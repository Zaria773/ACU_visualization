<template>
  <div
    class="acu-dash-widget"
    :class="{
      'acu-dash-widget-wide': config.colSpan === 2,
      'acu-dash-widget-editing': isEditing,
    }"
    :draggable="isEditing"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
    @dragover.prevent
    @drop="handleDrop"
  >
    <!-- 编辑控件 (仅编辑态显示) -->
    <template v-if="isEditing">
      <button class="acu-widget-remove" title="移除组件" @click.stop="emit('remove', config.id)">
        <i class="fas fa-times"></i>
      </button>
      <button class="acu-widget-config" title="配置快捷按钮" @click.stop="emit('config-actions', config.id)">
        <i class="fas fa-plus"></i>
      </button>
      <div class="acu-widget-resize" title="拖动改变大小" @mousedown.stop="startResize" @touchstart.stop="startResize">
        <i class="fas fa-expand-alt"></i>
      </div>
    </template>

    <!-- 头部 -->
    <div class="acu-dash-title">
      <span class="acu-dash-title-text">
        <i :class="['fas', config.icon]"></i>
        {{ displayTitle }}
        <span v-if="rowCount > 0" class="acu-dash-count">{{ rowCount }}</span>
      </span>
      <div v-if="!isEditing && config.actions.length > 0" class="acu-dash-actions">
        <button
          v-for="actionId in config.actions"
          :key="actionId"
          class="acu-dash-action-btn"
          :title="getActionTooltip(actionId)"
          @click.stop="handleAction(actionId)"
        >
          <i :class="['fas', getActionIcon(actionId)]"></i>
        </button>
      </div>
    </div>

    <!-- 内容区 (可滚动) -->
    <div class="acu-dash-body" :class="bodyClass">
      <template v-if="tableData && displayRows.length > 0">
        <!-- 网格式展示 (NPC风格) -->
        <div v-if="config.displayStyle === 'grid'" class="acu-dash-npc-grid">
          <div
            v-for="row in displayRows"
            :key="row.key"
            class="acu-dash-npc-item acu-dash-interactive"
            :class="{ 'acu-highlight-changed': isRowChanged(row) }"
            @click.stop="handleRowClick(row)"
          >
            <span class="acu-dash-npc-text">{{ getDisplayValue(row) }}</span>
            <button
              class="acu-dash-row-edit-btn"
              title="编辑"
              @click.stop="handleEditRow(row)"
            >
              <i class="fas fa-pen"></i>
            </button>
          </div>
        </div>

        <!-- 列表式展示 (任务风格) -->
        <div v-else-if="config.displayStyle === 'list'" class="acu-dash-list">
          <div
            v-for="row in displayRows"
            :key="row.key"
            class="acu-dash-list-item acu-dash-interactive"
            :class="{ 'acu-highlight-changed': isRowChanged(row) }"
            @click.stop="handleRowClick(row)"
          >
            <i class="fas fa-circle" style="font-size: 6px"></i>
            <span class="acu-dash-list-text">{{ getDisplayValue(row) }}</span>
            <span v-if="getSecondaryValue(row)" class="acu-dash-list-badge">
              {{ getSecondaryValue(row) }}
            </span>
            <button
              class="acu-dash-row-edit-btn"
              title="编辑"
              @click.stop="handleEditRow(row)"
            >
              <i class="fas fa-pen"></i>
            </button>
          </div>
        </div>

        <!-- 紧凑式展示 (状态栏风格) -->
        <div v-else class="acu-dash-compact">
          <div v-for="row in displayRows" :key="row.key" class="acu-dash-stat-row">
            <span class="acu-dash-stat-label">{{ getLabel(row) }}</span>
            <span class="acu-dash-stat-val" :class="{ 'acu-highlight-changed': isRowChanged(row) }">
              {{ getValue(row) }}
            </span>
          </div>
        </div>
      </template>

      <!-- 空状态 -->
      <div v-else class="acu-dash-empty">
        <i :class="['fas', config.icon]"></i>
        <span>暂无数据</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DashboardWidgetConfig, ProcessedTable, TableRow, WidgetActionId } from '../../types';
import { WIDGET_ACTIONS } from '../../types';

// Props
interface Props {
  config: DashboardWidgetConfig;
  tableData: ProcessedTable | null;
  isEditing: boolean;
  diffMap: Set<string>;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  navigate: [tableId: string];
  'row-click': [tableId: string, row: TableRow];
  'row-edit': [tableId: string, row: TableRow];
  action: [actionId: WidgetActionId, tableId: string];
  remove: [widgetId: string];
  resize: [widgetId: string, colSpan: 1 | 2];
  'config-actions': [widgetId: string];
  'drag-start': [widgetId: string];
  'drag-end': [];
  drop: [widgetId: string];
}>();

// ============================================================
// Computed
// ============================================================

/** 表格总行数 */
const totalCount = computed(() => props.tableData?.rows.length ?? 0);

/** 显示的行数 */
const rowCount = computed(() => displayRows.value.length);

/** 显示标题 - 优先使用表名，否则使用配置标题 */
const displayTitle = computed(() => {
  // 如果有表格数据，使用表名
  if (props.tableData?.name) {
    return props.tableData.name;
  }
  // 否则使用配置标题
  return props.config.title;
});

/** 显示的行数据 (移除行数限制，显示所有行) */
const displayRows = computed(() => {
  if (!props.tableData) return [];
  return props.tableData.rows;
});

/** 内容区 class */
const bodyClass = computed(() => ({
  'acu-dash-body-scrollable': true,
}));

// ============================================================
// Methods - 数据展示
// ============================================================

/**
 * 获取显示值 (优先匹配 displayColumns)
 */
function getDisplayValue(row: TableRow): string {
  const { displayColumns } = props.config;

  // 如果配置了显示列，优先匹配
  if (displayColumns.length > 0) {
    for (const colName of displayColumns) {
      const cell = row.cells.find(c => c.key.toLowerCase().includes(colName.toLowerCase()));
      if (cell && cell.value) {
        return String(cell.value);
      }
    }
  }

  // 默认返回第一个有值的单元格
  const firstCell = row.cells.find(c => c.value && String(c.value).trim());
  return firstCell ? String(firstCell.value) : `行 ${row.index + 1}`;
}

/**
 * 获取次要显示值 (用于列表模式的右侧徽章)
 * 注意：避免返回与主显示值相同的内容
 */
function getSecondaryValue(row: TableRow): string | null {
  const { displayColumns } = props.config;
  const primaryValue = getDisplayValue(row);

  // 如果配置了多个显示列，返回第二个（但不能与第一个相同）
  if (displayColumns.length > 1) {
    // 从第二个显示列开始查找
    for (let i = 1; i < displayColumns.length; i++) {
      const colName = displayColumns[i];
      const cell = row.cells.find(c => c.key.toLowerCase().includes(colName.toLowerCase()));
      if (cell && cell.value) {
        const val = String(cell.value);
        // 确保不与主显示值重复
        if (val !== primaryValue) {
          return val;
        }
      }
    }
  }

  return null;
}

/**
 * 获取标签 (紧凑模式)
 */
function getLabel(row: TableRow): string {
  return row.cells[0]?.value ? String(row.cells[0].value) : `项 ${row.index + 1}`;
}

/**
 * 获取值 (紧凑模式)
 */
function getValue(row: TableRow): string {
  return row.cells[1]?.value ? String(row.cells[1].value) : '-';
}

/**
 * 检查行是否有变更
 */
function isRowChanged(row: TableRow): boolean {
  if (!props.config.tableId) return false;
  const key = `${props.config.tableId}:${row.key}`;
  return props.diffMap.has(key);
}

// ============================================================
// Methods - 快捷按钮
// ============================================================

function getActionIcon(actionId: WidgetActionId): string {
  return WIDGET_ACTIONS[actionId]?.icon ?? 'fa-question';
}

function getActionTooltip(actionId: WidgetActionId): string {
  return WIDGET_ACTIONS[actionId]?.tooltip ?? actionId;
}

function handleAction(actionId: WidgetActionId): void {
  if (props.config.tableId) {
    emit('action', actionId, props.config.tableId);
  }
}

// ============================================================
// Methods - 导航与交互
// ============================================================

function handleNavigate(): void {
  if (props.config.tableId) {
    emit('navigate', props.config.tableId);
  }
}

function handleRowClick(row: TableRow): void {
  if (props.config.tableId) {
    emit('row-click', props.config.tableId, row);
  }
}

function handleEditRow(row: TableRow): void {
  if (props.config.tableId) {
    emit('row-edit', props.config.tableId, row);
  }
}

// ============================================================
// Methods - 编辑态交互
// ============================================================

/**
 * 开始调整大小
 */
function startResize(e: MouseEvent | TouchEvent): void {
  e.preventDefault();

  // 切换大小: 1 -> 2, 2 -> 1
  const newColSpan = props.config.colSpan === 1 ? 2 : 1;
  emit('resize', props.config.id, newColSpan);
}

/**
 * 拖拽开始
 */
function handleDragStart(e: DragEvent): void {
  if (!props.isEditing) {
    e.preventDefault();
    return;
  }
  e.dataTransfer?.setData('text/plain', props.config.id);
  emit('drag-start', props.config.id);
}

/**
 * 拖拽结束
 */
function handleDragEnd(): void {
  emit('drag-end');
}

/**
 * 接收放置
 */
function handleDrop(e: DragEvent): void {
  e.preventDefault();
  emit('drop', props.config.id);
}
</script>
