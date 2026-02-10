/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * UI 状态管理 Store
 * 迁移原代码中的 isCollapsed, isPinned, currentPage, currentSearchTerm, globalScrollTop, isEditingOrder 等全局变量
 */

import { useStorage } from '@vueuse/core';
import { klona } from 'klona';
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import type { DivinationResult } from '../components/dialogs/divination/types';
import { DEFAULT_CHAT_CONFIG, type ChatSpecificConfig } from '../composables/storageKeys';
import { getACUConfigManager } from '../composables/useACUConfigManager';
import type { BallPosition, DashboardWidgetConfig, TableRow, WidgetActionId } from '../types';
import { useDataStore } from './useDataStore';
import { useDivinationStore } from './useDivinationStore';

// ============================================================
// 弹窗 Props 类型定义
// ============================================================

/** 行编辑弹窗 Props */
export interface RowEditDialogProps {
  tableName: string;
  tableId: string;
  rowIndex: number;
  currentRowData: TableRow | null;
}

/** 历史记录弹窗 Props */
export interface HistoryDialogProps {
  tableName: string;
  tableId: string;
  rowIndex: number;
  currentRowData: TableRow | null;
  titleColIndex?: number;
}

/** 头像裁剪弹窗 Props */
export interface AvatarCropDialogProps {
  imageUrl: string;
  name: string;
  initialOffsetX?: number;
  initialOffsetY?: number;
  initialScale?: number;
  /** 初始反色状态 */
  initialInvert?: boolean;
  /** 是否显示反色选项（默认 false，仅悬浮球需要） */
  showInvertOption?: boolean;
}

/** 头像裁剪弹窗回调 */
export interface AvatarCropDialogCallbacks {
  onApply: (data: { offsetX: number; offsetY: number; scale: number; invert?: boolean }) => void;
  onUpload?: (file: File) => void;
}

/** 组件设置弹窗 Props */
export interface WidgetSettingsDialogProps {
  widgetId: string;
  widgetConfig: DashboardWidgetConfig | null;
  tableHeaders: string[];
}

/** 快捷按钮配置弹窗 Props */
export interface WidgetActionsDialogProps {
  widgetId: string;
  currentActions: WidgetActionId[];
}

/** 头像管理弹窗 Props */
export interface AvatarManagerDialogProps {
  nodes: Array<{ id: string; name: string; label: string; type: string }>;
  factions: Array<{ id: string; name: string }>;
}

/** 节点配置弹窗 Props */
export interface NodeConfigDialogProps {
  nodeId: string;
  fullName: string;
  currentLabel: string;
  selectedIndices: number[];
}

/** 节点配置弹窗回调 */
export interface NodeConfigDialogCallbacks {
  onConfirm: (nodeId: string, displayLabel: string, selectedIndices: number[]) => void;
  onResetToFullName: (nodeId: string, fullName: string) => void;
  onStyleUpdate?: (nodeId: string) => void;
}

/** 姓名选择弹窗 Props */
export interface NodeLabelDialogProps {
  fullName: string;
  initialIndices: number[];
}

/** 姓名选择弹窗回调 */
export interface NodeLabelDialogCallbacks {
  onApply: (indices: number[]) => void;
  onReset: () => void;
}

/** 势力设置弹窗 Props */
export interface FactionSettingsDialogProps {
  factionId: string;
  factionName: string;
}

/** 分类选择弹窗 Props */
export interface CategorySelectDialogProps {
  categoryId: string;
  rowContext: { title: string; value: string };
  /** 来源组件 ID (用于管理标签) */
  widgetId?: string;
}

/** 标签二次编辑弹窗 Props */
export interface TagPreEditDialogProps {
  tagLabel: string;
  resolvedPrompt: string;
  /** 是否显示同伴选择器 */
  showCompanions?: boolean;
  /** 来源组件 ID (用于管理标签) */
  widgetId?: string;
}

/** 标签管理器弹窗 Props */
export interface TagManagerDialogProps {
  widgetId: string;
  displayedTagIds: string[];
  displayedCategoryIds: string[];
}

/** 图标选择弹窗 Props */
export interface IconSelectDialogProps {
  currentIcon: string;
}

/** 图标选择弹窗回调 */
export interface IconSelectDialogCallbacks {
  onSelect: (icon: string) => void;
}

/** 预设保存弹窗 Props */
export interface PresetSaveDialogProps {
  /** 预设类型：'manual-update' | 'theme' | 'divination' */
  presetType: 'manual-update' | 'theme' | 'divination';
  /** 摘要信息列表 */
  summaryItems: string[];
  /** 初始预设名称（可选） */
  initialName?: string;
  /** 检查重名的函数 */
  checkDuplicate?: (name: string) => boolean;
}

/** 预设保存弹窗回调 */
export interface PresetSaveDialogCallbacks {
  onSave: (name: string) => void;
}

/** 输入楼层弹窗 Props */
export interface InputFloorDialogProps {
  currentFloor: number;
}

/** 清除范围弹窗 Props */
export interface PurgeRangeDialogProps {
  maxFloor: number;
}

/** 高级清除弹窗 Props */
export interface AdvancedPurgeDialogProps {
  initialStartFloor?: number;
  initialEndFloor?: number;
}

/** 高级清除弹窗回调 */
export interface AdvancedPurgeDialogCallbacks {
  onConfirm: (result: { changedCount: number; tables: string[] }) => void;
}

// 注意：看板管理弹窗直接通过组件 props 传递 tables 数据，不需要在 store 中定义 Props 接口

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
  TAB_ORDER: 'acu_tab_order',
} as const;

/** 特殊 Tab 常量 */
export const TAB_DASHBOARD = 'acu_tab_dashboard_home';
export const TAB_OPTIONS = 'acu_tab_options_panel';
export const TAB_RELATIONSHIP_GRAPH = 'acu_tab_relationship_graph';

/** 智能匹配 Tab 图标 */
export function getSmartTabIcon(name: string): string {
  if (/势力|组织|阵营/.test(name)) return 'fas fa-fist-raised';
  if (/技能/.test(name)) return 'fas fa-magic';
  if (/人物|角色|npc/i.test(name)) return 'fas fa-users';
  if (/交互|行动/.test(name)) return 'fas fa-hand-pointer';
  if (/随机/.test(name)) return 'fas fa-dice';
  if (/全局/.test(name)) return 'fas fa-globe';
  if (/地点|地图/.test(name)) return 'fas fa-map-marked-alt';
  if (/大纲/.test(name)) return 'fas fa-book';
  return 'fas fa-table';
}

export const useUIStore = defineStore('acu-ui', () => {
  // ============================================================
  // 持久化状态 - 使用 useStorage 自动同步 localStorage
  //
  // 注意：居中模式检测已移至 index.ts 入口文件（checkAndResetCenteredMode）
  // 在 Vue 应用初始化之前执行，确保 activeTab 在此处初始化时已被正确处理
  // ============================================================

  /** 面板折叠状态 - 对应原代码 isCollapsed */
  const isCollapsed = useStorage(STORAGE_KEYS.UI_COLLAPSE, false);

  /** 面板固定状态 - 对应原代码 isPinned */
  const isPinned = useStorage(STORAGE_KEYS.PIN, false);

  /** 当前活跃 Tab - 对应原代码 getActiveTabState/saveActiveTabState */
  const activeTab = useStorage<string | null>(STORAGE_KEYS.ACTIVE_TAB, null);

  /** 表格排序 - 对应原代码 getSavedTableOrder/saveTableOrder */
  const tableOrder = useStorage<string[]>(STORAGE_KEYS.TABLE_ORDER, []);

  // ============================================================
  // 使用 ConfigManager 管理聊天相关配置
  // 配置存储在 extensionSettings，同步读取，自动保存
  //
  // 【重要】使用 ref + watch 模式而非 computed getter/setter
  // computed getter/setter 在嵌套对象修改时不会触发，导致配置无法保存
  // ============================================================
  const configManager = getACUConfigManager();

  /** 获取当前聊天 ID */
  const currentChatId = computed(() => SillyTavern.getCurrentChatId() || 'default');

  /** 聊天配置 - 使用 ref 实现响应式 */
  const chatConfigRef = ref<ChatSpecificConfig>({ ...DEFAULT_CHAT_CONFIG });

  /**
   * Tab 可见性配置 - 使用独立 ref 避免 computed getter/setter 的响应式问题
   * 空数组表示全部显示，非空数组表示只显示指定的 Tab
   * 存储的是表格名称 (name)，特殊 Tab 使用常量 ID
   */
  const visibleTabsRef = ref<string[]>([]);

  /**
   * Tab 排序配置 - 使用独立 ref
   * 空数组表示使用默认顺序
   */
  const tabOrderRef = ref<string[]>([]);

  /** 从 ConfigManager 加载当前聊天的配置 */
  function loadChatConfig() {
    const chatId = currentChatId.value;
    const stored = configManager.config.chats[chatId];
    chatConfigRef.value = stored ? klona(stored) : { ...DEFAULT_CHAT_CONFIG };
    // 同步 Tab 配置到独立 ref
    visibleTabsRef.value = [...chatConfigRef.value.visibleTabs];
    tabOrderRef.value = [...chatConfigRef.value.tabOrder];
    console.info('[UIStore] 已加载聊天配置:', chatId, 'visibleTabs:', visibleTabsRef.value);
  }

  // 监听聊天 ID 变化，自动加载配置
  watch(
    currentChatId,
    () => {
      loadChatConfig();
    },
    { immediate: true },
  );

  // 监听配置变化，自动保存
  let isChatConfigInitializing = true;
  watch(
    chatConfigRef,
    newValue => {
      if (isChatConfigInitializing) return;
      const chatId = currentChatId.value;
      configManager.setChatConfig(chatId, klona(newValue));
    },
    { deep: true },
  );

  // 监听 Tab 配置变化，同步到 chatConfigRef 并触发保存
  watch(
    visibleTabsRef,
    newValue => {
      if (isChatConfigInitializing) return;
      chatConfigRef.value.visibleTabs = [...newValue];
      const chatId = currentChatId.value;
      configManager.setChatConfig(chatId, klona(chatConfigRef.value));
      console.info('[UIStore] visibleTabs 已保存:', newValue);
    },
    { deep: true },
  );

  watch(
    tabOrderRef,
    newValue => {
      if (isChatConfigInitializing) return;
      chatConfigRef.value.tabOrder = [...newValue];
      const chatId = currentChatId.value;
      configManager.setChatConfig(chatId, klona(chatConfigRef.value));
      console.info('[UIStore] tabOrder 已保存:', newValue);
    },
    { deep: true },
  );

  // 初始化完成后允许保存
  setTimeout(() => {
    isChatConfigInitializing = false;
  }, 100);

  /** 表格高度 - 通过 chatConfigRef 访问 */
  const tableHeights = computed({
    get: () => chatConfigRef.value.tableHeights,
    set: val => {
      chatConfigRef.value.tableHeights = val;
    },
  });

  /** 表格样式 - 通过 chatConfigRef 访问 */
  const tableStyles = computed({
    get: () => chatConfigRef.value.tableStyles,
    set: val => {
      chatConfigRef.value.tableStyles = val;
    },
  });

  /** 倒序显示的表格列表 - 通过 chatConfigRef 访问 */
  const reverseTables = computed({
    get: () => chatConfigRef.value.reverseTables,
    set: val => {
      chatConfigRef.value.reverseTables = val;
    },
  });

  /** 悬浮球位置 */
  const ballPosition = useStorage<BallPosition>(STORAGE_KEYS.BALL_POSITION, {
    x: 20,
    y: typeof window !== 'undefined' ? window.innerHeight - 150 : 500,
  });

  /** 布局方向 - 横向(horizontal)或竖向(vertical) */
  const layout = useStorage<'horizontal' | 'vertical'>(STORAGE_KEYS.LAYOUT, 'horizontal');

  /**
   * 可见的 Tab 列表 - 使用独立 ref 实现响应式
   * 空数组表示全部显示
   * 存储的是表格名称 (name)，特殊 Tab 使用常量 ID
   */
  const visibleTabs = computed({
    get: () => visibleTabsRef.value,
    set: val => {
      visibleTabsRef.value = [...val];
    },
  });

  /**
   * Tab 排序顺序 - 使用独立 ref 实现响应式
   * 空数组表示使用默认顺序
   */
  const tabOrder = computed({
    get: () => tabOrderRef.value,
    set: val => {
      tabOrderRef.value = [...val];
    },
  });

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

  /** 单元格锁定编辑模式 */
  const isLockEditMode = ref(false);

  /** 只显示锁定的卡片 */
  const showLockedOnly = ref(false);

  /** 设置弹窗初始面板 */
  const initialSettingsPanel = ref<string | null>(null);

  // ============================================================
  // 弹窗状态 - 统一管理
  // ============================================================

  /** 行编辑弹窗状态 */
  const rowEditDialog = reactive<{
    visible: boolean;
    props: RowEditDialogProps;
  }>({
    visible: false,
    props: {
      tableName: '',
      tableId: '',
      rowIndex: 0,
      currentRowData: null,
    },
  });

  /** 组件设置弹窗状态 */
  const widgetSettingsDialog = reactive<{
    visible: boolean;
    props: WidgetSettingsDialogProps;
  }>({
    visible: false,
    props: {
      widgetId: '',
      widgetConfig: null,
      tableHeaders: [],
    },
  });

  /** 历史记录弹窗状态（Dashboard 专用） */
  const dashboardHistoryDialog = reactive<{
    visible: boolean;
    props: HistoryDialogProps;
  }>({
    visible: false,
    props: {
      tableName: '',
      tableId: '',
      rowIndex: 0,
      currentRowData: null,
      titleColIndex: 0,
    },
  });

  /** 头像裁剪弹窗状态 */
  const avatarCropDialog = reactive<{
    visible: boolean;
    props: AvatarCropDialogProps;
  }>({
    visible: false,
    props: {
      imageUrl: '',
      name: '',
      initialOffsetX: 50,
      initialOffsetY: 50,
      initialScale: 150,
      initialInvert: false,
      showInvertOption: false,
    },
  });

  /** 头像裁剪弹窗回调 - 使用 shallowRef 避免被 reactive 代理 */
  const avatarCropOnApply = shallowRef<
    ((data: { offsetX: number; offsetY: number; scale: number; invert?: boolean }) => void) | null
  >(null);
  const avatarCropOnUpload = shallowRef<((file: File) => void) | null>(null);

  /** 快捷按钮配置弹窗状态 */
  const widgetActionsDialog = reactive<{
    visible: boolean;
    props: WidgetActionsDialogProps;
  }>({
    visible: false,
    props: {
      widgetId: '',
      currentActions: [],
    },
  });

  /** 头像管理弹窗状态 */
  const avatarManagerDialog = reactive<{
    visible: boolean;
    props: AvatarManagerDialogProps;
  }>({
    visible: false,
    props: {
      nodes: [],
      factions: [],
    },
  });

  /** 头像管理弹窗回调 - 使用 shallowRef 避免被 reactive 代理 */
  const avatarManagerOnUpdate = shallowRef<(() => void) | null>(null);
  const avatarManagerOnLabelChange = shallowRef<(() => void) | null>(null);

  /** 节点配置弹窗状态 */
  const nodeConfigDialog = reactive<{
    visible: boolean;
    props: NodeConfigDialogProps;
  }>({
    visible: false,
    props: {
      nodeId: '',
      fullName: '',
      currentLabel: '',
      selectedIndices: [],
    },
  });

  /** 节点配置弹窗回调 - 使用 shallowRef 避免被 reactive 代理 */
  const nodeConfigOnConfirm = shallowRef<
    ((nodeId: string, displayLabel: string, selectedIndices: number[]) => void) | null
  >(null);
  const nodeConfigOnResetToFullName = shallowRef<((nodeId: string, fullName: string) => void) | null>(null);
  const nodeConfigOnStyleUpdate = shallowRef<((nodeId: string) => void) | null>(null);

  /** 姓名选择弹窗状态 */
  const nodeLabelDialog = reactive<{
    visible: boolean;
    props: NodeLabelDialogProps;
  }>({
    visible: false,
    props: {
      fullName: '',
      initialIndices: [],
    },
  });

  /** 姓名选择弹窗回调 - 使用 shallowRef 避免被 reactive 代理 */
  const nodeLabelOnApply = shallowRef<((indices: number[]) => void) | null>(null);
  const nodeLabelOnReset = shallowRef<(() => void) | null>(null);

  /** 打开姓名选择弹窗 */
  function openNodeLabelDialog(props: NodeLabelDialogProps, callbacks: NodeLabelDialogCallbacks) {
    nodeLabelDialog.props = { ...props };
    nodeLabelOnApply.value = callbacks.onApply;
    nodeLabelOnReset.value = callbacks.onReset;
    nodeLabelDialog.visible = true;
  }

  /** 关闭姓名选择弹窗 */
  function closeNodeLabelDialog() {
    nodeLabelDialog.visible = false;
    nodeLabelOnApply.value = null;
    nodeLabelOnReset.value = null;
  }

  /** 处理姓名选择应用 */
  function handleNodeLabelApply(data: { displayLabel: string; selectedIndices: number[] }) {
    if (nodeLabelOnApply.value) {
      nodeLabelOnApply.value(data.selectedIndices);
    }
    closeNodeLabelDialog();
  }

  /** 处理姓名选择重置 */
  function handleNodeLabelReset() {
    if (nodeLabelOnReset.value) {
      nodeLabelOnReset.value();
    }
    closeNodeLabelDialog();
  }

  /** 关系图设置弹窗 Props */
  interface GraphSettingsDialogProps {
    factions: string[];
  }

  /** 关系图设置弹窗状态 */
  const graphSettingsDialog = reactive<{
    visible: boolean;
    props: GraphSettingsDialogProps;
  }>({
    visible: false,
    props: {
      factions: [],
    },
  });

  /** 势力设置弹窗状态 */
  const factionSettingsDialog = reactive<{
    visible: boolean;
    props: FactionSettingsDialogProps;
  }>({
    visible: false,
    props: {
      factionId: '',
      factionName: '',
    },
  });

  // ============================================================
  // 通用弹窗状态（从 App.vue 迁移）
  // ============================================================

  /** 设置弹窗 */
  const settingsDialog = ref(false);

  /** 导演控制台弹窗 */
  const directorDialog = ref(false);

  /** 输入楼层弹窗 */
  const inputFloorDialog = reactive<{
    visible: boolean;
    props: InputFloorDialogProps;
  }>({
    visible: false,
    props: {
      currentFloor: 0,
    },
  });

  /** 清除范围弹窗 */
  const purgeRangeDialog = reactive<{
    visible: boolean;
    props: PurgeRangeDialogProps;
  }>({
    visible: false,
    props: {
      maxFloor: 0,
    },
  });

  /** 高级清除弹窗 */
  const advancedPurgeDialog = reactive<{
    visible: boolean;
    props: AdvancedPurgeDialogProps;
    state: {
      selectedTableKeys: string[];
    };
  }>({
    visible: false,
    props: {
      initialStartFloor: undefined,
      initialEndFloor: undefined,
    },
    state: {
      selectedTableKeys: [],
    },
  });

  /** 高级清除弹窗回调 - 使用 shallowRef 避免被 reactive 代理 */
  const advancedPurgeOnConfirm = shallowRef<((result: { changedCount: number; tables: string[] }) => void) | null>(
    null,
  );

  /** 手动更新弹窗 */
  const manualUpdateDialog = ref(false);

  /** 历史记录弹窗（DataTable 使用，与 dashboardHistoryDialog 分开） */
  const historyDialog = reactive<{
    visible: boolean;
    props: HistoryDialogProps;
  }>({
    visible: false,
    props: {
      tableName: '',
      tableId: '',
      rowIndex: 0,
      currentRowData: null,
      titleColIndex: 1,
    },
  });

  /** Tab 收纳浮窗 */
  const tabsPopup = ref(false);

  /** 添加表格弹窗状态 */
  const addTableDialog = reactive<{
    visible: boolean;
  }>({
    visible: false,
  });

  /** 添加表格弹窗回调 - 使用 shallowRef 避免被 reactive 代理 */
  const addTableOnConfirm = shallowRef<((tables: any[]) => void) | null>(null);

  /** 预设保存弹窗状态 */
  const presetSaveDialog = reactive<{
    visible: boolean;
    props: PresetSaveDialogProps;
  }>({
    visible: false,
    props: {
      presetType: 'manual-update',
      summaryItems: [],
      initialName: '',
    },
  });

  /** 预设保存弹窗回调 - 使用 shallowRef 避免被 reactive 代理 */
  const presetSaveOnSave = shallowRef<((name: string) => void) | null>(null);

  /** 分类选择弹窗状态 */
  const categorySelectDialog = reactive<{
    visible: boolean;
    props: CategorySelectDialogProps;
  }>({
    visible: false,
    props: {
      categoryId: '',
      rowContext: { title: '', value: '' },
      widgetId: '',
    },
  });

  /** 标签二次编辑弹窗状态 */
  const tagPreEditDialog = reactive<{
    visible: boolean;
    props: TagPreEditDialogProps;
  }>({
    visible: false,
    props: {
      tagLabel: '',
      resolvedPrompt: '',
      showCompanions: false,
      widgetId: '',
    },
  });

  /** 标签管理器弹窗状态 */
  const tagManagerDialog = reactive<{
    visible: boolean;
    props: TagManagerDialogProps;
  }>({
    visible: false,
    props: {
      widgetId: '',
      displayedTagIds: [],
      displayedCategoryIds: [],
    },
  });

  /** 标签管理器弹窗回调 - 使用 shallowRef 避免被 reactive 代理 */
  const tagManagerOnSave = shallowRef<((displayedTagIds: string[], displayedCategoryIds: string[]) => void) | null>(
    null,
  );

  /** 图标选择弹窗状态 */
  const iconSelectDialog = reactive<{
    visible: boolean;
    props: IconSelectDialogProps;
  }>({
    visible: false,
    props: {
      currentIcon: '',
    },
  });

  /** 图标选择弹窗回调 - 使用 shallowRef 避免被 reactive 代理 */
  const iconSelectOnSelect = shallowRef<((icon: string) => void) | null>(null);

  /** 打开图标选择弹窗 */
  function openIconSelectDialog(props: IconSelectDialogProps, callbacks: IconSelectDialogCallbacks) {
    iconSelectDialog.props = { ...props };
    iconSelectOnSelect.value = callbacks.onSelect;
    iconSelectDialog.visible = true;
  }

  /** 关闭图标选择弹窗 */
  function closeIconSelectDialog() {
    iconSelectDialog.visible = false;
    iconSelectOnSelect.value = null;
  }

  /** 处理图标选择 */
  function handleIconSelect(icon: string) {
    if (iconSelectOnSelect.value) {
      iconSelectOnSelect.value(icon);
    }
    closeIconSelectDialog();
  }

  /** 标签预览模式状态（移动端用） */
  const tagPreviewMode = ref(false);

  /** 标签预览浮窗状态 */
  const tagPreviewTooltip = reactive<{
    visible: boolean;
    content: string;
    x: number;
    y: number;
  }>({
    visible: false,
    content: '',
    x: 0,
    y: 0,
  });

  /** 抽签覆盖层状态 */
  const divinationOverlay = reactive<{
    visible: boolean;
    result: DivinationResult | null;
    isQuickRerollMode: boolean;
  }>({
    visible: false,
    result: null,
    isQuickRerollMode: false,
  });

  /** 隐藏提示词编辑弹窗状态 */
  const promptEditorDialog = reactive<{
    visible: boolean;
    props: {
      prompt: string;
    };
  }>({
    visible: false,
    props: {
      prompt: '',
    },
  });

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
   * @param tabNameOrId Tab 名称或 ID（支持特殊 Tab 的 ID，如 TAB_DASHBOARD）
   */
  function isTabVisible(tabNameOrId: string): boolean {
    // 空数组表示全部显示
    if (visibleTabs.value.length === 0) return true;
    return visibleTabs.value.includes(tabNameOrId);
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

  /**
   * 设置 Tab 排序顺序
   * @param order Tab ID 顺序列表
   */
  function setTabOrder(order: string[]) {
    tabOrder.value = order;
  }

  /**
   * 获取排序后的 Tab ID 列表
   * @param allTabIds 所有可用的 Tab ID 列表
   * @returns 按用户配置排序后的 Tab ID 列表
   */
  function getSortedTabIds(allTabIds: string[]): string[] {
    if (!tabOrder.value || tabOrder.value.length === 0) {
      return allTabIds;
    }
    // 按照 tabOrder 排序，未在 tabOrder 中的放到最后
    const orderedIds = tabOrder.value.filter(id => allTabIds.includes(id));
    const unorderedIds = allTabIds.filter(id => !tabOrder.value.includes(id));
    return [...orderedIds, ...unorderedIds];
  }

  /**
   * 移动 Tab 到指定位置
   * @param tabId 要移动的 Tab ID
   * @param newIndex 新的位置索引
   * @param allTabIds 所有可用的 Tab ID 列表
   */
  function moveTab(tabId: string, newIndex: number, allTabIds: string[]) {
    const currentOrder = getSortedTabIds(allTabIds);
    const currentIndex = currentOrder.indexOf(tabId);
    if (currentIndex === -1) return;

    const newOrder = [...currentOrder];
    newOrder.splice(currentIndex, 1);
    newOrder.splice(newIndex, 0, tabId);
    tabOrder.value = newOrder;
  }

  /**
   * 将 Tab 添加到可见列表（从隐藏区移到展示区）
   * @param tabId Tab ID
   */
  function showTab(tabId: string) {
    if (!visibleTabs.value.includes(tabId)) {
      visibleTabs.value = [...visibleTabs.value, tabId];
    }
  }

  /**
   * 将 Tab 从可见列表移除（从展示区移到隐藏区）
   * @param tabId Tab ID
   */
  function hideTab(tabId: string) {
    visibleTabs.value = visibleTabs.value.filter(id => id !== tabId);
  }

  /**
   * 重置 Tab 配置为默认（全部显示，默认顺序）
   */
  function resetTabConfig() {
    visibleTabs.value = [];
    tabOrder.value = [];
  }

  // ============================================================
  // 弹窗 Actions
  // ============================================================

  /**
   * 打开行编辑弹窗
   * @param props 弹窗参数
   */
  function openRowEditDialog(props: RowEditDialogProps): void {
    rowEditDialog.props = { ...props };
    rowEditDialog.visible = true;
  }

  /**
   * 关闭行编辑弹窗
   */
  function closeRowEditDialog(): void {
    rowEditDialog.visible = false;
  }

  /**
   * 打开组件设置弹窗
   * @param props 弹窗参数
   */
  function openWidgetSettingsDialog(props: WidgetSettingsDialogProps): void {
    widgetSettingsDialog.props = { ...props };
    widgetSettingsDialog.visible = true;
  }

  /**
   * 关闭组件设置弹窗
   */
  function closeWidgetSettingsDialog(): void {
    widgetSettingsDialog.visible = false;
  }

  /**
   * 打开历史记录弹窗（Dashboard 专用）
   * @param props 弹窗参数
   */
  function openDashboardHistoryDialog(props: HistoryDialogProps): void {
    dashboardHistoryDialog.props = { ...props };
    dashboardHistoryDialog.visible = true;
  }

  /**
   * 关闭历史记录弹窗（Dashboard 专用）
   */
  function closeDashboardHistoryDialog(): void {
    dashboardHistoryDialog.visible = false;
  }

  /**
   * 从行编辑弹窗切换到历史记录弹窗
   */
  function switchFromRowEditToHistory(): void {
    // 复制当前行编辑弹窗的参数到历史记录弹窗
    dashboardHistoryDialog.props = {
      tableName: rowEditDialog.props.tableName,
      tableId: rowEditDialog.props.tableId,
      rowIndex: rowEditDialog.props.rowIndex,
      currentRowData: rowEditDialog.props.currentRowData,
      titleColIndex: 0,
    };
    // 关闭行编辑弹窗，打开历史记录弹窗
    rowEditDialog.visible = false;
    dashboardHistoryDialog.visible = true;
  }

  /**
   * 打开头像裁剪弹窗
   * @param props 弹窗参数
   * @param callbacks 回调函数
   */
  function openAvatarCropDialog(props: AvatarCropDialogProps, callbacks: AvatarCropDialogCallbacks): void {
    avatarCropDialog.props = {
      imageUrl: props.imageUrl,
      name: props.name,
      initialOffsetX: props.initialOffsetX ?? 50,
      initialOffsetY: props.initialOffsetY ?? 50,
      initialScale: props.initialScale ?? 150,
      initialInvert: props.initialInvert ?? false,
      showInvertOption: props.showInvertOption ?? false,
    };
    avatarCropOnApply.value = callbacks.onApply;
    avatarCropOnUpload.value = callbacks.onUpload ?? null;
    avatarCropDialog.visible = true;
  }

  /**
   * 关闭头像裁剪弹窗
   */
  function closeAvatarCropDialog(): void {
    avatarCropDialog.visible = false;
    // 清理回调
    avatarCropOnApply.value = null;
    avatarCropOnUpload.value = null;
  }

  /**
   * 处理头像裁剪应用
   * @param data 裁剪参数
   */
  function handleAvatarCropApply(data: { offsetX: number; offsetY: number; scale: number; invert?: boolean }): void {
    if (avatarCropOnApply.value) {
      avatarCropOnApply.value(data);
    }
    closeAvatarCropDialog();
  }

  /**
   * 处理头像裁剪上传
   * @param file 上传的文件
   */
  function handleAvatarCropUpload(file: File): void {
    if (avatarCropOnUpload.value) {
      avatarCropOnUpload.value(file);
    }
  }

  /**
   * 打开快捷按钮配置弹窗
   * @param props 弹窗参数
   */
  function openWidgetActionsDialog(props: WidgetActionsDialogProps): void {
    widgetActionsDialog.props = { ...props };
    widgetActionsDialog.visible = true;
  }

  /**
   * 关闭快捷按钮配置弹窗
   */
  function closeWidgetActionsDialog(): void {
    widgetActionsDialog.visible = false;
  }

  /**
   * 打开头像管理弹窗
   * @param props 弹窗参数
   * @param callbacks 回调函数
   */
  function openAvatarManagerDialog(
    props: AvatarManagerDialogProps,
    callbacks: { onUpdate?: () => void; onLabelChange?: () => void },
  ): void {
    avatarManagerDialog.props = { ...props };
    avatarManagerOnUpdate.value = callbacks.onUpdate ?? null;
    avatarManagerOnLabelChange.value = callbacks.onLabelChange ?? null;
    avatarManagerDialog.visible = true;
  }

  /**
   * 关闭头像管理弹窗
   */
  function closeAvatarManagerDialog(): void {
    avatarManagerDialog.visible = false;
    // 清理回调
    avatarManagerOnUpdate.value = null;
    avatarManagerOnLabelChange.value = null;
  }

  /**
   * 处理头像管理更新
   */
  function handleAvatarManagerUpdate(): void {
    if (avatarManagerOnUpdate.value) {
      avatarManagerOnUpdate.value();
    }
  }

  /**
   * 处理头像管理标签变更
   */
  function handleAvatarManagerLabelChange(): void {
    if (avatarManagerOnLabelChange.value) {
      avatarManagerOnLabelChange.value();
    }
  }

  /**
   * 打开节点配置弹窗
   * @param props 弹窗参数
   * @param callbacks 回调函数
   */
  function openNodeConfigDialog(props: NodeConfigDialogProps, callbacks: NodeConfigDialogCallbacks): void {
    nodeConfigDialog.props = { ...props };
    nodeConfigOnConfirm.value = callbacks.onConfirm;
    nodeConfigOnResetToFullName.value = callbacks.onResetToFullName;
    nodeConfigOnStyleUpdate.value = callbacks.onStyleUpdate ?? null;
    nodeConfigDialog.visible = true;
  }

  /**
   * 关闭节点配置弹窗
   */
  function closeNodeConfigDialog(): void {
    nodeConfigDialog.visible = false;
    // 清理回调
    nodeConfigOnConfirm.value = null;
    nodeConfigOnResetToFullName.value = null;
    nodeConfigOnStyleUpdate.value = null;
  }

  /**
   * 处理节点配置确认
   * @param nodeId 节点 ID
   * @param displayLabel 显示标签
   * @param selectedIndices 选中的字符索引
   */
  function handleNodeConfigConfirm(nodeId: string, displayLabel: string, selectedIndices: number[]): void {
    if (nodeConfigOnConfirm.value) {
      nodeConfigOnConfirm.value(nodeId, displayLabel, selectedIndices);
    }
    closeNodeConfigDialog();
  }

  /**
   * 处理节点配置重置为全名
   * @param nodeId 节点 ID
   * @param fullName 全名
   */
  function handleNodeConfigResetToFullName(nodeId: string, fullName: string): void {
    if (nodeConfigOnResetToFullName.value) {
      nodeConfigOnResetToFullName.value(nodeId, fullName);
    }
    closeNodeConfigDialog();
  }

  /**
   * 处理节点样式更新
   * @param nodeId 节点 ID
   */
  function handleNodeConfigStyleUpdate(nodeId: string): void {
    if (nodeConfigOnStyleUpdate.value) {
      nodeConfigOnStyleUpdate.value(nodeId);
    }
  }

  /**
   * 打开关系图设置弹窗
   * @param factions 势力列表
   */
  function openGraphSettingsDialog(factions: string[] = []): void {
    graphSettingsDialog.props.factions = factions;
    graphSettingsDialog.visible = true;
  }

  /**
   * 关闭关系图设置弹窗
   */
  function closeGraphSettingsDialog(): void {
    graphSettingsDialog.visible = false;
  }

  /**
   * 打开势力设置弹窗
   * @param factionId 势力ID（容器节点ID）
   * @param factionName 势力名称
   */
  function openFactionSettingsDialog(factionId: string, factionName: string): void {
    factionSettingsDialog.props = {
      factionId,
      factionName,
    };
    factionSettingsDialog.visible = true;
  }

  /**
   * 关闭势力设置弹窗
   */
  function closeFactionSettingsDialog(): void {
    factionSettingsDialog.visible = false;
  }

  // ============================================================
  // 通用弹窗 Actions（从 App.vue 迁移）
  // ============================================================

  /**
   * 打开设置弹窗
   * @param panel 初始显示的面板（可选）
   */
  function openSettingsDialog(panel: string = 'main'): void {
    if (panel !== 'main') {
      initialSettingsPanel.value = panel;
    }
    settingsDialog.value = true;
  }

  /**
   * 关闭设置弹窗
   */
  function closeSettingsDialog(): void {
    settingsDialog.value = false;
  }

  /**
   * 打开导演控制台弹窗
   */
  function openDirectorDialog(): void {
    directorDialog.value = true;
  }

  /**
   * 关闭导演控制台弹窗
   */
  function closeDirectorDialog(): void {
    directorDialog.value = false;
  }

  /**
   * 打开输入楼层弹窗
   * @param currentFloor 当前目标楼层
   */
  function openInputFloorDialog(currentFloor: number = 0): void {
    inputFloorDialog.props.currentFloor = currentFloor;
    inputFloorDialog.visible = true;
  }

  /**
   * 关闭输入楼层弹窗
   */
  function closeInputFloorDialog(): void {
    inputFloorDialog.visible = false;
  }

  /**
   * 打开清除范围弹窗
   * @param maxFloor 最大楼层
   */
  function openPurgeRangeDialog(maxFloor: number = 0): void {
    purgeRangeDialog.props.maxFloor = maxFloor;
    purgeRangeDialog.visible = true;
  }

  /**
   * 关闭清除范围弹窗
   */
  function closePurgeRangeDialog(): void {
    purgeRangeDialog.visible = false;
  }

  /**
   * 打开高级清除弹窗
   * @param props 弹窗参数
   * @param callbacks 回调函数
   * @param initialState 初始状态（可选）
   */
  function openAdvancedPurgeDialog(
    props: AdvancedPurgeDialogProps,
    callbacks: AdvancedPurgeDialogCallbacks,
    initialState?: { selectedTableKeys: string[] },
  ): void {
    advancedPurgeDialog.props = { ...props };
    if (initialState) {
      advancedPurgeDialog.state.selectedTableKeys = [...initialState.selectedTableKeys];
    }
    advancedPurgeOnConfirm.value = callbacks.onConfirm;
    advancedPurgeDialog.visible = true;
  }

  /**
   * 关闭高级清除弹窗
   */
  function closeAdvancedPurgeDialog(): void {
    advancedPurgeDialog.visible = false;
    advancedPurgeOnConfirm.value = null;
  }

  /**
   * 处理高级清除确认
   * @param result 清除结果
   */
  function handleAdvancedPurgeConfirm(result: { changedCount: number; tables: string[] }): void {
    if (advancedPurgeOnConfirm.value) {
      advancedPurgeOnConfirm.value(result);
    }
    closeAdvancedPurgeDialog();
  }

  /**
   * 打开手动更新弹窗
   */
  function openManualUpdateDialog(): void {
    manualUpdateDialog.value = true;
  }

  /**
   * 关闭手动更新弹窗
   */
  function closeManualUpdateDialog(): void {
    manualUpdateDialog.value = false;
  }

  /**
   * 打开历史记录弹窗（DataTable 使用）
   * @param props 弹窗参数
   */
  function openHistoryDialog(props: HistoryDialogProps): void {
    historyDialog.props = { ...props };
    historyDialog.visible = true;
  }

  /**
   * 关闭历史记录弹窗（DataTable 使用）
   */
  function closeHistoryDialog(): void {
    historyDialog.visible = false;
  }

  /**
   * 打开 Tab 收纳浮窗
   */
  function openTabsPopup(): void {
    tabsPopup.value = true;
  }

  /**
   * 关闭 Tab 收纳浮窗
   */
  function closeTabsPopup(): void {
    tabsPopup.value = false;
  }

  /**
   * 切换 Tab 收纳浮窗
   */
  function toggleTabsPopup(): void {
    tabsPopup.value = !tabsPopup.value;
  }

  /**
   * 打开预设保存弹窗
   * @param props 弹窗参数
   * @param callbacks 回调函数
   */
  function openPresetSaveDialog(props: PresetSaveDialogProps, callbacks: PresetSaveDialogCallbacks): void {
    presetSaveDialog.props = { ...props };
    presetSaveOnSave.value = callbacks.onSave;
    presetSaveDialog.visible = true;
  }

  /**
   * 关闭预设保存弹窗
   */
  function closePresetSaveDialog(): void {
    presetSaveDialog.visible = false;
    presetSaveOnSave.value = null;
  }

  /**
   * 处理预设保存
   * @param name 预设名称
   */
  function handlePresetSave(name: string): void {
    if (presetSaveOnSave.value) {
      presetSaveOnSave.value(name);
    }
    closePresetSaveDialog();
  }

  // ============================================================
  // 添加表格弹窗 Actions
  // ============================================================

  /**
   * 打开添加表格弹窗
   * @param onConfirm 确认回调
   */
  function openAddTableDialog(onConfirm: (tables: any[]) => void): void {
    addTableOnConfirm.value = onConfirm;
    addTableDialog.visible = true;
  }

  /**
   * 关闭添加表格弹窗
   */
  function closeAddTableDialog(): void {
    addTableDialog.visible = false;
    addTableOnConfirm.value = null;
  }

  /**
   * 处理添加表格确认
   * @param tables 要添加的表格列表
   */
  function handleAddTableConfirm(tables: any[]): void {
    if (addTableOnConfirm.value) {
      addTableOnConfirm.value(tables);
    }
    closeAddTableDialog();
  }

  // ============================================================
  // 标签系统弹窗 Actions
  // ============================================================

  /**
   * 打开分类选择弹窗
   * @param props 弹窗参数
   */
  function openCategorySelectDialog(props: CategorySelectDialogProps): void {
    categorySelectDialog.props = { ...props };
    categorySelectDialog.visible = true;
  }

  /**
   * 关闭分类选择弹窗
   */
  function closeCategorySelectDialog(): void {
    categorySelectDialog.visible = false;
  }

  /**
   * 打开标签二次编辑弹窗
   * @param props 弹窗参数
   */
  function openTagPreEditDialog(props: TagPreEditDialogProps): void {
    tagPreEditDialog.props = { ...props };
    tagPreEditDialog.visible = true;
  }

  /**
   * 关闭标签二次编辑弹窗
   */
  function closeTagPreEditDialog(): void {
    tagPreEditDialog.visible = false;
  }

  /**
   * 打开标签管理器弹窗
   * @param props 弹窗参数
   * @param onSave 保存回调
   */
  function openTagManagerDialog(
    props: TagManagerDialogProps,
    onSave?: (displayedTagIds: string[], displayedCategoryIds: string[]) => void,
  ): void {
    tagManagerDialog.props = { ...props };
    tagManagerOnSave.value = onSave ?? null;
    tagManagerDialog.visible = true;
  }

  /**
   * 关闭标签管理器弹窗
   */
  function closeTagManagerDialog(): void {
    tagManagerDialog.visible = false;
    tagManagerOnSave.value = null;
  }

  /**
   * 处理标签管理器保存
   * @param displayedTagIds 已展示的标签 ID 列表
   * @param displayedCategoryIds 已展示的分类 ID 列表
   */
  function handleTagManagerSave(displayedTagIds: string[], displayedCategoryIds: string[]): void {
    if (tagManagerOnSave.value) {
      tagManagerOnSave.value(displayedTagIds, displayedCategoryIds);
    }
    closeTagManagerDialog();
  }

  // ============================================================
  // 抽签覆盖层 Actions
  // ============================================================

  /**
   * 打开抽签覆盖层
   * @param result 抽签结果
   * @param isQuickReroll 是否为快捷重抽模式
   */
  function openDivinationOverlay(result: DivinationResult, isQuickReroll = false): void {
    divinationOverlay.result = result;
    divinationOverlay.isQuickRerollMode = isQuickReroll;
    divinationOverlay.visible = true;
  }

  /**
   * 关闭抽签覆盖层
   */
  function closeDivinationOverlay(): void {
    divinationOverlay.visible = false;
    divinationOverlay.isQuickRerollMode = false;
  }

  /**
   * 打开隐藏提示词编辑弹窗
   * @param prompt 当前提示词
   */
  function openPromptEditorDialog(prompt: string): void {
    promptEditorDialog.props.prompt = prompt;
    promptEditorDialog.visible = true;
  }

  /**
   * 关闭隐藏提示词编辑弹窗
   */
  function closePromptEditorDialog(): void {
    promptEditorDialog.visible = false;
  }

  /**
   * 初始化抽签系统
   */
  async function initDivinationSystem() {
    const divinationStore = useDivinationStore();
    if (!divinationStore.isLoaded) {
      divinationStore.loadConfig();
      await divinationStore.loadFromWorldbook();
    }
  }

  // ============================================================
  // AI 通知动画信号
  // ============================================================
  const aiNotifySignal = ref(0);
  const isAiGenerating = ref(false);

  /**
   * 触发 AI 填表完成的通知动画
   */
  function triggerAiNotify() {
    aiNotifySignal.value++;
    isAiGenerating.value = false; // 完成时停止生成状态
  }

  /**
   * 设置 AI 正在生成状态
   */
  function setAiGenerating(status: boolean) {
    isAiGenerating.value = status;
  }

  /**
   * 同步新表格到可见列表
   * 当 visibleTabs 非空时，检测新增的表格并自动添加到可见列表末尾
   * 注意：visibleTabs 存储的是表格名称 (name)，而不是 sheetId，因为 name 更稳定
   * @param allTableNames 当前所有表格的名称列表
   * @returns 新增的表格名称数组
   */
  function syncNewTablesToVisibleTabs(allTableNames: string[]): string[] {
    // 如果 visibleTabs 为空（全部显示模式），无需同步
    if (visibleTabs.value.length === 0) {
      return [];
    }

    // 找出不在 visibleTabs 中的新表格（按名称匹配）
    const newTabNames = allTableNames.filter(name => !visibleTabs.value.includes(name));

    // 如果有新表格，添加到可见列表末尾
    if (newTabNames.length > 0) {
      visibleTabs.value = [...visibleTabs.value, ...newTabNames];
      console.info(`[ACU] 检测到 ${newTabNames.length} 个新表格，已自动添加到可见列表:`, newTabNames);
    }

    return newTabNames;
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
    isLockEditMode,
    showLockedOnly,
    initialSettingsPanel,

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
    tabOrder,
    setTabOrder,
    getSortedTabIds,
    moveTab,
    showTab,
    hideTab,
    resetTabConfig,
    syncNewTablesToVisibleTabs,

    // 弹窗状态
    rowEditDialog,
    widgetSettingsDialog,
    dashboardHistoryDialog,
    avatarCropDialog,
    widgetActionsDialog,
    avatarManagerDialog,
    nodeConfigDialog,
    nodeLabelDialog,
    graphSettingsDialog,
    factionSettingsDialog,
    // 通用弹窗状态（从 App.vue 迁移）
    settingsDialog,
    directorDialog,
    inputFloorDialog,
    purgeRangeDialog,
    advancedPurgeDialog,
    manualUpdateDialog,
    historyDialog,
    tabsPopup,
    presetSaveDialog,

    // 弹窗 Actions
    openRowEditDialog,
    closeRowEditDialog,
    openWidgetSettingsDialog,
    closeWidgetSettingsDialog,
    openDashboardHistoryDialog,
    closeDashboardHistoryDialog,
    switchFromRowEditToHistory,
    openAvatarCropDialog,
    closeAvatarCropDialog,
    handleAvatarCropApply,
    handleAvatarCropUpload,
    openWidgetActionsDialog,
    closeWidgetActionsDialog,
    openAvatarManagerDialog,
    closeAvatarManagerDialog,
    handleAvatarManagerUpdate,
    handleAvatarManagerLabelChange,
    openNodeConfigDialog,
    closeNodeConfigDialog,
    handleNodeConfigConfirm,
    handleNodeConfigResetToFullName,
    handleNodeConfigStyleUpdate,
    openNodeLabelDialog,
    closeNodeLabelDialog,
    handleNodeLabelApply,
    handleNodeLabelReset,
    openGraphSettingsDialog,
    closeGraphSettingsDialog,
    openFactionSettingsDialog,
    closeFactionSettingsDialog,
    // 通用弹窗 Actions（从 App.vue 迁移）
    openSettingsDialog,
    closeSettingsDialog,
    openDirectorDialog,
    closeDirectorDialog,
    openInputFloorDialog,
    closeInputFloorDialog,
    openPurgeRangeDialog,
    closePurgeRangeDialog,
    openAdvancedPurgeDialog,
    closeAdvancedPurgeDialog,
    handleAdvancedPurgeConfirm,
    openManualUpdateDialog,
    closeManualUpdateDialog,
    openHistoryDialog,
    closeHistoryDialog,
    openTabsPopup,
    closeTabsPopup,
    toggleTabsPopup,
    openPresetSaveDialog,
    closePresetSaveDialog,
    handlePresetSave,

    // 添加表格弹窗
    addTableDialog,
    openAddTableDialog,
    closeAddTableDialog,
    handleAddTableConfirm,

    // 标签系统弹窗
    categorySelectDialog,
    tagPreEditDialog,
    tagManagerDialog,
    openCategorySelectDialog,
    closeCategorySelectDialog,
    openTagPreEditDialog,
    closeTagPreEditDialog,
    openTagManagerDialog,
    closeTagManagerDialog,
    handleTagManagerSave,

    // 图标选择弹窗
    iconSelectDialog,
    openIconSelectDialog,
    closeIconSelectDialog,
    handleIconSelect,

    // 抽签覆盖层
    divinationOverlay,
    openDivinationOverlay,
    closeDivinationOverlay,

    // 隐藏提示词编辑弹窗
    promptEditorDialog,
    openPromptEditorDialog,
    closePromptEditorDialog,

    // 抽签系统初始化
    initDivinationSystem,

    // 抽签设置弹窗
    openDivinationSettingsDialog: () => {
      openSettingsDialog('divination');
    },

    // AI 通知信号
    aiNotifySignal: computed(() => aiNotifySignal.value),
    triggerAiNotify,
    isAiGenerating: computed(() => isAiGenerating.value),
    setAiGenerating,

    // 标签预览模式
    tagPreviewMode,
    tagPreviewTooltip,
    toggleTagPreviewMode: () => {
      tagPreviewMode.value = !tagPreviewMode.value;
      // 切换模式时隐藏浮窗
      tagPreviewTooltip.visible = false;
    },
    showTagPreviewTooltip: (content: string, x: number, y: number) => {
      tagPreviewTooltip.content = content;
      tagPreviewTooltip.x = x;
      tagPreviewTooltip.y = y;
      tagPreviewTooltip.visible = true;
    },
    hideTagPreviewTooltip: () => {
      tagPreviewTooltip.visible = false;
    },
  };
});
