<template>
  <div class="acu-dash-container-new">
    <!-- 顶栏 - 布局：标题 / (空) / 编辑按钮 / 高度拖手 / 搜索框 -->
    <div class="acu-dash-header">
      <!-- 左侧：标题 -->
      <div class="acu-dash-header-left">
        <span class="acu-dash-header-title">
          <i class="fas fa-th-large"></i>
          仪表盘
        </span>
      </div>

      <!-- 中间：弹性空间 -->
      <div class="acu-dash-header-spacer"></div>

      <!-- 右侧：按钮区 -->
      <div class="acu-dash-header-actions">
        <!-- 编辑模式按钮组 -->
        <template v-if="isEditing">
          <button class="acu-toolbar-btn" title="管理看板" @click.stop="openWidgetManager">
            <i class="fas fa-cog"></i>
          </button>
          <button class="acu-toolbar-btn acu-btn-primary" title="完成编辑" @click.stop="exitEditMode">
            <i class="fas fa-check"></i>
          </button>
        </template>
        <template v-else>
          <button class="acu-toolbar-btn" title="编辑仪表盘" @click.stop="enterEditMode">
            <i class="fas fa-edit"></i>
          </button>
        </template>

        <!-- 高度拖手 -->
        <button
          ref="heightHandleRef"
          class="acu-toolbar-btn acu-height-handle"
          title="拖动调整高度 / 双击重置"
          @pointerdown="handleHeightDragStart"
          @dblclick="handleHeightReset"
          @touchend.stop="handleHeightTouchEnd"
        >
          <i class="fas fa-grip-lines"></i>
        </button>

        <!-- 搜索框 -->
        <div class="acu-search-box">
          <i class="fas fa-search acu-search-icon"></i>
          <input v-model="searchTerm" type="text" class="acu-search-input" placeholder="搜索..." />
          <i v-if="searchTerm" class="fas fa-times acu-search-clear" @click="searchTerm = ''"></i>
        </div>
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
        :all-tables="availableTables"
        :class="{
          'acu-dash-widget-dragging': draggingWidgetId === widget.id,
          'acu-dash-widget-drop-target': dropTargetId === widget.id,
        }"
        @navigate="handleNavigate"
        @row-click="handleRowClick"
        @row-edit="handleRowEdit"
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
        <button class="acu-dash-add-first-btn" @click.stop="openWidgetManager">
          <i class="fas fa-plus"></i>
          添加第一个看板
        </button>
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
  </div>
</template>

<script setup lang="ts">
/**
 * Dashboard 仪表盘视图组件 (动态配置版)
 * 使用 useDashboardStore 管理配置
 */

import { computed, onMounted, ref } from 'vue';
import { useDashboardStore } from '../stores/useDashboardStore';
import { useDataStore } from '../stores/useDataStore';
import { useUIStore } from '../stores/useUIStore';
import type { ProcessedTable, TableRow, WidgetActionId } from '../types';
import { TABLE_KEYWORD_RULES, WIDGET_ACTIONS } from '../types';
import { DashboardWidget } from './dashboard';

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
  heightDragStart: [event: PointerEvent];
  heightReset: [];
}>();

// ============================================================
// Stores
// ============================================================

const dataStore = useDataStore();
const dashboardStore = useDashboardStore();
const uiStore = useUIStore();

// ============================================================
// 状态
// ============================================================

/** 是否处于编辑模式 */
const isEditing = ref(false);

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

/** 高度拖手引用 */
const heightHandleRef = ref<HTMLElement | null>(null);

/** 移动端长按高度拖手定时器 */
let heightTouchTimer: ReturnType<typeof setTimeout> | null = null;

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
        // 传入表名以确保标题正确显示
        dashboardStore.addWidget(table.id, table.name);
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
// 方法 - 弹窗
// ============================================================

/** 打开看板管理弹窗 */
function openWidgetManager(): void {
  uiStore.openWidgetManagerDialog(props.tables);
}

// ============================================================
// 方法 - 组件操作
// ============================================================

/** 切换表格组件（已添加时移除，未添加时添加） */
function handleAddWidget(tableId: string): void {
  if (isTableAdded(tableId)) {
    // 已添加时移除
    const widget = dashboardStore.findWidgetByTableId(tableId);
    if (widget) {
      dashboardStore.removeWidget(widget.id);
    }
  } else {
    // 未添加时添加
    const table = props.tables.find(t => t.id === tableId);
    dashboardStore.addWidget(tableId, table?.name);
  }
}

/** 检查是否已添加特殊组件 */
function hasSpecialWidget(widgetType: 'updateStatus' | 'optionsPanel'): boolean {
  return dashboardStore.hasSpecialWidget(widgetType);
}

/** 切换特殊组件（已添加时移除，未添加时添加） */
function handleAddSpecialWidget(widgetType: 'updateStatus' | 'optionsPanel'): void {
  if (hasSpecialWidget(widgetType)) {
    dashboardStore.removeSpecialWidget(widgetType);
  } else {
    dashboardStore.addSpecialWidget(widgetType);
  }
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
// 方法 - 高度拖手
// ============================================================

/**
 * 高度拖手按下事件
 */
function handleHeightDragStart(event: PointerEvent): void {
  if (heightHandleRef.value) {
    emit('heightDragStart', event, heightHandleRef.value);
  }
}

/**
 * 高度拖手双击重置
 */
function handleHeightReset(): void {
  emit('heightReset');
}

/**
 * 移动端触摸结束事件 (用于长按重置)
 */
function handleHeightTouchEnd(): void {
  if (heightTouchTimer) {
    clearTimeout(heightTouchTimer);
    heightTouchTimer = null;
  }
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

/** 处理行编辑 - 通过 uiStore 打开全局弹窗 */
function handleRowEdit(tableId: string, row: TableRow): void {
  const table = getTableById(tableId);
  uiStore.openRowEditDialog({
    tableId,
    tableName: table?.name ?? tableId,
    rowIndex: row.index,
    currentRowData: row,
  });
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
