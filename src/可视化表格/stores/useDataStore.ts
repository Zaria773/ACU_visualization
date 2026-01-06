/**
 * 数据状态管理 Store
 * 迁移原代码中的 globalStagedData, currentDiffMap, pendingDeletes, isSaving 等全局变量
 *
 * 兼容性说明:
 * - 保持 acu_* 开头的 localStorage 键名
 * - 保持 TavernDB_ACU_IsolatedData 数据结构
 * - 保持与 AutoCardUpdaterAPI 的交互方式
 */

import { klona } from 'klona';
import type { RawDatabaseData } from '../types/index';
import { getCore, getTableData } from '../utils/index';

// ============================================================
// 本地类型定义 (避免与 types/index.ts 冲突)
// ============================================================

/** 存储键名常量 - 兼容旧版本 */
export const STORAGE_KEYS = {
  SNAPSHOT: 'acu_data_snapshot_v18_5',
  TABLE_ORDER: 'acu_table_order',
  ACTIVE_TAB: 'acu_active_tab',
  UI_CONFIG: 'acu_ui_config_v18',
  UI_COLLAPSE: 'acu_ui_collapse',
  TABLE_HEIGHTS: 'acu_table_heights',
  REVERSE_TABLES: 'acu_reverse_tables',
  PIN: 'acu_pin',
  TABLE_STYLES: 'acu_table_styles',
  WINDOW_CONFIG: 'acu_win_config',
  V5_SETTINGS: 'shujuku_v34_allSettings_v2',
} as const;

/** 简化的单元格数据 (用于 Vue 组件) */
export interface CellData {
  key: string;
  value: string;
}

/** 简化的行数据 (用于 Vue 组件) */
export interface RowData {
  index: number;
  cells: CellData[];
}

/** 表格数据映射 (tableId -> 行数据列表) */
export type VueTableData = Record<string, RowData[]>;

/** 楼层信息 */
export interface FloorInfo {
  index: number;
  isAuto: boolean;
  reason: string;
}

/** 隔离数据结构 */
export interface IsolatedDataEntry {
  independentData: Record<string, RawDatabaseData[string]>;
  modifiedKeys: string[];
  updateGroupKeys: string[];
}

/** SillyTavern 聊天消息类型 */
export interface STChatMessage {
  is_user?: boolean;
  mes?: string;
  TavernDB_ACU_IsolatedData?: Record<string, IsolatedDataEntry>;
  [key: string]: unknown;
}

/** 保存结果类型 */
export interface SaveResult {
  success: boolean;
  savedToFloor: number;
  error?: string;
}

// ============================================================
// Store 定义
// ============================================================

export const useDataStore = defineStore('acu-data', () => {
  // ============================================================
  // 状态定义 - 迁移原全局变量
  // ============================================================

  /** 暂存数据 - 对应原代码 globalStagedData (原始格式) */
  const stagedData = ref<RawDatabaseData | null>(null);

  /** 处理后的表格数据 - Vue 组件使用的格式 */
  const tables = ref<VueTableData>({});

  /** 原始快照数据 - 用于差异比对 */
  const snapshot = ref<RawDatabaseData | null>(null);

  /**
   * AI填表变更追踪 - AI 自动填表产生的变更
   * 由 generateDiffMap 填充，对比快照与当前数据的差异
   */
  const aiDiffMap = reactive<Set<string>>(new Set());

  /**
   * 手动修改变更追踪 - 用户手动编辑产生的变更
   * 由 updateCell/insertRow 等操作填充
   */
  const manualDiffMap = reactive<Set<string>>(new Set());

  /**
   * 合并的变更追踪 (计算属性) - 兼容旧代码
   * @deprecated 请使用 getCellChangeType/getRowChangeType 获取变更类型
   */
  const diffMap = computed(() => {
    const merged = new Set<string>();
    aiDiffMap.forEach(key => merged.add(key));
    manualDiffMap.forEach(key => merged.add(key));
    return merged;
  });

  /** 待删除项 - 对应原代码 pendingDeletes (使用 reactive 确保 Set 操作触发响应式更新) */
  const pendingDeletes = reactive<Set<string>>(new Set());

  /** 保存锁 - 对应原代码 isSaving */
  const isSaving = ref(false);

  /** 加载状态 */
  const isLoading = ref(false);

  /** 目标楼层信息 */
  const targetFloorInfo = ref<FloorInfo | null>(null);

  // ============================================================
  // Getters
  // ============================================================

  /** 是否有待删除项 */
  const hasPendingDeletes = computed(() => pendingDeletes.size > 0);

  /** 是否有未保存的变更 */
  const hasUnsavedChanges = computed(() => aiDiffMap.size > 0 || manualDiffMap.size > 0 || pendingDeletes.size > 0);

  /** 别名 - 与重构策略文档保持一致 */
  const hasChanges = hasUnsavedChanges;

  /** 获取暂存数据 (兼容旧 API) */
  function getStagedData(): RawDatabaseData | null {
    return stagedData.value;
  }

  // ============================================================
  // 快照管理
  // ============================================================

  /**
   * 加载快照
   */
  function loadSnapshot(): RawDatabaseData | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SNAPSHOT);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  /**
   * 保存快照
   */
  function saveSnapshot(data: RawDatabaseData): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify(data));
    } catch (e) {
      console.error('[ACU] Save snapshot failed:', e);
    }
  }

  /**
   * 清除快照
   */
  function clearSnapshot(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.SNAPSHOT);
    } catch {
      // ignore
    }
  }

  // ============================================================
  // 辅助函数
  // ============================================================

  /**
   * 生成行键
   */
  function getRowKey(tableId: string, rowIndex: number): string {
    return `${tableId}-row-${rowIndex}`;
  }

  /**
   * 生成单元格键
   */
  function getCellKey(tableId: string, rowIndex: number, colIndex: number): string {
    return `${tableId}-${rowIndex}-${colIndex}`;
  }

  /**
   * 获取 SillyTavern 核心对象
   */
  function getSillyTavern(): any {
    let ST = (window as any).SillyTavern || (window.parent ? (window.parent as any).SillyTavern : null);
    if (!ST && (window as any).top && (window as any).top.SillyTavern) {
      ST = (window as any).top.SillyTavern;
    }
    return ST;
  }

  /**
   * 获取隔离配置 Key
   */
  function getIsolationConfigKey(): string {
    let configKey = '';
    try {
      let storage = window.localStorage;
      if (!storage.getItem(STORAGE_KEYS.V5_SETTINGS) && window.parent) {
        try {
          storage = window.parent.localStorage;
        } catch {
          // ignore cross-origin
        }
      }
      const settingsStr = storage.getItem(STORAGE_KEYS.V5_SETTINGS);
      if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        if (settings.dataIsolationEnabled && settings.dataIsolationCode) {
          configKey = settings.dataIsolationCode;
        }
      }
    } catch {
      // ignore
    }
    return configKey;
  }

  /**
   * 获取快照中的单元格值
   */
  function getSnapshotCellValue(tableId: string, rowIndex: number, colIndex: number): string {
    if (!snapshot.value) return '';

    for (const sheetId in snapshot.value) {
      const sheet = snapshot.value[sheetId];
      if (sheet && sheet.name === tableId && sheet.content) {
        const row = sheet.content[rowIndex + 1];
        if (row && row[colIndex] !== undefined) {
          return String(row[colIndex]);
        }
      }
    }
    return '';
  }

  /**
   * 同步 tables 到 stagedData
   */
  function syncToStagedData(): void {
    if (!stagedData.value) return;

    const data = klona(stagedData.value);

    for (const sheetId in data) {
      const sheet = data[sheetId];
      if (!sheet || !sheet.name || !sheet.content) continue;

      const tableRows = tables.value[sheet.name];
      if (!tableRows) continue;

      const headers = sheet.content[0] || [];
      const newContent: (string | number)[][] = [headers];

      for (const row of tableRows) {
        const rowData: (string | number)[] = [];
        for (let i = 0; i < headers.length; i++) {
          const cell = row.cells[i];
          rowData.push(cell ? cell.value : '');
        }
        newContent.push(rowData);
      }

      sheet.content = newContent;
    }

    stagedData.value = data;
  }

  /**
   * 清除变更标记 (清除两种高亮)
   */
  function clearChanges(clearDeletes = false): void {
    aiDiffMap.clear();
    manualDiffMap.clear();
    if (clearDeletes) {
      pendingDeletes.clear();
    }
  }

  /**
   * 设置暂存数据 (用于外部加载数据)
   */
  function setStagedData(data: RawDatabaseData): void {
    stagedData.value = klona(data);
    const processed = processToTableData(data);
    tables.value = processed;
    console.info('[ACU] 暂存数据已设置');
  }

  /**
   * 生成 AI 差异映射 (对比当前数据与快照)
   * 只填充 aiDiffMap，不影响 manualDiffMap
   */
  function generateDiffMap(currentData: RawDatabaseData): void {
    // 只清除 AI 变更，保留手动变更
    aiDiffMap.clear();

    if (!snapshot.value) {
      // 没有快照，无法比较
      return;
    }

    const snapData = snapshot.value;

    for (const sheetId in currentData) {
      if (sheetId === 'mate' || sheetId === 'updated' || sheetId === 'created' || sheetId.startsWith('_')) {
        continue;
      }

      const currentSheet = currentData[sheetId];
      const snapSheet = snapData[sheetId];

      if (!currentSheet || !currentSheet.content) continue;

      const tableName = currentSheet.name || sheetId.replace('sheet_', '');

      // 如果快照中没有这个表，则所有行都标记为 AI 变更
      if (!snapSheet || !snapSheet.content) {
        for (let rowIdx = 1; rowIdx < currentSheet.content.length; rowIdx++) {
          const rowKey = getRowKey(tableName, rowIdx - 1);
          // 如果不是手动变更，才标记为 AI 变更
          if (!manualDiffMap.has(rowKey)) {
            aiDiffMap.add(rowKey);
          }
        }
        continue;
      }

      // 比较每行每列
      const maxRows = Math.max(currentSheet.content.length, snapSheet.content.length);
      for (let rowIdx = 1; rowIdx < maxRows; rowIdx++) {
        const currentRow = currentSheet.content[rowIdx];
        const snapRow = snapSheet.content[rowIdx];
        const realRowIdx = rowIdx - 1;

        // 行不存在于其中一方
        if (!currentRow || !snapRow) {
          const rowKey = getRowKey(tableName, realRowIdx);
          if (!manualDiffMap.has(rowKey)) {
            aiDiffMap.add(rowKey);
          }
          continue;
        }

        // 比较每个单元格
        const maxCols = Math.max(currentRow.length, snapRow.length);
        for (let colIdx = 0; colIdx < maxCols; colIdx++) {
          const currentVal = String(currentRow[colIdx] ?? '');
          const snapVal = String(snapRow[colIdx] ?? '');
          if (currentVal !== snapVal) {
            const cellKey = getCellKey(tableName, realRowIdx, colIdx);
            // 如果不是手动变更，才标记为 AI 变更
            if (!manualDiffMap.has(cellKey)) {
              aiDiffMap.add(cellKey);
            }
          }
        }
      }
    }

    console.info(`[ACU] AI差异映射已生成，AI变更: ${aiDiffMap.size}, 手动变更: ${manualDiffMap.size}`);
  }

  // ============================================================
  // 数据加载
  // ============================================================

  /**
   * 从酒馆数据库加载数据
   */
  async function loadFromDatabase(): Promise<void> {
    if (isLoading.value) {
      console.warn('[ACU] 加载进行中，跳过重复请求');
      return;
    }

    try {
      isLoading.value = true;
      console.info('[ACU] 开始加载数据...');

      const rawData = getTableData();

      if (!rawData) {
        console.warn('[ACU] 未获取到表格数据');
        return;
      }

      stagedData.value = klona(rawData);
      const processed = processToTableData(rawData);
      tables.value = processed;
      snapshot.value = klona(rawData);
      aiDiffMap.clear();
      manualDiffMap.clear();
      pendingDeletes.clear();
      saveSnapshot(rawData);

      console.info('[ACU] 数据加载完成，表格数量:', Object.keys(processed).length);
    } catch (error) {
      console.error('[ACU] 加载数据失败:', error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 将原始数据转换为 Vue 组件使用的格式
   * 注意：与原代码 processJsonData 保持一致，仅处理有 name 属性的 sheet
   */
  function processToTableData(rawData: RawDatabaseData): VueTableData {
    const result: VueTableData = {};

    for (const sheetId in rawData) {
      const sheet = rawData[sheetId];

      // 关键：与原代码保持一致，仅处理有 name 属性的 sheet
      if (!sheet?.name) {
        continue;
      }

      if (!sheet.content || !Array.isArray(sheet.content)) {
        continue;
      }

      // 使用 sheet.name 作为表名（不使用后备值）
      const tableName = sheet.name;
      const headers = sheet.content[0] || [];
      const rows: RowData[] = [];

      for (let rowIdx = 1; rowIdx < sheet.content.length; rowIdx++) {
        const rowData = sheet.content[rowIdx];
        const cells: CellData[] = [];

        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          cells.push({
            key: String(headers[colIdx] || `col_${colIdx}`),
            value: String(rowData[colIdx] ?? ''),
          });
        }

        rows.push({
          index: rowIdx - 1,
          cells,
        });
      }

      result[tableName] = rows;
    }

    return result;
  }

  // ============================================================
  // 数据保存
  // ============================================================

  /**
   * 查找目标楼层
   */
  function findTargetFloor(): number {
    const ST = getSillyTavern();
    if (!ST || !ST.chat || ST.chat.length === 0) return -1;

    for (let i = ST.chat.length - 1; i >= 0; i--) {
      const msg = ST.chat[i] as STChatMessage;
      if (!msg.is_user && msg.TavernDB_ACU_IsolatedData) {
        targetFloorInfo.value = {
          index: i,
          isAuto: true,
          reason: '已存在数据',
        };
        return i;
      }
    }

    for (let i = ST.chat.length - 1; i >= 0; i--) {
      const msg = ST.chat[i] as STChatMessage;
      if (!msg.is_user) {
        targetFloorInfo.value = {
          index: i,
          isAuto: true,
          reason: '新建数据位置',
        };
        return i;
      }
    }

    return -1;
  }

  /**
   * 过滤已删除的行
   */
  function filterDeletedRows(data: RawDatabaseData): RawDatabaseData {
    if (pendingDeletes.size === 0) return data;

    const result = klona(data);

    for (const sheetId in result) {
      if (sheetId === 'mate') continue;

      const sheet = result[sheetId];
      if (!sheet || !sheet.name || !sheet.content) continue;

      const newContent: (string | number)[][] = [sheet.content[0]];

      for (let i = 1; i < sheet.content.length; i++) {
        const realIdx = i - 1;
        const rowKey = getRowKey(sheet.name, realIdx);
        if (!pendingDeletes.has(rowKey)) {
          newContent.push(sheet.content[i]);
        }
      }

      sheet.content = newContent;
    }

    return result;
  }

  /**
   * 写入到指定楼层
   */
  async function writeToFloor(floorIndex: number, data: RawDatabaseData): Promise<void> {
    const ST = getSillyTavern();
    if (!ST || !ST.chat || !ST.chat[floorIndex]) {
      throw new Error(`楼层 ${floorIndex} 不存在`);
    }

    const targetMsg = ST.chat[floorIndex] as STChatMessage;

    let finalKey = getIsolationConfigKey();
    if (targetMsg.TavernDB_ACU_IsolatedData) {
      const existingKeys = Object.keys(targetMsg.TavernDB_ACU_IsolatedData);
      if (existingKeys.length > 0) {
        finalKey = existingKeys[0];
      }
    } else {
      targetMsg.TavernDB_ACU_IsolatedData = {};
    }

    if (!targetMsg.TavernDB_ACU_IsolatedData[finalKey]) {
      targetMsg.TavernDB_ACU_IsolatedData[finalKey] = {
        independentData: {},
        modifiedKeys: [],
        updateGroupKeys: [],
      };
    }

    const tagData = targetMsg.TavernDB_ACU_IsolatedData[finalKey] as IsolatedDataEntry;
    if (!tagData.independentData) tagData.independentData = {};

    const sheetsToSave = Object.keys(data).filter(k => k.startsWith('sheet_'));
    sheetsToSave.forEach(k => {
      tagData.independentData[k] = klona(data[k]);
    });

    const existingKeys: string[] = tagData.modifiedKeys || [];
    tagData.modifiedKeys = [...new Set([...existingKeys, ...sheetsToSave])];
  }

  /**
   * 同步世界书
   */
  async function syncWorldbook(): Promise<void> {
    const api = getCore().getDB();
    if (api && api.syncWorldbookEntries) {
      try {
        await api.syncWorldbookEntries({ createIfNeeded: true });
      } catch (syncErr) {
        console.warn('[ACU] Worldbook sync failed:', syncErr);
      }
    }
  }

  /**
   * 保存聊天记录（防抖）
   */
  async function saveChatDebounced(): Promise<void> {
    const ST = getSillyTavern();
    if (ST?.saveChatDebounced) {
      await ST.saveChatDebounced();
    } else if (ST?.saveChat) {
      await ST.saveChat();
    }
  }

  /**
   * 保存数据到数据库
   */
  async function saveToDatabase(): Promise<SaveResult> {
    if (isSaving.value) {
      console.warn('[ACU] 保存进行中，跳过重复请求');
      return { success: false, savedToFloor: -1, error: '保存进行中' };
    }

    try {
      isSaving.value = true;
      console.info('[ACU] 开始保存数据...');

      let dataToSave = stagedData.value;
      if (!dataToSave) {
        dataToSave = getTableData();
      }

      if (!dataToSave) {
        throw new Error('无数据可保存');
      }

      const filteredData = filterDeletedRows(klona(dataToSave));
      const targetFloor = findTargetFloor();
      if (targetFloor === -1) {
        throw new Error('未找到合适的目标楼层');
      }

      await writeToFloor(targetFloor, filteredData);
      await syncWorldbook();
      await saveChatDebounced();

      snapshot.value = klona(filteredData);
      stagedData.value = klona(filteredData);
      clearChanges(true);
      saveSnapshot(filteredData);

      console.info(`[ACU] 数据保存完成，目标楼层: ${targetFloor}`);
      return { success: true, savedToFloor: targetFloor };
    } catch (error) {
      const errMsg = (error as Error).message;
      console.error('[ACU] 保存数据失败:', error);
      return { success: false, savedToFloor: -1, error: errMsg };
    } finally {
      isSaving.value = false;
    }
  }

  /**
   * 保存到指定楼层
   */
  async function saveToFloor(floorIndex: number): Promise<SaveResult> {
    if (isSaving.value) {
      console.warn('[ACU] 保存进行中，跳过重复请求');
      return { success: false, savedToFloor: -1, error: '保存进行中' };
    }

    try {
      isSaving.value = true;
      console.info(`[ACU] 保存到第 ${floorIndex} 楼...`);

      let dataToSave = stagedData.value;
      if (!dataToSave) {
        dataToSave = getTableData();
      }

      if (!dataToSave) {
        throw new Error('无数据可保存');
      }

      const filteredData = filterDeletedRows(klona(dataToSave));
      await writeToFloor(floorIndex, filteredData);
      await syncWorldbook();
      await saveChatDebounced();

      snapshot.value = klona(filteredData);
      stagedData.value = klona(filteredData);
      clearChanges(true);
      saveSnapshot(filteredData);

      console.info(`[ACU] 已保存到第 ${floorIndex} 楼`);
      return { success: true, savedToFloor: floorIndex };
    } catch (error) {
      const errMsg = (error as Error).message;
      console.error('[ACU] 保存到指定楼层失败:', error);
      return { success: false, savedToFloor: -1, error: errMsg };
    } finally {
      isSaving.value = false;
    }
  }

  /**
   * 清除指定楼层范围的数据
   */
  async function purgeFloorRange(startFloor: number, endFloor: number): Promise<void> {
    if (isSaving.value) {
      console.warn('[ACU] 操作进行中，跳过重复请求');
      return;
    }

    try {
      isSaving.value = true;
      console.info(`[ACU] 清除第 ${startFloor} 到 ${endFloor} 楼的数据...`);

      const ST = getSillyTavern();
      if (!ST || !ST.chat) {
        throw new Error('无法访问聊天记录');
      }

      const maxIdx = ST.chat.length - 1;
      const safeStartFloor = Math.max(0, startFloor);
      const safeEndFloor = Math.min(maxIdx, endFloor);

      if (isNaN(safeStartFloor) || isNaN(safeEndFloor) || safeStartFloor > safeEndFloor) {
        throw new Error('无效的楼层范围');
      }

      const keysToDelete = [
        'TavernDB_ACU_Data',
        'TavernDB_ACU_SummaryData',
        'TavernDB_ACU_IndependentData',
        'TavernDB_ACU_Identity',
        'TavernDB_ACU_IsolatedData',
        'TavernDB_ACU_ModifiedKeys',
        'TavernDB_ACU_UpdateGroupKeys',
      ];

      let purgedCount = 0;
      for (let i = safeStartFloor; i <= safeEndFloor; i++) {
        const msg = ST.chat[i] as STChatMessage;
        if (!msg) continue;

        let messageModified = false;
        for (const key of keysToDelete) {
          if (Object.prototype.hasOwnProperty.call(msg, key)) {
            delete (msg as any)[key];
            messageModified = true;
          }
        }

        if (messageModified) {
          purgedCount++;
        }
      }

      if (purgedCount > 0) {
        await saveChatDebounced();
        clearSnapshot();
        clearChanges(true);
        await syncWorldbook();
      }

      console.info(`[ACU] 已清除 ${purgedCount} 个楼层的数据`);
    } catch (error) {
      console.error('[ACU] 清除楼层数据失败:', error);
      throw error;
    } finally {
      isSaving.value = false;
    }
  }

  // ============================================================
  // 行操作
  // ============================================================

  /**
   * 插入新行
   */
  function insertRow(tableId: string, afterIndex: number): void {
    const tableRows = tables.value[tableId];
    if (!tableRows || tableRows.length === 0) {
      console.warn(`[ACU] 表格 ${tableId} 不存在或为空`);
      return;
    }

    const templateRow = tableRows[0];
    const newRow: RowData = {
      index: tableRows.length,
      cells: templateRow.cells.map((cell: CellData) => ({
        key: cell.key,
        value: '',
      })),
    };

    tableRows.splice(afterIndex + 1, 0, newRow);

    tableRows.forEach((row: RowData, i: number) => {
      row.index = i;
    });

    const rowKey = getRowKey(tableId, afterIndex + 1);
    // 插入行是手动操作
    manualDiffMap.add(rowKey);

    syncToStagedData();

    console.info(`[ACU] 在 ${tableId} 第 ${afterIndex} 行后插入新行`);
  }

  /**
   * 更新单元格
   */
  function updateCell(tableId: string, rowIndex: number, colIndex: number, value: string): void {
    const tableRows = tables.value[tableId];
    if (!tableRows || !tableRows[rowIndex]) {
      console.warn(`[ACU] 无效的单元格位置: ${tableId}[${rowIndex}][${colIndex}]`);
      return;
    }

    const row = tableRows[rowIndex];
    if (row.cells[colIndex]) {
      const oldValue = row.cells[colIndex].value;
      row.cells[colIndex].value = value;

      const cellKey = getCellKey(tableId, rowIndex, colIndex);
      const snapshotValue = getSnapshotCellValue(tableId, rowIndex, colIndex);

      if (value !== snapshotValue) {
        // 手动编辑产生的变更
        manualDiffMap.add(cellKey);
        // 从 AI 变更中移除（手动变更优先）
        aiDiffMap.delete(cellKey);
      } else {
        // 值恢复到快照状态，移除所有变更标记
        manualDiffMap.delete(cellKey);
        aiDiffMap.delete(cellKey);

        const isRowUnchanged = row.cells.every(
          (cell: CellData, i: number) => cell.value === getSnapshotCellValue(tableId, rowIndex, i),
        );
        if (isRowUnchanged) {
          row.cells.forEach((_: CellData, i: number) => {
            const key = getCellKey(tableId, rowIndex, i);
            manualDiffMap.delete(key);
            aiDiffMap.delete(key);
          });
        }
      }

      syncToStagedData();

      console.info(`[ACU] 更新 ${tableId}[${rowIndex}][${colIndex}]: "${oldValue}" -> "${value}"`);
    }
  }

  /**
   * 切换删除标记 (兼容旧 API)
   */
  function toggleDelete(rowKey: string): void {
    if (pendingDeletes.has(rowKey)) {
      pendingDeletes.delete(rowKey);
      console.info(`[ACU] 取消删除标记: ${rowKey}`);
    } else {
      pendingDeletes.add(rowKey);
      console.info(`[ACU] 添加删除标记: ${rowKey}`);
    }
  }

  /**
   * 切换删除标记 (新 API)
   */
  function toggleDeleteRow(tableId: string, rowIndex: number): void {
    const rowKey = getRowKey(tableId, rowIndex);
    toggleDelete(rowKey);
  }

  /**
   * 标记删除
   */
  function markForDelete(tableId: string, rowIndex: number): void {
    const rowKey = getRowKey(tableId, rowIndex);
    pendingDeletes.add(rowKey);
  }

  /**
   * 取消删除标记
   */
  function unmarkForDelete(tableId: string, rowIndex: number): void {
    const rowKey = getRowKey(tableId, rowIndex);
    pendingDeletes.delete(rowKey);
  }

  /**
   * 获取单元格变更类型
   * @returns 'manual' | 'ai' | null
   */
  function getCellChangeType(cellId: string): 'manual' | 'ai' | null {
    // 手动变更优先
    if (manualDiffMap.has(cellId)) return 'manual';
    if (aiDiffMap.has(cellId)) return 'ai';
    return null;
  }

  /**
   * 获取行变更类型
   * @returns 'manual' | 'ai' | null (如果行中有手动变更，返回 manual；否则如果有 AI 变更，返回 ai)
   */
  function getRowChangeType(tableId: string, rowIndex: number, colCount?: number): 'manual' | 'ai' | null {
    const rowKey = getRowKey(tableId, rowIndex);

    // 检查整行标记
    if (manualDiffMap.has(rowKey)) return 'manual';
    if (aiDiffMap.has(rowKey)) return 'ai';

    // 检查待删除
    if (pendingDeletes.has(rowKey)) return 'manual';

    const tableRows = tables.value[tableId];
    const cols = colCount ?? (tableRows?.[rowIndex]?.cells.length || 0);

    let hasManual = false;
    let hasAi = false;

    for (let c = 0; c < cols; c++) {
      const cellKey = getCellKey(tableId, rowIndex, c);
      if (manualDiffMap.has(cellKey)) hasManual = true;
      if (aiDiffMap.has(cellKey)) hasAi = true;
    }

    // 手动优先
    if (hasManual) return 'manual';
    if (hasAi) return 'ai';
    return null;
  }

  /**
   * 检查行是否有变更 (兼容旧 API)
   */
  function isRowChanged(tableId: string, rowIndex: number, colCount?: number): boolean {
    return getRowChangeType(tableId, rowIndex, colCount) !== null;
  }

  /**
   * 检查行是否待删除
   */
  function isRowPendingDelete(tableId: string, rowIndex: number): boolean {
    return pendingDeletes.has(getRowKey(tableId, rowIndex));
  }

  /**
   * 检查行是否待删除 (兼容旧 API)
   */
  function isPendingDelete(rowKey: string): boolean {
    return pendingDeletes.has(rowKey);
  }

  /**
   * 检查单元格是否有变更 (兼容旧 API)
   */
  function isCellChanged(cellId: string): boolean {
    return getCellChangeType(cellId) !== null;
  }

  // ============================================================
  // 返回 Store 接口
  // ============================================================

  return {
    // 状态
    stagedData,
    tables,
    snapshot,
    aiDiffMap,
    manualDiffMap,
    diffMap, // 兼容旧代码的合并视图
    pendingDeletes,
    isSaving,
    isLoading,
    targetFloorInfo,

    // Getters
    hasPendingDeletes,
    hasUnsavedChanges,
    hasChanges,
    getStagedData,

    // 数据加载
    loadFromDatabase,
    processToTableData,
    setStagedData,
    generateDiffMap,

    // 数据保存
    saveToDatabase,
    saveToFloor,
    purgeFloorRange,

    // 行操作
    insertRow,
    updateCell,
    toggleDelete,
    toggleDeleteRow,
    markForDelete,
    unmarkForDelete,

    // 状态检查 (新 API)
    getCellChangeType,
    getRowChangeType,
    // 状态检查 (兼容旧 API)
    isRowChanged,
    isRowPendingDelete,
    isPendingDelete,
    isCellChanged,

    // 辅助函数
    getRowKey,
    getCellKey,
    clearChanges,
    syncToStagedData,

    // 快照管理
    loadSnapshot,
    saveSnapshot,
    clearSnapshot,
  };
});
