<template>
  <div class="acu-app" :class="appClasses">
    <!-- 悬浮球 (面板隐藏时显示) -->
    <FloatingBall :style="{ display: uiStore.isPanelVisible ? 'none' : 'block' }" />

    <!-- 主面板 -->
    <MainPanel
      ref="mainPanelRef"
      :style="{ display: uiStore.isPanelVisible ? 'flex' : 'none' }"
      :title="panelTitle"
      :theme="configStore.config.theme"
      :layout="configStore.config.layout"
      :is-collapsed="uiStore.isCollapsed"
      :is-pinned="uiStore.isPinned"
      :is-content-hidden="isContentHidden"
      :lock-panel="configStore.config.lockPanel"
      :left-tab-rail-enabled="isLeftTabRailEnabled"
      :has-changes="dataStore.hasUnsavedChanges"
      @refresh="handleRefresh"
      @save="handleSave"
      @save-as="handleSaveAs"
      @undo="handleUndo"
      @manual-update="handleManualUpdate"
      @purge="handlePurge"
      @open-native="handleOpenNative"
      @settings="uiStore.openSettingsDialog"
      @toggle-pin="uiStore.togglePin"
      @toggle="handleToggle"
      @close="handlePanelClose"
      @hide-content="handleHideContent"
      @collapse-tab="handleCollapseTabClick"
    >
      <!-- 标签栏插槽（收纳模式时隐藏） -->
      <template #tabs>
        <TabBar
          v-if="!isTabBarCollapsed"
          :tabs="tabList"
          :active-tab="uiStore.activeTab"
          :show-dashboard="true"
          :has-options-tabs="hasOptionsTabs"
          :has-relationship-graph="hasRelationshipData"
          :is-editing-order="uiStore.isEditingOrder"
          :grid-columns="configStore.gridColumnsCss"
          @tab-change="handleTabChange"
          @order-change="handleTabsReorder"
          @exit-editing="uiStore.setEditingOrder(false)"
        />
      </template>

      <!-- Tab浮窗插槽 -->
      <template #tabs-popup>
        <TabsPopup
          :visible="uiStore.tabsPopup"
          :tabs="tabList"
          :active-tab="uiStore.activeTab"
          :grid-columns="configStore.gridColumnsCss"
          :show-dashboard="true"
          :show-options-panel="hasOptionsTabs"
          :show-relationship-graph="hasRelationshipData"
          @tab-click="handleTabsPopupClick"
          @close="uiStore.closeTabsPopup"
        />
      </template>

      <!-- 动作按钮插槽 (使用默认) -->

      <!-- 内容区域 -->
      <template #default>
        <!-- 仪表盘视图 -->
        <Dashboard
          v-if="uiStore.activeTab === TAB_DASHBOARD"
          :tables="processedTables"
          @navigate="handleNavigateToTable"
          @row-click="handleRowClick"
          @show-relationship-graph="handleShowRelationshipGraph"
          @action="handleDashboardAction"
          @height-drag-start="handleHeightDragStart"
          @height-reset="handleHeightReset"
        />

        <!-- 选项面板视图 -->
        <OptionsPanel
          v-else-if="uiStore.activeTab === TAB_OPTIONS"
          :tables="optionsTables"
          @cell-click="handleCellClick"
          @toggle-delete="handleToggleDelete"
        />

        <!-- 关系图视图 -->
        <RelationshipGraph
          v-else-if="uiStore.activeTab === TAB_RELATIONSHIP_GRAPH"
          ref="relationshipGraphRef"
          :relationship-table="relationshipTableData"
          :character-tables="characterTablesData"
          :faction-table="factionTableData"
          :all-tables="processedTables"
          :show-legend="true"
        />

        <!-- 普通表格视图 -->
        <DataTable
          v-else-if="currentTable"
          :key="currentTable.id"
          :table-id="currentTable.id"
          :table-name="currentTable.name"
          :rows="currentTable.rows"
          :headers="currentTable.headers"
          :search-term="searchTerm"
          @cell-click="handleCellClick"
          @insert-row="handleInsertRow"
          @toggle-delete="handleToggleDelete"
          @context-menu="handleContextMenu"
          @search-change="searchTerm = $event"
          @close="handleTableClose"
          @height-drag-start="handleHeightDragStart"
          @height-reset="handleHeightReset"
          @show-history="handleShowHistory"
        />

        <!-- 无数据状态 -->
        <div v-else class="acu-no-data">
          <i class="fas fa-inbox"></i>
          <p>请选择一个表格</p>
        </div>
      </template>
    </MainPanel>

    <!-- 右键菜单 -->
    <ContextMenu
      v-model:visible="contextMenuState.visible"
      :x="contextMenuState.x"
      :y="contextMenuState.y"
      :table-id="contextMenuState.tableId"
      :table-name="contextMenuState.tableName"
      :row-index="contextMenuState.rowIndex"
      @insert-row="handleContextInsertRow"
      @copy="handleContextCopy"
      @delete="handleContextDelete"
      @undo-delete="handleContextUndoDelete"
    />

    <CommonDialogsHost
      @settings-save="handleSettingsSave"
      @save-to-floor="handleSaveToFloor"
      @purge-range="handlePurgeRange"
      @advanced-purge-confirm="handleAdvancedPurgeConfirm"
      @history-apply="handleHistoryApply"
    />

    <DashboardDialogsHost :current-editing-row="currentEditingRow" />

    <GraphDialogsHost @open-avatar-manager-from-settings="handleOpenAvatarManagerFromSettings" />

    <TagManagerDialogsHost
      @category-tag-select="handleCategoryTagSelect"
      @prompt-editor-save="handlePromptEditorSave"
    />

    <!-- 抽签覆盖层 -->
    <DivinationOverlay
      :visible="uiStore.divinationOverlay.visible"
      :result="uiStore.divinationOverlay.result"
      @close="uiStore.closeDivinationOverlay"
      @retry="performDivination"
      @confirm="handleDivinationConfirm"
    />

    <!-- 全局 Toast 通知 -->
    <Toast :visible="toastState.visible" :message="toastState.message" :type="toastState.type" />

    <ChatEmbedHost
      :processed-tables="processedTables"
      :options-tables="optionsTables"
      :app-classes="appClasses"
      @row-click="handleRowClick"
      @row-edit="handleEmbedRowEdit"
      @action="handleDashboardAction"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * App.vue - ACU 可视化表格根组件
 *
 * 集成所有子组件，管理全局状态和事件通信
 */

import { computed, onMounted, onUnmounted, provide, ref, watchEffect } from 'vue';

// 组件导入
import { defineAsyncComponent } from 'vue';
import {
  ContextMenu,
  Dashboard,
  DataTable,
  FloatingBall,
  MainPanel,
  OptionsPanel,
  TabBar,
  TabsPopup,
  Toast,
} from './components';
import CommonDialogsHost from './components/dialogs/CommonDialogsHost.vue';
import DashboardDialogsHost from './components/dialogs/DashboardDialogsHost.vue';
import GraphDialogsHost from './components/dialogs/GraphDialogsHost.vue';
import TagManagerDialogsHost from './components/dialogs/TagManagerDialogsHost.vue';
import { DivinationOverlay } from './components/dialogs/divination';
import ChatEmbedHost from './components/chat-embed/ChatEmbedHost.vue';

// RelationshipGraph 使用懒加载，只在用户打开关系图时才加载 Cytoscape 及其扩展
// 这可以显著减少初始内存占用，特别是在移动设备上
const RelationshipGraph = defineAsyncComponent({
  loader: () => import('./components/RelationshipGraph.vue'),
  loadingComponent: {
    template: `
      <div class="acu-graph-loading">
        <i class="fas fa-spinner fa-spin"></i>
        <span>正在加载关系图...</span>
      </div>
    `,
  },
  delay: 200, // 200ms 后显示加载指示器
});

// Store 导入
import { useConfigStore } from './stores/useConfigStore';
import { useDashboardStore } from './stores/useDashboardStore';
import { useDataStore } from './stores/useDataStore';
import { useDivinationStore } from './stores/useDivinationStore';
import { useTagLibraryStore } from './stores/useTagLibraryStore';
import { getSmartTabIcon, TAB_DASHBOARD, TAB_OPTIONS, TAB_RELATIONSHIP_GRAPH, useUIStore } from './stores/useUIStore';

// Composables 导入
import { useApiCallbacks } from './composables/useApiCallbacks';
import { useAppContextMenu } from './composables/useAppContextMenu';
import { useAppNavigation } from './composables/useAppNavigation';
import { useAppDataActions } from './composables/useAppDataActions';
import { useClickOutsidePanel } from './composables/useClickOutsidePanel';
import { useCoreActions } from './composables/useCoreActions';
import { useDataPersistence } from './composables/useDataPersistence';
import { useDivinationAction } from './composables/useDivinationAction';
import { useHiddenPrompt } from './composables/useHiddenPrompt';
import { useHistoryApply } from './composables/useHistoryApply';
import { useParentStyleInjection } from './composables/useParentStyleInjection';
import { useRelationshipData } from './composables/useRelationshipData';
import { useSwipeEnhancement } from './composables/useSwipeEnhancement';
import { useTabShortcuts } from './composables/useTabShortcuts';
import { useTableHeightMemo } from './composables/useTableHeightMemo';
import { toast, useToast } from './composables/useToast';
import { useTouchScrollFix } from './composables/useTouchScrollFix';

// 工具函数导入
import { processJsonData } from './utils';

// 类型导入
import type { InteractiveTag, ProcessedTable, TabItem, TableRow } from './types';

// ============================================================
// Store 实例
// ============================================================

const uiStore = useUIStore();
const dataStore = useDataStore();
const dashboardStore = useDashboardStore();
const configStore = useConfigStore();
const tagLibraryStore = useTagLibraryStore();
const divinationStore = useDivinationStore() as any;

// ============================================================
// Composables
// ============================================================

const { init: initStyles, cleanup: cleanupStyles } = useParentStyleInjection();
const { stopAutoSave } = useDataPersistence();
const { state: toastState } = useToast();
const { setInput } = useCoreActions();
const { setHiddenPrompt, setupSendIntercept, cleanupSendIntercept } = useHiddenPrompt();
const { performDivination, confirmDivination, triggerQuickReroll } = useDivinationAction();
// 触摸滚动修复（横向布局卡片滑动）- 随组件生命周期自动管理
useTouchScrollFix();

// API 回调注册（表格更新、快照管理）- 随组件生命周期自动管理
useApiCallbacks();

// Swipe 增强功能（清除表格、重新触发剧情推进）- 在 onMounted 中初始化
const swipeEnhancement = useSwipeEnhancement();
// 注意：init() 移到 onMounted 中执行，确保父窗口 DOM 已就绪

// ============================================================
// Refs
// ============================================================

const mainPanelRef = ref<InstanceType<typeof MainPanel>>();
const relationshipGraphRef = ref<InstanceType<typeof RelationshipGraph>>();

// ============================================================
// Provide (向子组件提供数据)
// ============================================================

// 向 DataTable 提供所有表格数据（用于关系图）
provide('allTables', () => processedTables.value);

// ============================================================
// 响应式状态
// ============================================================

/** 搜索关键词 */
const searchTerm = ref('');

/** 内容区域隐藏状态 */
const isContentHidden = ref(false);

// 弹窗状态已迁移到 useUIStore，此处不再需要独立的 ref

// ============================================================
// 计算属性
// ============================================================

/** 应用 class */
const appClasses = computed(() => [
  `acu-theme-${configStore.config.theme}`,
  `acu-font-${configStore.config.fontFamily.replace(/\s+/g, '-').toLowerCase()}`,
  {
    'acu-mobile': uiStore.isMobile,
    'acu-layout-horizontal': configStore.config.layout === 'horizontal',
    'acu-layout-vertical': configStore.config.layout === 'vertical',
    'acu-fix-ios-zoom': configStore.config.enableIOSInputFix,
  },
]);

/** 面板标题 */
const panelTitle = computed(() => {
  if (uiStore.activeTab === TAB_DASHBOARD) return 'ACU 仪表盘';
  if (uiStore.activeTab === TAB_OPTIONS) return 'ACU 选项面板';
  return `ACU - ${uiStore.activeTab || '可视化表格'}`;
});

/** 处理后的表格数据 */
const processedTables = computed<ProcessedTable[]>(() => {
  const staged = dataStore.stagedData;
  if (!staged) return [];

  // 使用 processJsonData 将原始数据转换为表格结构
  // 原始格式: { sheetId: { name: string, content: string[][] } }
  // 转换后格式: { tableName: { key: sheetId, headers: string[], rows: string[][] } }
  const processed = processJsonData(staged);
  if (!processed) return [];

  return Object.entries(processed).map(([tableName, tableData]) => {
    const { key: sheetId, headers, rows: rawRows } = tableData;

    // 将 string[][] 格式的行数据转换为 TableRow[] 格式
    const rows: TableRow[] = rawRows.map((rowData, rowIndex) => {
      // rowData 是 string[] 数组，根据 headers 数组映射为 cells
      const cells = rowData.map((cellValue, colIndex) => ({
        colIndex,
        key: headers[colIndex] || `col_${colIndex}`,
        value: String(cellValue ?? ''),
      }));

      return {
        index: rowIndex,
        key: `${tableName}-row-${rowIndex}`,
        cells,
      };
    });

    return {
      id: sheetId, // 使用原始 sheetId 作为 ID，便于保存时定位
      name: tableName,
      headers: headers.map(h => String(h)), // 确保 headers 是字符串数组
      rows,
    };
  });
});

/** Tab 列表 */
const tabList = computed<TabItem[]>(() => {
  return processedTables.value.map(table => ({
    id: table.id,
    name: table.name,
    icon: getTableIcon(table.name),
  }));
});

/** 是否有选项类表格 */
const hasOptionsTabs = computed(() => {
  return processedTables.value.some(t => t.name.includes('选项') || t.name.toLowerCase().includes('option'));
});

/** 是否收纳Tab栏 */
const isTabBarCollapsed = computed(() => {
  return configStore.config.collapseTabBar === true;
});

/** 是否启用左侧 Tab 栏（PC 判定放在 MainPanel 内按 media 执行） */
const isLeftTabRailEnabled = computed(() => {
  if (isTabBarCollapsed.value) return false;
  return configStore.config.leftTabRailMode === true;
});

/** 选项类表格 */
const optionsTables = computed(() => {
  return processedTables.value.filter(t => t.name.includes('选项') || t.name.toLowerCase().includes('option'));
});

/** 嵌入区交互表行编辑（打开行编辑弹窗） */
function handleEmbedRowEdit(tableId: string, row: TableRow) {
  const table = processedTables.value.find(t => t.id === tableId);
  uiStore.openRowEditDialog({
    tableId,
    tableName: table?.name ?? tableId,
    rowIndex: row.index,
    currentRowData: row,
  });
}

const {
  relationshipTable: relationshipTableData,
  characterTables: characterTablesData,
  factionTable: factionTableData,
  hasRelationshipData,
} = useRelationshipData(processedTables);

const { restoreTableHeight, handleHeightDragStart, handleHeightReset } = useTableHeightMemo({
  mainPanelRef,
});

const {
  handlePanelClose,
  handleHideContent,
  handleToggle,
  handleTabChange,
  handleTabsReorder,
  handleCollapseTabClick,
  handleTabsPopupClick,
  handleNavigateToTable,
  handleShowRelationshipGraph,
  handleTableClose,
} = useAppNavigation({
  mainPanelRef,
  searchTerm,
  isContentHidden,
  hasRelationshipData,
  restoreTableHeight,
});

useTabShortcuts({
  getTabList: () => tabList.value,
  hasRelationshipData,
  hasOptionsTabs,
  handleTabChange,
});

useClickOutsidePanel();

/** 当前选中的表格 */
const currentTable = computed(() => {
  if (!uiStore.activeTab) return null;
  return processedTables.value.find(t => t.id === uiStore.activeTab) || null;
});

/** 当前正在编辑的行数据 (实时响应) - 修复 RowEditDialog 数据不更新的问题 */
const currentEditingRow = computed(() => {
  const { tableId, rowIndex } = uiStore.rowEditDialog.props;
  if (!tableId) return null;

  const table = processedTables.value.find(t => t.id === tableId);
  if (!table) return null;

  // 确保 rowIndex 有效
  if (rowIndex < 0 || rowIndex >= table.rows.length) return null;

  return table.rows[rowIndex];
});

/** 当前目标楼层 */
const currentTargetFloor = computed(() => {
  // 从 dataStore 获取目标楼层信息
  return 0; // 默认值，实际应从 dataStore 获取
});

/** 最大楼层索引 */
const maxFloorIndex = computed(() => {
  // 从聊天记录获取最大楼层（兼容跨iframe）
  let ST = (window as any).SillyTavern || (window.parent ? (window.parent as any).SillyTavern : null);
  if (!ST && (window as any).top && (window as any).top.SillyTavern) {
    ST = (window as any).top.SillyTavern;
  }
  const chat = ST?.chat;
  return Array.isArray(chat) ? chat.length - 1 : 0;
});

const {
  loadData,
  handleRefresh,
  handleSave,
  handleSaveToFloor,
  handlePurgeRange,
  handleUndo,
  handleCellClick,
  handleRowClick,
  handleInsertRow,
  handleToggleDelete,
} = useAppDataActions({
  getProcessedTables: () => processedTables.value,
  getMaxFloorIndex: () => maxFloorIndex.value,
});

const {
  contextMenuState,
  handleContextMenu,
  handleContextInsertRow,
  handleContextCopy,
  handleContextDelete,
  handleContextUndoDelete,
} = useAppContextMenu({
  getProcessedTables: () => processedTables.value,
  handleInsertRow,
  handleToggleDelete,
});

const { handleShowHistory, handleHistoryApply } = useHistoryApply({
  getProcessedTables: () => processedTables.value,
});

// ============================================================
// 辅助函数
// ============================================================

/** 获取表格图标 (使用统一的智能匹配逻辑) */
function getTableIcon(tableName: string): string {
  // 优先使用 App 内部特定的匹配规则 (保持原有行为)
  const name = tableName.toLowerCase();

  if (name.includes('主角') || name.includes('player')) return 'fas fa-user';
  if (name.includes('任务') || name.includes('quest')) return 'fas fa-tasks';
  if (name.includes('物品') || name.includes('item')) return 'fas fa-box-open';
  if (name.includes('装备') || name.includes('equip')) return 'fas fa-shield-alt';
  if (name.includes('状态') || name.includes('status')) return 'fas fa-heart';
  if (name.includes('事件') || name.includes('event')) return 'fas fa-calendar-alt';
  if (name.includes('选项') || name.includes('option')) return 'fas fa-sliders-h';

  // 使用 useUIStore 中的通用智能匹配逻辑
  const smartIcon = getSmartTabIcon(tableName);
  if (smartIcon !== 'fas fa-table') {
    return smartIcon;
  }

  return 'fas fa-table';
}

/** 从设置弹窗打开头像管理器 */
function handleOpenAvatarManagerFromSettings() {
  // 调用 RelationshipGraph 组件的 openAvatarManager 方法
  if (relationshipGraphRef.value) {
    relationshipGraphRef.value.openAvatarManager();
  }
}

/** 打开另存为弹窗 */
function handleSaveAs() {
  uiStore.openInputFloorDialog(currentTargetFloor.value);
}

/** 打开清除弹窗 */
function handlePurge() {
  uiStore.openPurgeRangeDialog(maxFloorIndex.value);
}

/** 处理仪表盘快捷按钮动作 */
function handleDashboardAction(actionId: string, tableId: string) {
  switch (actionId) {
    case 'clear':
      // 打开清除弹窗
      handlePurge();
      break;
    case 'undo':
      // 撤回操作
      handleUndo();
      break;
    case 'manualUpdate':
      // 手动更新
      handleManualUpdate();
      break;
    case 'console':
      // 打开导演控制台
      uiStore.openDirectorDialog();
      break;
    case 'quickReroll':
      // 快捷重抽
      triggerQuickReroll();
      break;
    default:
      console.log('[ACU Dashboard] 未处理的动作:', actionId, tableId);
  }
}

// ============================================================
// 事件处理 - 分类选择弹窗中的标签点击
// ============================================================

/**
 * 处理分类弹窗中的标签选择
 * @param tag 选中的标签
 * @param rowContext 行上下文（用于解析通配符）
 */
function handleCategoryTagSelect(tag: InteractiveTag, rowContext: { title: string; value: string }) {
  // 解析提示词模板中的通配符
  let prompt = String(tag.promptTemplate || '');

  // {{value}} - 标签本身的值
  prompt = prompt.replace(/\{\{value\}\}/gi, tag.label);

  // {{rowTitle}} - 当前行标题
  if (rowContext?.title) {
    prompt = prompt.replace(/\{\{rowTitle\}\}/gi, rowContext.title);
  } else {
    prompt = prompt.replace(/\{\{rowTitle\}\}/gi, '');
  }

  // {{playerName}} - 主角名
  const playerName = getPlayerName();
  prompt = prompt.replace(/\{\{playerName\}\}/gi, playerName);

  // {{tableName}} - 表格名（分类弹窗没有表格上下文，留空）
  prompt = prompt.replace(/\{\{tableName\}\}/gi, '');

  const resolvedPrompt = prompt.trim();

  // 检查是否为地点类标签（需要显示同伴选择器）
  const category = tagLibraryStore.getCategoryById(tag.categoryId);
  const isLocation = category ? category.path.includes('地点') || category.path.includes('Location') : false;

  // 检查是否需要二次编辑
  // 如果是地点标签，强制打开二次编辑弹窗以选择同伴
  if (tag.allowPreEdit || isLocation) {
    // 打开二次编辑弹窗
    uiStore.openTagPreEditDialog({
      tagLabel: tag.label,
      resolvedPrompt,
      showCompanions: isLocation,
    });
  } else if (resolvedPrompt) {
    // 直接追加到输入框
    setInput(resolvedPrompt);
  }
}

/**
 * 获取主角名
 */
function getPlayerName(): string {
  const parentWin = window.parent || window;
  try {
    const ctx = (parentWin as any).SillyTavern?.getContext?.();
    if (ctx?.name1) {
      return ctx.name1;
    }
  } catch (e) {
    console.warn('[ACU] 获取主角名失败', e);
  }
  return '{{user}}';
}

// ============================================================
// 事件处理 - 抽签系统
// ============================================================

/**
 * 处理抽签确认
 */
function handleDivinationConfirm(action: 'reveal' | 'hide' | 'reroll' = 'reveal') {
  const result = uiStore.divinationOverlay.result;
  if (result) {
    confirmDivination(result, action);
  } else {
    console.error('[ACU] Confirm divination failed: No result found');
  }
}

/**
 * 处理隐藏提示词保存
 * @param prompt 提示词内容
 */
function handlePromptEditorSave(prompt: string): void {
  setHiddenPrompt(prompt);
  setupSendIntercept();
}


// ============================================================
// 事件处理 - 弹窗
// ============================================================

/** 设置保存 */
function handleSettingsSave() {
  console.info('[ACU] 设置已保存');
}

/** 手动更新 - 打开配置弹窗 */
function handleManualUpdate() {
  uiStore.openManualUpdateDialog();
}

/** 打开原生编辑器 */
function handleOpenNative() {
  try {
    const w = window.parent || window;
    const api = (w as any).AutoCardUpdaterAPI || (window as any).AutoCardUpdaterAPI;
    if (api && typeof api.openVisualizer === 'function') {
      api.openVisualizer();
      console.info('[ACU] 已打开原生编辑器');
    } else {
      console.warn('[ACU] AutoCardUpdaterAPI.openVisualizer 不可用');
    }
  } catch (error) {
    console.error('[ACU] 打开原生编辑器失败:', error);
  }
}

/** 高级清除完成回调 */
async function handleAdvancedPurgeConfirm(result: { changedCount: number; tables: string[] }) {
  console.info(`[ACU] 高级清除完成，影响 ${result.changedCount} 楼层，表格:`, result.tables);
  // 刷新数据以反映变更
  await loadData();
}

// ============================================================
// 生命周期
// ============================================================

onMounted(async () => {
  console.info('[ACU] App 组件已挂载');

  // 初始化样式注入
  initStyles();

  // 初始化 Swipe 增强功能（必须在 onMounted 中执行，确保父窗口 DOM 已就绪）
  try {
    swipeEnhancement.init();
    console.info('[ACU] Swipe 增强功能初始化成功');
  } catch (error) {
    console.error('[ACU] Swipe 增强功能初始化失败:', error);
  }

  // 检测移动端
  uiStore.setMobile(window.innerWidth <= 768);

  // 监听窗口大小变化
  window.addEventListener('resize', () => {
    uiStore.setMobile(window.innerWidth <= 768);
  });

  // 加载数据
  try {
    await loadData();

    // 初始化仪表盘配置 (需在数据加载后执行，以便自动添加默认组件时能获取到表格数据)
    await dashboardStore.loadConfig();

    // 初始化抽签系统配置
    divinationStore.loadConfig();
    // 加载世界书词库 (如果存在)
    await divinationStore.loadFromWorldbook();

    uiStore.setInitialized(true);

    // 设置默认活跃 Tab
    // 【关键修复】参照 6.4.1：居中模式（首次加载）下不自动打开任何 tab，只显示光秃秃的导航栏
    // 这样导航栏就不会因为内容区域太大而被推到屏幕外面
    let isCenteredMode = false;
    try {
      const winConfigRaw = localStorage.getItem('acu_win_config');
      const winConfig = winConfigRaw ? JSON.parse(winConfigRaw) : null;
      // 如果是居中模式（通常是首次加载）
      if (winConfig?.isCentered === true) {
        isCenteredMode = true;
        // 【关键】强制设置 activeTab 为 null，只显示导航栏
        uiStore.setActiveTab(null);
        // 【关键】强制展开面板，不显示悬浮球
        uiStore.isCollapsed = false;
        console.info('[ACU] 居中模式（首次加载）：强制清除 Tab，展开面板，只显示导航栏');
      }
    } catch (e) {
      // 解析失败，使用默认行为
    }

    // 非居中模式下，如果没有 activeTab 且有表格数据，则默认打开仪表盘
    if (!isCenteredMode && !uiStore.activeTab && processedTables.value.length > 0) {
      uiStore.setActiveTab(TAB_DASHBOARD);
    }
  } catch (error) {
    console.error('[ACU] 初始化数据加载失败:', error);
  }
});

onUnmounted(() => {
  console.info('[ACU] App 组件已卸载');

  // 停止自动保存 (防止内存泄露)
  stopAutoSave();

  // 清理 DOM 拦截
  cleanupSendIntercept();

  // 清理样式
  cleanupStyles();
});

// ============================================================
// 监听
// ============================================================

// 监听移动端安全区配置，将值注入到父窗口 CSS 变量
watchEffect(() => {
  // 仅在移动模式下应用安全区，PC 端强制为 0
  const safeAreaBottom = uiStore.isMobile ? (configStore.config.mobileSafeAreaBottom ?? 50) : 0;
  const safeAreaTop = uiStore.isMobile ? (configStore.config.mobileSafeAreaTop ?? 0) : 0;
  if (window.parent?.document?.documentElement) {
    window.parent.document.documentElement.style.setProperty('--acu-safe-area-bottom', `${safeAreaBottom}px`);
    window.parent.document.documentElement.style.setProperty('--acu-safe-area-top', `${safeAreaTop}px`);
  }
});
</script>
