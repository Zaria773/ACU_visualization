/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * useAppDataActions.ts - App 数据操作 Composable
 *
 * 提取自 App.vue，负责：
 * - 数据加载/刷新/保存
 * - 单元格/行操作
 * - 撤销/历史记录
 */

import { useDataStore } from '../stores/useDataStore';
import { useUIStore } from '../stores/useUIStore';
import type { TableRow } from '../types';
import { useCoreActions } from './useCoreActions';
import { useDataPersistence } from './useDataPersistence';
import { useRowHistory } from './useRowHistory';
import { toast } from './useToast';

export interface UseAppDataActionsOptions {
  /** 处理后的表格数据（响应式） */
  getProcessedTables: () => { id: string; name: string; rows: TableRow[] }[];
}

export function useAppDataActions(options: UseAppDataActionsOptions) {
  const dataStore = useDataStore();
  const uiStore = useUIStore();
  const { saveToDatabase, getTableData, purgeFloorRange: executePurgeFloorRange } = useDataPersistence();

  // ============================================================
  // 数据加载/刷新
  // ============================================================

  /** 加载数据 */
  async function loadData(): Promise<void> {
    const data = getTableData();
    if (data) {
      // setStagedData 内部应用锁定保护并返回处理后的数据
      const processedData = dataStore.setStagedData(data);
      // 使用处理后的数据保存快照，避免锁定单元格产生 AI 高亮
      dataStore.saveSnapshot(processedData);

      // 【注意】这里不调用 syncNewTablesToVisibleTabs
      // 初始化时不应该自动添加"隐藏的表格"，只有 AI 填表时才检测真正的新表格
      // syncNewTablesToVisibleTabs 的调用保留在 useApiCallbacks.ts 中（AI 填表回调）

      // 刷新后清除所有高亮标记（手动和AI）
      dataStore.clearChanges(true);
    }
  }

  /** 刷新数据 */
  async function handleRefresh(): Promise<void> {
    try {
      await loadData();
      console.info('[ACU] 数据已刷新');
    } catch (error) {
      console.error('[ACU] 刷新失败:', error);
    }
  }

  // ============================================================
  // 数据保存
  // ============================================================

  /** 保存数据 */
  async function handleSave(): Promise<void> {
    try {
      // 保存当前状态到撤回缓存（在保存操作前执行）
      dataStore.saveLastState();

      // 第三个参数 commitDeletes = true，确保删除操作被提交
      const success = await saveToDatabase(null, false, true);
      if (success) {
        console.info('[ACU] 数据已保存');
        // 刷新界面以显示最新数据
        await loadData();
      }
    } catch (error) {
      console.error('[ACU] 保存失败:', error);
    }
  }

  /** 保存到指定楼层 */
  async function handleSaveToFloor(floorIndex: number): Promise<void> {
    try {
      const success = await saveToDatabase(null, false, false, floorIndex);
      if (success) {
        console.info(`[ACU] 数据已保存到第 ${floorIndex} 楼`);
        // 另存为后刷新界面以显示最新数据
        await loadData();
      }
    } catch (error) {
      console.error('[ACU] 保存到指定楼层失败:', error);
    }
  }

  /** 清除范围 */
  async function handlePurgeRange(startFloor: number, endFloor: number): Promise<void> {
    try {
      await executePurgeFloorRange(startFloor, endFloor);
      console.info(`[ACU] 已清除第 ${startFloor} 到 ${endFloor} 楼的数据`);
      // 清除完成后刷新界面以显示最新数据
      await loadData();
    } catch (error) {
      console.error('[ACU] 清除范围失败:', error);
    }
  }

  // ============================================================
  // 撤销操作
  // ============================================================

  /** 撤回到上次保存 */
  function handleUndo(): void {
    if (!dataStore.hasUndoData) {
      toast.warning('没有可撤回的数据');
      return;
    }

    // 恢复内存状态（不写数据库，快速恢复）
    // 撤回后 manualDiffMap 会被填充，hasUnsavedChanges 变为 true
    const success = dataStore.undoToLastSave();
    if (success) {
      toast.success('已撤回到上次保存前的状态（需手动保存）');
      console.info('[ACU] 已撤回到上次保存前的状态, hasUnsavedChanges:', dataStore.hasUnsavedChanges);
    } else {
      toast.error('撤回失败');
    }
  }

  // ============================================================
  // 单元格/行操作
  // ============================================================

  /** 单元格点击 */
  function handleCellClick(tableId: string, rowIndex: number, colIndex: number): void {
    console.info(`[ACU] 单元格点击: ${tableId}[${rowIndex}][${colIndex}]`);
  }

  /** 行点击 */
  function handleRowClick(tableId: string, row: TableRow): void {
    console.info(`[ACU] 行点击: ${tableId}[${row.index}]`);
  }

  /** 插入行 */
  async function handleInsertRow(tableId: string, afterIndex: number): Promise<void> {
    console.info(`[ACU] 插入行: ${tableId} 在索引 ${afterIndex} 之后`);

    // 查找表格对应的原始 sheetId（tableId 就是 sheetId）
    const tables = options.getProcessedTables();
    const table = tables.find(t => t.id === tableId);
    if (!table) {
      console.warn('[ACU] 未找到表格:', tableId);
      return;
    }

    // 调用核心动作插入行
    const { insertRow } = useCoreActions();
    await insertRow(tableId, afterIndex);

    // 刷新数据以显示新行
    await loadData();
  }

  /** 切换删除状态 */
  function handleToggleDelete(tableId: string, rowIndex: number): void {
    // 找到对应的表名（DataCard 使用 tableName 生成 rowKey）
    const tables = options.getProcessedTables();
    const table = tables.find(t => t.id === tableId);
    const tableName = table?.name || tableId;
    const rowKey = `${tableName}-row-${rowIndex}`;
    dataStore.toggleDelete(rowKey);
    console.info(`[ACU] 切换删除状态: ${rowKey}`);
  }

  // ============================================================
  // 历史记录
  // ============================================================

  /** 应用历史记录更改 */
  async function handleHistoryApply(changes: Map<number, string>): Promise<void> {
    const { tableId, tableName, rowIndex, currentRowData } = uiStore.historyDialog.props;

    if (!currentRowData || changes.size === 0) {
      uiStore.closeHistoryDialog();
      return;
    }

    // 先保存编辑前的行状态作为历史记录
    const { saveSnapshot, getCurrentChatId } = useRowHistory();
    const chatId = getCurrentChatId();
    if (chatId) {
      await saveSnapshot(tableName, rowIndex, tableRowToCells(currentRowData), 'manual');
      console.info('[ACU] 已保存历史记录（批量操作前）');
    }

    // 批量应用每个单元格的更改，跳过单独的历史记录保存
    for (const [colIndex, value] of changes) {
      dataStore.updateCell(tableName, rowIndex, colIndex, value, { skipHistory: true });
    }

    console.info(`[ACU] 应用历史更改: ${changes.size} 个单元格`);
    uiStore.closeHistoryDialog();
  }

  /** 将 TableRow 转换为 cells 格式 */
  function tableRowToCells(row: TableRow): Record<number, string> {
    const cells: Record<number, string> = {};
    row.cells.forEach((cell, index) => {
      cells[index] = String(cell.value);
    });
    return cells;
  }

  return {
    // 数据加载
    loadData,
    handleRefresh,

    // 数据保存
    handleSave,
    handleSaveToFloor,
    handlePurgeRange,

    // 撤销
    handleUndo,

    // 单元格/行操作
    handleCellClick,
    handleRowClick,
    handleInsertRow,
    handleToggleDelete,

    // 历史记录
    handleHistoryApply,
    tableRowToCells,
  };
}
