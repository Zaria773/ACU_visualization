/**
 * 虚拟滚动 Composable
 * 封装 @vueuse/core 的 useVirtualList，适配 DashboardWidget 的 grid/list 两种模式
 */

import { useVirtualList } from '@vueuse/core';
import { computed, type Ref } from 'vue';

// ============================================================
// 类型定义
// ============================================================

/** useVirtualList 的返回类型 */
export type UseVirtualListReturn<T> = ReturnType<typeof useVirtualList<T>>;

// ============================================================
// 常量配置
// ============================================================

/** 列表模式每项高度 (px) */
export const LIST_ITEM_HEIGHT = 32;

/** 网格模式每项高度 (px) - 包含 padding 和 gap */
export const GRID_ITEM_HEIGHT = 48;

/** 网格模式每行最大列数 */
export const GRID_COLUMNS = 3;

/** 预渲染行数 */
export const OVERSCAN = 5;

// ============================================================
// 列表模式虚拟滚动
// ============================================================

/**
 * 列表模式虚拟滚动
 * @param items 数据源
 * @returns 虚拟滚动结果
 */
export function useListVirtualScroll<T>(items: Ref<T[]>): UseVirtualListReturn<T> {
  return useVirtualList(items, {
    itemHeight: LIST_ITEM_HEIGHT,
    overscan: OVERSCAN,
  });
}

// ============================================================
// 网格模式虚拟滚动
// ============================================================

/**
 * 将数据按行分组（用于网格模式）
 * @param items 原始数据
 * @param columns 每行列数
 * @returns 分组后的行数据
 */
export function groupIntoRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

/**
 * 网格模式虚拟滚动
 * 由于 useVirtualList 按行计算，需要先将数据分组
 * @param items 数据源
 * @param columns 每行列数，默认 3
 * @returns 虚拟滚动结果（每项是一行数据）
 */
export function useGridVirtualScroll<T>(
  items: Ref<T[]>,
  columns: number = GRID_COLUMNS,
): UseVirtualListReturn<T[]> & { rowGroups: Ref<T[][]> } {
  // 将数据分组为行
  const rowGroups = computed(() => groupIntoRows(items.value, columns));

  const result = useVirtualList(rowGroups, {
    itemHeight: GRID_ITEM_HEIGHT,
    overscan: OVERSCAN,
  });

  return {
    ...result,
    rowGroups,
  };
}
