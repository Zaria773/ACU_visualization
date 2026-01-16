<template>
  <div v-if="visible" class="acu-modal-container" @click.self="handleClose">
    <div class="acu-modal acu-widget-manager-modal">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">
          <i class="fas fa-th-large"></i>
          管理看板
        </span>
        <button class="acu-close-pill" @click.stop="handleClose">完成</button>
      </div>

      <!-- 内容 - PC 左右布局 / 移动端上下布局 -->
      <div class="acu-modal-body acu-widget-manager-body">
        <!-- 已添加区 -->
        <div class="acu-widget-section acu-widget-added">
          <div class="acu-widget-section-header">
            <span>已添加</span>
            <span class="acu-widget-count">{{ addedItems.length }}</span>
          </div>
          <div ref="addedListRef" class="acu-widget-section-list" @dragover.prevent @drop="handleDrop">
            <div
              v-for="(item, index) in addedItems"
              :key="item.id"
              class="acu-widget-item acu-widget-item-added"
              :class="{ 'acu-widget-dragging': draggingId === item.id }"
              :draggable="true"
              @dragstart="handleDragStart($event, item.id)"
              @dragend="handleDragEnd"
              @dragover.prevent="handleDragOver($event, index)"
              @click.stop="handleRemove(item)"
            >
              <!-- 拖动手柄 (6点图标) -->
              <div class="acu-widget-drag-handle" @mousedown.stop @touchstart.stop>
                <i class="fas fa-grip-vertical"></i>
              </div>
              <!-- 上下移动按钮 -->
              <div class="acu-widget-move-btns">
                <button :disabled="index === 0" title="上移" @click.stop="moveUp(index)">
                  <i class="fas fa-chevron-up"></i>
                </button>
                <button :disabled="index === addedItems.length - 1" title="下移" @click.stop="moveDown(index)">
                  <i class="fas fa-chevron-down"></i>
                </button>
              </div>
              <!-- 图标和名称 -->
              <i :class="['fas', item.icon]"></i>
              <span class="acu-widget-name">{{ item.name }}</span>
              <!-- 特殊组件徽章 -->
              <span v-if="item.isSpecial" class="acu-widget-badge-special">特殊</span>
              <!-- 移除提示 -->
              <span class="acu-widget-action-hint acu-widget-hint-remove">
                <i class="fas fa-minus-circle"></i>
              </span>
            </div>
            <div v-if="addedItems.length === 0" class="acu-widget-empty">
              <i class="fas fa-inbox"></i>
              <span>暂无已添加的看板</span>
            </div>
          </div>
        </div>

        <!-- 未添加区 -->
        <div class="acu-widget-section acu-widget-available">
          <div class="acu-widget-section-header">
            <span>未添加</span>
            <span class="acu-widget-count">{{ availableItems.length }}</span>
          </div>
          <div class="acu-widget-section-list">
            <div
              v-for="item in availableItems"
              :key="item.id"
              class="acu-widget-item acu-widget-item-available"
              @click.stop="handleAdd(item)"
            >
              <i :class="['fas', item.icon]"></i>
              <span class="acu-widget-name">{{ item.name }}</span>
              <!-- 特殊组件徽章 -->
              <span v-if="item.isSpecial" class="acu-widget-badge-special">特殊</span>
              <!-- 行数提示（普通表格） -->
              <span v-else-if="item.rowCount !== undefined" class="acu-widget-row-count"> {{ item.rowCount }} 行 </span>
              <!-- 添加提示 -->
              <span class="acu-widget-action-hint acu-widget-hint-add">
                <i class="fas fa-plus-circle"></i>
              </span>
            </div>
            <div v-if="availableItems.length === 0" class="acu-widget-empty">
              <i class="fas fa-check-circle"></i>
              <span>所有看板都已添加</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * DashboardWidgetManagerDialog - 看板管理弹窗
 *
 * 功能:
 * - 合并了原有的"添加看板"和"排序"弹窗
 * - 左右两个区域：已添加 / 未添加
 * - 已添加区支持拖拽排序和按钮排序
 * - 点击项目切换添加/移除
 * - PC左右布局，移动端上下布局
 * - 特殊组件显示 (特殊) 徽章
 */

import { computed, ref } from 'vue';
import { useDashboardStore } from '../../stores/useDashboardStore';
import type { ProcessedTable } from '../../types';
import { TABLE_KEYWORD_RULES } from '../../types';

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  visible: boolean;
  tables: ProcessedTable[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  close: [];
}>();

// ============================================================
// Store
// ============================================================

const dashboardStore = useDashboardStore();

// ============================================================
// State
// ============================================================

/** 拖拽中的项目 ID */
const draggingId = ref<string | null>(null);

/** 拖拽目标索引 */
const dropTargetIndex = ref<number | null>(null);

/** 已添加列表 DOM 引用 */
const addedListRef = ref<HTMLElement | null>(null);

// ============================================================
// Types
// ============================================================

interface WidgetItem {
  id: string;
  name: string;
  icon: string;
  isSpecial: boolean;
  specialType?: 'updateStatus' | 'optionsPanel';
  rowCount?: number;
  widgetId?: string;
}

// ============================================================
// Computed
// ============================================================

/** 特殊组件定义 */
const specialWidgets: WidgetItem[] = [
  {
    id: 'special_updateStatus',
    name: '表格更新状态',
    icon: 'fa-sync-alt',
    isSpecial: true,
    specialType: 'updateStatus',
  },
  {
    id: 'special_optionsPanel',
    name: '选项聚合面板',
    icon: 'fa-list-check',
    isSpecial: true,
    specialType: 'optionsPanel',
  },
];

/** 已添加的项目列表 */
const addedItems = computed<WidgetItem[]>(() => {
  return dashboardStore.enabledWidgets.map(widget => {
    // 检查是否是特殊组件
    if (widget.type === 'updateStatus' || widget.type === 'optionsPanel') {
      const special = specialWidgets.find(s => s.specialType === widget.type);
      return {
        id: widget.id,
        name: special?.name || widget.title,
        icon: widget.icon || special?.icon || 'fa-cog',
        isSpecial: true,
        specialType: widget.type as 'updateStatus' | 'optionsPanel',
        widgetId: widget.id,
      };
    }

    // 普通表格组件
    const table = props.tables.find(t => t.id === widget.tableId);
    return {
      id: widget.id,
      name: table?.name || widget.title || widget.tableId || '未知表格',
      icon: widget.icon || 'fa-table',
      isSpecial: false,
      rowCount: table?.rows.length,
      widgetId: widget.id,
    };
  });
});

/** 未添加的项目列表 */
const availableItems = computed<WidgetItem[]>(() => {
  const items: WidgetItem[] = [];

  // 1. 添加未添加的特殊组件
  for (const special of specialWidgets) {
    if (!dashboardStore.hasSpecialWidget(special.specialType!)) {
      items.push(special);
    }
  }

  // 2. 添加未添加的表格
  for (const table of props.tables) {
    if (!dashboardStore.hasWidget(table.id)) {
      items.push({
        id: `table_${table.id}`,
        name: table.name,
        icon: getTableIcon(table.name, table.id),
        isSpecial: false,
        rowCount: table.rows.length,
      });
    }
  }

  return items;
});

// ============================================================
// Methods - 辅助
// ============================================================

/**
 * 获取表格图标
 */
function getTableIcon(tableName: string, tableId: string): string {
  const searchText = (tableName + tableId).toLowerCase();
  for (const [key, keywords] of Object.entries(TABLE_KEYWORD_RULES)) {
    if (keywords.some(k => searchText.includes(k.toLowerCase()))) {
      const iconMap: Record<string, string> = {
        player: 'fa-user',
        npc: 'fa-users',
        task: 'fa-tasks',
        item: 'fa-box',
        summary: 'fa-book',
        option: 'fa-list-check',
      };
      return iconMap[key] || 'fa-table';
    }
  }
  return 'fa-table';
}

// ============================================================
// Methods - 添加/移除
// ============================================================

/**
 * 添加项目
 */
function handleAdd(item: WidgetItem): void {
  if (item.isSpecial && item.specialType) {
    dashboardStore.addSpecialWidget(item.specialType);
  } else {
    // 从 id 中提取 tableId (格式: table_xxx)
    const tableId = item.id.replace(/^table_/, '');
    const table = props.tables.find(t => t.id === tableId);
    dashboardStore.addWidget(tableId, table?.name);
  }
}

/**
 * 移除项目
 */
function handleRemove(item: WidgetItem): void {
  if (item.widgetId) {
    dashboardStore.removeWidget(item.widgetId);
  }
}

// ============================================================
// Methods - 排序
// ============================================================

/**
 * 上移
 */
function moveUp(index: number): void {
  if (index <= 0) return;
  const item = addedItems.value[index];
  if (item.widgetId) {
    dashboardStore.moveWidget(item.widgetId, index - 1);
  }
}

/**
 * 下移
 */
function moveDown(index: number): void {
  if (index >= addedItems.value.length - 1) return;
  const item = addedItems.value[index];
  if (item.widgetId) {
    dashboardStore.moveWidget(item.widgetId, index + 1);
  }
}

/**
 * 拖拽开始
 */
function handleDragStart(e: DragEvent, id: string): void {
  draggingId.value = id;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
}

/**
 * 拖拽结束
 */
function handleDragEnd(): void {
  draggingId.value = null;
  dropTargetIndex.value = null;
}

/**
 * 拖拽悬停
 */
function handleDragOver(e: DragEvent, index: number): void {
  e.preventDefault();
  dropTargetIndex.value = index;
}

/**
 * 放置
 */
function handleDrop(e: DragEvent): void {
  e.preventDefault();
  if (!draggingId.value || dropTargetIndex.value === null) return;

  const draggedItem = addedItems.value.find(item => item.id === draggingId.value);
  if (draggedItem?.widgetId) {
    dashboardStore.moveWidget(draggedItem.widgetId, dropTargetIndex.value);
  }

  draggingId.value = null;
  dropTargetIndex.value = null;
}

// ============================================================
// Methods - 关闭
// ============================================================

function handleClose(): void {
  emit('update:visible', false);
  emit('close');
}
</script>
