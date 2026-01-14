<template>
  <div class="acu-dash-container-new">
    <!-- 顶栏 -->
    <div class="acu-dash-header">
      <div class="acu-dash-header-left">
        <span class="acu-dash-header-title">
          <i class="fas fa-th-large"></i>
          仪表盘
        </span>
      </div>

      <div class="acu-dash-header-actions">
        <!-- 搜索框 -->
        <div class="acu-search-box">
          <i class="fas fa-search acu-search-icon"></i>
          <input v-model="searchTerm" type="text" class="acu-search-input" placeholder="搜索..." />
          <i v-if="searchTerm" class="fas fa-times acu-search-clear" @click="searchTerm = ''"></i>
        </div>

        <template v-if="isEditing">
          <button class="acu-dash-add-widget-btn" title="添加看板" @click.stop="showAddWidgetDialog = true">
            <i class="fas fa-plus"></i>
          </button>
          <button class="acu-dash-sort-btn" title="调整顺序" @click.stop="showSortDialog = true">
            <i class="fas fa-sort"></i>
          </button>
          <button class="acu-dash-done-btn" @click.stop="exitEditMode">完成</button>
        </template>
        <template v-else>
          <button class="acu-dash-edit-btn" title="编辑仪表盘" @click.stop="enterEditMode">
            <i class="fas fa-edit"></i>
          </button>
        </template>
      </div>
    </div>

    <!-- 组件网格 -->
    <div ref="gridRef" class="acu-dash-grid">
      <!-- 动态配置的看板 -->
      <DashboardWidget
        v-for="widget in enabledWidgets"
        :key="widget.id"
        :config="widget"
        :table-data="getTableById(widget.tableId)"
        :is-editing="isEditing"
        :diff-map="diffMap"
        :class="{
          'acu-dash-widget-dragging': draggingWidgetId === widget.id,
          'acu-dash-widget-drop-target': dropTargetId === widget.id,
        }"
        @navigate="handleNavigate"
        @row-click="handleRowClick"
        @action="handleWidgetAction"
        @remove="handleRemoveWidget"
        @resize="handleResizeWidget"
        @config-actions="handleConfigActions"
        @drag-start="handleDragStart"
        @drag-end="handleDragEnd"
        @drop="handleDrop"
      />

      <!-- 空状态 - 没有配置任何看板 -->
      <div v-if="enabledWidgets.length === 0" class="acu-dash-empty-state">
        <i class="fas fa-layer-group"></i>
        <p>还没有配置任何看板</p>
        <button class="acu-dash-add-first-btn" @click.stop="showAddWidgetDialog = true">
          <i class="fas fa-plus"></i>
          添加第一个看板
        </button>
      </div>
    </div>

    <!-- 添加组件弹窗 (不使用 Teleport，因为 Vue 应用已挂载到父窗口) -->
    <div v-if="showAddWidgetDialog" class="acu-modal-container" @click.self="showAddWidgetDialog = false">
      <div class="acu-modal acu-add-widget-modal">
        <div class="acu-modal-header">
          <span class="acu-modal-title">添加看板</span>
          <button class="acu-close-pill" @click.stop="showAddWidgetDialog = false">关闭</button>
        </div>
        <div class="acu-modal-body">
          <div class="acu-add-widget-hint">选择要添加到仪表盘的表格：</div>
          <div class="acu-add-widget-list">
            <div
              v-for="table in availableTables"
              :key="table.id"
              class="acu-add-widget-item"
              :class="{ 'acu-add-widget-item-added': isTableAdded(table.id) }"
              @click.stop="handleAddWidget(table.id)"
            >
              <i :class="['fas', getTableIcon(table.id)]"></i>
              <span class="acu-add-widget-name">{{ table.name }}</span>
              <span v-if="isTableAdded(table.id)" class="acu-add-widget-badge">已添加</span>
              <span v-else class="acu-add-widget-count">{{ table.rows.length }} 行</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 快捷按钮配置弹窗 (不使用 Teleport，因为 Vue 应用已挂载到父窗口) -->
    <div v-if="editingActionsWidgetId" class="acu-modal-container" @click.self="editingActionsWidgetId = null">
      <div class="acu-modal acu-actions-config-modal">
        <div class="acu-modal-header">
          <span class="acu-modal-title">配置快捷按钮</span>
          <button class="acu-close-pill" @click.stop="editingActionsWidgetId = null">完成</button>
        </div>
        <div class="acu-modal-body">
          <div class="acu-actions-list">
            <label
              v-for="action in allActions"
              :key="action.id"
              class="acu-action-checkbox"
              :class="{ active: isActionEnabled(action.id) }"
            >
              <input type="checkbox" :checked="isActionEnabled(action.id)" @change="toggleAction(action.id)" />
              <i :class="['fas', action.icon]"></i>
              <span>{{ action.label }}</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- 排序弹窗 -->
    <DashboardSortDialog v-if="showSortDialog" :tables="tables" @close="showSortDialog = false" />
  </div>
</template>

<script setup lang="ts">
/**
 * Dashboard 仪表盘视图组件 (动态配置版)
 * 使用 useDashboardStore 管理配置
 */

import { computed, onMounted, ref, watch } from 'vue';
import { useDashboardStore } from '../stores/useDashboardStore';
import { useDataStore } from '../stores/useDataStore';
import type { ProcessedTable, TableRow, WidgetActionId } from '../types';
import { TABLE_KEYWORD_RULES, WIDGET_ACTIONS } from '../types';
import { getCore } from '../utils/index';
import { DashboardWidget } from './dashboard';
import DashboardSortDialog from './dialogs/DashboardSortDialog.vue';

interface Props {
  /** 所有表格数据 */
  tables: ProcessedTable[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  navigate: [tableId: string];
  rowClick: [tableId: string, row: TableRow];
  showRelationshipGraph: [];
  action: [actionId: WidgetActionId, tableId: string];
}>();

// ============================================================
// Stores
// ============================================================

const dataStore = useDataStore();
const dashboardStore = useDashboardStore();

// ============================================================
// 状态
// ============================================================

/** 是否处于编辑模式 */
const isEditing = ref(false);

/** 是否显示添加组件弹窗 */
const showAddWidgetDialog = ref(false);

/** 是否显示排序弹窗 */
const showSortDialog = ref(false);

/** 搜索关键词 */
const searchTerm = ref('');

/** 正在编辑快捷按钮的组件 ID */
const editingActionsWidgetId = ref<string | null>(null);

/** 拖拽中的组件 ID */
const draggingWidgetId = ref<string | null>(null);

/** 放置目标组件 ID */
const dropTargetId = ref<string | null>(null);

/** Grid 容器引用 */
const gridRef = ref<HTMLElement | null>(null);

// ============================================================
// Computed
// ============================================================

/** 启用的看板列表 */
const enabledWidgets = computed(() => dashboardStore.enabledWidgets);

/** 差异映射 */
const diffMap = computed(() => dataStore.diffMap);

/** 可用的表格列表（用于添加弹窗） */
const availableTables = computed(() => props.tables);

/** 所有快捷按钮选项 */
const allActions = computed(() => Object.values(WIDGET_ACTIONS));

/** 当前编辑的组件配置 */
const editingWidgetConfig = computed(() => {
  if (!editingActionsWidgetId.value) return null;
  return dashboardStore.config.widgets.find(w => w.id === editingActionsWidgetId.value);
});

// ============================================================
// Modal 层级管理
// ============================================================

/** 是否有弹窗打开 */
const hasActiveModal = computed(() => {
  return showAddWidgetDialog.value || showSortDialog.value || editingActionsWidgetId.value !== null;
});

/** 监听弹窗状态，切换父容器类名以提升层级 */
watch(hasActiveModal, isActive => {
  const { $ } = getCore();
  if (isActive) {
    $('.acu-data-display').addClass('has-modal');
  } else {
    $('.acu-data-display').removeClass('has-modal');
  }
});

// ============================================================
// 生命周期
// ============================================================

onMounted(async () => {
  // 加载仪表盘配置
  await dashboardStore.loadConfig();

  // 如果没有配置任何看板，自动添加匹配的表格
  if (dashboardStore.config.widgets.length === 0) {
    autoAddDefaultWidgets();
  }
});

// 监听表格变化，可能需要更新看板
watch(
  () => props.tables,
  () => {
    // 可以在这里添加自动更新逻辑
  },
);

// ============================================================
// 方法 - 表格相关
// ============================================================

/** 根据 ID 获取表格 */
function getTableById(tableId: string | undefined): ProcessedTable | null {
  if (!tableId) return null;
  return props.tables.find(t => t.id === tableId) ?? null;
}

/** 检查表格是否已添加 */
function isTableAdded(tableId: string): boolean {
  return dashboardStore.hasWidget(tableId);
}

/** 获取表格图标 */
function getTableIcon(tableId: string): string {
  for (const [key, keywords] of Object.entries(TABLE_KEYWORD_RULES)) {
    if (keywords.some(k => tableId.toLowerCase().includes(k.toLowerCase()))) {
      const template = dashboardStore.config.widgets.find(w => w.tableId === tableId);
      return template?.icon ?? 'fa-table';
    }
  }
  return 'fa-table';
}

/** 自动添加默认看板 */
function autoAddDefaultWidgets(): void {
  for (const table of props.tables) {
    // 尝试匹配模板
    for (const [, keywords] of Object.entries(TABLE_KEYWORD_RULES)) {
      if (keywords.some(k => table.id.toLowerCase().includes(k.toLowerCase()) || table.name.includes(k))) {
        dashboardStore.addWidget(table.id);
        break;
      }
    }
  }
}

// ============================================================
// 方法 - 编辑模式
// ============================================================

function enterEditMode(): void {
  isEditing.value = true;
}

function exitEditMode(): void {
  isEditing.value = false;
  draggingWidgetId.value = null;
  dropTargetId.value = null;
}

// ============================================================
// 方法 - 组件操作
// ============================================================

/** 添加组件 */
function handleAddWidget(tableId: string): void {
  if (isTableAdded(tableId)) return;
  dashboardStore.addWidget(tableId);
}

/** 移除组件 */
function handleRemoveWidget(widgetId: string): void {
  dashboardStore.removeWidget(widgetId);
}

/** 调整组件大小 */
function handleResizeWidget(widgetId: string, colSpan: 1 | 2): void {
  dashboardStore.updateWidget(widgetId, { colSpan });
}

/** 配置快捷按钮 */
function handleConfigActions(widgetId: string): void {
  editingActionsWidgetId.value = widgetId;
}

/** 检查快捷按钮是否启用 */
function isActionEnabled(actionId: WidgetActionId): boolean {
  return editingWidgetConfig.value?.actions.includes(actionId) ?? false;
}

/** 切换快捷按钮 */
function toggleAction(actionId: WidgetActionId): void {
  if (!editingActionsWidgetId.value || !editingWidgetConfig.value) return;

  const currentActions = [...editingWidgetConfig.value.actions];
  const index = currentActions.indexOf(actionId);

  if (index >= 0) {
    currentActions.splice(index, 1);
  } else {
    currentActions.push(actionId);
  }

  dashboardStore.setWidgetActions(editingActionsWidgetId.value, currentActions);
}

// ============================================================
// 方法 - 拖拽排序
// ============================================================

function handleDragStart(widgetId: string): void {
  draggingWidgetId.value = widgetId;
}

function handleDragEnd(): void {
  draggingWidgetId.value = null;
  dropTargetId.value = null;
}

function handleDrop(targetWidgetId: string): void {
  if (!draggingWidgetId.value || draggingWidgetId.value === targetWidgetId) return;

  // 找到目标位置
  const targetWidget = dashboardStore.config.widgets.find(w => w.id === targetWidgetId);
  if (targetWidget) {
    dashboardStore.moveWidget(draggingWidgetId.value, targetWidget.order);
  }

  draggingWidgetId.value = null;
  dropTargetId.value = null;
}

// ============================================================
// 方法 - 事件处理
// ============================================================

function handleNavigate(tableId: string): void {
  emit('navigate', tableId);
}

function handleRowClick(tableId: string, row: TableRow): void {
  emit('rowClick', tableId, row);
}

function handleWidgetAction(actionId: WidgetActionId, tableId: string): void {
  switch (actionId) {
    case 'goToTable':
      emit('navigate', tableId);
      break;
    case 'relationshipGraph':
      emit('showRelationshipGraph');
      break;
    default:
      emit('action', actionId, tableId);
      break;
  }
}
</script>
