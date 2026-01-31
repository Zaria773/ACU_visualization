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
        <span v-if="tableCount > 0" class="acu-dash-count">{{ tableCount }}</span>
      </span>
      <div v-show="!isEditing" class="acu-dash-actions">
        <!-- 一键展开/折叠 -->
        <button class="acu-icon-btn" :title="allExpanded ? '全部折叠' : '全部展开'" @click.stop="toggleAllExpanded">
          <i class="fas" :class="allExpanded ? 'fa-compress-alt' : 'fa-expand-alt'"></i>
        </button>
        <!-- 设置按钮 -->
        <button class="acu-icon-btn" title="抽词设置" @click.stop="handleSettingsClick">
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
      <div v-if="tableCount === 0" class="acu-dash-empty">
        <i class="fas fa-dice"></i>
        <span>未检测到随机表</span>
        <span class="hint">表名需包含"随机"、"Random"等关键词</span>
      </div>

      <!-- 表分组 (V2: 按表名分组) -->
      <div
        v-for="table in tables"
        :key="table.id"
        class="rwp-column-group"
        :class="{ collapsed: !expandedTables[table.id] }"
      >
        <!-- 表头 -->
        <div class="rwp-group-header" @click="toggleTable(table.id)">
          <div class="rwp-header-left">
            <i class="fas" :class="expandedTables[table.id] ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
            <span class="rwp-column-name">{{ table.name }}</span>
            <span class="rwp-word-count">({{ table.words.length }})</span>
          </div>
          <div class="rwp-header-right" @click.stop>
            <!-- Limit 设置 Badge -->
            <div class="rwp-limit-wrapper">
              <div
                class="acu-badge-pill acu-badge-interactive"
                :class="activeLimitPopup === table.id ? 'acu-badge-primary' : 'acu-badge-secondary'"
                title="点击设置抽取数量限制"
                @click.stop="toggleLimitPopup(table.id)"
              >
                <i class="fas fa-filter" style="margin-right: 4px; font-size: 11px"></i>
                <span>{{ getTableLimitText(table.id) }}</span>
              </div>

              <!-- Limit 设置 Popover -->
              <div v-if="activeLimitPopup === table.id" class="rwp-limit-popover" @click.stop>
                <div class="popover-header">抽取数量限制 (0=不限)</div>
                <div class="popover-body">
                  <div class="limit-control">
                    <input
                      type="range"
                      class="acu-range-input"
                      min="0"
                      max="10"
                      step="1"
                      :value="getTableLimit(table.id)"
                      @input="e => setTableLimit(table.id, +(e.target as HTMLInputElement).value)"
                    />
                    <span class="limit-value">{{ getTableLimit(table.id) || '不限' }}</span>
                  </div>
                  <div class="popover-actions">
                    <button class="acu-tool-btn small" @click="setTableLimit(table.id, 0)">重置为不限</button>
                  </div>
                </div>
              </div>
            </div>

            <label class="acu-switch small">
              <input type="checkbox" :checked="isTableEnabled(table.id)" @change.stop="toggleTableEnabled(table.id)" />
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <!-- 词列表 -->
        <div v-show="expandedTables[table.id]" class="rwp-group-content">
          <span
            v-for="(word, idx) in table.words"
            :key="idx"
            class="rwp-word-badge"
            :class="{ disabled: !isTableEnabled(table.id) }"
          >
            {{ word }}
          </span>
          <span v-if="table.words.length === 0" class="rwp-empty-hint"> 暂无词条 </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { detectWordPoolTables, getTableDisplayName, getWordPoolTableData } from '../../composables/useWordPool';
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
  config: () => ({}) as DashboardWidgetConfig,
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

/** 编辑模式前的折叠状态 */
const wasCollapsedBeforeEditing = ref(false);

/** 展开的表（本地状态，按表ID） */
const expandedTables = reactive<Record<string, boolean>>({});

/** 当前激活的 Limit 设置弹窗（表ID） */
const activeLimitPopup = ref<string | null>(null);

/** 表数据缓存 (V2: 按表分组) */
interface TableData {
  /** 表ID（不含 sheet_ 前缀） */
  id: string;
  /** 表显示名称 */
  name: string;
  /** 该表所有词（每个单元格为一个词，不拆分） */
  words: string[];
}
const tables = ref<TableData[]>([]);

// ============================================================
// 计算属性
// ============================================================

/** 表数量 */
const tableCount = computed(() => tables.value.length);

/** 过滤后的快捷按钮 */
const filteredActions = computed(() => {
  const actions = props.config?.actions || [];
  // 过滤掉 settings (已有专用按钮)
  return actions.filter(id => id !== 'settings');
});

/** 是否全部展开 */
const allExpanded = computed(() => {
  if (tables.value.length === 0) return false;
  return tables.value.every(t => expandedTables[t.id]);
});

// ============================================================
// 生命周期
// ============================================================

onMounted(() => {
  loadTableData();
  window.addEventListener('click', closePopups);
});

onUnmounted(() => {
  window.removeEventListener('click', closePopups);
});

// 监听表格配置变化，刷新数据
watch(
  () => divinationStore.config.tablePoolConfig,
  () => {
    // 配置变化时无需重新加载数据，只需触发视图更新
  },
  { deep: true },
);

// 监听编辑模式变化，进入编辑模式时自动折叠，退出时恢复
watch(
  () => props.isEditing,
  newVal => {
    if (newVal) {
      wasCollapsedBeforeEditing.value = isCollapsed.value;
      isCollapsed.value = true;
    } else {
      isCollapsed.value = wasCollapsedBeforeEditing.value;
    }
  },
);

// 监听数据变化，自动刷新词库
watch(
  () => dataStore.tables,
  () => {
    console.log('[RandomWordPoolWidget] 检测到数据变更，刷新词库...');
    loadTableData();
  },
  { deep: false }, // tables 引用变化即触发，无需 deep
);

// ============================================================
// 方法
// ============================================================

/**
 * 加载表数据 (V2: 按表分组，单元格不拆分)
 */
function loadTableData(): void {
  const detectedTables = detectWordPoolTables();
  const result: TableData[] = [];

  for (const tableId of detectedTables) {
    const rows = getWordPoolTableData(tableId);
    if (rows.length === 0) continue;

    // 取最后一行（最新生成的数据 / 每表唯一行）
    const latestRow = rows[rows.length - 1];
    const words: string[] = [];

    // V2: 每个单元格是一个完整的词（不再按逗号拆分）
    for (const cellValue of Object.values(latestRow)) {
      if (cellValue && typeof cellValue === 'string') {
        const trimmed = cellValue.trim();
        if (trimmed) {
          words.push(trimmed);
        }
      }
    }

    result.push({
      id: tableId,
      name: getTableDisplayName(tableId),
      words,
    });
  }

  tables.value = result;

  // 初始化展开状态（默认全部折叠）
  for (const t of tables.value) {
    if (expandedTables[t.id] === undefined) {
      expandedTables[t.id] = false;
    }
  }

  console.info(`[RandomWordPoolWidget] 加载了 ${tables.value.length} 个表数据`);
}

/**
 * 检查表是否启用
 */
function isTableEnabled(tableId: string): boolean {
  const config = divinationStore.config.tablePoolConfig[tableId];
  // 默认启用
  return config ? config.enabled : true;
}

/**
 * 切换表启用状态
 */
function toggleTableEnabled(tableId: string): void {
  const currentConfig = divinationStore.config.tablePoolConfig[tableId] || {
    enabled: true,
    limit: 0,
  };

  divinationStore.config.tablePoolConfig[tableId] = {
    ...currentConfig,
    enabled: !currentConfig.enabled,
  };
}

/**
 * 获取表的 Limit 值
 */
function getTableLimit(tableId: string): number {
  return divinationStore.config.tablePoolConfig[tableId]?.limit || 0;
}

/**
 * 获取表的 Limit 显示文本
 */
function getTableLimitText(tableId: string): string {
  const limit = getTableLimit(tableId);
  return limit > 0 ? `限 ${limit}` : '不限';
}

/**
 * 设置表的 Limit
 */
function setTableLimit(tableId: string, limit: number): void {
  const currentConfig = divinationStore.config.tablePoolConfig[tableId] || {
    enabled: true,
    limit: 0,
  };
  divinationStore.config.tablePoolConfig[tableId] = {
    ...currentConfig,
    limit,
  };
}

/**
 * 切换 Limit 弹窗显示
 */
function toggleLimitPopup(tableId: string): void {
  if (activeLimitPopup.value === tableId) {
    activeLimitPopup.value = null;
  } else {
    activeLimitPopup.value = tableId;
  }
}

/**
 * 关闭所有弹窗
 */
function closePopups(): void {
  activeLimitPopup.value = null;
}

/**
 * 切换表展开状态
 */
function toggleTable(tableId: string): void {
  expandedTables[tableId] = !expandedTables[tableId];
}

/**
 * 一键展开/折叠所有表
 */
function toggleAllExpanded(): void {
  const newState = !allExpanded.value;
  for (const t of tables.value) {
    expandedTables[t.id] = newState;
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
