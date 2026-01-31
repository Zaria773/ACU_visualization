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
          <button class="acu-icon-btn acu-btn-primary" title="完成编辑" @click.stop="exitEditMode">
            <i class="fas fa-check"></i>
          </button>
        </template>
        <template v-else>
          <button class="acu-icon-btn" title="编辑仪表盘" @click.stop="enterEditMode">
            <i class="fas fa-edit"></i>
          </button>
        </template>

        <!-- 高度拖手 -->
        <button
          ref="heightHandleRef"
          class="acu-icon-btn acu-height-handle"
          title="拖动调整高度 / 双击重置"
          @pointerdown="handleHeightDragStart"
          @dblclick="handleHeightReset"
          @touchend.stop="handleHeightTouchEnd"
        >
          <i class="fas fa-grip-lines"></i>
        </button>

        <!-- 搜索框 -->
        <input v-model="searchTerm" type="text" class="acu-search-input acu-search-inline" placeholder="搜索..." />
        <i v-if="searchTerm" class="fas fa-times acu-search-clear" @click="searchTerm = ''"></i>
      </div>
    </div>

    <!-- 组件网格 -->
    <div ref="gridRef" class="acu-dash-grid">
      <!-- 编辑模式：添加面板 -->
      <div v-if="isEditing" class="acu-dash-add-section">
        <!-- 使用通用按钮样式 -->
        <button
          class="acu-action-btn"
          :class="{ active: isAddPanelOpen }"
          @click.stop="isAddPanelOpen = !isAddPanelOpen"
        >
          <i class="fas" :class="isAddPanelOpen ? 'fa-chevron-up' : 'fa-plus'"></i>
          {{ isAddPanelOpen ? '收起' : '添加表格' }}
        </button>

        <!-- 展开的添加面板：复用 switch-list -->
        <div v-if="isAddPanelOpen" class="acu-switch-list acu-dash-add-list">
          <div class="acu-switch-list-body">
            <!-- 已添加的表格（排前面，switch 开启） -->
            <div
              v-for="widget in enabledWidgets"
              :key="widget.id"
              class="acu-switch-list-item is-selected"
              @click.stop="handleRemoveWidget(widget.id)"
            >
              <span class="item-label">
                <i :class="['fas', widget.icon]"></i>
                {{ getWidgetDisplayName(widget) }}
              </span>
              <label class="acu-switch small" @click.stop>
                <input type="checkbox" checked @change.stop="handleRemoveWidget(widget.id)" />
                <span class="slider"></span>
              </label>
            </div>

            <!-- 未添加的特殊组件 -->
            <div
              v-for="widget in notAddedSpecialWidgets"
              :key="widget.type"
              class="acu-switch-list-item"
              @click.stop="handleAddSpecialWidget(widget.type)"
            >
              <span class="item-label">
                <i :class="['fas', widget.icon]"></i>
                {{ widget.name }}
              </span>
              <label class="acu-switch small" @click.stop>
                <input type="checkbox" :checked="false" @change.stop="handleAddSpecialWidget(widget.type)" />
                <span class="slider"></span>
              </label>
            </div>

            <!-- 未添加的表格（排后面，switch 关闭） -->
            <div
              v-for="table in notAddedTables"
              :key="table.id"
              class="acu-switch-list-item"
              @click.stop="handleAddWidget(table.id)"
            >
              <span class="item-label">
                <i :class="['fas', getTableIcon(table.id)]"></i>
                {{ table.name }}
              </span>
              <label class="acu-switch small" @click.stop>
                <input type="checkbox" @change.stop="handleAddWidget(table.id)" />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- 动态配置的看板 -->
      <template v-for="widget in displayWidgets" :key="widget.id">
        <!-- 随机词表组件 -->
        <RandomWordPoolWidget
          v-if="widget.type === 'randomWordPool'"
          :is-editing="isEditing"
          :widget-id="widget.id"
          :col-span="widget.colSpan"
          :config="widget"
          :class="{
            'acu-dash-widget-dragging': draggingWidgetId === widget.id,
            'acu-dash-widget-drop-target': dropTargetId === widget.id,
          }"
          @remove="handleRemoveWidget"
          @resize="handleResizeWidget"
          @action="handleWidgetAction"
          @drag-start="handleDragStart"
          @drag-end="handleDragEnd"
          @drop="handleDrop"
        />

        <!-- 交互表格专用组件 -->
        <InteractionTableWidget
          v-else-if="widget.displayStyle === 'interaction'"
          :config="widget"
          :table-data="getTableById(widget.tableId)"
          :is-editing="isEditing"
          :diff-map="diffMap"
          :ai-diff-map="aiDiffMap"
          :search-term="searchTerm"
          :class="{
            'acu-dash-widget-dragging': draggingWidgetId === widget.id,
            'acu-dash-widget-drop-target': dropTargetId === widget.id,
          }"
          @navigate="handleNavigate"
          @row-edit="handleRowEdit"
          @action="handleWidgetAction"
          @remove="handleRemoveWidget"
          @resize="handleResizeWidget"
          @drag-start="handleDragStart"
          @drag-end="handleDragEnd"
          @drop="handleDrop"
        />

        <!-- 普通看板组件 -->
        <DashboardWidget
          v-else
          :config="widget"
          :table-data="getTableById(widget.tableId)"
          :is-editing="isEditing"
          :diff-map="diffMap"
          :ai-diff-map="aiDiffMap"
          :search-term="searchTerm"
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
          @drag-start="handleDragStart"
          @drag-end="handleDragEnd"
          @drop="handleDrop"
        />
      </template>

      <!-- 空状态 -->
      <div v-if="displayWidgets.length === 0" class="acu-dash-empty-state">
        <template v-if="searchTerm">
          <i class="fas fa-search"></i>
          <p>没有找到匹配 "{{ searchTerm }}" 的内容</p>
          <button class="acu-dash-add-first-btn" @click.stop="searchTerm = ''">
            <i class="fas fa-times"></i>
            清除搜索
          </button>
        </template>
        <template v-else>
          <i class="fas fa-layer-group"></i>
          <p>还没有配置任何看板</p>
          <button
            class="acu-dash-add-first-btn"
            @click.stop="
              enterEditMode();
              isAddPanelOpen = true;
            "
          >
            <i class="fas fa-plus"></i>
            添加第一个看板
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Dashboard 仪表盘视图组件 (动态配置版)
 * 使用 useDashboardStore 管理配置
 */

import { computed, onMounted, ref, watch } from 'vue';
import { useToast } from '../composables/useToast';
import { useDashboardStore } from '../stores/useDashboardStore';
import { useDataStore } from '../stores/useDataStore';
import { useUIStore } from '../stores/useUIStore';
import type { DashboardWidgetConfig, ProcessedTable, TableRow, WidgetActionId } from '../types';
import { TABLE_KEYWORD_RULES } from '../types';
import { DashboardWidget, InteractionTableWidget, RandomWordPoolWidget } from './dashboard';

const toast = useToast();

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
  heightDragStart: [event: PointerEvent, target: HTMLElement | null];
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

/** 添加面板是否展开 */
const isAddPanelOpen = ref(false);

/** 搜索关键词 */
const searchTerm = ref('');

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

/** 未添加到仪表盘的表格 */
const notAddedTables = computed(() => {
  return props.tables.filter(t => !dashboardStore.hasWidget(t.id));
});

/** 未添加的特殊组件 */
const notAddedSpecialWidgets = computed(() => {
  const widgets = dashboardStore.config.widgets;
  const list = [];

  if (!widgets.some(w => w.type === 'updateStatus')) {
    list.push({ type: 'updateStatus' as const, name: '表格更新状态', icon: 'fa-sync-alt' });
  }

  if (!widgets.some(w => w.type === 'optionsPanel')) {
    list.push({ type: 'optionsPanel' as const, name: '选项聚合面板', icon: 'fa-list-check' });
  }

  if (!widgets.some(w => w.type === 'randomWordPool')) {
    list.push({ type: 'randomWordPool' as const, name: '随机词表', icon: 'fa-dice' });
  }

  return list;
});

/** 差异映射 */
const diffMap = computed(() => dataStore.diffMap);

/** AI 变更映射 */
const aiDiffMap = computed(() => dataStore.aiDiffMap);

// ============================================================
// AI 高亮相关
// ============================================================

/** 有 AI 更新的表格 ID 集合 */
const aiHighlightedTableIds = computed(() => {
  const tableIds = new Set<string>();
  for (const widget of dashboardStore.enabledWidgets) {
    if (!widget.tableId) continue;
    const table = getTableById(widget.tableId);
    if (!table) continue;
    const hasAiUpdate = table.rows.some(row => {
      const key = `${widget.tableId}:${row.key}`;
      return dataStore.aiDiffMap.has(key);
    });
    if (hasAiUpdate) tableIds.add(widget.tableId);
  }
  return tableIds;
});

// ============================================================
// 搜索相关
// ============================================================

/** 检查组件是否有匹配搜索的内容（全局搜索） */
function widgetMatchesSearch(widget: DashboardWidgetConfig): boolean {
  if (!searchTerm.value) return true;
  const searchLower = searchTerm.value.toLowerCase().trim();
  if (!searchLower) return true;

  // 特殊组件：直接隐藏
  if (widget.type === 'updateStatus' || widget.type === 'optionsPanel' || widget.type === 'randomWordPool') {
    return false;
  }

  const table = getTableById(widget.tableId);
  if (!table) return false;

  // 全局搜索：表名 + 所有行的所有单元格
  if (table.name.toLowerCase().includes(searchLower)) return true;
  return table.rows.some(row => row.cells.some(cell => String(cell.value).toLowerCase().includes(searchLower)));
}

// ============================================================
// 处理后的组件列表
// ============================================================

/**
 * 处理后的组件列表
 * - 搜索模式: 过滤掉不匹配的组件
 * - 非搜索模式: AI 更新的组件排前面
 */
const displayWidgets = computed(() => {
  let widgets = [...dashboardStore.enabledWidgets];

  if (searchTerm.value) {
    // 搜索模式：过滤
    widgets = widgets.filter(w => widgetMatchesSearch(w));
  } else {
    // 非搜索模式：AI 更新的排前面
    widgets.sort((a, b) => {
      const aHighlight = aiHighlightedTableIds.value.has(a.tableId || '');
      const bHighlight = aiHighlightedTableIds.value.has(b.tableId || '');
      if (aHighlight !== bHighlight) return bHighlight ? 1 : -1;
      return a.order - b.order;
    });
  }

  return widgets;
});

/** 可用的表格列表（用于添加弹窗） */
const availableTables = computed(() => props.tables);

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

/** 获取组件显示名称 */
function getWidgetDisplayName(widget: DashboardWidgetConfig): string {
  // 特殊组件
  if (widget.type === 'updateStatus') return '表格更新状态';
  if (widget.type === 'optionsPanel') return '选项聚合面板';
  // 普通表格：优先用表名
  const table = props.tables.find(t => t.id === widget.tableId);
  return table?.name || widget.title || widget.tableId || '未知表格';
}

/** 获取表格图标 */
function getTableIcon(tableId: string): string {
  const table = getTableById(tableId);
  const nameToCheck = table?.name || tableId;

  for (const [key, keywords] of Object.entries(TABLE_KEYWORD_RULES)) {
    if (keywords.some(k => nameToCheck.toLowerCase().includes(k.toLowerCase()))) {
      // 如果已配置，优先用配置的图标
      const widget = dashboardStore.config.widgets.find(w => w.tableId === tableId);
      if (widget?.icon) return widget.icon;

      // 否则返回模板默认图标
      // 注意：这里需要从 Store 或常量中获取模板配置，但在组件内我们只能推断
      if (key === 'global') return 'fa-globe';
      if (key === 'task') return 'fa-tasks';
      if (key === 'item') return 'fa-box-open';
      if (key === 'character') return 'fa-user';
      if (key === 'location') return 'fa-map-marker-alt';
    }
  }
  return 'fa-table';
}

/** 自动添加默认看板 */
function autoAddDefaultWidgets(): void {
  for (const table of props.tables) {
    // 尝试匹配模板
    for (const [key, keywords] of Object.entries(TABLE_KEYWORD_RULES)) {
      if (keywords.some(k => table.id.toLowerCase().includes(k.toLowerCase()) || table.name.includes(k))) {
        // 传入表名以确保标题正确显示，并传入匹配到的 templateKey
        dashboardStore.addWidget(table.id, table.name, key);
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
  toast.info('拖动组件顶栏可排序');
}

function exitEditMode(): void {
  isEditing.value = false;
  isAddPanelOpen.value = false;
  draggingWidgetId.value = null;
  dropTargetId.value = null;
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
function hasSpecialWidget(widgetType: 'updateStatus' | 'optionsPanel' | 'randomWordPool'): boolean {
  return dashboardStore.hasSpecialWidget(widgetType);
}

/** 切换特殊组件（已添加时移除，未添加时添加） */
function handleAddSpecialWidget(widgetType: 'updateStatus' | 'optionsPanel' | 'randomWordPool'): void {
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
