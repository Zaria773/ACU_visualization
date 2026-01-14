/**
 * 行历史记录 Composable
 * 封装业务逻辑：保存快照、获取历史、格式转换
 *
 * 设计说明：
 * - 每行最多保留 5 条历史快照
 * - 自动去重：如果内容完全相同则不保存
 * - 按聊天 ID 隔离，切换聊天时历史记录独立
 */

import { ref } from 'vue';
import * as db from './useIndexedDB';
import type { RowSnapshot } from './useIndexedDB';
import type { TableRow, TableCell } from '../types';

/** 每行最大保留的快照数量 */
const MAX_SNAPSHOTS_PER_ROW = 5;

/**
 * 获取当前聊天ID
 * 尝试从多个可能的位置获取 SillyTavern 的聊天 ID
 */
function getCurrentChatId(): string {
  try {
    // 尝试从父窗口获取 SillyTavern
    const ST = (window as any).SillyTavern || (window.parent as any)?.SillyTavern || (window.top as any)?.SillyTavern;

    if (ST?.getCurrentChatId) {
      const chatId = ST.getCurrentChatId();
      if (chatId) return chatId;
    }

    // 备选：尝试获取当前聊天文件名
    if (ST?.chat?.length > 0) {
      // 使用第一条消息的某个唯一标识
      const firstMsg = ST.chat[0];
      if (firstMsg?.chat_id) return firstMsg.chat_id;
    }
  } catch (e) {
    console.warn('[ACU History] 获取 chatId 失败:', e);
  }
  return 'default';
}

/**
 * 生成行唯一键
 * 注意：必须与 useDataStore.getRowKey 保持一致
 * @param tableName 表名
 * @param rowIndex 行索引
 */
function makeRowKey(tableName: string, rowIndex: number): string {
  return `${tableName}-row-${rowIndex}`;
}

/**
 * 比较两个 cells 对象是否相同
 */
function areCellsEqual(a: Record<number, string>, b: Record<number, string>): boolean {
  const keysA = Object.keys(a).map(Number);
  const keysB = Object.keys(b).map(Number);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}

/**
 * 行历史记录 Composable
 */
export function useRowHistory() {
  const isLoading = ref(false);

  /**
   * 保存行快照
   * 自动去重 + 限制条数
   *
   * @param tableName 表名
   * @param rowIndex 行索引
   * @param cells 单元格数据 (colIndex -> value)
   * @param source 变更来源 ('manual' | 'ai')
   */
  async function saveSnapshot(
    tableName: string,
    rowIndex: number,
    cells: Record<number, string>,
    source: 'manual' | 'ai',
  ): Promise<void> {
    try {
      isLoading.value = true;
      const chatId = getCurrentChatId();
      const rowKey = makeRowKey(tableName, rowIndex);

      // 获取现有历史
      const existing = await db.getSnapshots(chatId, rowKey);
      const sorted = existing.sort((a, b) => b.timestamp - a.timestamp);

      // 去重：如果最新快照的 cells 完全相同，跳过
      if (sorted.length > 0) {
        const latest = sorted[0];
        if (areCellsEqual(cells, latest.cells)) {
          console.info('[ACU History] 内容未变化，跳过记录');
          return;
        }
      }

      // 添加新快照
      await db.addSnapshot({
        chatId,
        rowKey,
        timestamp: Date.now(),
        source,
        cells,
      });

      console.info(`[ACU History] 已记录 ${rowKey} 的快照 (${source})`);

      // 超过限制则删除最旧的
      if (sorted.length >= MAX_SNAPSHOTS_PER_ROW) {
        const toDelete = sorted.slice(MAX_SNAPSHOTS_PER_ROW - 1);
        for (const snapshot of toDelete) {
          if (snapshot.id !== undefined) {
            await db.deleteSnapshot(snapshot.id);
          }
        }
        console.info(`[ACU History] 清理旧快照 ${toDelete.length} 条`);
      }
    } catch (e) {
      console.error('[ACU History] 保存快照失败:', e);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 获取行历史快照
   * 按时间倒序，最多返回 5 条
   *
   * @param tableName 表名
   * @param rowIndex 行索引
   */
  async function getSnapshots(tableName: string, rowIndex: number): Promise<RowSnapshot[]> {
    try {
      isLoading.value = true;
      const chatId = getCurrentChatId();
      const rowKey = makeRowKey(tableName, rowIndex);

      console.info('[ACU History] 查询快照, 参数:', { chatId, rowKey, tableName, rowIndex });

      const snapshots = await db.getSnapshots(chatId, rowKey);
      console.info('[ACU History] 查询结果:', snapshots.length, '条');

      return snapshots.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_SNAPSHOTS_PER_ROW);
    } catch (e) {
      console.error('[ACU History] 获取快照失败:', e);
      return [];
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 将快照转换为 TableRow 格式
   * 用于在 DataCard 中显示历史数据
   *
   * @param snapshot 快照数据
   * @param templateRow 模板行（提供 cells 结构，包含 key 等信息）
   */
  function snapshotToTableRow(snapshot: RowSnapshot, templateRow: TableRow): TableRow {
    return {
      index: templateRow.index,
      key: templateRow.key,
      cells: templateRow.cells.map((cell, colIndex) => ({
        ...cell,
        value: snapshot.cells[colIndex] !== undefined ? snapshot.cells[colIndex] : cell.value,
      })),
    };
  }

  /**
   * 从 TableRow 提取 cells 数据
   * 用于将当前行数据转换为可存储的格式
   *
   * @param row 行数据
   */
  function tableRowToCells(row: TableRow): Record<number, string> {
    const cells: Record<number, string> = {};
    row.cells.forEach((cell, index) => {
      cells[index] = cell.value;
    });
    return cells;
  }

  /**
   * 计算两个快照之间的差异
   * 返回发生变化的列索引集合
   *
   * @param oldSnapshot 旧快照
   * @param newCells 新的 cells 数据
   */
  function getDiff(oldSnapshot: RowSnapshot, newCells: Record<number, string>): Set<number> {
    const changedCols = new Set<number>();

    // 检查新数据中的变化
    for (const [key, value] of Object.entries(newCells)) {
      const colIndex = Number(key);
      if (oldSnapshot.cells[colIndex] !== value) {
        changedCols.add(colIndex);
      }
    }

    // 检查旧数据中被删除的列
    for (const key of Object.keys(oldSnapshot.cells)) {
      const colIndex = Number(key);
      if (newCells[colIndex] === undefined) {
        changedCols.add(colIndex);
      }
    }

    return changedCols;
  }

  /**
   * 格式化时间戳为相对时间
   * @param timestamp Unix 时间戳
   */
  function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 172800000) return '昨天';

    return new Date(timestamp).toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * 清除当前聊天的所有历史记录
   */
  async function clearCurrentChatHistory(): Promise<void> {
    try {
      const chatId = getCurrentChatId();
      await db.deleteByChat(chatId);
      console.info('[ACU History] 已清除当前聊天的历史记录');
    } catch (e) {
      console.error('[ACU History] 清除历史失败:', e);
    }
  }

  return {
    isLoading,
    saveSnapshot,
    getSnapshots,
    snapshotToTableRow,
    tableRowToCells,
    getDiff,
    formatRelativeTime,
    clearCurrentChatHistory,
    getCurrentChatId,
  };
}

// ============================================================
// 独立函数导出（供外部直接调用，无需实例化 composable）
// ============================================================

/**
 * 直接保存快照（无需实例化 composable）
 * 用于 useDataStore 等外部模块调用
 *
 * @param chatId 聊天ID
 * @param tableName 表名
 * @param row 行数据 (TableRow 格式)
 * @param source 变更来源 ('manual' | 'ai')
 */
export async function saveSnapshot(
  chatId: string,
  tableName: string,
  row: TableRow,
  source: 'manual' | 'ai',
): Promise<void> {
  try {
    const rowKey = makeRowKey(tableName, row.index);

    // 将 TableRow.cells 转换为 Record<number, string>
    const cells: Record<number, string> = {};
    row.cells.forEach((cell, index) => {
      cells[index] = String(cell.value);
    });

    // 获取现有历史
    const existing = await db.getSnapshots(chatId, rowKey);
    const sorted = existing.sort((a, b) => b.timestamp - a.timestamp);

    // 去重：如果最新快照的 cells 完全相同，跳过
    if (sorted.length > 0) {
      const latest = sorted[0];
      if (areCellsEqual(cells, latest.cells)) {
        console.info('[ACU History] 内容未变化，跳过记录');
        return;
      }
    }

    // 添加新快照
    await db.addSnapshot({
      chatId,
      rowKey,
      timestamp: Date.now(),
      source,
      cells,
    });

    console.info(`[ACU History] 已记录 ${rowKey} 的快照 (${source})`);

    // 超过限制则删除最旧的
    if (sorted.length >= MAX_SNAPSHOTS_PER_ROW) {
      const toDelete = sorted.slice(MAX_SNAPSHOTS_PER_ROW - 1);
      for (const snapshot of toDelete) {
        if (snapshot.id !== undefined) {
          await db.deleteSnapshot(snapshot.id);
        }
      }
      console.info(`[ACU History] 清理旧快照 ${toDelete.length} 条`);
    }
  } catch (e) {
    console.error('[ACU History] 保存快照失败:', e);
  }
}

// 重新导出类型
export type { RowSnapshot };
