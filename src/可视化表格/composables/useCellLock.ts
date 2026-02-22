/**
 * 单元格锁定管理器 Composable
 *
 * 支持：
 * - 单元格级锁定和整行锁定
 * - 按聊天 ID 隔离（存储在 ConfigManager 中）
 * - 批量锁定模式（临时锁定 → 保存）
 * - 同步到数据库 API（syncToDatabase），由后端原生拦截 AI 修改
 *
 * 注意：applyLocks 为遗留方法，当前由 syncToDatabase 替代，
 * 后端 API 原生支持锁定拦截，无需前端在 AI 填表后手动恢复值。
 */

import { computed, ref } from 'vue';
import { getCore } from '../utils/index';
import type { LockStorage, RowLockInfo } from './storageKeys';
import { getACUConfigManager } from './useACUConfigManager';

// ============================================================
// 常量
// ============================================================

/** 各表的主键字段定义 */
const PRIMARY_KEYS: Record<string, string | null> = {
  全局数据表: null,
  世界地图点: '详细地点',
  地图元素表: '元素名称',
  主角信息: '姓名',
  重要人物表: '姓名',
  技能表: '技能名称',
  物品表: '物品名称',
  装备表: '装备名称',
  任务表: '名称',
  总结表: '编码索引',
  总体大纲: '编码索引',
  重要情报: '情报名称',
  势力: '名称',
};

// ============================================================
// 辅助函数
// ============================================================

/** 获取当前聊天 ID */
function getCurrentChatId(): string {
  return SillyTavern.getCurrentChatId() || 'default';
}

// ============================================================
// 模块级单例状态（所有组件共享）
// ============================================================

/** 持久化锁定状态（从 ConfigManager 加载） */
const persistedLocks = ref<LockStorage>({});

/** 批量模式下的临时锁定状态 */
const pendingLocks = ref<LockStorage>({});

/** 当前聊天 ID（用于判断是否需要重新加载） */
let currentChatId: string | null = null;

// ============================================================
// 主 Composable
// ============================================================

export function useCellLock() {
  const configManager = getACUConfigManager();

  /** 从 ConfigManager 加载锁定数据 */
  function loadLocks(): LockStorage {
    const chatId = getCurrentChatId();

    // 聊天变化时重新加载
    if (currentChatId !== chatId) {
      currentChatId = chatId;
      const chatConfig = configManager.getChatConfig(chatId);
      persistedLocks.value = chatConfig.cellLocks || {};
    }

    return persistedLocks.value;
  }

  /** 保存锁定数据到 ConfigManager */
  function saveLocks(): void {
    const chatId = getCurrentChatId();
    configManager.setChatConfig(chatId, { cellLocks: { ...persistedLocks.value } });
    console.info('[CellLock] 锁定数据已保存到 ConfigManager');
  }

  /**
   * 解析 rowKey 字符串，提取主键信息
   * rowKey 格式：
   * - "fieldName=fieldValue" (主键匹配)
   * - "_row_N" (索引匹配)
   */
  function parseRowKey(rowKey: string): { type: 'pk'; field: string; value: string } | { type: 'index'; index: number } | null {
    if (rowKey.startsWith('_row_')) {
      const idx = parseInt(rowKey.substring(5), 10);
      return Number.isFinite(idx) ? { type: 'index', index: idx } : null;
    }
    const eqIdx = rowKey.indexOf('=');
    if (eqIdx > 0) {
      return { type: 'pk', field: rowKey.substring(0, eqIdx), value: rowKey.substring(eqIdx + 1) };
    }
    return null;
  }

  /**
   * 根据前端 rowKey 找到数据中的行索引
   * 直接解析 rowKey 格式进行匹配，避免依赖 getRowKey() 的 fallback 逻辑导致不一致
   */
  function findRowIndexByKey(
    _tableName: string,
    rowKey: string,
    content: (string | number | null)[][],
    headers: string[]
  ): number {
    const parsed = parseRowKey(rowKey);
    if (!parsed) return -1;

    if (parsed.type === 'index') {
      // 直接索引引用，验证范围有效性
      return parsed.index < content.length - 1 ? parsed.index : -1;
    }

    // 主键查找：在 headers 中找到字段列，然后在数据行中匹配值
    const colIdx = headers.indexOf(parsed.field);
    if (colIdx === -1) return -1;

    for (let i = 1; i < content.length; i++) {
      if (String(content[i][colIdx] ?? '') === parsed.value) {
        return i - 1; // 返回 0-based 行索引
      }
    }

    return -1;
  }

  /** 同步前端锁定状态到数据库 API */
  function syncToDatabase(locks: LockStorage): void {
    const api = getCore().getDB();
    if (!api?.setTableLockState) {
      console.warn('[CellLock] 数据库锁定 API 不可用，仅保存到 ConfigManager');
      return;
    }

    const tableData = api.exportTableAsJson?.();
    if (!tableData) return;

    for (const sheetKey in tableData) {
      if (!sheetKey.startsWith('sheet_')) continue;
      const tableName = tableData[sheetKey]?.name;
      if (!tableName) continue;

      const tableLocks = locks[tableName];
      if (!tableLocks || Object.keys(tableLocks).length === 0) {
        api.clearTableLocks?.(sheetKey);
        continue;
      }

      const content = tableData[sheetKey]?.content;
      if (!content || content.length < 2) continue;

      const headers = content[0] as string[];
      const rowIndices: number[] = [];
      const cellKeys: string[] = [];

      for (const [rowKey, lock] of Object.entries(tableLocks)) {
        const rowIndex = findRowIndexByKey(tableName, rowKey, content, headers);
        if (rowIndex === -1) continue;

        if (lock._fullRow) {
          rowIndices.push(rowIndex);
        } else {
          for (const fieldName of Object.keys(lock._fields)) {
            const colIndex = headers.indexOf(fieldName);
            // 后端列索引是 0-based 数据列（headers[0] 始终为 null，需要减 1）
            if (colIndex > 0) {
              cellKeys.push(`${rowIndex}:${colIndex - 1}`);
            }
          }
        }
      }

      api.setTableLockState(sheetKey, {
        rows: rowIndices,
        cols: [],
        cells: cellKeys,
      });
    }

    console.info('[CellLock] 锁定状态已同步到数据库 API');
  }

  // ============================================================
  // 批量锁定模式操作
  // ============================================================

  /** 初始化批量模式，从持久化状态复制 */
  function initPendingLocks(): void {
    loadLocks();
    // 深拷贝持久化状态作为初始值
    pendingLocks.value = JSON.parse(JSON.stringify(persistedLocks.value));
    // 首次同步：确保数据库锁定状态与 ConfigManager 一致
    if (Object.keys(persistedLocks.value).length > 0) {
      syncToDatabase(persistedLocks.value);
    }
  }

  /** 保存临时锁定到持久化存储 */
  function savePendingLocks(): void {
    persistedLocks.value = JSON.parse(JSON.stringify(pendingLocks.value));
    saveLocks();
    syncToDatabase(persistedLocks.value);  // 新增：同步到数据库 API
  }

  /** 丢弃临时锁定，恢复到持久化状态 */
  function discardPendingLocks(): void {
    pendingLocks.value = {};
  }

  // ============================================================
  // 行键生成
  // ============================================================

  /**
   * 生成行的唯一标识键
   * @param tableName 表名
   * @param row 行数据数组
   * @param headers 表头数组
   * @param rowIndex 可选的行索引，用于 fallback
   */
  function getRowKey(tableName: string, row: (string | null)[], headers: string[], rowIndex?: number): string | null {
    const pkField = PRIMARY_KEYS[tableName];

    // 全局数据表只有一行
    if (pkField === null) return '_row_0';

    let fieldIndex = 1; // 默认使用第二列
    if (pkField) {
      const idx = headers.indexOf(pkField);
      if (idx !== -1) fieldIndex = idx;
    }

    const value = row[fieldIndex];

    // 如果主键值存在，使用主键值
    if (value) {
      return `${pkField || headers[fieldIndex]}=${value}`;
    }

    // Fallback：如果提供了行索引，使用行索引作为唯一键
    if (rowIndex !== undefined) {
      return `_row_${rowIndex}`;
    }

    // 尝试其他列的值作为 fallback
    for (let i = 0; i < row.length; i++) {
      if (row[i] && i !== 0) {
        return `${headers[i] || `col${i}`}=${row[i]}`;
      }
    }

    return null;
  }

  // ============================================================
  // 锁定操作（批量模式）
  // ============================================================

  /**
   * 切换单元格锁定状态
   * @param tableName 表名
   * @param rowKey 行键
   * @param fieldName 字段名
   * @param value 当前值（用于锁定时保存）
   */
  function toggleCellLock(tableName: string, rowKey: string, fieldName: string, value: string): boolean {
    // 深拷贝以触发响应式更新
    const newLocks: LockStorage = JSON.parse(JSON.stringify(pendingLocks.value));

    if (!newLocks[tableName]) {
      newLocks[tableName] = {};
    }
    if (!newLocks[tableName][rowKey]) {
      newLocks[tableName][rowKey] = {
        _fullRow: false,
        _fields: {},
        _snapshot: null,
      };
    }

    const lock = newLocks[tableName][rowKey];
    let result: boolean;

    // 如果是整行锁定，需要从 snapshot 中移除这个字段
    if (lock._fullRow && lock._snapshot) {
      if (lock._snapshot[fieldName] !== undefined) {
        delete lock._snapshot[fieldName];
        // 如果 snapshot 为空，取消整行锁定
        if (Object.keys(lock._snapshot).length === 0) {
          lock._fullRow = false;
          lock._snapshot = null;
        }
        result = false; // 解锁
      } else {
        // 字段不在 snapshot 中，添加到 fields
        lock._fields[fieldName] = value;
        result = true; // 锁定
      }
    } else if (lock._fields[fieldName] !== undefined) {
      // 字段级锁定切换 - 已锁定则解锁
      delete lock._fields[fieldName];
      result = false; // 解锁
    } else {
      // 字段级锁定切换 - 未锁定则锁定
      lock._fields[fieldName] = value;
      result = true; // 锁定
    }

    // 清理空锁定
    if (!lock._fullRow && Object.keys(lock._fields).length === 0) {
      delete newLocks[tableName][rowKey];
      if (Object.keys(newLocks[tableName]).length === 0) {
        delete newLocks[tableName];
      }
    }

    // 触发响应式更新
    pendingLocks.value = newLocks;
    console.log(
      '[CellLock] toggleCellLock:',
      tableName,
      rowKey,
      fieldName,
      '->',
      result,
      'count:',
      countLocks(newLocks),
    );
    return result;
  }

  /** 计算锁定数量 */
  function countLocks(locks: LockStorage): number {
    let count = 0;
    for (const tableLocks of Object.values(locks)) {
      if (typeof tableLocks !== 'object') continue;
      for (const lock of Object.values(tableLocks)) {
        if (lock._fullRow) {
          count += Object.keys(lock._snapshot || {}).length;
        } else {
          count += Object.keys(lock._fields || {}).length;
        }
      }
    }
    return count;
  }

  /**
   * 切换整行锁定状态
   * @param tableName 表名
   * @param rowKey 行键
   * @param headers 表头数组
   * @param row 行数据数组
   */
  function toggleRowLock(tableName: string, rowKey: string, headers: string[], row: (string | null)[]): boolean {
    // 深拷贝以触发响应式更新
    const newLocks: LockStorage = JSON.parse(JSON.stringify(pendingLocks.value));

    if (!newLocks[tableName]) {
      newLocks[tableName] = {};
    }

    const lock = newLocks[tableName]?.[rowKey];

    // 如果已经是整行锁定，则解锁
    if (lock?._fullRow) {
      delete newLocks[tableName][rowKey];
      if (Object.keys(newLocks[tableName]).length === 0) {
        delete newLocks[tableName];
      }
      pendingLocks.value = newLocks;
      console.log('[CellLock] toggleRowLock: 解锁整行', tableName, rowKey);
      return false; // 解锁
    }

    // 创建整行快照
    const snapshot: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h && row[i] != null && row[i] !== '') {
        snapshot[h] = row[i] as string;
      }
    });

    newLocks[tableName][rowKey] = {
      _fullRow: true,
      _fields: {},
      _snapshot: snapshot,
    };

    pendingLocks.value = newLocks;
    console.log('[CellLock] toggleRowLock: 锁定整行', tableName, rowKey, 'fields:', Object.keys(snapshot).length);
    return true; // 锁定
  }

  /** 清理空的锁定记录 */
  function cleanupEmptyLock(tableName: string, rowKey: string): void {
    const lock = pendingLocks.value[tableName]?.[rowKey];
    if (!lock) return;

    if (!lock._fullRow && Object.keys(lock._fields).length === 0) {
      delete pendingLocks.value[tableName][rowKey];
      if (Object.keys(pendingLocks.value[tableName]).length === 0) {
        delete pendingLocks.value[tableName];
      }
    }
  }

  // ============================================================
  // 锁定状态查询（批量模式）
  // ============================================================

  /**
   * 检查单元格是否被锁定（批量模式下）
   */
  function isCellLockedPending(tableName: string, rowKey: string, fieldName: string): boolean {
    const lock = pendingLocks.value[tableName]?.[rowKey];
    if (!lock) return false;
    if (lock._fullRow) return lock._snapshot?.[fieldName] !== undefined;
    return lock._fields?.[fieldName] !== undefined;
  }

  /**
   * 检查整行是否被锁定（批量模式下）
   */
  function isRowLockedPending(tableName: string, rowKey: string): boolean {
    return pendingLocks.value[tableName]?.[rowKey]?._fullRow === true;
  }

  /**
   * 获取某行所有被锁定的字段名列表（批量模式下）
   */
  function getLockedFieldsPending(tableName: string, rowKey: string): string[] {
    const lock = pendingLocks.value[tableName]?.[rowKey];
    if (!lock) return [];
    if (lock._fullRow) return Object.keys(lock._snapshot || {});
    return Object.keys(lock._fields || {});
  }

  // ============================================================
  // 锁定状态查询（持久化状态）
  // ============================================================

  /**
   * 检查单元格是否被锁定（持久化状态）
   */
  function isCellLocked(tableName: string, rowKey: string, fieldName: string): boolean {
    loadLocks();
    const lock = persistedLocks.value[tableName]?.[rowKey];
    if (!lock) return false;
    if (lock._fullRow) return lock._snapshot?.[fieldName] !== undefined;
    return lock._fields?.[fieldName] !== undefined;
  }

  /**
   * 检查整行是否被锁定（持久化状态）
   */
  function isRowLocked(tableName: string, rowKey: string): boolean {
    loadLocks();
    return persistedLocks.value[tableName]?.[rowKey]?._fullRow === true;
  }

  // ============================================================
  // AI 数据保护
  // ============================================================

  /**
   * 更新锁定单元格的存储值
   * 当用户手动编辑锁定单元格时调用，确保锁定值与用户修改同步
   *
   * @param tableName 表名
   * @param rowKey 行键
   * @param fieldName 字段名
   * @param newValue 新值
   * @returns 是否更新成功
   */
  function updateLockedValue(tableName: string, rowKey: string, fieldName: string, newValue: string): boolean {
    loadLocks();
    const lock = persistedLocks.value[tableName]?.[rowKey];
    if (!lock) return false;

    let updated = false;

    // 检查并更新整行锁定的快照
    if (lock._fullRow && lock._snapshot && lock._snapshot[fieldName] !== undefined) {
      lock._snapshot[fieldName] = newValue;
      updated = true;
    }

    // 检查并更新字段级锁定
    if (lock._fields && lock._fields[fieldName] !== undefined) {
      lock._fields[fieldName] = newValue;
      updated = true;
    }

    if (updated) {
      saveLocks();
      console.log('[CellLock] updateLockedValue:', tableName, rowKey, fieldName, '->', newValue);
    }

    return updated;
  }

  /**
   * 应用锁定，恢复被 AI 修改的值
   * @param tableName 表名
   * @param tableContent 表数据（包含表头）
   * @returns 处理结果
   */
  function applyLocks(
    tableName: string,
    tableContent: (string | number | null)[][],
  ): { modified: boolean; restored: string[] } {
    loadLocks();
    const tableLocks = persistedLocks.value[tableName];

    if (!tableLocks || !tableContent || tableContent.length < 2) {
      return { modified: false, restored: [] };
    }

    const headers = tableContent[0] as string[];
    const restored: string[] = [];
    let modified = false;

    // 建立现有行的索引
    // 关键修复：传入行索引 (i-1)，确保与锁定时生成的 key 一致
    const rowIndexMap: Record<string, number> = {};
    for (let i = 1; i < tableContent.length; i++) {
      // 修复：传入 i-1 作为行索引（与 DataCard.vue 中 data.index 一致）
      const key = getRowKey(tableName, tableContent[i] as (string | null)[], headers, i - 1);
      if (key) rowIndexMap[key] = i;
    }

    for (const [rowKey, lock] of Object.entries(tableLocks)) {
      const idx = rowIndexMap[rowKey];

      if (idx === undefined) {
        // 行不存在，尝试重建
        const newRow = rebuildRow(headers, lock);
        if (newRow) {
          tableContent.push(newRow);
          restored.push(rowKey);
          modified = true;
          console.info(`[CellLock] 恢复被删除的锁定行: ${rowKey}`);
        }
        continue;
      }

      const row = tableContent[idx];
      const fields = lock._fullRow ? lock._snapshot : lock._fields;

      if (fields) {
        for (const [field, value] of Object.entries(fields)) {
          const colIdx = headers.indexOf(field);
          if (colIdx !== -1 && row[colIdx] !== value) {
            console.info(
              `[CellLock] 恢复锁定值: ${tableName}[${rowKey}].${field} = "${value}" (原值: "${row[colIdx]}")`,
            );
            row[colIdx] = value;
            modified = true;
          }
        }
      }
    }

    return { modified, restored };
  }

  /** 重建被删除的行 */
  function rebuildRow(headers: string[], lock: RowLockInfo): (string | null)[] | null {
    const fields = lock._fullRow ? lock._snapshot : lock._fields;
    if (!fields || Object.keys(fields).length === 0) return null;

    const row: (string | null)[] = new Array(headers.length).fill(null);
    for (const [field, value] of Object.entries(fields)) {
      const idx = headers.indexOf(field);
      if (idx !== -1) row[idx] = value;
    }
    return row;
  }

  // ============================================================
  // 统计信息
  // ============================================================

  /** 批量模式下锁定的单元格总数 */
  const pendingLockCount = computed(() => {
    let count = 0;
    for (const tableLocks of Object.values(pendingLocks.value)) {
      if (typeof tableLocks !== 'object') continue;
      for (const lock of Object.values(tableLocks)) {
        if (lock._fullRow) {
          count += Object.keys(lock._snapshot || {}).length;
        } else {
          count += Object.keys(lock._fields || {}).length;
        }
      }
    }
    return count;
  });

  /**
   * 检查行是否有任何锁定（用于筛选功能）
   * @param tableName 表名
   * @param rowKey 行键
   */
  function hasRowAnyLockPending(tableName: string, rowKey: string): boolean {
    const lock = pendingLocks.value[tableName]?.[rowKey];
    if (!lock) return false;
    if (lock._fullRow) return true;
    return Object.keys(lock._fields || {}).length > 0;
  }

  // ============================================================
  // 导出
  // ============================================================

  return {
    // 初始化
    loadLocks,
    initPendingLocks,

    // 行键生成
    getRowKey,

    // 批量模式操作
    pendingLocks,
    toggleCellLock,
    toggleRowLock,
    savePendingLocks,
    discardPendingLocks,

    // 批量模式查询
    isCellLockedPending,
    isRowLockedPending,
    getLockedFieldsPending,
    hasRowAnyLockPending,

    // 持久化状态查询
    isCellLocked,
    isRowLocked,

    // AI 数据保护
    applyLocks,
    updateLockedValue,

    // 统计
    pendingLockCount,
  };
}
