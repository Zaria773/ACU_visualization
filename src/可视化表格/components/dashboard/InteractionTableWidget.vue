<template>
  <div
    class="acu-dash-widget"
    :class="{
      'acu-dash-widget-wide': config.colSpan === 2,
      'acu-dash-widget-editing': isEditing,
      'acu-highlight-ai-table': hasAiUpdate && !searchTerm,
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
      <button class="acu-widget-config" title="配置快捷按钮" @click.stop="handleConfigActions">
        <i class="fas fa-plus"></i>
      </button>
      <div class="acu-widget-resize" title="拖动改变大小" @mousedown.stop="startResize" @touchstart.stop="startResize">
        <i class="fas fa-expand-alt"></i>
      </div>
    </template>

    <!-- 头部 -->
    <div class="acu-dash-title" :class="{ 'acu-dash-title-clickable': !isEditing }" @click="handleTitleAreaClick">
      <span class="acu-dash-title-text" @click.stop="handleTitleTextClick">
        <i :class="['fas', displayIcon]"></i>
        {{ displayTitle }}
        <span v-if="rowCount > 0" class="acu-dash-count">{{ rowCount }}</span>
      </span>
      <!-- 按钮区 -->
      <div v-if="!isEditing" class="acu-dash-actions">
        <!-- 全部存入按钮 -->
        <button class="acu-icon-btn" title="将所有交互存入标签库" @click.stop="handleImportAll">
          <i class="fas fa-save"></i>
        </button>

        <button class="acu-icon-btn" :title="getActionTooltip('settings')" @click.stop="handleAction('settings')">
          <i class="fas fa-cog"></i>
        </button>

        <!-- 自定义快捷按钮 -->
        <button
          v-for="actionId in filteredActions"
          :key="actionId"
          class="acu-icon-btn"
          :class="{ 'acu-dual-icon': hasSecondaryIcon(actionId) }"
          :title="getActionTooltip(actionId)"
          @click.stop="handleAction(actionId)"
        >
          <i :class="['fas', getActionIcon(actionId)]"></i>
          <i v-if="hasSecondaryIcon(actionId)" class="fas icon-secondary" :class="getSecondaryIcon(actionId)"></i>
        </button>

        <i class="fas acu-dash-collapse-icon" :class="isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
      </div>
    </div>

    <!-- 内容区 -->
    <div v-show="!isCollapsed" class="acu-dash-body acu-dash-body-scrollable">
      <div v-if="displayRows.length > 0" class="acu-interaction-list">
        <div
          v-for="row in displayRows"
          :key="row.key"
          class="acu-interaction-item"
          :class="{
            'acu-highlight-changed': isRowChanged(row),
            'acu-highlight-ai': isRowAiChanged(row) && !searchTerm,
          }"
          @click="handleRowClick(row)"
        >
          <!-- 第一行：交互对象 + 按钮 -->
          <div class="acu-interaction-header">
            <span class="acu-interaction-target">{{ getRowValue(row, '交互对象') }}</span>

            <div class="acu-interaction-actions">
              <!-- 追加到输入框 -->
              <button class="acu-icon-btn" title="追加到输入框" @click.stop="handleAppendToInput(row)">
                <i class="fas fa-reply"></i>
              </button>
              <!-- 单条存入 -->
              <button
                class="acu-icon-btn"
                :class="{ 'acu-btn-success': isRowImported(row) }"
                :title="isRowImported(row) ? '已存入' : '存入标签库'"
                :disabled="isRowImported(row)"
                @click.stop="handleImportRow(row)"
              >
                <i class="fas" :class="isRowImported(row) ? 'fa-check' : 'fa-download'"></i>
              </button>
            </div>
          </div>

          <!-- 第二行：Badge -->
          <div class="acu-interaction-meta">
            <span class="acu-badge acu-badge-primary">{{ getRowValue(row, '交互名称') }}</span>
            <span class="acu-badge acu-badge-secondary">{{ getRowValue(row, '交互类型') }}</span>
            <span v-if="getRowValue(row, '交互简介')" class="acu-badge acu-badge-secondary">{{
              getRowValue(row, '交互简介')
            }}</span>
          </div>

          <!-- 第三行：内容 -->
          <div class="acu-interaction-text">
            {{ getRowValue(row, '交互内容') }}
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="acu-dash-empty">
        <i :class="['fas', config.icon]"></i>
        <span>暂无交互数据</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useCoreActions } from '../../composables/useCoreActions';
import { useInteractionImporter } from '../../composables/useInteractionImporter';
import { useToast } from '../../composables/useToast';
import { getSmartTabIcon, useUIStore } from '../../stores/useUIStore';
import type { DashboardWidgetConfig, ProcessedTable, TableRow, WidgetActionId } from '../../types';
import { WIDGET_ACTIONS } from '../../types';

const { setInput } = useCoreActions();
const { importFromRow, importAll } = useInteractionImporter();
const { success, error } = useToast();
const uiStore = useUIStore();

// Props
interface Props {
  config: DashboardWidgetConfig;
  tableData: ProcessedTable | null;
  isEditing: boolean;
  diffMap: Set<string>;
  aiDiffMap?: Set<string>;
  searchTerm?: string;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  navigate: [tableId: string];
  'row-edit': [tableId: string, row: TableRow];
  action: [actionId: WidgetActionId, tableId: string];
  remove: [widgetId: string];
  resize: [widgetId: string, colSpan: 1 | 2];
  'drag-start': [widgetId: string];
  'drag-end': [];
  drop: [widgetId: string];
}>();

// State
const isCollapsed = ref(false);
const importedRowKeys = ref<Set<string>>(new Set()); // 记录已导入的行 Key

// Computed
const totalCount = computed(() => props.tableData?.rows.length ?? 0);
const rowCount = computed(() => displayRows.value.length);
const displayTitle = computed(() => props.tableData?.name || props.config.title);

const filteredActions = computed(() => {
  return (props.config.actions || []).filter(actionId => actionId !== 'settings' && actionId !== 'goToTable');
});

/** 显示图标 - 智能匹配 */
const displayIcon = computed(() => {
  // 1. 如果有配置的图标且不是默认表图标，优先使用配置
  if (props.config.icon && props.config.icon !== 'fa-table') {
    return props.config.icon;
  }

  // 2. 尝试使用智能匹配
  const titleToMatch = props.tableData?.name || props.config.title;
  if (titleToMatch) {
    const smartIcon = getSmartTabIcon(titleToMatch);
    // 移除 'fas ' 前缀
    return smartIcon.replace('fas ', '');
  }

  return 'fa-table';
});

const hasAiUpdate = computed(() => {
  if (!props.tableData || !props.aiDiffMap) return false;
  return props.tableData.rows.some(row => isRowAiChanged(row));
});

const displayRows = computed(() => {
  if (!props.tableData) return [];
  let rows = [...props.tableData.rows];

  if (props.searchTerm) {
    const searchLower = props.searchTerm.toLowerCase().trim();
    rows = rows.filter(row => row.cells.some(cell => String(cell.value).toLowerCase().includes(searchLower)));
  }

  return rows;
});

// Methods
function getActionTooltip(actionId: WidgetActionId): string {
  return WIDGET_ACTIONS[actionId]?.tooltip || '';
}

function getActionIcon(actionId: WidgetActionId): string {
  return WIDGET_ACTIONS[actionId]?.icon ?? 'fa-question';
}

function hasSecondaryIcon(actionId: WidgetActionId): boolean {
  return !!WIDGET_ACTIONS[actionId]?.secondaryIcon;
}

function getSecondaryIcon(actionId: WidgetActionId): string {
  return WIDGET_ACTIONS[actionId]?.secondaryIcon ?? '';
}

function getRowValue(row: TableRow, colName: string): string {
  const cell = row.cells.find(c => c.key === colName);
  return cell ? String(cell.value) : '';
}

function isRowChanged(row: TableRow): boolean {
  if (!props.tableData) return false;
  const rowKey = `${props.tableData.name}-row-${row.index}`;
  return props.diffMap.has(rowKey);
}

function isRowAiChanged(row: TableRow): boolean {
  if (!props.tableData || !props.aiDiffMap) return false;
  const rowKey = `${props.tableData.name}-row-${row.index}`;
  return props.aiDiffMap.has(rowKey);
}

function isRowImported(row: TableRow): boolean {
  return importedRowKeys.value.has(row.key);
}

// Handlers
function handleTitleAreaClick(e: MouseEvent) {
  if (props.isEditing) return;
  // 如果点击的是按钮区域，不处理（由按钮自己的 click 处理）
  if ((e.target as HTMLElement).closest('.acu-dash-actions')) return;
  isCollapsed.value = !isCollapsed.value;
}

function handleTitleTextClick() {
  if (props.isEditing) return;
  if (props.config.tableId) {
    emit('navigate', props.config.tableId);
  }
}

function handleRowClick(row: TableRow) {
  if (props.isEditing) return;
  if (props.config.tableId) {
    emit('row-edit', props.config.tableId, row);
  }
}

function handleAction(actionId: WidgetActionId) {
  if (actionId === 'settings') {
    const tableHeaders = props.tableData?.headers ?? [];
    uiStore.openWidgetSettingsDialog({
      widgetId: props.config.id,
      widgetConfig: props.config,
      tableHeaders,
    });
    return;
  }

  if (props.config.tableId) {
    emit('action', actionId, props.config.tableId);
  }
}

function handleDragStart() {
  emit('drag-start', props.config.id);
}

function handleDragEnd() {
  emit('drag-end');
}

function handleDrop() {
  emit('drop', props.config.id);
}

function handleConfigActions() {
  uiStore.openWidgetActionsDialog({
    widgetId: props.config.id,
    currentActions: props.config.actions,
  });
}

function startResize(e: MouseEvent | TouchEvent) {
  // 阻止默认行为（防止触发拖拽）
  e.preventDefault();
  // 简单的 resize 逻辑，实际可能需要更复杂的拖拽处理
  // 这里简化为点击切换 1/2 列
  const newColSpan = props.config.colSpan === 1 ? 2 : 1;
  emit('resize', props.config.id, newColSpan);
}

// Interaction Handlers
async function handleAppendToInput(row: TableRow) {
  const content = getRowValue(row, '交互内容');
  if (content) {
    setInput(content); // setInput 默认就是 append
    success('已追加到输入框');
  }
}

function handleImportRow(row: TableRow) {
  // 构造 rowData: [null, target, label, category, content, description]
  // 注意：这里需要按顺序构造，或者修改 importFromRow 接受对象
  // 为了复用 useInteractionImporter，我们按顺序构造数组
  // 假设列顺序固定为: [null, "交互对象", "交互名称", "交互类型", "交互内容", "交互简介"]
  // 但实际上 row.cells 是无序的，我们需要按 key 查找

  const target = getRowValue(row, '交互对象');
  const label = getRowValue(row, '交互名称');
  const category = getRowValue(row, '交互类型');
  const content = getRowValue(row, '交互内容');
  const description = getRowValue(row, '交互简介'); // 尝试获取简介

  const rowData = [null, target, label, category, content, description] as (string | number)[];

  if (importFromRow(rowData)) {
    importedRowKeys.value.add(row.key);
    success('已存入标签库');
  } else {
    error('存入失败，数据不完整');
  }
}

function handleImportAll() {
  if (!props.tableData) return;

  const allRowsData = props.tableData.rows.map(row => {
    const target = getRowValue(row, '交互对象');
    const label = getRowValue(row, '交互名称');
    const category = getRowValue(row, '交互类型');
    const content = getRowValue(row, '交互内容');
    const description = getRowValue(row, '交互简介');
    return [null, target, label, category, content, description] as (string | number)[];
  });

  const count = importAll(allRowsData);
  if (count > 0) {
    // 标记所有行为已导入
    props.tableData.rows.forEach(row => importedRowKeys.value.add(row.key));
  }
}

// 监听 AI 更新，自动导入
watch(
  () => props.aiDiffMap,
  newAiDiff => {
    if (!newAiDiff || !props.tableData) return;

    // 检查是否有当前表格的 AI 更新
    const hasUpdate = props.tableData.rows.some(row => {
      const rowKey = `${props.tableData!.name}-row-${row.index}`;
      return newAiDiff.has(rowKey);
    });

    if (hasUpdate) {
      // 触发自动导入
      const allRowsData = props.tableData.rows.map(row => {
        const target = getRowValue(row, '交互对象');
        const label = getRowValue(row, '交互名称');
        const category = getRowValue(row, '交互类型');
        const content = getRowValue(row, '交互内容');
        const description = getRowValue(row, '交互简介');
        return [null, target, label, category, content, description] as (string | number)[];
      });

      // 传入 true 表示这是自动导入，受开关控制
      const count = importAll(allRowsData, true);
      if (count > 0) {
        props.tableData.rows.forEach(row => importedRowKeys.value.add(row.key));
      }
    }
  },
  { deep: true },
);

/** 记录进入编辑模式前的折叠状态 */
let previousCollapsedState = false;

// Watchers
watch(
  () => props.isEditing,
  val => {
    if (val) {
      previousCollapsedState = isCollapsed.value;
      isCollapsed.value = true;
    } else {
      isCollapsed.value = previousCollapsedState;
    }
  },
  { immediate: true },
);
</script>

<style lang="scss">
// 样式已迁移至 src/可视化表格/styles/components/interaction-widget.scss
// 遵循 ACU_DEV_GUIDE.md 规则：Vue <style scoped> 完全失效
</style>
