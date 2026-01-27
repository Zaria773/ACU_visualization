/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * useAppContextMenu.ts - App 右键菜单 Composable
 *
 * 提取自 App.vue，负责：
 * - 右键菜单状态管理
 * - 右键菜单操作（插入/复制/删除）
 */

import { reactive } from 'vue';
import { useDataStore } from '../stores/useDataStore';
import type { TableRow } from '../types';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  tableId: string;
  tableName: string;
  rowIndex: number;
  isDeleting: boolean;
}

export interface UseAppContextMenuOptions {
  /** 获取处理后的表格数据 */
  getProcessedTables: () => { id: string; name: string; rows: TableRow[] }[];
  /** 插入行处理函数 */
  handleInsertRow: (tableId: string, afterIndex: number) => Promise<void>;
  /** 切换删除状态处理函数 */
  handleToggleDelete: (tableId: string, rowIndex: number) => void;
}

export function useAppContextMenu(options: UseAppContextMenuOptions) {
  const { getProcessedTables, handleInsertRow, handleToggleDelete } = options;
  const dataStore = useDataStore();

  /** 右键菜单状态 */
  const contextMenuState = reactive<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    tableId: '',
    tableName: '',
    rowIndex: 0,
    isDeleting: false,
  });

  /** 显示右键菜单 */
  function handleContextMenu(event: MouseEvent, tableId: string, rowIndex: number): void {
    // 使用表名生成 rowKey（与 DataCard 保持一致）
    const tables = getProcessedTables();
    const table = tables.find(t => t.id === tableId);
    const tableName = table?.name || tableId;
    const rowKey = `${tableName}-row-${rowIndex}`;

    contextMenuState.visible = true;
    contextMenuState.x = event.clientX;
    contextMenuState.y = event.clientY;
    contextMenuState.tableId = tableId;
    contextMenuState.tableName = tableName;
    contextMenuState.rowIndex = rowIndex;
    contextMenuState.isDeleting = dataStore.pendingDeletes.has(rowKey);
  }

  /** 右键菜单 - 插入行 */
  function handleContextInsertRow(): void {
    handleInsertRow(contextMenuState.tableId, contextMenuState.rowIndex);
    contextMenuState.visible = false;
  }

  /** 右键菜单 - 复制 */
  function handleContextCopy(): void {
    const tables = getProcessedTables();
    const table = tables.find(t => t.id === contextMenuState.tableId);
    const row = table?.rows[contextMenuState.rowIndex];
    if (row) {
      const text = row.cells.map(c => `${c.key}: ${c.value}`).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        console.info('[ACU] 内容已复制');
      });
    }
    contextMenuState.visible = false;
  }

  /** 右键菜单 - 删除 */
  function handleContextDelete(): void {
    handleToggleDelete(contextMenuState.tableId, contextMenuState.rowIndex);
    contextMenuState.visible = false;
  }

  /** 右键菜单 - 撤销删除 */
  function handleContextUndoDelete(): void {
    handleToggleDelete(contextMenuState.tableId, contextMenuState.rowIndex);
    contextMenuState.visible = false;
  }

  return {
    contextMenuState,
    handleContextMenu,
    handleContextInsertRow,
    handleContextCopy,
    handleContextDelete,
    handleContextUndoDelete,
  };
}
