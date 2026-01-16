/**
 * 单元格锁定管理器 Composable
 *
 * 移植自骰子可视化的 LockManager，支持：
 * - 单元格级锁定和整行锁定
 * - 按聊天 contextFingerprint 隔离
 * - 批量锁定模式（临时锁定 → 保存）
 * - AI 数据保护（applyLocks 恢复被修改的值）
 */

import { computed, ref } from 'vue';

// ============================================================
// 类型定义
// ============================================================

/** 单行的锁定信息 */
interface RowLockInfo {
  /** 是否整行锁定 */
  _fullRow: boolean;
  /** 字段级锁定的值 */
  _fields: Record<string, string>;
  /** 整行锁定时的完整快照 */
  _snapshot: Record<string, string> | null;
}

/** 表的锁定数据 */
type TableLocks = Record<string, RowLockInfo>;

/** 完整的锁定存储结构 */
interface LockStorage {
  [tableName: string]: TableLocks;
  _lastAccess?: number;
}

// ============================================================
// 常量
// ============================================================

const STORAGE_KEY_PREFIX = 'acu_locked_fields_v2_';
const MAX_CONTEXTS = 20;

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

/** 获取当前聊天的上下文指纹 */
function getCurrentContextFingerprint(): string {
  try {
    // 尝试从 SillyTavern 获取当前聊天 ID
    const ctx = (window as any).SillyTavern?.getContext?.();
    if (ctx?.chatId) {
      return ctx.chatId;
    }
    // 备用：使用角色名 + 聊天文件名
    if (ctx?.characterId && ctx?.chat?.length > 0) {
      return `${ctx.characterId}_${ctx.chat.length}`;
    }
  } catch {
    // ignore
  }
  return 'default';
}

/** 获取存储键 */
function getStorageKey(ctxId?: string): string {
  return STORAGE_KEY_PREFIX + (ctxId || getCurrentContextFingerprint());
}

// ============================================================
// 模块级单例状态（所有组件共享）
// ============================================================

/** 持久化锁定状态（从 localStorage 加载） */
const persistedLocks = ref<LockStorage>({});

/** 批量模式下的临时锁定状态 */
const pendingLocks = ref<LockStorage>({});

/** 当前上下文 ID（用于判断是否需要重新加载） */
let currentContextId: string | null = null;

// ============================================================
// 主 Composable
// ============================================================

export function useCellLock() {
  /** 从 localStorage 加载锁定数据 */
  function loadLocks(): LockStorage {
    const ctxId = getCurrentContextFingerprint();

    // 上下文变化时重新加载
    if (currentContextId !== ctxId) {
      currentContextId = ctxId;
      try {
        const stored = localStorage.getItem(getStorageKey(ctxId));
        if (stored) {
          const data = JSON.parse(stored);
          delete data._lastAccess;
          persistedLocks.value = data;
        } else {
          persistedLocks.value = {};
        }
      } catch {
        persistedLocks.value = {};
      }
    }

    return persistedLocks.value;
  }

  /** 保存锁定数据到 localStorage */
  function saveLocks(): void {
    try {
      const dataToSave = { ...persistedLocks.value, _lastAccess: Date.now() };
      localStorage.setItem(getStorageKey(), JSON.stringify(dataToSave));
      cleanupOldContexts();
    } catch (e) {
      console.warn('[CellLock] 保存失败', e);
    }
  }

  /** 清理过旧的锁定数据，只保留最近使用的 N 个 */
  function cleanupOldContexts(): void {
    try {
      const allKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(STORAGE_KEY_PREFIX)) {
          allKeys.push(key);
        }
      }

      if (allKeys.length <= MAX_CONTEXTS) return;

      const keyWithTime = allKeys.map(key => {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          return { key, time: data?._lastAccess || 0 };
        } catch {
          return { key, time: 0 };
        }
      });

      keyWithTime.sort((a, b) => b.time - a.time);
      const toDelete = keyWithTime.slice(MAX_CONTEXTS);
      toDelete.forEach(item => localStorage.removeItem(item.key));

      if (toDelete.length > 0) {
        console.log(`[CellLock] 清理了 ${toDelete.length} 个过期的锁定数据`);
      }
    } catch (e) {
      console.warn('[CellLock] 清理失败', e);
    }
  }

  // ============================================================
  // 批量锁定模式操作
  // ============================================================

  /** 初始化批量模式，从持久化状态复制 */
  function initPendingLocks(): void {
    loadLocks();
    // 深拷贝持久化状态作为初始值
    pendingLocks.value = JSON.parse(JSON.stringify(persistedLocks.value));
  }

  /** 保存临时锁定到持久化存储 */
  function savePendingLocks(): void {
    persistedLocks.value = JSON.parse(JSON.stringify(pendingLocks.value));
    saveLocks();
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
    } else {
      // 字段级锁定切换
      if (lock._fields[fieldName] !== undefined) {
        delete lock._fields[fieldName];
        result = false; // 解锁
      } else {
        lock._fields[fieldName] = value;
        result = true; // 锁定
      }
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
