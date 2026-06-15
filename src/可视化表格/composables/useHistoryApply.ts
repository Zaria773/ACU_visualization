/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * useHistoryApply.ts - 历史记录弹窗打开与应用逻辑
 */

import { useDataStore } from '../stores/useDataStore';
import { useUIStore } from '../stores/useUIStore';
import type { TableRow } from '../types';
import { useRowHistory } from './useRowHistory';

export interface UseHistoryApplyOptions {
  getProcessedTables: () => { id: string; name: string; headers?: string[]; rows: TableRow[] }[];
}

export function useHistoryApply(options: UseHistoryApplyOptions) {
  const dataStore = useDataStore();
  const uiStore = useUIStore();

  function handleShowHistory(tableId: string, tableName: string, rowIndex: number, rowData: TableRow): void {
    const table = options.getProcessedTables().find(t => t.id === tableId);
    let titleColIndex = 1;
    if (table && (tableName.includes('总结') || tableName.includes('大纲'))) {
      const idx = (table.headers || []).findIndex(
        h => h && (h.includes('索引') || h.includes('编号') || h.includes('代码')),
      );
      titleColIndex = idx > 0 ? idx : 1;
    }

    uiStore.openHistoryDialog({
      tableId,
      tableName,
      rowIndex,
      currentRowData: rowData,
      titleColIndex,
    });
    console.info(`[ACU] 打开历史记录: ${tableName}[${rowIndex}], titleColIndex=${titleColIndex}`);
  }

  async function handleHistoryApply(changes: Map<number, string>): Promise<void> {
    const { tableName, rowIndex, currentRowData } = uiStore.historyDialog.props;

    if (!currentRowData || changes.size === 0) {
      uiStore.closeHistoryDialog();
      return;
    }

    const { saveSnapshot, getCurrentChatId } = useRowHistory();
    const chatId = getCurrentChatId();
    if (chatId) {
      await saveSnapshot(tableName, rowIndex, tableRowToCells(currentRowData), 'manual');
      console.info('[ACU] 已保存历史记录（批量操作前）');
    }

    for (const [colIndex, value] of changes) {
      dataStore.updateCell(tableName, rowIndex, colIndex, value, { skipHistory: true });
    }

    console.info(`[ACU] 应用历史更改: ${changes.size} 个单元格`);
    uiStore.closeHistoryDialog();
  }

  function tableRowToCells(row: TableRow): Record<number, string> {
    const cells: Record<number, string> = {};
    row.cells.forEach((cell, index) => {
      cells[index] = String(cell.value);
    });
    return cells;
  }

  return {
    handleShowHistory,
    handleHistoryApply,
    tableRowToCells,
  };
}
