/**
 * UI 状态管理 Store
 * 迁移原代码中的 isCollapsed, isPinned, currentPage, currentSearchTerm, globalScrollTop, isEditingOrder 等全局变量
 */

import { useStorage } from '@vueuse/core';
import type { BallPosition } from '../types';
import { useDataStore } from './useDataStore';

/** 存储键常量 (保持与原代码兼容) */
export const STORAGE_KEYS = {
  UI_COLLAPSE: 'acu_ui_collapse_state',
  PIN: 'acu_pin_state',
  ACTIVE_TAB: 'acu_active_tab',
  TABLE_ORDER: 'acu_table_order',
  TABLE_HEIGHTS: 'acu_table_heights',
  TABLE_STYLES: 'acu_table_styles',
  REVERSE_TABLES: 'acu_reverse_tables',
  BALL_POSITION: 'acu_float_ball_pos',
  LAYOUT: 'acu_layout',
  VISIBLE_TABS: 'acu_visible_tabs',
} as const;

const STORAGE_KEY_UI_COLLAPSE = STORAGE_KEYS.UI_COLLAPSE;
const STORAGE_KEY_PIN = STORAGE_KEYS.PIN;
const STORAGE_KEY_ACTIVE_TAB = STORAGE_KEYS.ACTIVE_TAB;
const STORAGE_KEY_TABLE_ORDER = STORAGE_KEYS.TABLE_ORDER;
const STORAGE_KEY_TABLE_HEIGHTS = STORAGE_KEYS.TABLE_HEIGHTS;
const STORAGE_KEY_TABLE_STYLES = STORAGE_KEYS.TABLE_STYLES;
const STORAGE_KEY_REVERSE_TABLES = STORAGE_KEYS.REVERSE_TABLES;
const STORAGE_KEY_BALL_POSITION = STORAGE_KEYS.BALL_POSITION;
const STORAGE_KEY_LAYOUT = STORAGE_KEYS.LAYOUT;
const STORAGE_KEY_VISIBLE_TABS = STORAGE_KEYS.VISIBLE_TABS;

/** 特殊 Tab 常量 */
export const TAB_DASHBOARD = 'acu_tab_dashboard_home';
export const TAB_OPTIONS = 'acu_tab_options_panel';

export const useUIStore = defineStore('acu-ui', () => {
  // ============================================================
  // 持久化状态 - 使用 useStorage 自动同步 localStorage
  // ============================================================

  /** 面板折叠状态 - 对应原代码 isCollapsed */
  const isCollapsed = useStorage(STORAGE_KEY_UI_COLLAPSE, false);

  /** 面板固定状态 - 对应原代码 isPinned */
  const isPinned = useStorage(STORAGE_KEY_PIN, false);

  /** 当前活跃 Tab - 对应原代码 getActiveTabState/saveActiveTabState */
  const activeTab = useStorage<string | null>(STORAGE_KEY_ACTIVE_TAB, null);

  /** 表格排序 - 对应原代码 getSavedTableOrder/saveTableOrder */
  const tableOrder = useStorage<string[]>(STORAGE_KEY_TABLE_ORDER, []);

  /** 表格高度 - 对应原代码 getTableHeights/saveTableHeights */
  const tableHeights = useStorage<Record<string, number>>(STORAGE_KEY_TABLE_HEIGHTS, {});

  /** 表格样式 - 对应原代码 getTableStyles/saveTableStyles */
  const tableStyles = useStorage<Record<string, 'list' | 'card'>>(STORAGE_KEY_TABLE_STYLES, {});

  /** 倒序显示的表格列表 - 对应原代码 getReverseOrderTables/saveReverseOrderTables */
  const reverseTables = useStorage<string[]>(STORAGE_KEY_REVERSE_TABLES, []);

  /** 悬浮球位置 */
  const ballPosition = useStorage<BallPosition>(STORAGE_KEY_BALL_POSITION, {
    x: 20,
    y: typeof window !== 'undefined' ? window.innerHeight - 150 : 500,
  });

  /** 布局方向 - 横向(horizontal)或竖向(vertical) */
  const layout = useStorage<'horizontal' | 'vertical'>(STORAGE_KEY_LAYOUT, 'horizontal');

  /** 可见的 Tab ID 列表 - 空数组表示全部显示 */
  const visibleTabs = useStorage<string[]>(STORAGE_KEY_VISIBLE_TABS, []);

  // ============================================================
  // 非持久化状态 - 仅在运行时存在
  // ============================================================

  /** 当前页码 - 对应原代码 currentPage */
  const currentPage = ref(1);

  /** 当前搜索词 - 对应原代码 currentSearchTerm */
  const searchTerm = ref('');

  /** 全局滚动位置 - 对应原代码 globalScrollTop */
  const scrollTop = ref(0);

  /** 排序编辑模式 - 对应原代码 isEditingOrder */
  const isEditingOrder = ref(false);

  /** 初始化状态 - 对应原代码 isInitialized */
  const isInitialized = ref(false);

  /** 内容是否隐藏 (保留导航栏) */
  const isContentHidden = ref(false);

  /** 是否为移动端 */
  const isMobile = ref(false);

  // ============================================================
  // Getters
  // ============================================================

  /** 面板是否可见 */
  const isPanelVisible = computed(() => !isCollapsed.value && activeTab.value !== null);

  /** 是否显示仪表盘 */
  const isDashboardActive = computed(() => activeTab.value === TAB_DASHBOARD);

  /** 是否显示选项面板 */
  const isOptionsActive = computed(() => activeTab.value === TAB_OPTIONS);

  // ============================================================
  // Actions
  // ============================================================

  /**
   * 切换折叠状态
   */
  function toggleCollapse() {
    isCollapsed.value = !isCollapsed.value;
  }

  /**
   * 切换固定状态
   */
  function togglePin() {
    isPinned.value = !isPinned.value;
  }

  /**
   * 设置活跃 Tab
   * @param tabName Tab 名称
   */
  function setActiveTab(tabName: string | null) {
    activeTab.value = tabName;
    // 切换 tab 时重置页码和搜索
    currentPage.value = 1;
    searchTerm.value = '';
  }

  /**
   * 设置表格排序
   * @param order 排序后的表格名称数组
   */
  function setTableOrder(order: string[]) {
    tableOrder.value = order;
  }

  /**
   * 设置表格高度
   * @param tableName 表格名称
   * @param height 高度
   */
  function setTableHeight(tableName: string, height: number) {
    tableHeights.value = { ...tableHeights.value, [tableName]: height };
  }

  /**
   * 重置表格高度 (移除记忆值)
   * @param tableName 表格名称
   */
  function resetTableHeight(tableName: string) {
    const heights = { ...tableHeights.value };
    delete heights[tableName];
    tableHeights.value = heights;
  }

  /**
   * 获取表格高度
   * @param tableName 表格名称
   */
  function getTableHeight(tableName: string): number | undefined {
    return tableHeights.value[tableName];
  }

  /**
   * 设置表格样式
   * @param tableName 表格名称
   * @param style 样式
   */
  function setTableStyle(tableName: string, style: 'list' | 'card') {
    tableStyles.value = { ...tableStyles.value, [tableName]: style };
  }

  /**
   * 获取表格样式
   * @param tableName 表格名称
   */
  function getTableStyle(tableName: string): 'list' | 'card' {
    return tableStyles.value[tableName] || 'list';
  }

  /**
   * 切换表格倒序状态
   * @param tableName 表格名称
   */
  function toggleTableReverse(tableName: string) {
    const current = [...reverseTables.value];
    const index = current.indexOf(tableName);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(tableName);
    }
    reverseTables.value = current;
  }

  /**
   * 检查表格是否倒序显示
   * @param tableName 表格名称
   */
  function isTableReversed(tableName: string): boolean {
    return reverseTables.value.includes(tableName);
  }

  /**
   * 设置当前页码
   * @param page 页码
   */
  function setCurrentPage(page: number) {
    currentPage.value = Math.max(1, page);
  }

  /**
   * 设置搜索词
   * @param term 搜索词
   */
  function setSearchTerm(term: string) {
    searchTerm.value = term.toLowerCase();
    // 搜索时重置页码
    currentPage.value = 1;
  }

  /**
   * 获取当前搜索词
   */
  const currentSearchTerm = computed(() => searchTerm.value);

  /**
   * 保存滚动位置
   * @param top 滚动位置
   */
  function saveScrollTop(top: number) {
    scrollTop.value = top;
  }

  /**
   * 进入排序编辑模式
   */
  function enterEditingOrder() {
    isEditingOrder.value = true;
  }

  /**
   * 退出排序编辑模式
   */
  function exitEditingOrder() {
    isEditingOrder.value = false;
  }

  /**
   * 设置排序编辑模式
   * @param status 是否编辑中
   */
  function setEditingOrder(status: boolean) {
    isEditingOrder.value = status;
  }

  /**
   * 设置移动端状态
   * @param status 是否为移动端
   */
  function setMobile(status: boolean) {
    isMobile.value = status;
  }

  /**
   * 设置布局方向
   * @param newLayout 布局方向
   */
  function setLayout(newLayout: 'horizontal' | 'vertical') {
    layout.value = newLayout;
  }

  /**
   * 切换布局方向
   */
  function toggleLayout() {
    layout.value = layout.value === 'horizontal' ? 'vertical' : 'horizontal';
  }

  /**
   * 检查是否为横向布局
   */
  const isHorizontalLayout = computed(() => layout.value === 'horizontal');

  /**
   * 关闭面板 (收起为悬浮球)
   */
  function closePanel() {
    isCollapsed.value = true; // 收起为悬浮球
    isContentHidden.value = false; // 重置隐藏状态
  }

  /**
   * 显示面板内容
   * 如果没有选中的 Tab，默认打开仪表盘
   */
  function openPanel() {
    isContentHidden.value = false;
    isCollapsed.value = false;
    // 确保有选中的 Tab，否则面板不会显示（isPanelVisible 依赖 activeTab !== null）
    if (activeTab.value === null) {
      activeTab.value = TAB_DASHBOARD;
    }
  }

  /**
   * 设置初始化状态
   * @param status 初始化状态
   */
  function setInitialized(status: boolean) {
    isInitialized.value = status;
  }

  /**
   * 保存悬浮球位置
   * @param position 位置对象
   */
  function saveBallPosition(position: BallPosition) {
    ballPosition.value = position;
  }

  /**
   * 获取悬浮球位置
   */
  function getBallPosition(): BallPosition {
    return ballPosition.value;
  }

  /**
   * 重置悬浮球位置到默认
   * 使用父窗口尺寸（支持跨 iframe 场景）
   */
  function resetBallPosition() {
    const parentHeight = typeof window !== 'undefined' ? (window.parent?.innerHeight ?? window.innerHeight) : 500;

    ballPosition.value = {
      x: 20,
      y: Math.max(100, parentHeight - 150), // 确保不会太靠上
    };
  }

  /**
   * 自动调整面板高度
   * @param force 是否强制重置
   */
  function autoFitPanelHeight(force = false) {
    const { $ } = (window as any).jQuery ? { $: (window as any).jQuery } : { $: (window.parent as any).$ };
    if (!$) return;

    const $panel = $(window.parent.document).find('#acu-data-area');
    if (!$panel.length) return;

    // 如果用户手动调整过高度，且不是强制重置，则不自动调整
    const currentTab = activeTab.value;
    if (!force && currentTab && tableHeights.value[currentTab]) {
      return;
    }

    // 简单的自适应逻辑：根据内容高度调整，但不超过最大高度
    // 注意：这里只是一个简单的实现，实际可能需要更复杂的计算
    // 由于内容是动态加载的，可能需要延迟执行
    setTimeout(() => {
      const contentHeight = $panel[0].scrollHeight;
      const winHeight = $(window.parent).height() || 800;
      const maxHeight = winHeight - 200;
      let newHeight = Math.min(contentHeight + 20, maxHeight);
      if (newHeight < 200) newHeight = 200;

      $panel.css('height', newHeight + 'px');
    }, 100);
  }

  // ============================================================
  // Tab 可见性配置 Actions
  // ============================================================

  /**
   * 设置可见的 Tab
   * @param tabs Tab ID 列表，空数组表示全部显示
   */
  function setVisibleTabs(tabs: string[]) {
    visibleTabs.value = tabs;
  }

  /**
   * 检查 Tab 是否可见
   * @param tabId Tab ID
   */
  function isTabVisible(tabId: string): boolean {
    // 空数组表示全部显示
    if (visibleTabs.value.length === 0) return true;
    return visibleTabs.value.includes(tabId);
  }

  /**
   * 切换 Tab 可见性
   * @param tabId Tab ID
   */
  function toggleTabVisibility(tabId: string) {
    const current = [...visibleTabs.value];
    const index = current.indexOf(tabId);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(tabId);
    }
    visibleTabs.value = current;
  }

  /**
   * 重置 Tab 可见性为全部显示
   */
  function resetVisibleTabs() {
    visibleTabs.value = [];
  }

  // ============================================================
  // 其他 Actions
  // ============================================================

  /**
   * 更新保存按钮状态
   * (迁移自原代码 updateSaveBtnState)
   */
  function updateSaveBtnState() {
    const { $ } = (window as any).jQuery ? { $: (window as any).jQuery } : { $: (window.parent as any).$ };
    if (!$) return;

    const dataStore = useDataStore();
    const hasChanges = dataStore.hasUnsavedChanges;
    const $btn = $(window.parent.document).find('#acu-btn-save-global');

    if ($btn.length) {
      if (hasChanges) {
        $btn.addClass('acu-has-changes');
        $btn.find('i').addClass('fa-beat-fade');
        $btn.css('color', '#e67e22');
      } else {
        $btn.removeClass('acu-has-changes');
        $btn.find('i').removeClass('fa-beat-fade');
        $btn.css('color', '');
      }
    }
  }

  return {
    // 持久化状态
    isCollapsed,
    isPinned,
    activeTab,
    tableOrder,
    tableHeights,
    tableStyles,
    reverseTables,
    ballPosition,
    layout,
    visibleTabs,

    // 非持久化状态
    currentPage,
    searchTerm,
    currentSearchTerm,
    scrollTop,
    isEditingOrder,
    isInitialized,
    isContentHidden,
    isMobile,

    // Getters
    isPanelVisible,
    isDashboardActive,
    isOptionsActive,
    reverseOrderTables: reverseTables,
    isHorizontalLayout,

    // Actions
    toggleCollapse,
    togglePin,
    setActiveTab,
    setTableOrder,
    setTableHeight,
    resetTableHeight,
    getTableHeight,
    setTableStyle,
    getTableStyle,
    toggleTableReverse,
    isTableReversed,
    setCurrentPage,
    setSearchTerm,
    saveScrollTop,
    enterEditingOrder,
    exitEditingOrder,
    setEditingOrder,
    setMobile,
    setLayout,
    toggleLayout,
    closePanel,
    openPanel,
    setInitialized,
    updateSaveBtnState,
    autoFitPanelHeight,
    saveBallPosition,
    getBallPosition,
    resetBallPosition,

    // Tab 可见性配置
    setVisibleTabs,
    isTabVisible,
    toggleTabVisibility,
    resetVisibleTabs,
  };
});
