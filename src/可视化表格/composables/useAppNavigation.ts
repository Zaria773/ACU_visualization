/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * useAppNavigation.ts - App 导航 Composable
 *
 * 提取自 App.vue，负责：
 * - Tab 切换与排序
 * - 面板收起/展开
 * - 高度记忆与恢复
 */

import { nextTick, type Ref } from 'vue';
import { TAB_DASHBOARD, TAB_RELATIONSHIP_GRAPH, useUIStore } from '../stores/useUIStore';
import { toast } from './useToast';

export interface UseAppNavigationOptions {
  /** MainPanel 组件 ref */
  mainPanelRef: Ref<
    | {
        exitCenteredMode: () => void;
        getDataAreaElement: () => HTMLElement | null;
      }
    | undefined
  >;
  /** 搜索词 ref */
  searchTerm: Ref<string>;
  /** 内容隐藏状态 ref */
  isContentHidden: Ref<boolean>;
  /** 是否有关系图数据 */
  hasRelationshipData: Ref<boolean>;
  /** 恢复当前 Tab 高度 */
  restoreTableHeight: (tabId: string) => void;
}

export function useAppNavigation(options: UseAppNavigationOptions) {
  const { mainPanelRef, searchTerm, isContentHidden, hasRelationshipData, restoreTableHeight } = options;
  const uiStore = useUIStore();

  // ============================================================
  // 面板操作
  // ============================================================

  /** 关闭面板 */
  function handlePanelClose(): void {
    uiStore.closePanel();
    console.info('[ACU] 面板已关闭');
  }

  /** 隐藏内容区 */
  function handleHideContent(): void {
    isContentHidden.value = !isContentHidden.value;
  }

  /** 收起面板为悬浮球 */
  function handleToggle(): void {
    uiStore.isCollapsed = true;
    console.info('[ACU] 面板已收起为悬浮球');
  }

  // ============================================================
  // Tab 切换
  // ============================================================

  /** Tab 切换 */
  function handleTabChange(tabId: string): void {
    // 【关键】如果点击了 Tab，退出居中模式（通过 MainPanel 暴露的方法，确保响应式更新）
    if (tabId && mainPanelRef.value) {
      mainPanelRef.value.exitCenteredMode();
    }

    // 1. 立即清除高度限制，避免前一个Tab的高度影响布局计算
    const dataAreaEl = mainPanelRef.value?.getDataAreaElement();
    if (dataAreaEl) {
      dataAreaEl.style.height = '';
      dataAreaEl.style.minHeight = '';
      dataAreaEl.style.maxHeight = '';
    }

    uiStore.setActiveTab(tabId);
    searchTerm.value = '';
    // Bug2副作用修复: 切换tab时恢复内容区域显示
    isContentHidden.value = false;
    console.info(`[ACU] 切换到 Tab: ${tabId}`);

    // 2. 恢复该表的记忆高度（需要等待 DOM 完全渲染）
    // 移动端需要更长的等待时间，使用 setTimeout 而非纯 rAF
    nextTick(() => {
      // 使用 50ms 延迟确保移动端浏览器完成渲染
      setTimeout(() => {
        requestAnimationFrame(() => {
          restoreTableHeight(tabId);
        });
      }, 50);
    });
  }

  /** Tab 排序变更 */
  function handleTabsReorder(newOrder: string[]): void {
    uiStore.setTableOrder(newOrder);
    console.info('[ACU] Tab 顺序已更新');
  }

  /** 收纳Tab按钮点击 - 显示/隐藏Tab浮窗 */
  function handleCollapseTabClick(): void {
    uiStore.toggleTabsPopup();
    console.info(`[ACU] Tab浮窗: ${uiStore.tabsPopup ? '显示' : '隐藏'}`);
  }

  /** Tab浮窗点击 - 切换Tab并关闭浮窗 */
  function handleTabsPopupClick(tabId: string): void {
    uiStore.closeTabsPopup();
    handleTabChange(tabId);
  }

  // ============================================================
  // 导航
  // ============================================================

  /** 导航到指定表格 */
  function handleNavigateToTable(tableId: string): void {
    // 1. 立即清除高度限制，避免前一个Tab的高度影响布局计算
    const dataAreaEl = mainPanelRef.value?.getDataAreaElement();
    if (dataAreaEl) {
      dataAreaEl.style.height = '';
      dataAreaEl.style.minHeight = '';
      dataAreaEl.style.maxHeight = '';
    }

    uiStore.setActiveTab(tableId);
    console.info(`[ACU] 导航到表格: ${tableId}`);

    // 2. 恢复该表的记忆高度（移动端需要更长的等待时间）
    nextTick(() => {
      setTimeout(() => {
        requestAnimationFrame(() => {
          restoreTableHeight(tableId);
        });
      }, 50);
    });
  }

  /** 从仪表盘显示人物关系图 - 直接导航到关系图 Tab */
  function handleShowRelationshipGraph(): void {
    if (hasRelationshipData.value) {
      uiStore.setActiveTab(TAB_RELATIONSHIP_GRAPH);
      console.info('[ACU] 导航到关系图 Tab');
    } else {
      toast.warning('未找到人物关系数据');
    }
  }

  /** 关闭当前表格，返回仪表盘 */
  function handleTableClose(): void {
    // 使用 handleTabChange 以确保高度被正确重置/恢复
    handleTabChange(TAB_DASHBOARD);
    console.info('[ACU] 返回仪表盘');
  }

  return {
    // 面板
    handlePanelClose,
    handleHideContent,
    handleToggle,

    // Tab
    handleTabChange,
    handleTabsReorder,
    handleCollapseTabClick,
    handleTabsPopupClick,

    // 导航
    handleNavigateToTable,
    handleShowRelationshipGraph,
    handleTableClose,
  };
}
