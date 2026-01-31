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

    <!-- 头部 - 点击标题跳转，点击其他区域折叠/展开 -->
    <!-- 全局状态组件在展示态隐藏表头 -->
    <div
      v-if="config.displayStyle !== 'global' || isEditing"
      class="acu-dash-title"
      :class="{ 'acu-dash-title-clickable': !isEditing }"
      style="font-size: 1.2em !important"
      @click="handleTitleAreaClick"
    >
      <span class="acu-dash-title-text" @click.stop="handleTitleTextClick">
        <i :class="['fas', displayIcon]"></i>
        {{ displayTitle }}
        <span v-if="rowCount > 0" class="acu-dash-count">{{ rowCount }}</span>
      </span>
      <!-- 按钮区（包含折叠指示器） -->
      <div class="acu-dash-actions">
        <!-- 设置按钮常驻 (updateStatus 类型不显示) -->
        <button
          v-if="config.type !== 'updateStatus'"
          class="acu-icon-btn"
          :title="getActionTooltip('settings')"
          @click.stop="handleAction('settings')"
        >
          <i class="fas fa-cog"></i>
        </button>
        <!-- 其他配置的快捷按钮 -->
        <button
          v-for="actionId in filteredActionsNoSettings"
          :key="actionId"
          class="acu-icon-btn"
          :title="getActionTooltip(actionId)"
          @click.stop="handleAction(actionId)"
        >
          <i :class="['fas', getActionIcon(actionId)]"></i>
        </button>
        <!-- 折叠指示器放在按钮区最右边 -->
        <i class="fas acu-dash-collapse-icon" :class="isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
      </div>
    </div>

    <!-- 内容区 (可滚动, 可折叠) -->
    <div v-show="!isCollapsed" class="acu-dash-body" :class="bodyClass">
      <!-- 特殊组件: 表格更新状态 -->
      <template v-if="config.type === 'updateStatus'">
        <TableStatusBoard @table-click="handleStatusTableClick" />
      </template>

      <!-- 特殊组件: 选项聚合面板 -->
      <template v-else-if="config.type === 'optionsPanel'">
        <EmbeddedOptionsPanel :tables="allTables ?? []" @navigate="handleNavigate" />
      </template>

      <!-- 全局状态组件 (无表头，沉浸式) -->
      <template v-else-if="config.displayStyle === 'global'">
        <GlobalStatusWidget :table-data="tableData" :is-editing="isEditing" />
      </template>

      <!-- 普通表格组件 -->
      <template v-else-if="tableData && displayRows.length > 0">
        <!-- ============================================================ -->
        <!-- 网格式展示 (NPC风格) - 虚拟滚动版 -->
        <!-- ============================================================ -->
        <template v-if="config.displayStyle === 'grid'">
          <!-- 虚拟滚动模式 -->
          <div v-if="useVirtual" v-bind="gridContainerProps" class="acu-dash-virtual-container">
            <div v-bind="gridWrapperProps">
              <div
                v-for="{ data: rowGroup, index: groupIndex } in virtualGridRowGroups"
                :key="groupIndex"
                class="acu-dash-npc-grid"
              >
                <div
                  v-for="row in rowGroup"
                  :key="row.key"
                  class="acu-dash-npc-item acu-dash-interactive"
                  :class="{
                    'acu-highlight-changed': isRowChanged(row),
                    'acu-highlight-ai': isRowAiChanged(row) && !searchTerm,
                  }"
                  @click.stop="handleRowClick(row)"
                >
                  <span class="acu-dash-npc-text">{{ getDisplayValue(row) }}</span>
                  <!-- 展示标签 -->
                  <span v-for="tag in getDisplayTags(row)" :key="tag.column" class="acu-dash-display-tag">
                    {{ tag.value }}
                  </span>
                  <!-- 互动标签（旧系统） -->
                  <span
                    v-for="item in getInteractiveTags(row)"
                    :key="item.tag.id"
                    class="acu-dash-interactive-tag"
                    :class="{ fixed: item.tag.isFixed }"
                    :title="getTagTooltip(item.tag)"
                    @click.stop="handleInteractiveTagClick(item.tag, row)"
                  >
                    {{ item.value }}
                  </span>
                  <!-- 互动标签（新系统 - 从全局标签库） -->
                  <span
                    v-for="newTag in displayedInteractiveTags"
                    :key="newTag.id"
                    class="acu-dash-interactive-tag acu-dash-global-tag"
                    :title="getNewTagTooltip(newTag)"
                    @click.stop="
                      handleNewInteractiveTagClick(newTag, { title: getDisplayValue(row), value: getDisplayValue(row) })
                    "
                  >
                    {{ newTag.label }}
                  </span>
                  <!-- 分类按钮 -->
                  <span
                    v-for="category in displayedCategories"
                    :key="category.id"
                    class="acu-dash-category-btn"
                    :title="`点击选择 ${getCategoryDisplayName(category)} 下的标签`"
                    @click.stop="
                      handleCategoryClick(category, { title: getDisplayValue(row), value: getDisplayValue(row) })
                    "
                  >
                    <i
                      v-if="isFontAwesome(getCategoryButtonLabel(category))"
                      :class="getCategoryButtonLabel(category)"
                    ></i>
                    <span v-else>{{ getCategoryButtonLabel(category) }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
          <!-- 普通模式（数据量小时不使用虚拟滚动） -->
          <div v-else class="acu-dash-npc-grid">
            <div
              v-for="row in displayRows"
              :key="row.key"
              class="acu-dash-npc-item acu-dash-interactive"
              :class="{
                'acu-highlight-changed': isRowChanged(row),
                'acu-highlight-ai': isRowAiChanged(row) && !searchTerm,
              }"
              @click.stop="handleRowClick(row)"
            >
              <span class="acu-dash-npc-text">{{ getDisplayValue(row) }}</span>
              <!-- 展示标签 -->
              <span v-for="tag in getDisplayTags(row)" :key="tag.column" class="acu-dash-display-tag">
                {{ tag.value }}
              </span>
              <!-- 互动标签（旧系统） -->
              <span
                v-for="item in getInteractiveTags(row)"
                :key="item.tag.id"
                class="acu-dash-interactive-tag"
                :class="{ fixed: item.tag.isFixed }"
                :title="getTagTooltip(item.tag)"
                @click.stop="handleInteractiveTagClick(item.tag, row)"
              >
                {{ item.value }}
              </span>
              <!-- 互动标签（新系统 - 从全局标签库） -->
              <span
                v-for="newTag in displayedInteractiveTags"
                :key="newTag.id"
                class="acu-dash-interactive-tag acu-dash-global-tag"
                :title="getNewTagTooltip(newTag)"
                @click.stop="
                  handleNewInteractiveTagClick(newTag, { title: getDisplayValue(row), value: getDisplayValue(row) })
                "
              >
                {{ newTag.label }}
              </span>
              <!-- 分类按钮 -->
              <span
                v-for="category in displayedCategories"
                :key="category.id"
                class="acu-dash-category-btn"
                :title="`点击选择 ${getCategoryDisplayName(category)} 下的标签`"
                @click.stop="
                  handleCategoryClick(category, { title: getDisplayValue(row), value: getDisplayValue(row) })
                "
              >
                <i v-if="isFontAwesome(getCategoryButtonLabel(category))" :class="getCategoryButtonLabel(category)"></i>
                <span v-else>{{ getCategoryButtonLabel(category) }}</span>
              </span>
            </div>
          </div>
        </template>

        <!-- ============================================================ -->
        <!-- 列表式展示 (任务风格) - 虚拟滚动版 -->
        <!-- ============================================================ -->
        <template v-else>
          <!-- 虚拟滚动模式 -->
          <div v-if="useVirtual" v-bind="listContainerProps" class="acu-dash-virtual-container">
            <div v-bind="listWrapperProps" class="acu-dash-list">
              <div
                v-for="{ data: row, index } in virtualListRows"
                :key="row.key"
                class="acu-dash-list-item acu-dash-interactive"
                :class="{
                  'acu-highlight-changed': isRowChanged(row),
                  'acu-highlight-ai': isRowAiChanged(row) && !searchTerm,
                }"
                :style="{ minHeight: LIST_ITEM_HEIGHT + 'px' }"
                @click.stop="handleRowClick(row)"
              >
                <i class="fas fa-circle" style="font-size: 6px"></i>
                <span class="acu-dash-list-text">{{ getDisplayValue(row) }}</span>
                <!-- 展示标签 -->
                <span v-for="tag in getDisplayTags(row)" :key="tag.column" class="acu-dash-display-tag">
                  {{ tag.value }}
                </span>
                <!-- 互动标签（旧系统） -->
                <span
                  v-for="item in getInteractiveTags(row)"
                  :key="item.tag.id"
                  class="acu-dash-interactive-tag"
                  :class="{ fixed: item.tag.isFixed }"
                  :title="getTagTooltip(item.tag)"
                  @click.stop="handleInteractiveTagClick(item.tag, row)"
                >
                  {{ item.value }}
                </span>
                <!-- 互动标签（新系统 - 从全局标签库） -->
                <span
                  v-for="newTag in displayedInteractiveTags"
                  :key="newTag.id"
                  class="acu-dash-interactive-tag acu-dash-global-tag"
                  :title="getNewTagTooltip(newTag)"
                  @click.stop="
                    handleNewInteractiveTagClick(newTag, { title: getDisplayValue(row), value: getDisplayValue(row) })
                  "
                >
                  {{ newTag.label }}
                </span>
                <!-- 分类按钮 -->
                <span
                  v-for="category in displayedCategories"
                  :key="category.id"
                  class="acu-dash-interactive-tag acu-dash-global-tag"
                  :title="`点击选择 ${getCategoryDisplayName(category)} 下的标签`"
                  @click.stop="
                    handleCategoryClick(category, { title: getDisplayValue(row), value: getDisplayValue(row) })
                  "
                >
                  <i
                    v-if="isFontAwesome(getCategoryButtonLabel(category))"
                    :class="getCategoryButtonLabel(category)"
                  ></i>
                  <span v-else>{{ getCategoryButtonLabel(category) }}</span>
                </span>
              </div>
            </div>
          </div>
          <!-- 普通模式（数据量小时不使用虚拟滚动） -->
          <div v-else class="acu-dash-list">
            <div
              v-for="row in displayRows"
              :key="row.key"
              class="acu-dash-list-item acu-dash-interactive"
              :class="{
                'acu-highlight-changed': isRowChanged(row),
                'acu-highlight-ai': isRowAiChanged(row) && !searchTerm,
              }"
              @click.stop="handleRowClick(row)"
            >
              <i class="fas fa-circle" style="font-size: 6px"></i>
              <span class="acu-dash-list-text">{{ getDisplayValue(row) }}</span>
              <!-- 展示标签 -->
              <span v-for="tag in getDisplayTags(row)" :key="tag.column" class="acu-dash-display-tag">
                {{ tag.value }}
              </span>
              <!-- 互动标签（旧系统） -->
              <span
                v-for="item in getInteractiveTags(row)"
                :key="item.tag.id"
                class="acu-dash-interactive-tag"
                :class="{ fixed: item.tag.isFixed }"
                :title="getTagTooltip(item.tag)"
                @click.stop="handleInteractiveTagClick(item.tag, row)"
              >
                {{ item.value }}
              </span>
              <!-- 互动标签（新系统 - 从全局标签库） -->
              <span
                v-for="newTag in displayedInteractiveTags"
                :key="newTag.id"
                class="acu-dash-interactive-tag acu-dash-global-tag"
                :title="getNewTagTooltip(newTag)"
                @click.stop="
                  handleNewInteractiveTagClick(newTag, { title: getDisplayValue(row), value: getDisplayValue(row) })
                "
              >
                {{ newTag.label }}
              </span>
              <!-- 分类按钮 -->
              <span
                v-for="category in displayedCategories"
                :key="category.id"
                class="acu-dash-interactive-tag acu-dash-global-tag"
                :title="`点击选择 ${getCategoryDisplayName(category)} 下的标签`"
                @click.stop="
                  handleCategoryClick(category, { title: getDisplayValue(row), value: getDisplayValue(row) })
                "
              >
                <i v-if="isFontAwesome(getCategoryButtonLabel(category))" :class="getCategoryButtonLabel(category)"></i>
                <span v-else>{{ getCategoryButtonLabel(category) }}</span>
              </span>
            </div>
          </div>
        </template>
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
import { computed, onMounted, ref, watch } from 'vue';
import { useCoreActions } from '../../composables/useCoreActions';
import { useDivinationAction } from '../../composables/useDivinationAction';
import { LIST_ITEM_HEIGHT, useGridVirtualScroll, useListVirtualScroll } from '../../composables/useVirtualScroll';
import { useTagLibraryStore } from '../../stores/useTagLibraryStore';
import { getSmartTabIcon, useUIStore } from '../../stores/useUIStore';
import type {
  DashboardWidgetConfig,
  InteractiveTag,
  ProcessedTable,
  TableRow,
  TagCategory,
  TagDefinition,
  WidgetActionId,
} from '../../types';
import { WIDGET_ACTIONS } from '../../types';
import EmbeddedOptionsPanel from './EmbeddedOptionsPanel.vue';
import GlobalStatusWidget from './GlobalStatusWidget.vue';
import TableStatusBoard from './TableStatusBoard.vue';

const uiStore = useUIStore();
const tagLibraryStore = useTagLibraryStore();
const { setInput } = useCoreActions();
const { performDivination } = useDivinationAction();

// ============================================================
// 生命周期
// ============================================================

onMounted(async () => {
  // 加载全局标签库
  await tagLibraryStore.loadLibrary();
});

// Props
interface Props {
  config: DashboardWidgetConfig;
  tableData: ProcessedTable | null;
  isEditing: boolean;
  diffMap: Set<string>;
  /** AI 变更集合 */
  aiDiffMap?: Set<string>;
  /** 搜索关键词 */
  searchTerm?: string;
  /** 所有表格数据 (用于特殊组件如选项面板) */
  allTables?: ProcessedTable[];
}

const props = defineProps<Props>();

// ============================================================
// 状态
// ============================================================

/** 组件是否折叠 */
const isCollapsed = ref(false);

/** 记录进入编辑模式前的折叠状态 */
let previousCollapsedState = false;

// 监听编辑模式变化：进入时自动收起，退出时恢复
watch(
  () => props.isEditing,
  editing => {
    if (editing) {
      // 进入编辑模式：记录当前状态，然后收起
      previousCollapsedState = isCollapsed.value;
      isCollapsed.value = true;
    } else {
      // 退出编辑模式：恢复之前的状态
      isCollapsed.value = previousCollapsedState;
    }
  },
  { immediate: true },
);

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
    // 移除 'fas ' 前缀，因为模板中已经加了 ['fas', icon]
    return smartIcon.replace('fas ', '');
  }

  return 'fa-table';
});

// ============================================================
// AI 高亮相关
// ============================================================

/** 判断行是否有 AI 更新 */
function isRowAiChanged(row: TableRow): boolean {
  if (!props.tableData || !props.aiDiffMap) return false;
  const tableName = props.tableData.name;

  // 检查 rowKey 格式: tableName-row-rowIndex
  const rowKey = `${tableName}-row-${row.index}`;
  if (props.aiDiffMap.has(rowKey)) return true;

  // 检查 cellKey 格式: tableName-rowIndex-colIndex
  // 当 AI 只修改某行的单个单元格时，只会添加 cellKey
  for (let colIdx = 0; colIdx < row.cells.length; colIdx++) {
    const cellKey = `${tableName}-${row.index}-${colIdx}`;
    if (props.aiDiffMap.has(cellKey)) return true;
  }

  return false;
}

/** 组件是否有 AI 更新（用于标题高亮） */
const hasAiUpdate = computed(() => {
  if (!props.tableData || !props.aiDiffMap) return false;
  return props.tableData.rows.some(row => isRowAiChanged(row));
});

// ============================================================
// 搜索相关
// ============================================================

/** 判断行是否匹配搜索（全局搜索：所有单元格内容） */
function isRowMatchSearch(row: TableRow): boolean {
  if (!props.searchTerm) return false;
  const searchLower = props.searchTerm.toLowerCase().trim();
  if (!searchLower) return false;
  return row.cells.some(cell => String(cell.value).toLowerCase().includes(searchLower));
}

// ============================================================
// 过滤+排序后的行数据
// ============================================================

/**
 * 显示的行数据（过滤+排序）
 * - 搜索模式: 过滤不匹配的行
 * - 非搜索模式: AI 更新的行排前面
 */
const displayRows = computed(() => {
  if (!props.tableData) return [];

  let rows = [...props.tableData.rows];

  // 搜索模式：过滤不匹配的行
  if (props.searchTerm) {
    rows = rows.filter(row => isRowMatchSearch(row));
  }

  // 排序：AI 更新的排前面
  return rows.sort((a, b) => {
    const aAi = isRowAiChanged(a);
    const bAi = isRowAiChanged(b);
    if (aAi !== bAi) return bAi ? 1 : -1;
    return a.index - b.index;
  });
});

// ============================================================
// 虚拟滚动
// ============================================================

/** 虚拟滚动阈值：超过此数量启用虚拟滚动 */
const VIRTUAL_SCROLL_THRESHOLD = 30;

/** 是否启用虚拟滚动 */
const useVirtual = computed(() => displayRows.value.length > VIRTUAL_SCROLL_THRESHOLD);

// 列表模式虚拟滚动
const {
  list: virtualListRows,
  containerProps: listContainerProps,
  wrapperProps: listWrapperProps,
} = useListVirtualScroll(displayRows);

// 网格模式虚拟滚动（数据按行分组）
const {
  list: virtualGridRowGroups,
  containerProps: gridContainerProps,
  wrapperProps: gridWrapperProps,
} = useGridVirtualScroll(displayRows);

/** 内容区 class */
const bodyClass = computed(() => ({
  'acu-dash-body-scrollable': true,
}));

// ============================================================
// 新标签系统 - 从全局标签库读取已配置的标签
// ============================================================

/**
 * 获取当前组件配置的已展示标签（从全局标签库）
 * 这些是固定显示的标签，不依赖于行数据
 */
const displayedInteractiveTags = computed<InteractiveTag[]>(() => {
  const config = props.config;
  const displayedIds = config?.widgetTagConfig?.displayedTagIds || [];
  return displayedIds
    .map(id => tagLibraryStore.getTagById(id))
    .filter((tag): tag is InteractiveTag => tag !== undefined);
});

/**
 * 获取当前组件配置的已展示分类（从全局标签库）
 * 点击分类会弹出该分类下的标签选择弹窗
 */
const displayedCategories = computed<TagCategory[]>(() => {
  const config = props.config;
  const displayedIds = config?.widgetTagConfig?.displayedCategoryIds || [];
  return displayedIds
    .map(id => tagLibraryStore.getCategoryById(id))
    .filter((cat): cat is TagCategory => cat !== undefined);
});

/**
 * 获取分类的显示名称（只取最后一级）
 */
function getCategoryDisplayName(category: TagCategory): string {
  const parts = category.path.split('/');
  return parts[parts.length - 1];
}

/**
 * 获取分类按钮的显示标签
 * 有 emoji 就只显示 emoji，没有才显示文字名称
 */
function getCategoryButtonLabel(category: TagCategory): string {
  // 如果有 icon（emoji），只显示 emoji
  if (category.icon) {
    return category.icon;
  }
  // 没有 emoji，显示分类名称（只取最后一级）
  return getCategoryDisplayName(category);
}

function isFontAwesome(icon: string): boolean {
  return icon.startsWith('fa') || icon.includes(' fa-');
}

/** 过滤掉 goToTable 按钮，因为点击顶栏已可跳转 */
const filteredActions = computed(() => {
  return props.config.actions.filter(actionId => actionId !== 'goToTable');
});

/** 过滤掉 goToTable 和 settings 按钮（settings 已常驻显示） */
const filteredActionsNoSettings = computed(() => {
  return props.config.actions.filter(actionId => actionId !== 'goToTable' && actionId !== 'settings');
});

// ============================================================
// Methods - 数据展示
// ============================================================

/**
 * 获取显示值 (优先使用 titleColumn，其次匹配 displayColumns)
 */
function getDisplayValue(row: TableRow): string {
  const { titleColumn, displayColumns } = props.config;

  // 优先使用配置的 titleColumn
  if (titleColumn) {
    const cell = row.cells.find(
      c => c.key.toLowerCase() === titleColumn.toLowerCase() || c.key.toLowerCase().includes(titleColumn.toLowerCase()),
    );
    if (cell && cell.value) {
      return String(cell.value);
    }
  }

  // 其次使用 displayColumns
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
 * 检查行是否有变更
 */
function isRowChanged(row: TableRow): boolean {
  if (!props.tableData) return false;
  const tableName = props.tableData.name;

  // 检查 rowKey 格式: tableName-row-rowIndex
  const rowKey = `${tableName}-row-${row.index}`;
  if (props.diffMap.has(rowKey)) return true;

  // 检查 cellKey 格式: tableName-rowIndex-colIndex
  for (let colIdx = 0; colIdx < row.cells.length; colIdx++) {
    const cellKey = `${tableName}-${row.index}-${colIdx}`;
    if (props.diffMap.has(cellKey)) return true;
  }

  return false;
}

/**
 * 获取展示标签 (从 displayTagColumns 配置的列提取值)
 */
function getDisplayTags(row: TableRow): Array<{ column: string; value: string }> {
  const displayTagColumns = props.config.displayTagColumns;
  if (!displayTagColumns || displayTagColumns.length === 0) {
    return [];
  }

  const tags: Array<{ column: string; value: string }> = [];

  for (const colName of displayTagColumns) {
    // 查找匹配的单元格
    const cell = row.cells.find(
      c => c.key.toLowerCase() === colName.toLowerCase() || c.key.toLowerCase().includes(colName.toLowerCase()),
    );
    if (cell && cell.value) {
      const value = String(cell.value).trim();
      if (value) {
        tags.push({ column: colName, value });
      }
    }
  }

  return tags;
}

/** 分隔符正则：逗号、分号、竖线、斜杠（中英文） */
const TAG_SEPARATORS = /[,，；;|/]/;

/**
 * 获取互动标签 (从 interactiveTagConfig 配置的列提取值，使用分隔符解析)
 * 返回匹配到的标签定义
 */
function getInteractiveTags(row: TableRow): Array<{ tag: TagDefinition; value: string; matchedDefinition: boolean }> {
  const tagConfig = props.config.interactiveTagConfig;
  if (!tagConfig || tagConfig.sourceColumns.length === 0) {
    return [];
  }

  const result: Array<{ tag: TagDefinition; value: string; matchedDefinition: boolean }> = [];
  const tagDefinitions = tagConfig.tagDefinitions || [];

  // 从配置的来源列中提取值
  for (const colName of tagConfig.sourceColumns) {
    const cell = row.cells.find(
      c => c.key.toLowerCase() === colName.toLowerCase() || c.key.toLowerCase().includes(colName.toLowerCase()),
    );
    if (cell && cell.value) {
      const rawValue = String(cell.value).trim();
      if (!rawValue) continue;

      // 使用分隔符拆分值
      const values = rawValue
        .split(TAG_SEPARATORS)
        .map(v => v.trim())
        .filter(Boolean);

      for (const value of values) {
        // 尝试匹配标签定义（不区分大小写）
        const matchedDef = tagDefinitions.find(def => def.label.toLowerCase() === value.toLowerCase());
        if (matchedDef) {
          // 匹配到定义，使用定义中的模板
          result.push({ tag: matchedDef, value, matchedDefinition: true });
        } else {
          // 未匹配到定义，创建一个默认的标签（使用默认模板）
          const defaultTag: TagDefinition = {
            id: `dynamic_${value}`,
            label: value,
            promptTemplate: '{{value}}', // 默认只发送标签值本身
            isFixed: false,
          };
          result.push({ tag: defaultTag, value, matchedDefinition: false });
        }
      }
    }
  }

  return result;
}

/**
 * 获取标签的 tooltip（解析后的提示词预览）
 */
function getTagTooltip(tag: TagDefinition): string {
  if (!tag.promptTemplate) return tag.label;

  // 简单预览，替换通配符占位符
  let preview = tag.promptTemplate;
  preview = preview.replace(/\{\{value\}\}/gi, `[${tag.label}]`);
  preview = preview.replace(/\{\{rowTitle\}\}/gi, '[行标题]');
  preview = preview.replace(/\{\{playerName\}\}/gi, '[主角名]');

  return preview.length > 50 ? preview.substring(0, 50) + '...' : preview;
}

/**
 * 处理互动标签点击（旧系统 - TagDefinition）
 * @param tag 标签定义
 * @param row 当前行数据
 */
function handleInteractiveTagClick(tag: TagDefinition, row: TableRow): void {
  // 解析模板通配符
  let prompt = tag.promptTemplate;

  // {{value}} - 标签本身的值
  prompt = prompt.replace(/\{\{value\}\}/gi, tag.label);

  // {{rowTitle}} - 当前行标题
  const rowTitle = getDisplayValue(row);
  prompt = prompt.replace(/\{\{rowTitle\}\}/gi, rowTitle);

  // {{playerName}} - 主角名（从酒馆获取）
  const playerName = getPlayerName();
  prompt = prompt.replace(/\{\{playerName\}\}/gi, playerName);

  // {{tableName}} - 表格名称
  const tableName = props.tableData?.name || props.config.title || '';
  prompt = prompt.replace(/\{\{tableName\}\}/gi, tableName);

  // 追加到输入框
  if (prompt) {
    setInput(prompt);
  }
}

/**
 * 解析标签的提示词模板通配符
 * @param tag 互动标签
 * @param rowData 当前行数据（可选）
 * @returns 解析后的提示词
 */
function resolveTagPrompt(tag: InteractiveTag, rowData?: { title: string; value: string }): string {
  let prompt = tag.promptTemplate;

  // {{value}} - 标签本身的值
  prompt = prompt.replace(/\{\{value\}\}/gi, tag.label);

  // {{rowTitle}} - 当前行标题（如果有）
  if (rowData?.title) {
    prompt = prompt.replace(/\{\{rowTitle\}\}/gi, rowData.title);
  } else {
    prompt = prompt.replace(/\{\{rowTitle\}\}/gi, '');
  }

  // {{playerName}} - 主角名（使用酒馆宏 {{user}}，让酒馆处理）
  const playerName = getPlayerName();
  prompt = prompt.replace(/\{\{playerName\}\}/gi, playerName);

  // {{tableName}} - 表格名称
  const tableName = props.tableData?.name || props.config.title || '';
  prompt = prompt.replace(/\{\{tableName\}\}/gi, tableName);

  return prompt.trim();
}

/**
 * 处理新标签系统的标签点击（InteractiveTag）
 * @param tag 互动标签
 * @param rowData 当前行数据（可选）
 */
function handleNewInteractiveTagClick(tag: InteractiveTag, rowData?: { title: string; value: string }): void {
  const resolvedPrompt = resolveTagPrompt(tag, rowData);

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
      widgetId: props.config.id,
    });
  } else if (resolvedPrompt) {
    // 直接追加到输入框
    setInput(resolvedPrompt);
  }
}

/**
 * 处理分类按钮点击
 * @param category 分类对象
 * @param rowData 当前行数据（用于后续解析通配符）
 */
function handleCategoryClick(category: TagCategory, rowData: { title: string; value: string }): void {
  uiStore.openCategorySelectDialog({
    categoryId: category.id,
    rowContext: rowData,
    widgetId: props.config.id,
  });
}

/**
 * 处理分类弹窗中的标签选择
 * @param tag 选中的标签
 * @param rowContext 行上下文
 */
function handleCategoryTagSelect(tag: InteractiveTag, rowContext: { title: string; value: string }): void {
  handleNewInteractiveTagClick(tag, rowContext);
}

/**
 * 获取标签的 tooltip（新标签系统）
 */
function getNewTagTooltip(tag: InteractiveTag): string {
  if (!tag.promptTemplate) return tag.label;

  // 简单预览，替换通配符占位符
  let preview = tag.promptTemplate;
  preview = preview.replace(/\{\{value\}\}/gi, `[${tag.label}]`);
  preview = preview.replace(/\{\{rowTitle\}\}/gi, '[行标题]');
  preview = preview.replace(/\{\{playerName\}\}/gi, '[主角名]');
  preview = preview.replace(/\{\{tableName\}\}/gi, '[表格名]');

  return preview.length > 50 ? preview.substring(0, 50) + '...' : preview;
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
// Methods - 快捷按钮
// ============================================================

/**
 * 打开快捷按钮配置弹窗
 */
function handleConfigActions(): void {
  uiStore.openWidgetActionsDialog({
    widgetId: props.config.id,
    currentActions: props.config.actions,
  });
}

function getActionIcon(actionId: WidgetActionId): string {
  return WIDGET_ACTIONS[actionId]?.icon ?? 'fa-question';
}

function getActionTooltip(actionId: WidgetActionId): string {
  return WIDGET_ACTIONS[actionId]?.tooltip ?? actionId;
}

function handleAction(actionId: WidgetActionId): void {
  // 设置按钮：打开组件设置弹窗
  if (actionId === 'settings') {
    // headers 本身就是 string[]
    const tableHeaders = props.tableData?.headers ?? [];
    uiStore.openWidgetSettingsDialog({
      widgetId: props.config.id,
      widgetConfig: props.config,
      tableHeaders,
    });
    return;
  }

  // 原生编辑器按钮：打开数据库原生编辑界面
  if (actionId === 'nativeEdit') {
    // 对于有 tableId 的组件打开指定表格，否则打开主界面
    openNativeEditor(props.config.tableId);
    return;
  }

  // 抽签按钮：触发抽签流程
  if (actionId === 'divination') {
    performDivination();
    return;
  }

  // 其他按钮：向上传递事件
  // 即使没有 tableId (如 updateStatus 组件)，也允许触发动作
  // App.vue 中有些动作不需要 tableId (如 manualUpdate)
  emit('action', actionId, props.config.tableId || '');
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
      uiStore.isCollapsed = true;
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
// Methods - 导航与交互
// ============================================================

function handleNavigate(): void {
  if (props.config.tableId) {
    emit('navigate', props.config.tableId);
  }
}

/**
 * 处理表格状态看板中的表格点击
 * @param tableId 表格 ID
 */
function handleStatusTableClick(tableId: string): void {
  emit('navigate', tableId);
}

/**
 * 顶栏标题文字点击 - 跳转到表格
 */
function handleTitleTextClick(): void {
  if (!props.isEditing && props.config.tableId) {
    emit('navigate', props.config.tableId);
  }
}

/**
 * 顶栏区域点击（非标题文字）- 折叠/展开内容区
 */
function handleTitleAreaClick(): void {
  if (!props.isEditing) {
    isCollapsed.value = !isCollapsed.value;
  }
}

/**
 * 行点击事件 - 直接进入编辑模式
 * (已移除独立编辑按钮，点击行区域即编辑)
 */
function handleRowClick(row: TableRow): void {
  if (props.config.tableId) {
    emit('row-edit', props.config.tableId, row);
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
