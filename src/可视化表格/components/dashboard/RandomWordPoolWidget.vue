<!-- eslint-disable @typescript-eslint/ban-ts-comment -->
<!-- @ts-nocheck -->
<template>
  <div
    class="acu-dash-widget rwp-widget"
    :class="{
      'acu-dash-widget-wide': colSpan === 2,
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
      <button class="acu-widget-remove" title="移除组件" @click.stop="emit('remove', widgetId)">
        <i class="fas fa-times"></i>
      </button>
      <button class="acu-widget-config" title="配置快捷按钮" @click.stop="handleConfigActions">
        <i class="fas fa-plus"></i>
      </button>
      <div
        class="acu-widget-resize"
        title="点击切换单/双栏"
        @mousedown.stop="startResize"
        @touchstart.stop="startResize"
      >
        <i class="fas fa-expand-alt"></i>
      </div>
    </template>

    <!-- 头部 -->
    <div class="acu-dash-title rwp-header" @click="handleTitleClick">
      <span class="acu-dash-title-text">
        <i class="fas fa-dice"></i>
        随机词表
        <span v-if="columnCount > 0" class="acu-dash-count">{{ columnCount }}</span>
      </span>
      <div v-show="!isEditing" class="acu-dash-actions">
        <!-- 一键展开/折叠 -->
        <button
          class="acu-icon-btn"
          :title="allExpanded ? '全部折叠' : '全部展开'"
          @click.stop="toggleAllExpanded"
        >
          <i class="fas" :class="allExpanded ? 'fa-compress-alt' : 'fa-expand-alt'"></i>
        </button>
        <!-- 设置按钮 -->
        <button
          class="acu-icon-btn"
          title="抽词设置"
          @click.stop="handleSettingsClick"
        >
          <i class="fas fa-cog"></i>
        </button>
        <!-- 自定义快捷按钮 -->
        <button
          v-for="actionId in filteredActions"
          :key="actionId"
          class="acu-icon-btn"
          :title="getActionTooltip(actionId)"
          @click.stop="handleAction(actionId)"
        >
          <i :class="['fas', getActionIcon(actionId)]"></i>
        </button>
        <!-- 折叠指示器 -->
        <i class="fas acu-dash-collapse-icon" :class="isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
      </div>
    </div>

    <!-- 内容区 -->
    <div v-show="!isCollapsed" class="acu-dash-body rwp-body">
      <!-- 空状态 -->
      <div v-if="columnCount === 0" class="acu-dash-empty">
        <i class="fas fa-dice"></i>
        <span>未检测到随机表</span>
        <span class="hint">表名需包含"随机"、"Random"等关键词</span>
      </div>

      <!-- 列分组 -->
      <div
        v-for="column in columns"
        :key="column.name"
        class="rwp-column-group"
        :class="{ collapsed: !expandedColumns[column.name] }"
      >
        <!-- 列头 -->
        <div class="rwp-group-header" @click="toggleColumn(column.name)">
          <div class="rwp-header-left">
            <i class="fas" :class="expandedColumns[column.name] ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
            <span class="rwp-column-name">{{ column.name }}</span>
            <span class="rwp-word-count">({{ column.words.length }})</span>
          </div>
          <div class="rwp-header-right" @click.stop>
            <!-- Limit 设置 Badge -->
            <div class="rwp-limit-wrapper">
              <div
                class="acu-badge-pill acu-badge-interactive"
                :class="activeLimitPopup === column.name ? 'acu-badge-primary' : 'acu-badge-secondary'"
                title="点击设置抽取数量限制"
                @click.stop="toggleLimitPopup(column.name)"
              >
                <i class="fas fa-filter" style="margin-right: 4px; font-size: 11px;"></i>
                <span>{{ getColumnLimitText(column.name) }}</span>
              </div>

              <!-- Limit 设置 Popover -->
              <div
                v-if="activeLimitPopup === column.name"
                class="rwp-limit-popover"
                @click.stop
              >
                <div class="popover-header">抽取数量限制 (0=不限)</div>
                <div class="popover-body">
                  <div class="limit-control">
                    <input
                      type="range"
                      class="acu-range-input"
                      min="0"
                      max="10"
                      step="1"
                      :value="getColumnLimit(column.name)"
                      @input="(e) => setColumnLimit(column.name, +(e.target as HTMLInputElement).value)"
                    />
                    <span class="limit-value">{{ getColumnLimit(column.name) || '不限' }}</span>
                  </div>
                  <div class="popover-actions">
                    <button
                      class="acu-tool-btn small"
                      @click="setColumnLimit(column.name, 0)"
                    >
                      重置为不限
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <label class="acu-switch small">
              <input
                type="checkbox"
                :checked="isColumnEnabled(column.name)"
                @change.stop="toggleColumnEnabled(column.name)"
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <!-- 词列表 -->
        <div v-show="expandedColumns[column.name]" class="rwp-group-content">
          <span
            v-for="word in column.words"
            :key="word"
            class="rwp-word-badge"
            :class="{ disabled: !isColumnEnabled(column.name) }"
          >
            {{ word }}
          </span>
          <span v-if="column.words.length === 0" class="rwp-empty-hint">
            暂无词条
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import {
  detectWordPoolTables,
  getWordPoolTableData,
} from '../../composables/useWordPool';
import { useDataStore } from '../../stores/useDataStore';
import { useDivinationStore } from '../../stores/useDivinationStore';
import { useUIStore } from '../../stores/useUIStore';
import type { DashboardWidgetConfig, WidgetActionId } from '../../types';
import { WIDGET_ACTIONS } from '../../types';

// Props
interface Props {
  isEditing: boolean;
  widgetId?: string;
  colSpan?: 1 | 2;
  config?: DashboardWidgetConfig;
}

const props = withDefaults(defineProps<Props>(), {
  widgetId: 'random-word-pool',
  colSpan: 1,
  config: () => ({} as DashboardWidgetConfig),
});

// Emits
const emit = defineEmits<{
  remove: [widgetId: string];
  resize: [widgetId: string, colSpan: 1 | 2];
  action: [actionId: WidgetActionId, tableId: string];
  'drag-start': [widgetId: string];
  'drag-end': [];
  drop: [widgetId: string];
}>();

// Stores
const divinationStore = useDivinationStore();
const uiStore = useUIStore();
const dataStore = useDataStore();

// ============================================================
// 状态
// ============================================================

/** 组件是否折叠 */
const isCollapsed = ref(false);

/** 展开的列（本地状态） */
const expandedColumns = reactive<Record<string, boolean>>({});

/** 当前激活的 Limit 设置弹窗（列名） */
const activeLimitPopup = ref<string | null>(null);

/** 列数据缓存 */
interface ColumnData {
  name: string;
  words: string[];
}
const columns = ref<ColumnData[]>([]);

// ============================================================
// 计算属性
// ============================================================

/** 列数量 */
const columnCount = computed(() => columns.value.length);

/** 过滤后的快捷按钮 */
const filteredActions = computed(() => {
  const actions = props.config?.actions || [];
  // 过滤掉 settings (已有专用按钮)
  return actions.filter(id => id !== 'settings');
});

/** 是否全部展开 */
const allExpanded = computed(() => {
  if (columns.value.length === 0) return false;
  return columns.value.every(col => expandedColumns[col.name]);
});

// ============================================================
// 生命周期
// ============================================================

onMounted(() => {
  loadColumnData();
  window.addEventListener('click', closePopups);
});

onUnmounted(() => {
  window.removeEventListener('click', closePopups);
});

// 监听表格配置变化，刷新数据
watch(() => divinationStore.config.tableColumnConfig, () => {
  // 配置变化时无需重新加载数据，只需触发视图更新
}, { deep: true });

// 监听编辑模式变化，进入编辑模式时自动折叠
watch(() => props.isEditing, (newVal) => {
  if (newVal) {
    isCollapsed.value = true;
  }
});

// 监听数据变化，自动刷新词库
watch(
  () => dataStore.tables,
  () => {
    console.log('[RandomWordPoolWidget] 检测到数据变更，刷新词库...');
    loadColumnData();
  },
  { deep: false } // tables 引用变化即触发，无需 deep
);

// ============================================================
// 方法
// ============================================================

/**
 * 加载列数据
 */
function loadColumnData(): void {
  const tables = detectWordPoolTables();
  const columnsMap = new Map<string, Set<string>>();

  for (const tableName of tables) {
    const rows = getWordPoolTableData(tableName);
    if (rows.length === 0) continue;

    // 取最后一行（最新生成的数据）
    const latestRow = rows[rows.length - 1];

    for (const [columnName, cellValue] of Object.entries(latestRow)) {
      if (!cellValue || typeof cellValue !== 'string') continue;

      if (!columnsMap.has(columnName)) {
        columnsMap.set(columnName, new Set());
      }

      // 按分隔符拆分词
      const words = cellValue
        .split(/[,，·]/)
        .map(w => w.trim())
        .filter(Boolean);

      words.forEach(word => columnsMap.get(columnName)!.add(word));
    }
  }

  // 转换为数组格式
  columns.value = Array.from(columnsMap.entries()).map(([name, wordSet]) => ({
    name,
    words: Array.from(wordSet),
  }));

  // 初始化展开状态（默认全部展开）
  for (const col of columns.value) {
    if (expandedColumns[col.name] === undefined) {
      expandedColumns[col.name] = true;
    }
  }

  console.info(`[RandomWordPoolWidget] 加载了 ${columns.value.length} 列数据`);
}

/**
 * 检查列是否启用
 */
function isColumnEnabled(columnName: string): boolean {
  const config = divinationStore.config.tableColumnConfig[columnName];
  // 默认启用
  return config ? config.enabled : true;
}

/**
 * 切换列启用状态
 */
function toggleColumnEnabled(columnName: string): void {
  const currentConfig = divinationStore.config.tableColumnConfig[columnName] || {
    enabled: true,
    limit: 0,
  };

  divinationStore.config.tableColumnConfig[columnName] = {
    ...currentConfig,
    enabled: !currentConfig.enabled,
  };
}

/**
 * 获取列的 Limit 值
 */
function getColumnLimit(columnName: string): number {
  return divinationStore.config.tableColumnConfig[columnName]?.limit || 0;
}

/**
 * 获取列的 Limit 显示文本
 */
function getColumnLimitText(columnName: string): string {
  const limit = getColumnLimit(columnName);
  return limit > 0 ? `限 ${limit}` : '不限';
}

/**
 * 设置列的 Limit
 */
function setColumnLimit(columnName: string, limit: number): void {
  const currentConfig = divinationStore.config.tableColumnConfig[columnName] || {
    enabled: true,
    limit: 0,
  };
  divinationStore.config.tableColumnConfig[columnName] = {
    ...currentConfig,
    limit,
  };
}

/**
 * 切换 Limit 弹窗显示
 */
function toggleLimitPopup(columnName: string): void {
  if (activeLimitPopup.value === columnName) {
    activeLimitPopup.value = null;
  } else {
    activeLimitPopup.value = columnName;
  }
}

/**
 * 关闭所有弹窗
 */
function closePopups(): void {
  activeLimitPopup.value = null;
}

/**
 * 切换列展开状态
 */
function toggleColumn(columnName: string): void {
  expandedColumns[columnName] = !expandedColumns[columnName];
}

/**
 * 一键展开/折叠所有列
 */
function toggleAllExpanded(): void {
  const newState = !allExpanded.value;
  for (const col of columns.value) {
    expandedColumns[col.name] = newState;
  }
}

/**
 * 点击标题区域 - 折叠/展开内容
 */
function handleTitleClick(): void {
  if (!props.isEditing) {
    isCollapsed.value = !isCollapsed.value;
  }
}

/**
 * 设置按钮点击 - 跳转到抽签设置
 */
function handleSettingsClick(): void {
  uiStore.openDivinationSettingsDialog();
}

function getActionIcon(actionId: WidgetActionId): string {
  return WIDGET_ACTIONS[actionId]?.icon ?? 'fa-question';
}

function getActionTooltip(actionId: WidgetActionId): string {
  return WIDGET_ACTIONS[actionId]?.tooltip ?? actionId;
}

function handleAction(actionId: WidgetActionId): void {
  // 随机词表没有单一 tableId，传空串
  emit('action', actionId, '');
}

/**
 * 打开快捷按钮配置 (全局弹窗)
 */
function handleConfigActions(): void {
  uiStore.openWidgetActionsDialog({
    widgetId: props.config.id || props.widgetId,
    currentActions: props.config.actions || [],
  });
}

/**
 * 开始调整大小
 */
function startResize(e: MouseEvent | TouchEvent): void {
  // 阻止默认行为（防止触发拖拽）
  e.preventDefault();
  const newColSpan = props.colSpan === 1 ? 2 : 1;
  emit('resize', props.widgetId, newColSpan);
}

/**
 * 拖拽开始
 */
function handleDragStart(e: DragEvent): void {
  if (!props.isEditing) {
    e.preventDefault();
    return;
  }
  e.dataTransfer?.setData('text/plain', props.widgetId);
  emit('drag-start', props.widgetId);
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
  emit('drop', props.widgetId);
}
</script>
