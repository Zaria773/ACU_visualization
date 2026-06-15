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

import { useDashboardStore } from '../stores/useDashboardStore';
import { useDataStore } from '../stores/useDataStore';
import type { TableRow } from '../types';
import { useCoreActions } from './useCoreActions';
import { useDataPersistence } from './useDataPersistence';
import { useTableUpdateStatus } from './useTableUpdateStatus';
import { toast } from './useToast';

export interface UseAppDataActionsOptions {
  /** 处理后的表格数据（响应式） */
  getProcessedTables: () => { id: string; name: string; rows: TableRow[] }[];
  /** 最大楼层索引 */
  getMaxFloorIndex: () => number;
}

export function useAppDataActions(options: UseAppDataActionsOptions) {
  const dataStore = useDataStore();
  const dashboardStore = useDashboardStore();
  const { saveToDatabase, getTableData, purgeFloorRange: executePurgeFloorRange } = useDataPersistence();
  const { refresh: refreshTableStatus } = useTableUpdateStatus();

  // ============================================================
  // 数据加载/刷新
  // ============================================================

  /** 加载数据 */
  async function loadData(): Promise<void> {
    const data = getTableData();
    if (data) {
      const processedData = dataStore.setStagedData(data);
      dataStore.saveSnapshot(processedData);

      const allTableIds = Object.keys(data).filter(k => k.startsWith('sheet_'));

      // 【已移除】syncNewTablesToVisibleTabs 会强制重置用户隐藏的表格
      // 新表格的可见性现在由 ConfigManager 的默认策略处理

      dashboardStore.cleanupInvalidWidgets(allTableIds);

      // 刷新后清除所有高亮标记（手动和AI）
      dataStore.clearChanges(true);

      dashboardStore.ensureDefaultWidgets().catch(err => {
        console.warn('[ACU] 补充默认组件失败（非阻塞）:', err);
      });

      refreshTableStatus().catch(err => {
        console.warn('[ACU] 刷新表格更新状态失败（非阻塞）:', err);
      });
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
      let targetIndex = floorIndex;
      if (floorIndex < 0) {
        const maxFloor = options.getMaxFloorIndex();
        targetIndex = maxFloor + 1 + floorIndex;
        if (targetIndex < 0) targetIndex = 0;
      }

      if (targetIndex < 0) targetIndex = 0;

      const success = await saveToDatabase(null, false, false, targetIndex);
      if (success) {
        console.info(`[ACU] 数据已保存到第 ${targetIndex} 楼`);
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
  };
}
