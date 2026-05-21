/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
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
import { useCellLock } from '../composables/useCellLock';
import { saveSnapshot as saveRowSnapshot } from '../composables/useRowHistory';
import { isSummaryOrOutlineTable, useTableIntegrityCheck } from '../composables/useTableIntegrityCheck';
import type { RawDatabaseData, TableCell, TableRow } from '../types';
import { getCore, getTableData } from '../utils/index';

// ============================================================
// 本地类型定义 (避免与 types/index.ts 冲突)
// ============================================================

/** 数据快照键（仅本文件内部使用） */
const SNAPSHOT_KEY = 'acu_data_snapshot_v18_5';

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
// 工具函数
// ============================================================

/**
 * 标准化单元格值，统一处理各种空值情况
 * null, undefined, '', 'null', 'undefined' 都视为空字符串
 * @param value 原始值
 * @returns 标准化后的字符串
 */
function normalizeValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const strValue = String(value).trim();
  // 'null' 和 'undefined' 字符串也视为空
  if (strValue === 'null' || strValue === 'undefined') return '';
  return strValue;
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

  /** 上次保存前的数据 - 用于撤回功能 */
  const lastSavedData = ref<RawDatabaseData | null>(null);

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
  // 完整性检测
  // ============================================================

  /** 完整性检测实例 */
  const integrityChecker = useTableIntegrityCheck();

  /** 单元格锁定管理器 */
  const cellLock = useCellLock();

  /** 完整性问题映射（表格名 -> 问题列表） */
  const integrityIssues = integrityChecker.issuesByTable;

  /** 是否有完整性问题 */
  const hasIntegrityIssues = integrityChecker.hasIssues;

  /** 有问题的表格名称列表 */
  const problematicTables = integrityChecker.problematicTables;

  /** 问题统计 */
  const integrityStats = integrityChecker.issueStats;

  // ============================================================
  // Getters
  // ============================================================

  /** 是否有待删除项 */
  const hasPendingDeletes = computed(() => pendingDeletes.size > 0);

  /** 是否有未保存的变更 */
  const hasUnsavedChanges = computed(() => aiDiffMap.size > 0 || manualDiffMap.size > 0 || pendingDeletes.size > 0);

  /** 别名 - 与重构策略文档保持一致 */
  const hasChanges = hasUnsavedChanges;

  /** 是否有可撤回的数据 */
  const hasUndoData = computed(() => lastSavedData.value !== null);

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
      const data = localStorage.getItem(SNAPSHOT_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  /**
   * 保存快照（同时更新内存和 localStorage）
   */
  function saveSnapshot(data: RawDatabaseData): void {
    try {
      // 更新内存中的快照（用于 generateDiffMap 对比）
      snapshot.value = klona(data);
      // 持久化到 localStorage
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('[ACU] Save snapshot failed:', e);
    }
  }

  /**
   * 清除快照
   */
  function clearSnapshot(): void {
    try {
      localStorage.removeItem(SNAPSHOT_KEY);
    } catch {
      // ignore
    }
  }

  // ============================================================
  // 撤回功能
  // ============================================================

  /**
   * 保存当前快照到撤回缓存（在保存操作前调用）
   * 保存的是 snapshot（保存前的干净数据），而不是 stagedData（已修改的数据）
   * 这样撤回时可以恢复到保存操作前的数据库状态
   */
  function saveLastState(): void {
    // 优先使用内存中的 snapshot，其次从 localStorage 加载
    const currentSnapshot = snapshot.value || loadSnapshot();
    if (currentSnapshot) {
      lastSavedData.value = klona(currentSnapshot);
      console.info('[ACU] 已保存当前快照到撤回缓存');
    } else {
      console.warn('[ACU] 无快照数据可保存到撤回缓存');
    }
  }

  /**
   * 获取撤回数据（用于 App.vue 中写回数据库）
   * @returns 撤回数据的深拷贝，或 null
   */
  function getUndoData(): RawDatabaseData | null {
    if (!lastSavedData.value) {
      return null;
    }
    return klona(lastSavedData.value);
  }

  /**
   * 撤回到上次保存前的状态（仅更新内存状态）
   * 注意：撤回后界面数据与数据库不一致，会显示变更标记
   * @returns 是否成功撤回
   */
  function undoToLastSave(): boolean {
    if (!lastSavedData.value) {
      console.warn('[ACU] 无可撤回的数据');
      return false;
    }

    // 恢复数据到内存
    const restoredData = klona(lastSavedData.value);
    stagedData.value = restoredData;
    const processed = processToTableData(restoredData);
    tables.value = processed;

    // 注意：不更新 snapshot，因为数据库里还是新数据
    // 这样用户会看到"有未保存变更"的提示，需要手动保存
    // 保持 snapshot 不变，让用户明确知道数据与数据库不同

    // 清除 AI 变更标记（因为这不是 AI 产生的变更）
    aiDiffMap.clear();
    pendingDeletes.clear();

    // 收集所有差异 key
    const newDiffKeys: string[] = [];

    // 标记所有差异为手动变更（与当前 snapshot 对比）
    // 使用与 generateDiffMap 相同的 key 格式（tableName:rowIdx:colIdx）
    if (snapshot.value) {
      for (const sheetId in restoredData) {
        if (sheetId === 'mate' || sheetId === 'updated' || sheetId === 'created' || sheetId.startsWith('_')) {
          continue;
        }

        const restoredSheet = restoredData[sheetId];
        const snapSheet = snapshot.value[sheetId];

        if (!restoredSheet?.content) continue;

        const tableName = restoredSheet.name || sheetId.replace('sheet_', '');

        // 如果快照中没有这个表，所有行都标记为手动变更
        if (!snapSheet?.content) {
          for (let rowIdx = 1; rowIdx < restoredSheet.content.length; rowIdx++) {
            const realRowIdx = rowIdx - 1;
            const rowKey = getRowKey(tableName, realRowIdx);
            newDiffKeys.push(rowKey);
          }
          continue;
        }

        // 比较每行每列
        const maxRows = Math.max(restoredSheet.content.length, snapSheet.content.length);
        for (let rowIdx = 1; rowIdx < maxRows; rowIdx++) {
          const restoredRow = restoredSheet.content[rowIdx];
          const snapRow = snapSheet.content[rowIdx];
          const realRowIdx = rowIdx - 1;

          // 行不存在于其中一方
          if (!restoredRow || !snapRow) {
            const rowKey = getRowKey(tableName, realRowIdx);
            newDiffKeys.push(rowKey);
            continue;
          }

          // 比较每个单元格
          const maxCols = Math.max(restoredRow.length, snapRow.length);
          for (let colIdx = 0; colIdx < maxCols; colIdx++) {
            const restoredVal = String(restoredRow[colIdx] ?? '');
            const snapVal = String(snapRow[colIdx] ?? '');
            if (restoredVal !== snapVal) {
              const cellKey = getCellKey(tableName, realRowIdx, colIdx);
              newDiffKeys.push(cellKey);
            }
          }
        }
      }
    }

    // 清除旧的手动变更，用新计算的差异替换（触发响应式更新）
    manualDiffMap.clear();
    newDiffKeys.forEach(key => manualDiffMap.add(key));

    // 强制添加撤回标记，确保触发"有未保存变更"状态
    // 即使差异计算结果为0（例如刷新后快照被更新），也要提示用户保存
    manualDiffMap.add('__undo_pending__');

    console.info(`[ACU] 撤回后差异: 手动变更 ${manualDiffMap.size} 项`);

    // 不清除撤回缓存，允许多次撤回
    // lastSavedData.value = null;

    console.info('[ACU] 已撤回到上次保存前的状态（需手动保存）');
    return true;
  }

  /**
   * 清除撤回缓存
   */
  function clearUndoCache(): void {
    lastSavedData.value = null;
    console.info('[ACU] 已清除撤回缓存');
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
  function setStagedData(data: RawDatabaseData): RawDatabaseData {
    const cloned = klona(data);
    stagedData.value = cloned;
    tables.value = processToTableData(cloned);
    console.info('[ACU] 暂存数据已设置');
    return cloned;
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

        // 行不存在于其中一方（新增行或删除行）
        if (!currentRow || !snapRow) {
          const rowKey = getRowKey(tableName, realRowIdx);
          if (!manualDiffMap.has(rowKey)) {
            aiDiffMap.add(rowKey);
          }
          // 如果是新增的行（currentRow 存在但 snapRow 不存在），为每个单元格添加 cellKey
          // 这样 getCellChangeClass 才能正确检测到单元格的变更
          if (currentRow && !snapRow) {
            for (let colIdx = 0; colIdx < currentRow.length; colIdx++) {
              const cellKey = getCellKey(tableName, realRowIdx, colIdx);
              if (!manualDiffMap.has(cellKey)) {
                aiDiffMap.add(cellKey);
              }
            }
          }
          continue;
        }

        // 比较每个单元格
        const maxCols = Math.max(currentRow.length, snapRow.length);
        for (let colIdx = 0; colIdx < maxCols; colIdx++) {
          // 统一空值处理：null, undefined, '', 'null' 都视为空
          const currentVal = normalizeValue(currentRow[colIdx]);
          const snapVal = normalizeValue(snapRow[colIdx]);
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

      const clonedData = klona(rawData);
      stagedData.value = clonedData;
      const processed = processToTableData(clonedData);

      // 添加图标属性
      const tabsWithIcons = Object.entries(processed).reduce((acc, [key, rows]) => {
        // ... 原有逻辑
        acc[key] = rows;
        return acc;
      }, {} as VueTableData);

      tables.value = processed;
      snapshot.value = klona(clonedData);
      aiDiffMap.clear();
      manualDiffMap.clear();
      pendingDeletes.clear();
      saveSnapshot(clonedData);

      // 初始加载时清除警告（没有 AI 变更）
      integrityChecker.checkIntegrity(clonedData, null, new Set());

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

    // 使用空字符串作为默认隔离键，优先沿用已存在的键
    let finalKey = '';
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
   * 保存聊天记录到磁盘
   *
   * ⚠️ 注意: 历史上这里使用 ST.saveChatDebounced(), 但那是 lodash debounce 包装,
   * 调用后立即返回 undefined, 不会等待真实写盘完成. 这会导致:
   * 1. swipe 清除后, 磁盘 chat 仍是旧数据 → AI 重新生成时读到旧数据
   * 2. SQLite 模式下, refreshDataAndWorldbook 内部从内存 chat 合并是 OK 的,
   *    但若酒馆生成端依赖磁盘 chat 则会出错
   *
   * 现统一改为 ST.saveChat() 立即版, 真实等待写盘完成, 与 useDataPersistence
   * 中的 purgeFloorRange 保持一致.
   */
  async function saveChatDebounced(): Promise<void> {
    const ST = getSillyTavern();
    if (ST?.saveChat) {
      await ST.saveChat();
    } else if (ST?.saveChatDebounced) {
      // 兜底: 如果只有防抖版可用, 至少调一下(虽然不等写盘)
      await ST.saveChatDebounced();
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

      // [双路保存] SQLite 模式下兜底刷新(本函数直接写 chat 字段,绕过了 SQLite 内存数据库)
      // 不 import storageMode 工具(避免潜在循环依赖),用内联 ddl 检测
      try {
        const w = (window.parent || window) as any;
        const api = w.AutoCardUpdaterAPI;
        let isSqlite = false;
        for (const sheetId in filteredData) {
          if (!sheetId.startsWith('sheet_')) continue;
          const sheet: any = filteredData[sheetId];
          if (sheet?.sourceData?.ddl) {
            isSqlite = true;
            break;
          }
        }
        if (isSqlite && api && typeof api.refreshDataAndWorldbook === 'function') {
          await api.refreshDataAndWorldbook();
          console.info('[ACU][SQLite] dataStore.saveToDatabase 后 refreshDataAndWorldbook 已调用');
        }
      } catch (e) {
        console.warn('[ACU][SQLite] dataStore.saveToDatabase 后 refreshDataAndWorldbook 失败:', e);
      }

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

      // [双路保存] SQLite 模式下兜底刷新(本函数直接写 chat 字段,绕过了 SQLite 内存数据库)
      try {
        const w = (window.parent || window) as any;
        const api = w.AutoCardUpdaterAPI;
        let isSqlite = false;
        for (const sheetId in filteredData) {
          if (!sheetId.startsWith('sheet_')) continue;
          const sheet: any = filteredData[sheetId];
          if (sheet?.sourceData?.ddl) {
            isSqlite = true;
            break;
          }
        }
        if (isSqlite && api && typeof api.refreshDataAndWorldbook === 'function') {
          await api.refreshDataAndWorldbook();
          console.info('[ACU][SQLite] dataStore.saveToFloor 后 refreshDataAndWorldbook 已调用');
        }
      } catch (e) {
        console.warn('[ACU][SQLite] dataStore.saveToFloor 后 refreshDataAndWorldbook 失败:', e);
      }

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
        await syncWorldbook();

        // 重新拉取清除后的最新合并数据，刷新界面和快照
        // (同时复用此调用结果做 SQLite 模式检测)
        const latestData = getTableData();

        // [双路保存] SQLite 模式下兜底刷新(直接 delete msg 字段会绕过 SQLite 内存数据库)
        try {
          if (latestData) {
            let isSqlite = false;
            for (const sheetId in latestData) {
              if (!sheetId.startsWith('sheet_')) continue;
              const sheet: any = (latestData as any)[sheetId];
              if (sheet?.sourceData?.ddl) {
                isSqlite = true;
                break;
              }
            }
            if (isSqlite) {
              const w = (window.parent || window) as any;
              const api = w.AutoCardUpdaterAPI;
              if (api && typeof api.refreshDataAndWorldbook === 'function') {
                await api.refreshDataAndWorldbook();
                console.info('[ACU][SQLite] dataStore.purgeFloorRange 后 refreshDataAndWorldbook 已调用');
              }
            }
          }
        } catch (e) {
          console.warn('[ACU][SQLite] dataStore.purgeFloorRange 后 refreshDataAndWorldbook 失败:', e);
        }

        if (latestData) {
          const clonedData = klona(latestData);
          stagedData.value = clonedData;
          tables.value = processToTableData(clonedData);
          saveSnapshot(clonedData);
        } else {
          stagedData.value = null;
          tables.value = {};
          clearSnapshot();
        }
        clearChanges(true);
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
   * 获取当前聊天ID
   * 用于历史记录存储隔离
   */
  function getCurrentChatId(): string {
    const ST = getSillyTavern();

    // 方法1: 调用 API
    if (ST?.getCurrentChatId) {
      const id = ST.getCurrentChatId();
      if (id) return id;
    }

    // 方法2: 从 chat_metadata 获取
    if (ST?.chat_metadata?.chat_id) {
      return String(ST.chat_metadata.chat_id);
    }

    // 方法3: 从第一条消息获取
    if (ST?.chat?.length > 0 && ST.chat[0]?.chat_id) {
      return ST.chat[0].chat_id;
    }

    // 兜底：返回 'default' 确保数据能保存
    return 'default';
  }

  /**
   * 更新单元格
   * @param tableId 表格 ID
   * @param rowIndex 行索引
   * @param colIndex 列索引
   * @param value 新值
   * @param options 可选配置
   * @param options.skipHistory 是否跳过历史记录保存（用于批量操作）
   */
  function updateCell(
    tableId: string,
    rowIndex: number,
    colIndex: number,
    value: string,
    options?: { skipHistory?: boolean },
  ): void {
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

        // === 历史记录保存 ===
        // 仅在非批量操作时保存历史（批量操作由调用方统一保存）
        if (!options?.skipHistory) {
          const chatId = getCurrentChatId();
          console.info('[ACU] 保存历史记录, 参数:', {
            chatId,
            tableId,
            rowIndex,
            colIndex,
            oldValue: oldValue.substring(0, 50) + (oldValue.length > 50 ? '...' : ''),
            newValue: value.substring(0, 50) + (value.length > 50 ? '...' : ''),
          });

          if (chatId) {
            // 构建编辑前的行数据（使用旧值）
            const rowBeforeEdit: TableRow = {
              index: rowIndex,
              key: getRowKey(tableId, rowIndex),
              cells: row.cells.map(
                (cell: CellData, i: number): TableCell => ({
                  colIndex: i,
                  key: cell.key,
                  value: i === colIndex ? oldValue : cell.value,
                }),
              ),
            };
            // 异步保存，不阻塞主流程
            saveRowSnapshot(chatId, tableId, rowBeforeEdit, 'manual')
              .then(() => {
                console.info('[ACU] 历史记录保存成功');
              })
              .catch((err: unknown) => {
                console.warn('[ACU] 历史记录保存失败:', err);
              });
          } else {
            console.warn('[ACU] 无法获取 chatId，跳过历史记录保存');
          }
        }
        // === 历史记录保存结束 ===
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
   * 检查表格是否有 AI 填表变更
   * 用于 Tab 高亮显示
   */
  function hasTableAiChanges(tableName: string): boolean {
    // 遍历 aiDiffMap，检查是否有属于该表格的变更
    for (const key of aiDiffMap) {
      // key 格式: "表格名-row-行号" 或 "表格名-行号-列号"
      if (key.startsWith(`${tableName}-`)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 从变更键中提取表格 ID
   */
  function extractTableIdFromKey(key: string): string | null {
    const parts = key.split('-');
    if (parts.length >= 2) {
      // 表格名可能包含连字符，需要找到 "row" 或数字的位置
      const tableNameParts: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] === 'row' || /^\d+$/.test(parts[i])) {
          break;
        }
        tableNameParts.push(parts[i]);
      }
      if (tableNameParts.length > 0) {
        return tableNameParts.join('-');
      }
    }
    return null;
  }

  /**
   * 获取有 AI 变更的表格列表
   */
  function getTablesWithAiChanges(): string[] {
    const tablesSet = new Set<string>();
    for (const key of aiDiffMap) {
      const tableId = extractTableIdFromKey(key);
      if (tableId) tablesSet.add(tableId);
    }
    return Array.from(tablesSet);
  }

  /**
   * 根据表格名称查找表格 ID (sheet_xxx)
   */
  function getTableIdByName(tableName: string): string | null {
    if (!stagedData.value) return null;
    for (const sheetId in stagedData.value) {
      if (stagedData.value[sheetId]?.name === tableName) {
        return sheetId;
      }
    }
    return null;
  }

  /**
   * 获取所有发生变更的表格 ID 列表 (手动 + AI + 删除)
   * 用于增量保存
   * 注意：diffMap 中的 key 是基于 tableName 的，这里会转换为 tableId (sheet_xxx)
   */
  function getModifiedTableIds(): string[] {
    const tableNames = new Set<string>();

    // 1. 手动变更
    for (const key of manualDiffMap) {
      const tableName = extractTableIdFromKey(key);
      if (tableName) tableNames.add(tableName);
    }

    // 2. AI 变更
    for (const key of aiDiffMap) {
      const tableName = extractTableIdFromKey(key);
      if (tableName) tableNames.add(tableName);
    }

    // 3. 待删除
    for (const key of pendingDeletes) {
      const tableName = extractTableIdFromKey(key);
      if (tableName) tableNames.add(tableName);
    }

    // 4. 转换为 ID
    const tableIds = new Set<string>();
    for (const name of tableNames) {
      const id = getTableIdByName(name);
      if (id) {
        tableIds.add(id);
      } else if (stagedData.value && stagedData.value[name]) {
        // 可能是已经重命名或者是 ID 本身 (兼容)
        tableIds.add(name);
      }
    }

    return Array.from(tableIds);
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

  /**
   * 获取所有待提交的细粒度变更（按操作类型分组）
   * 用于 SQLite 模式下逐个调用 AutoCardUpdaterAPI
   *
   * 返回三类操作：
   * - updates: 单元格级别的更新（已存在的行的 cell 改动）
   * - inserts: 新增行（snapshot 中不存在的行索引）
   * - deletes: 待删除行（pendingDeletes 中标记的行）
   *
   * 注意：
   * - rowIdx 是 0-based 数据行索引(即 content[rowIdx+1],因为 content[0] 是表头)
   * - 同一行如果既被标记为整行变更(rowKey)又有单元格级标记(cellKey),
   *   按"行不在 snapshot 中" → insert,"行在 snapshot 中" → updates 处理
   * - inserts 的 data 用 **中文列名**(即 sheet.content[0] 中的字符串)作为 key
   * - 自动跳过 row_id 列(SQLite 模式下 row_id 是自增主键,API 会自动生成)
   * - aiDiffMap 不纳入 updates(AI 变更已经在数据库中,无须再次写入)
   * - 跳过撤回标记 __undo_pending__
   * - 不会执行任何 await 或 API 调用,纯计算
   */
  function getDetailedChanges(): {
    updates: Array<{ tableName: string; tableId: string; rowIdx: number; colIdx: number; value: string }>;
    inserts: Array<{ tableName: string; tableId: string; rowIdx: number; data: Record<string, string> }>;
    deletes: Array<{ tableName: string; tableId: string; rowIdx: number }>;
  } {
    const updates: Array<{ tableName: string; tableId: string; rowIdx: number; colIdx: number; value: string }> = [];
    const inserts: Array<{ tableName: string; tableId: string; rowIdx: number; data: Record<string, string> }> = [];
    const deletes: Array<{ tableName: string; tableId: string; rowIdx: number }> = [];

    if (!stagedData.value) {
      return { updates, inserts, deletes };
    }

    // ========================================================
    // 内部工具：解析 diff key,区分 cellKey 与 rowKey
    //   cellKey: ${tableName}-${rowIdx}-${colIdx}
    //   rowKey:  ${tableName}-row-${rowIdx}
    // 复用 extractTableIdFromKey 处理 tableName 含连字符的情况。
    // ========================================================
    function parseDiffKey(
      key: string,
    ):
      | { type: 'cell'; tableName: string; rowIdx: number; colIdx: number }
      | { type: 'row'; tableName: string; rowIdx: number }
      | null {
      const tableName = extractTableIdFromKey(key);
      if (!tableName) return null;
      // 去掉 "tableName-" 前缀
      const rest = key.substring(tableName.length + 1);
      const restParts = rest.split('-');

      // rowKey: tableName-row-rowIdx
      if (restParts.length === 2 && restParts[0] === 'row') {
        const rowIdx = parseInt(restParts[1], 10);
        if (isNaN(rowIdx)) return null;
        return { type: 'row', tableName, rowIdx };
      }

      // cellKey: tableName-rowIdx-colIdx
      if (restParts.length === 2) {
        const rowIdx = parseInt(restParts[0], 10);
        const colIdx = parseInt(restParts[1], 10);
        if (isNaN(rowIdx) || isNaN(colIdx)) return null;
        return { type: 'cell', tableName, rowIdx, colIdx };
      }

      return null;
    }

    // 在 RawDatabaseData 中按 name 查找 sheet
    function findSheetByName(data: RawDatabaseData | null, tableName: string): any | null {
      if (!data) return null;
      for (const sheetId in data) {
        if (data[sheetId]?.name === tableName) {
          return data[sheetId];
        }
      }
      return null;
    }

    // ========================================================
    // Step 1: 识别 inserts (新增行)
    //   来源: manualDiffMap 中的 rowKey
    //   条件: stagedData 中有该行 && snapshot 中没有该行
    // ========================================================
    const insertedRows = new Set<string>(); // 已识别为 insert 的 "tableName|rowIdx"

    for (const key of manualDiffMap) {
      if (key === '__undo_pending__') continue;

      const parsed = parseDiffKey(key);
      if (!parsed) {
        console.warn(`[ACU] getDetailedChanges: 无法解析 manualDiffMap key: ${key}`);
        continue;
      }
      if (parsed.type !== 'row') continue;

      const { tableName, rowIdx } = parsed;

      const tableId = getTableIdByName(tableName);
      if (!tableId) {
        console.warn(`[ACU] getDetailedChanges: 找不到表格 ID: ${tableName}`);
        continue;
      }

      const stagedSheet = findSheetByName(stagedData.value, tableName);
      const snapSheet = findSheetByName(snapshot.value, tableName);

      const stagedRow = stagedSheet?.content?.[rowIdx + 1];
      const snapRow = snapSheet?.content?.[rowIdx + 1];

      // 仅在 stagedData 有但 snapshot 没有时,视为新增
      if (stagedRow && !snapRow) {
        const headers: any[] = stagedSheet?.content?.[0] ?? [];
        const data: Record<string, string> = {};
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const colName = String(headers[colIdx] ?? '');
          // SQLite 模式下 row_id 是自增主键,跳过
          if (colName === 'row_id') continue;
          // 兼容空列名:跳过(避免 data 中出现 '' key)
          if (!colName) continue;
          data[colName] = String(stagedRow[colIdx] ?? '');
        }
        inserts.push({ tableName, tableId, rowIdx, data });
        insertedRows.add(`${tableName}|${rowIdx}`);
      }
      // 其他情况(行已在 snapshot 中)的整行 rowKey:
      // 通常对应"用户编辑了行内某些 cell" + 同步加了 rowKey 标记的场景,
      // 让 cellKey 那边处理为 updates 即可,这里不重复发起。
    }

    // ========================================================
    // Step 2: 识别 updates (单元格更新)
    //   来源: manualDiffMap 中的 cellKey
    //   排除: 已在 inserts 列表中的行
    //   注:   aiDiffMap 不纳入(AI 变更已在数据库中,无须再写一次)
    // ========================================================
    for (const key of manualDiffMap) {
      if (key === '__undo_pending__') continue;

      const parsed = parseDiffKey(key);
      if (!parsed) continue; // 已在 Step 1 警告过
      if (parsed.type !== 'cell') continue;

      const { tableName, rowIdx, colIdx } = parsed;

      // 该行已识别为 insert,整行会被一并写入,无须额外 update
      if (insertedRows.has(`${tableName}|${rowIdx}`)) continue;

      const tableId = getTableIdByName(tableName);
      if (!tableId) {
        console.warn(`[ACU] getDetailedChanges: 找不到表格 ID: ${tableName}`);
        continue;
      }

      const stagedSheet = findSheetByName(stagedData.value, tableName);
      const stagedRow = stagedSheet?.content?.[rowIdx + 1];
      if (!stagedRow) {
        console.warn(`[ACU] getDetailedChanges: stagedData 中找不到行: ${tableName}[${rowIdx}]`);
        continue;
      }

      const value = String(stagedRow[colIdx] ?? '');
      updates.push({ tableName, tableId, rowIdx, colIdx, value });
    }

    // ========================================================
    // Step 3: 识别 deletes (待删除行)
    //   来源: pendingDeletes 中的 rowKey
    //   条件: snapshot 中存在该行(避免删一个本就不存在的行)
    // ========================================================
    for (const key of pendingDeletes) {
      if (key === '__undo_pending__') continue;

      const parsed = parseDiffKey(key);
      if (!parsed) {
        console.warn(`[ACU] getDetailedChanges: 无法解析 pendingDeletes key: ${key}`);
        continue;
      }
      if (parsed.type !== 'row') continue; // 只处理 rowKey

      const { tableName, rowIdx } = parsed;

      const tableId = getTableIdByName(tableName);
      if (!tableId) {
        console.warn(`[ACU] getDetailedChanges: 找不到表格 ID: ${tableName}`);
        continue;
      }

      const snapSheet = findSheetByName(snapshot.value, tableName);
      const snapRow = snapSheet?.content?.[rowIdx + 1];
      if (!snapRow) {
        // 该行原本就不在数据库中,无须删除
        console.warn(`[ACU] getDetailedChanges: snapshot 中找不到要删除的行,跳过: ${tableName}[${rowIdx}]`);
        continue;
      }

      deletes.push({ tableName, tableId, rowIdx });
    }

    // 同类操作内按 (tableName, rowIdx) 排序,便于日志和调试
    updates.sort((a, b) => {
      if (a.tableName !== b.tableName) return a.tableName < b.tableName ? -1 : 1;
      if (a.rowIdx !== b.rowIdx) return a.rowIdx - b.rowIdx;
      return a.colIdx - b.colIdx;
    });
    inserts.sort((a, b) => {
      if (a.tableName !== b.tableName) return a.tableName < b.tableName ? -1 : 1;
      return a.rowIdx - b.rowIdx;
    });
    deletes.sort((a, b) => {
      if (a.tableName !== b.tableName) return a.tableName < b.tableName ? -1 : 1;
      return a.rowIdx - b.rowIdx;
    });

    return { updates, inserts, deletes };
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
    lastSavedData,

    // Getters
    hasPendingDeletes,
    hasUnsavedChanges,
    hasChanges,
    getModifiedTableIds,
    hasUndoData,
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
    hasTableAiChanges,
    getTablesWithAiChanges,
    // 状态检查 (兼容旧 API)
    isRowChanged,
    isRowPendingDelete,
    isPendingDelete,
    isCellChanged,

    // 详细变更(用于 SQLite 模式逐条提交)
    getDetailedChanges,

    // 辅助函数
    getRowKey,
    getCellKey,
    clearChanges,
    syncToStagedData,

    // 快照管理
    loadSnapshot,
    saveSnapshot,
    clearSnapshot,

    // 撤回功能
    saveLastState,
    undoToLastSave,
    clearUndoCache,
    getUndoData,

    // 完整性检测
    integrityIssues,
    hasIntegrityIssues,
    problematicTables,
    integrityStats,
    /**
     * 执行完整性检测（包装函数）
     * 只检测 AI 填表新增的行
     */
    checkIntegrity: (data: RawDatabaseData | null) => {
      // 传入当前快照和 aiDiffMap
      integrityChecker.checkIntegrity(data, snapshot.value, aiDiffMap);
    },
    hasTableIssues: integrityChecker.hasTableIssues,
    getTableIssues: integrityChecker.getTableIssues,
    getIntegritySummary: integrityChecker.getSummaryText,
    clearIntegrityIssues: integrityChecker.clearIssues,
    isSummaryOrOutlineTable,
  };
});
