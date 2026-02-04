<template>
  <div class="acu-app" :class="appClasses">
    <!-- 悬浮球 (面板隐藏时显示) -->
    <FloatingBall ref="floatingBallRef" :style="{ display: uiStore.isPanelVisible ? 'none' : 'block' }" />

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

    <!-- 设置弹窗 -->
    <SettingsDialog v-model:visible="uiStore.settingsDialog" @save="handleSettingsSave" />

    <!-- 导演控制台弹窗 -->
    <DirectorDialog v-model:visible="uiStore.directorDialog" />

    <!-- 输入楼层弹窗 -->
    <InputFloorDialog
      v-model:visible="uiStore.inputFloorDialog.visible"
      :current-floor="uiStore.inputFloorDialog.props.currentFloor"
      @confirm="handleSaveToFloor"
    />

    <!-- 清除范围弹窗 -->
    <PurgeRangeDialog
      v-model:visible="uiStore.purgeRangeDialog.visible"
      :max-floor="uiStore.purgeRangeDialog.props.maxFloor"
      @confirm="handlePurgeRange"
      @advanced-confirm="handleAdvancedPurgeConfirm"
    />

    <!-- 高级清除弹窗 (全局) -->
    <AdvancedPurgeDialog
      v-model:visible="uiStore.advancedPurgeDialog.visible"
      :initial-start-floor="uiStore.advancedPurgeDialog.props.initialStartFloor"
      :initial-end-floor="uiStore.advancedPurgeDialog.props.initialEndFloor"
      :initial-selected-tables="uiStore.advancedPurgeDialog.state.selectedTableKeys"
      @confirm="uiStore.handleAdvancedPurgeConfirm"
    />

    <!-- 手动更新配置弹窗 -->
    <ManualUpdateDialog v-model:visible="uiStore.manualUpdateDialog" />

    <!-- 历史记录弹窗 (DataTable 使用) -->
    <HistoryDialog
      v-model:visible="uiStore.historyDialog.visible"
      :table-name="uiStore.historyDialog.props.tableName"
      :table-id="uiStore.historyDialog.props.tableId"
      :row-index="uiStore.historyDialog.props.rowIndex"
      :current-row-data="uiStore.historyDialog.props.currentRowData"
      :title-col-index="uiStore.historyDialog.props.titleColIndex"
      @apply="handleHistoryApply"
    />

    <!-- 行编辑弹窗 (Dashboard 使用) -->
    <RowEditDialog
      v-model:visible="uiStore.rowEditDialog.visible"
      :table-name="uiStore.rowEditDialog.props.tableName"
      :table-id="uiStore.rowEditDialog.props.tableId"
      :row-index="uiStore.rowEditDialog.props.rowIndex"
      :current-row-data="uiStore.rowEditDialog.props.currentRowData"
      @close="uiStore.closeRowEditDialog"
      @show-history="uiStore.switchFromRowEditToHistory"
    />

    <!-- 历史记录弹窗 (Dashboard 使用) -->
    <HistoryDialog
      v-model:visible="uiStore.dashboardHistoryDialog.visible"
      :table-name="uiStore.dashboardHistoryDialog.props.tableName"
      :table-id="uiStore.dashboardHistoryDialog.props.tableId"
      :row-index="uiStore.dashboardHistoryDialog.props.rowIndex"
      :current-row-data="uiStore.dashboardHistoryDialog.props.currentRowData"
      :title-col-index="uiStore.dashboardHistoryDialog.props.titleColIndex"
      @close="uiStore.closeDashboardHistoryDialog"
    />

    <!-- 组件设置弹窗 (Dashboard 使用) -->
    <WidgetSettingsDialog
      v-model:visible="uiStore.widgetSettingsDialog.visible"
      :widget-id="uiStore.widgetSettingsDialog.props.widgetId"
      :widget-config="uiStore.widgetSettingsDialog.props.widgetConfig"
      :table-headers="uiStore.widgetSettingsDialog.props.tableHeaders"
      @close="uiStore.closeWidgetSettingsDialog"
    />

    <!-- 头像裁剪弹窗 (全局) -->
    <AvatarCropDialog
      :visible="uiStore.avatarCropDialog.visible"
      :image-url="uiStore.avatarCropDialog.props.imageUrl"
      :name="uiStore.avatarCropDialog.props.name"
      :initial-offset-x="uiStore.avatarCropDialog.props.initialOffsetX"
      :initial-offset-y="uiStore.avatarCropDialog.props.initialOffsetY"
      :initial-scale="uiStore.avatarCropDialog.props.initialScale"
      :initial-invert="uiStore.avatarCropDialog.props.initialInvert"
      :show-invert-option="uiStore.avatarCropDialog.props.showInvertOption"
      @close="uiStore.closeAvatarCropDialog"
      @apply="uiStore.handleAvatarCropApply"
      @upload="uiStore.handleAvatarCropUpload"
    />

    <!-- 快捷按钮配置弹窗 (Dashboard 使用) -->
    <WidgetActionsDialog
      v-model:visible="uiStore.widgetActionsDialog.visible"
      :widget-id="uiStore.widgetActionsDialog.props.widgetId"
      :current-actions="uiStore.widgetActionsDialog.props.currentActions"
      @close="uiStore.closeWidgetActionsDialog"
    />

    <!-- 头像管理弹窗 (RelationshipGraph 使用) -->
    <AvatarManagerDialog
      :visible="uiStore.avatarManagerDialog.visible"
      :nodes="uiStore.avatarManagerDialog.props.nodes"
      :factions="uiStore.avatarManagerDialog.props.factions"
      @close="uiStore.closeAvatarManagerDialog"
      @update="uiStore.handleAvatarManagerUpdate"
      @label-change="uiStore.handleAvatarManagerLabelChange"
    />

    <!-- 节点配置弹窗 (RelationshipGraph 使用) -->
    <NodeConfigDialog
      :visible="uiStore.nodeConfigDialog.visible"
      :node-id="uiStore.nodeConfigDialog.props.nodeId"
      :full-name="uiStore.nodeConfigDialog.props.fullName"
      :current-label="uiStore.nodeConfigDialog.props.currentLabel"
      :selected-indices="uiStore.nodeConfigDialog.props.selectedIndices"
      @close="uiStore.closeNodeConfigDialog"
      @confirm="uiStore.handleNodeConfigConfirm"
      @reset-to-full-name="uiStore.handleNodeConfigResetToFullName"
      @style-update="uiStore.handleNodeConfigStyleUpdate"
    />

    <!-- 姓名选择弹窗 (AvatarManagerDialog 使用) -->
    <NodeLabelDialog
      :visible="uiStore.nodeLabelDialog.visible"
      :full-name="uiStore.nodeLabelDialog.props.fullName"
      :initial-indices="uiStore.nodeLabelDialog.props.initialIndices"
      @close="uiStore.closeNodeLabelDialog"
      @apply="uiStore.handleNodeLabelApply"
      @reset="uiStore.handleNodeLabelReset"
    />

    <!-- 关系图设置弹窗 (RelationshipGraph 使用) -->
    <GraphSettingsDialog
      :visible="uiStore.graphSettingsDialog.visible"
      :factions="uiStore.graphSettingsDialog.props.factions"
      @close="uiStore.closeGraphSettingsDialog"
      @open-avatar-manager="handleOpenAvatarManagerFromSettings"
    />

    <!-- 势力设置弹窗 (RelationshipGraph 使用) -->
    <FactionSettingsDialog
      :visible="uiStore.factionSettingsDialog.visible"
      :faction-id="uiStore.factionSettingsDialog.props.factionId"
      :faction-name="uiStore.factionSettingsDialog.props.factionName"
      @close="uiStore.closeFactionSettingsDialog"
    />

    <!-- 标签管理器弹窗 (WidgetSettingsDialog 使用) -->
    <TagManagerDialog
      :visible="uiStore.tagManagerDialog.visible"
      :widget-id="uiStore.tagManagerDialog.props.widgetId"
      :displayed-tag-ids="uiStore.tagManagerDialog.props.displayedTagIds"
      :displayed-category-ids="uiStore.tagManagerDialog.props.displayedCategoryIds"
      @close="uiStore.closeTagManagerDialog"
      @save="uiStore.handleTagManagerSave"
    />

    <!-- 分类选择弹窗 (DashboardWidget 使用) -->
    <CategorySelectPopup
      :visible="uiStore.categorySelectDialog.visible"
      :category-id="uiStore.categorySelectDialog.props.categoryId"
      :row-context="uiStore.categorySelectDialog.props.rowContext"
      :widget-id="uiStore.categorySelectDialog.props.widgetId"
      @close="uiStore.closeCategorySelectDialog"
      @select="handleCategoryTagSelect"
    />

    <!-- 标签二次编辑弹窗 (DashboardWidget 使用) -->
    <TagPreEditDialog
      :visible="uiStore.tagPreEditDialog.visible"
      :tag-label="uiStore.tagPreEditDialog.props.tagLabel"
      :resolved-prompt="uiStore.tagPreEditDialog.props.resolvedPrompt"
      :show-companions="uiStore.tagPreEditDialog.props.showCompanions"
      :widget-id="uiStore.tagPreEditDialog.props.widgetId"
      @close="uiStore.closeTagPreEditDialog"
    />

    <!-- 预设保存弹窗 (全局) -->
    <PresetSaveDialog
      :visible="uiStore.presetSaveDialog.visible"
      :preset-type="uiStore.presetSaveDialog.props.presetType"
      :summary-items="uiStore.presetSaveDialog.props.summaryItems"
      :initial-name="uiStore.presetSaveDialog.props.initialName"
      :check-duplicate="uiStore.presetSaveDialog.props.checkDuplicate"
      @update:visible="uiStore.closePresetSaveDialog"
      @save="uiStore.handlePresetSave"
    />

    <!-- 抽签覆盖层 -->
    <DivinationOverlay
      :visible="uiStore.divinationOverlay.visible"
      :result="uiStore.divinationOverlay.result"
      @close="uiStore.closeDivinationOverlay"
      @retry="performDivination"
      @confirm="handleDivinationConfirm"
    />

    <!-- 隐藏提示词编辑弹窗 -->
    <PromptEditorDialog
      :visible="uiStore.promptEditorDialog.visible"
      :prompt="uiStore.promptEditorDialog.props.prompt"
      @close="uiStore.closePromptEditorDialog"
      @save="handlePromptEditorSave"
    />

    <!-- 全局图标选择弹窗 -->
    <IconSelectDialog
      :visible="uiStore.iconSelectDialog.visible"
      :current-icon="uiStore.iconSelectDialog.props.currentIcon"
      @update:visible="uiStore.closeIconSelectDialog"
      @select="uiStore.handleIconSelect"
    />

    <!-- 标签预览浮窗 (全局) -->
    <TagPreviewTooltip />

    <!-- 全局 Toast 通知 -->
    <Toast :visible="toastState.visible" :message="toastState.message" :type="toastState.type" />
  </div>
</template>

<script setup lang="ts">
/**
 * App.vue - ACU 可视化表格根组件
 *
 * 集成所有子组件，管理全局状态和事件通信
 */

import { computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, watch, watchEffect } from 'vue';

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
import {
  AdvancedPurgeDialog,
  AvatarCropDialog,
  AvatarManagerDialog,
  DirectorDialog,
  FactionSettingsDialog,
  GraphSettingsDialog,
  HistoryDialog,
  IconSelectDialog,
  InputFloorDialog,
  ManualUpdateDialog,
  NodeConfigDialog,
  NodeLabelDialog,
  PresetSaveDialog,
  PurgeRangeDialog,
  RowEditDialog,
  SettingsDialog,
  WidgetActionsDialog,
  WidgetSettingsDialog,
} from './components/dialogs';
import { DivinationOverlay, PromptEditorDialog } from './components/dialogs/divination';
import {
  CategorySelectPopup,
  TagManagerDialog,
  TagPreEditDialog,
  TagPreviewTooltip,
} from './components/dialogs/tag-manager';

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
import { useCoreActions } from './composables/useCoreActions';
import { useDataPersistence } from './composables/useDataPersistence';
import { useDivinationAction } from './composables/useDivinationAction';
import { useFullscreenSupport } from './composables/useFullscreenSupport';
import { appendToActiveInput, useHiddenPrompt } from './composables/useHiddenPrompt';
import { useParentStyleInjection } from './composables/useParentStyleInjection';
import { useRowHistory } from './composables/useRowHistory';
import { useSwipeEnhancement } from './composables/useSwipeEnhancement';
import { useTableUpdateStatus } from './composables/useTableUpdateStatus';
import { toast, useToast } from './composables/useToast';
import { useTouchScrollFix } from './composables/useTouchScrollFix';

// 工具函数导入
import { isCharacterTable, processJsonData } from './utils';

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
const { saveToDatabase, getTableData, purgeFloorRange: executePurgeFloorRange, stopAutoSave } = useDataPersistence();
const { refresh: refreshTableStatus } = useTableUpdateStatus();
const { state: toastState } = useToast();
const { setInput } = useCoreActions();
const { setHiddenPrompt, setupSendIntercept, cleanupSendIntercept } = useHiddenPrompt();
const { performDivination, confirmDivination, triggerQuickReroll } = useDivinationAction();

// 触摸滚动修复（横向布局卡片滑动）- 随组件生命周期自动管理
useTouchScrollFix();

// API 回调注册（表格更新、快照管理）- 随组件生命周期自动管理
useApiCallbacks();

// 全屏支持（同层界面兼容）- 随组件生命周期自动管理
// 支持三种场景：CSS全屏、浏览器全屏、iframe内全屏
useFullscreenSupport();

// Swipe 增强功能（清除表格、重新触发剧情推进）- 在 onMounted 中初始化
const swipeEnhancement = useSwipeEnhancement();
// 注意：init() 移到 onMounted 中执行，确保父窗口 DOM 已就绪

// ============================================================
// Refs
// ============================================================

const floatingBallRef = ref<InstanceType<typeof FloatingBall>>();
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

/** 右键菜单状态 */
const contextMenuState = reactive({
  visible: false,
  x: 0,
  y: 0,
  tableId: '',
  tableName: '',
  rowIndex: 0,
  isDeleting: false,
});

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

/** 选项类表格 */
const optionsTables = computed(() => {
  return processedTables.value.filter(t => t.name.includes('选项') || t.name.toLowerCase().includes('option'));
});

/** 是否有关系图相关数据（用于控制关系图 Tab 显示） */
const hasRelationshipData = computed(() => {
  return processedTables.value.some(t => isCharacterTable(t.name, t.id));
});

/**
 * 获取关系表数据（用于关系图）
 */
const relationshipTableData = computed<ProcessedTable | null>(() => {
  return (
    processedTables.value.find(t => {
      const name = t.name.toLowerCase();
      const id = t.id.toLowerCase();
      return name.includes('关系') || id.includes('relationship') || id.includes('relation');
    }) || null
  );
});

/**
 * 获取角色表列表（用于关系图）
 */
const characterTablesData = computed<ProcessedTable[]>(() => {
  return processedTables.value.filter(t => isCharacterTable(t.name, t.id));
});

/**
 * 获取势力表数据（用于关系图）
 */
const factionTableData = computed<ProcessedTable | null>(() => {
  const keywords = ['势力', 'faction', '组织', 'organization', '阵营', '帮派', '宗门', '门派', '派系'];
  return (
    processedTables.value.find(t => {
      const name = t.name.toLowerCase();
      const id = t.id.toLowerCase();
      return keywords.some(kw => name.includes(kw) || id.includes(kw));
    }) || null
  );
});

/**
 * 获取势力列表（用于关系图设置弹窗）
 * 从角色表中提取有归属的势力
 */
const factionList = computed<string[]>(() => {
  const factions = new Set<string>();

  // 从角色表中提取势力归属
  for (const table of characterTablesData.value) {
    // 查找势力/阵营列的索引
    const factionColIndex = table.headers.findIndex(h => {
      const lower = h.toLowerCase();
      return lower.includes('势力') || lower.includes('阵营') || lower.includes('faction');
    });

    if (factionColIndex >= 0) {
      for (const row of table.rows) {
        const cell = row.cells.find(c => c.colIndex === factionColIndex);
        if (cell && cell.value && String(cell.value).trim()) {
          factions.add(String(cell.value).trim());
        }
      }
    }
  }

  return Array.from(factions);
});

/** 当前选中的表格 */
const currentTable = computed(() => {
  if (!uiStore.activeTab) return null;
  return processedTables.value.find(t => t.id === uiStore.activeTab) || null;
});

/** 当前目标楼层 */
const currentTargetFloor = computed(() => {
  // 从 dataStore 获取目标楼层信息
  return 0; // 默认值，实际应从 dataStore 获取
});

/** 最大楼层索引 */
const maxFloorIndex = computed(() => {
  // 从聊天记录获取最大楼层
  const chat = (window as any).SillyTavern?.chat;
  return Array.isArray(chat) ? chat.length - 1 : 0;
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

// ============================================================
// 事件处理 - 悬浮球
// ============================================================

/** 悬浮球点击 - 显示面板 */
function handleBallClick() {
  uiStore.openPanel();
  isContentHidden.value = false;
  console.info('[ACU] 面板已打开');
}

/** 悬浮球双击 - 切换停靠模式 */
function handleBallDoubleClick() {
  floatingBallRef.value?.setDocked(true);
  console.info('[ACU] 悬浮球已停靠');
}

// ============================================================
// 事件处理 - 面板
// ============================================================

/** 关闭面板 */
function handlePanelClose() {
  uiStore.closePanel();
  console.info('[ACU] 面板已关闭');
}

/** 隐藏内容区 */
function handleHideContent() {
  isContentHidden.value = !isContentHidden.value;
}

/** 收起面板为悬浮球 */
function handleToggle() {
  uiStore.isCollapsed = true;
  console.info('[ACU] 面板已收起为悬浮球');
}

// ============================================================
// 事件处理 - 标签栏
// ============================================================

/** Tab 切换 */
function handleTabChange(tabId: string) {
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

/**
 * 恢复表格的记忆高度
 * @param tabId Tab ID
 */
function restoreTableHeight(tabId: string) {
  const dataAreaEl = mainPanelRef.value?.getDataAreaElement();
  if (!dataAreaEl) return;

  const savedHeight = uiStore.getTableHeight(tabId);

  if (savedHeight) {
    // 有记忆高度，直接应用
    dataAreaEl.style.height = `${savedHeight}px`;
    console.info(`[ACU] 恢复高度: ${tabId} = ${savedHeight}px`);
  } else {
    // 没有记忆高度，使用自适应计算
    mainPanelRef.value?.resetHeight();
  }
}

/** Tab 排序变更 */
function handleTabsReorder(newOrder: string[]) {
  uiStore.setTableOrder(newOrder);
  console.info('[ACU] Tab 顺序已更新');
}

/** 收纳Tab按钮点击 - 显示/隐藏Tab浮窗 */
function handleCollapseTabClick() {
  uiStore.toggleTabsPopup();
  console.info(`[ACU] Tab浮窗: ${uiStore.tabsPopup ? '显示' : '隐藏'}`);
}

/** Tab浮窗点击 - 切换Tab并关闭浮窗 */
function handleTabsPopupClick(tabId: string) {
  uiStore.closeTabsPopup();
  handleTabChange(tabId);
}

// ============================================================
// 事件处理 - 导航
// ============================================================

/** 导航到指定表格 */
function handleNavigateToTable(tableId: string) {
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
function handleShowRelationshipGraph() {
  if (hasRelationshipData.value) {
    uiStore.setActiveTab(TAB_RELATIONSHIP_GRAPH);
    console.info('[ACU] 导航到关系图 Tab');
  } else {
    toast.warning('未找到人物关系数据');
  }
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

/** 关闭当前表格，返回仪表盘 */
function handleTableClose() {
  // 使用 handleTabChange 以确保高度被正确重置/恢复
  handleTabChange(TAB_DASHBOARD);
  console.info('[ACU] 返回仪表盘');
}

/**
 * 打开数据库原生编辑器
 * @param tableId 表格 ID (可选，无 tableId 时打开主界面)
 */
function openNativeEditor(tableId?: string): void {
  try {
    const parentWin = window.parent || window;
    const api = (parentWin as any).AutoCardUpdaterAPI;

    if (tableId && api?.openTableEditor) {
      // 有 tableId：打开指定表格的编辑器
      api.openTableEditor(tableId);
    } else if (api?.openVisualizer) {
      // 无 tableId：打开原生可视化主界面
      api.openVisualizer();
      console.info('[ACU] 已打开原生编辑器');

      // 打开原生编辑器时，收起面板为悬浮球
      handleToggle();
    } else if (api?.openModal) {
      // 备选方案：打开数据库主界面
      api.openModal();
    } else {
      console.warn('[ACU] 无法打开原生编辑器：API 不可用');
    }
  } catch (e) {
    console.error('[ACU] 打开原生编辑器失败', e);
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

/** 高度拖拽开始 - 调用 MainPanel 的高度拖拽逻辑 */
function handleHeightDragStart(event: PointerEvent, handleEl: HTMLElement | null) {
  // 获取 MainPanel 暴露的数据区元素
  const dataAreaEl = mainPanelRef.value?.getDataAreaElement();
  if (!dataAreaEl || !handleEl) return;

  // 只响应左键
  if (event.button !== 0) return;

  event.preventDefault();
  event.stopPropagation();

  // 使用传入的 handleEl 捕获指针
  handleEl.setPointerCapture(event.pointerId);

  const startY = event.clientY;
  const startHeight = dataAreaEl.offsetHeight;

  const handlePointerMove = (moveE: PointerEvent) => {
    const dy = startY - moveE.clientY;
    let newHeight = startHeight + dy;

    // 限制高度范围：最小 200px，最大由 CSS 的 max-height: calc(100vh - bottom) 控制
    const minHeight = 200;
    newHeight = Math.max(minHeight, newHeight);

    dataAreaEl.style.height = `${newHeight}px`;
  };

  const handlePointerUp = (upE: PointerEvent) => {
    handleEl.releasePointerCapture(upE.pointerId);
    handleEl.removeEventListener('pointermove', handlePointerMove);
    handleEl.removeEventListener('pointerup', handlePointerUp);

    // 保存高度到对应表名（关键：每个表独立记忆）
    const currentTabName = uiStore.activeTab;
    if (currentTabName && dataAreaEl) {
      const finalHeight = dataAreaEl.offsetHeight;
      uiStore.setTableHeight(currentTabName, finalHeight);
      console.info(`[ACU] 保存高度: ${currentTabName} = ${finalHeight}px`);
    }
  };

  handleEl.addEventListener('pointermove', handlePointerMove);
  handleEl.addEventListener('pointerup', handlePointerUp);
}

/** 高度重置 - 调用 MainPanel 的重置高度方法 */
function handleHeightReset() {
  // 清除当前表的记忆高度
  const currentTabName = uiStore.activeTab;
  if (currentTabName) {
    uiStore.resetTableHeight(currentTabName);
    console.info(`[ACU] 清除高度记忆: ${currentTabName}`);
  }

  mainPanelRef.value?.resetHeight();
  console.info('[ACU] 高度已重置为自适应');
}

// ============================================================
// 事件处理 - 数据操作
// ============================================================

/** 加载数据 */
async function loadData(): Promise<void> {
  const data = getTableData();
  if (data) {
    // setStagedData 内部应用锁定保护并返回处理后的数据
    const processedData = dataStore.setStagedData(data);
    // 使用处理后的数据保存快照，避免锁定单元格产生 AI 高亮
    dataStore.saveSnapshot(processedData);

    // 同步新表格到可见列表（确保新模板的表格能显示）
    const allTableIds = Object.keys(data).filter(k => k.startsWith('sheet_'));
    uiStore.syncNewTablesToVisibleTabs(allTableIds);

    // 清理无效的仪表盘组件（移除已不存在的表格组件）
    dashboardStore.cleanupInvalidWidgets(allTableIds);

    // 刷新后清除所有高亮标记（手动和AI）
    dataStore.clearChanges(true);

    // 尝试补充默认组件（处理初始化时数据未就绪的情况）
    // 这是一个幂等操作，只会添加缺失的组件
    dashboardStore.ensureDefaultWidgets().catch(err => {
      console.warn('[ACU] 补充默认组件失败（非阻塞）:', err);
    });

    // 顺带刷新表格更新状态（仪表盘数据）
    // 由于 useTableUpdateStatus 改为了单例模式，这里调用会同步更新仪表盘组件
    refreshTableStatus().catch(err => {
      console.warn('[ACU] 刷新表格更新状态失败（非阻塞）:', err);
    });
  }
}

/** 刷新数据 */
async function handleRefresh() {
  try {
    await loadData();
    console.info('[ACU] 数据已刷新');
  } catch (error) {
    console.error('[ACU] 刷新失败:', error);
  }
}

/** 保存数据 */
async function handleSave() {
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

/** 撤回到上次保存 */
function handleUndo() {
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

/** 单元格点击 */
function handleCellClick(tableId: string, rowIndex: number, colIndex: number) {
  console.info(`[ACU] 单元格点击: ${tableId}[${rowIndex}][${colIndex}]`);
}

/** 行点击 */
function handleRowClick(tableId: string, row: TableRow) {
  console.info(`[ACU] 行点击: ${tableId}[${row.index}]`);
}

/** 插入行 */
async function handleInsertRow(tableId: string, afterIndex: number) {
  console.info(`[ACU] 插入行: ${tableId} 在索引 ${afterIndex} 之后`);

  // 查找表格对应的原始 sheetId（tableId 就是 sheetId）
  const table = processedTables.value.find(t => t.id === tableId);
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
function handleToggleDelete(tableId: string, rowIndex: number) {
  // 找到对应的表名（DataCard 使用 tableName 生成 rowKey）
  const table = processedTables.value.find(t => t.id === tableId);
  const tableName = table?.name || tableId;
  const rowKey = `${tableName}-row-${rowIndex}`;
  dataStore.toggleDelete(rowKey);
  console.info(`[ACU] 切换删除状态: ${rowKey}`);
}

// ============================================================
// 事件处理 - 右键菜单
// ============================================================

/** 显示右键菜单 */
function handleContextMenu(event: MouseEvent, tableId: string, rowIndex: number) {
  // 使用表名生成 rowKey（与 DataCard 保持一致）
  const table = processedTables.value.find(t => t.id === tableId);
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
function handleContextInsertRow() {
  handleInsertRow(contextMenuState.tableId, contextMenuState.rowIndex);
  contextMenuState.visible = false;
}

/** 右键菜单 - 复制 */
function handleContextCopy() {
  const table = processedTables.value.find(t => t.id === contextMenuState.tableId);
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
function handleContextDelete() {
  handleToggleDelete(contextMenuState.tableId, contextMenuState.rowIndex);
  contextMenuState.visible = false;
}

/** 右键菜单 - 撤销删除 */
function handleContextUndoDelete() {
  handleToggleDelete(contextMenuState.tableId, contextMenuState.rowIndex);
  contextMenuState.visible = false;
}

// ============================================================
// 事件处理 - 历史记录
// ============================================================

/** 显示历史记录弹窗 */
function handleShowHistory(tableId: string, tableName: string, rowIndex: number, rowData: TableRow) {
  // 计算 titleColIndex（与 DataTable.vue 逻辑一致）
  const table = processedTables.value.find(t => t.id === tableId);
  let titleColIndex = 1;
  if (table && (tableName.includes('总结') || tableName.includes('大纲'))) {
    const idx = table.headers.findIndex(h => h && (h.includes('索引') || h.includes('编号') || h.includes('代码')));
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

/** 应用历史记录更改 */
async function handleHistoryApply(changes: Map<number, string>) {
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

/**
 * 追加提示词到最后焦点输入框（支持 galgame 等同层界面）
 * @param prompt 提示词内容
 */
function appendPromptToInput(prompt: string): void {
  const wrapped = `<元指令>\n${prompt}\n</元指令>`;
  appendToActiveInput(wrapped, '\n');
  toast.success('提示词已追加到输入框');
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

/** 保存到指定楼层 */
async function handleSaveToFloor(floorIndex: number) {
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
async function handlePurgeRange(startFloor: number, endFloor: number) {
  try {
    await executePurgeFloorRange(startFloor, endFloor);
    console.info(`[ACU] 已清除第 ${startFloor} 到 ${endFloor} 楼的数据`);
    // 清除完成后刷新界面以显示最新数据
    await loadData();
  } catch (error) {
    console.error('[ACU] 清除范围失败:', error);
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
// 点击外部收起面板逻辑
// ============================================================

/**
 * 检查目标元素是否在 ACU 相关元素内
 * @param target 点击目标元素
 * @returns 如果在 ACU 元素内返回 true
 */
function isInsideACU(target: Element): boolean {
  const parentDoc = window.parent?.document || document;

  // 检查是否存在正在编辑的 InlineEditor（核心保护：只要有编辑器存在就不收起面板）
  if (parentDoc.querySelector('.acu-inline-editor')) {
    console.info('[ACU] 检测到 InlineEditor 存在，阻止收起面板');
    return true;
  }

  // 检查是否存在编辑锁定状态的卡片
  if (parentDoc.querySelector('.acu-editing-lock')) {
    console.info('[ACU] 检测到编辑锁定状态，阻止收起面板');
    return true;
  }

  // 检查是否正在编辑中（textarea 或 input 获得焦点）
  const activeElement = parentDoc.activeElement;
  if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
    // 如果活动元素在 ACU 内，认为是 ACU 内的点击
    if (activeElement.closest('.acu-wrapper') || activeElement.closest('.acu-inline-editor')) {
      console.info('[ACU] 检测到 ACU 内的输入框活动，阻止收起面板');
      return true;
    }
  }

  // 检查是否有任何弹窗正在显示
  if (
    uiStore.settingsDialog ||
    uiStore.inputFloorDialog.visible ||
    uiStore.purgeRangeDialog.visible ||
    uiStore.manualUpdateDialog ||
    uiStore.historyDialog.visible ||
    uiStore.presetSaveDialog.visible
  ) {
    return true;
  }

  // 检查是否在以下任一元素内
  return !!(
    target.closest('.acu-wrapper') || // 主面板容器
    target.closest('.acu-floating-ball-vue') || // 悬浮球
    target.closest('.acu-context-menu') || // 右键菜单
    target.closest('.acu-modal-overlay') || // 弹窗遮罩层
    target.closest('.acu-modal') || // 弹窗
    target.closest('.acu-modal-container') || // 弹窗容器
    target.closest('.acu-history-modal') || // 历史记录弹窗
    target.closest('.acu-dialog') || // 对话框
    target.closest('[class*="acu-settings"]') || // 设置相关
    target.closest('#acu_visualizer_vue-root') || // Vue 根容器
    target.closest('.acu-inline-editor') || // 内联编辑器
    target.closest('.acu-editing-lock') || // 编辑锁定状态的卡片
    target.closest('.acu-edit-textarea') // 编辑文本框
  );
}

// 使用 onClickOutside 监听点击外部事件
// 需要使用父窗口的 document 来监听
onMounted(() => {
  const parentDoc = window.parent?.document || document;

  const handleClickOutside = (event: MouseEvent) => {
    // 只在面板可见且未固定时处理
    if (!uiStore.isPanelVisible || uiStore.isPinned) {
      return;
    }

    const target = event.target as Element;

    // 如果点击在 ACU 相关元素内，不处理
    if (isInsideACU(target)) {
      return;
    }

    // 只有点击在外部时才收起面板
    uiStore.closePanel();
    console.info('[ACU] 点击外部，面板已收起');
  };

  // 在父窗口文档上监听点击事件
  parentDoc.addEventListener('click', handleClickOutside);

  // 清理函数
  onUnmounted(() => {
    parentDoc.removeEventListener('click', handleClickOutside);
  });
});

// ============================================================
// 监听
// ============================================================

// 监听移动端安全区配置，将值注入到父窗口 CSS 变量
watchEffect(() => {
  const safeArea = configStore.config.mobileSafeAreaBottom ?? 50;
  if (window.parent?.document?.documentElement) {
    window.parent.document.documentElement.style.setProperty('--acu-safe-area-bottom', `${safeArea}px`);
  }
});

// 监听数据变化，自动更新 diffMap
watch(
  () => dataStore.stagedData,
  newData => {
    if (newData) {
      dataStore.generateDiffMap(newData);
    }
  },
  { deep: true },
);
</script>
