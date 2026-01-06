<template>
  <div
    ref="cardRef"
    class="acu-data-card"
    :class="[
      rowHighlightClass,
      {
        'acu-editing-lock': editingCell !== null,
        'acu-style-list': viewMode === 'list',
        'acu-style-card': viewMode === 'card',
        'acu-swiping': isSwiping,
      },
    ]"
    @contextmenu.prevent="handleContextMenu"
    @scroll="handleScroll"
  >
    <!-- 横向布局：顶部下拉新增提示（必须在最前面，与原版 prepend 一致） -->
    <!-- 注意：使用 v-show 替代 v-if 保持 DOM 存在，配合 watchEffect 直接操作样式 -->
    <div
      ref="pullTopRef"
      v-show="layout === 'horizontal' && isMobile && gestureType === 'insert'"
      class="acu-pull-overlay acu-pull-top"
    >
      <div class="acu-pull-icon">
        <i class="fa-solid fa-plus"></i>
        <span class="acu-pull-text">新增一行</span>
      </div>
    </div>

    <!-- 卡片头部（可选显示索引和标题） -->
    <div v-if="showHeader" class="acu-card-header">
      <span v-if="showIndex" class="acu-card-index">#{{ data.index + 1 }}</span>
      <!-- 标题编辑模式 -->
      <InlineEditor
        v-if="titleCell && editingCell === titleColIndex"
        class="acu-title-editor"
        :value="titleCell.value"
        @save="handleCellSave(titleColIndex, $event)"
        @cancel="editingCell = null"
      />
      <!-- 标题显示模式 -->
      <span v-else-if="titleCell" class="acu-editable-title" @click="handleTitleClick">
        {{ titleCell.value || '未命名' }}
      </span>
    </div>

    <!-- 卡片内容区 - Card 布局 -->
    <template v-if="viewMode === 'card'">
      <!-- Card 单元格区域 -->
      <div class="acu-card-main-grid">
        <div
          v-for="cell in gridCells"
          :key="cell.colIndex"
          class="acu-grid-item"
          :class="getCellChangeClass(cell.colIndex)"
          @click="handleCellClick(cell.colIndex)"
        >
          <label class="acu-grid-label">{{ cell.key }}</label>
          <div class="acu-grid-value">
            <InlineEditor
              v-if="editingCell === cell.colIndex"
              :value="cell.value"
              @save="handleCellSave(cell.colIndex, $event)"
              @cancel="editingCell = null"
            />
            <Badge v-else :value="cell.value" />
          </div>
        </div>
      </div>

      <!-- Full-Width 单元格区域（长文本） -->
      <div v-if="fullWidthCells.length > 0" class="acu-card-full-area">
        <div
          v-for="cell in fullWidthCells"
          :key="cell.colIndex"
          class="acu-full-item"
          :class="getCellChangeClass(cell.colIndex)"
          @click="handleCellClick(cell.colIndex)"
        >
          <label class="acu-full-label">{{ cell.key }}</label>
          <div class="acu-full-value">
            <InlineEditor
              v-if="editingCell === cell.colIndex"
              :value="cell.value"
              :max-height="300"
              @save="handleCellSave(cell.colIndex, $event)"
              @cancel="editingCell = null"
            />
            <span v-else>{{ cell.value || '-' }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 卡片内容区 - List 布局 -->
    <template v-else>
      <div class="acu-card-body">
        <div
          v-for="cell in displayCells"
          :key="cell.colIndex"
          class="acu-card-row"
          :class="getCellChangeClass(cell.colIndex)"
          @click="handleCellClick(cell.colIndex)"
        >
          <label class="acu-card-label">{{ cell.key }}:</label>
          <div class="acu-card-value">
            <InlineEditor
              v-if="editingCell === cell.colIndex"
              :value="cell.value"
              @save="handleCellSave(cell.colIndex, $event)"
              @cancel="editingCell = null"
            />
            <Badge v-else :value="cell.value" />
          </div>
        </div>
      </div>
    </template>

    <!-- 横向布局：底部上划删除提示（在内容区域之后，与原版 append 一致） -->
    <!-- 注意：使用 v-show 替代 v-if 保持 DOM 存在，配合 watchEffect 直接操作样式 -->
    <div
      ref="pullBottomRef"
      v-show="layout === 'horizontal' && isMobile && gestureType === 'delete'"
      class="acu-pull-overlay acu-pull-bottom"
      :class="{ 'acu-pull-restore': isDeleting }"
    >
      <div class="acu-pull-icon">
        <i :class="isDeleting ? 'fa-solid fa-undo' : 'fa-solid fa-trash'"></i>
        <span class="acu-pull-text">{{ isDeleting ? '撤销删除' : '删除本行' }}</span>
      </div>
    </div>

    <!-- 待删除印章 (圆形印章样式，与原代码 .acu-badge-pending 保持一致) -->
    <div v-if="isDeleting" class="acu-delete-stamp">待删除</div>

    <!-- 竖向布局：左右滑动反馈（与原版 .acu-swipe-overlay 一致） -->
    <!-- 注意：使用 v-show 替代 v-if 保持 DOM 存在，配合 watchEffect 直接操作样式 -->
    <template v-if="layout === 'vertical' && isMobile">
      <!-- 左侧右滑删除提示 -->
      <div
        ref="swipeLeftRef"
        v-show="gestureType === 'delete'"
        class="acu-swipe-overlay acu-swipe-left"
        :class="{ 'acu-swipe-restore': isDeleting }"
      >
        <i :class="isDeleting ? 'fa-solid fa-undo' : 'fa-solid fa-trash'"></i>
      </div>
      <!-- 右侧左滑新增提示 -->
      <div ref="swipeRightRef" v-show="gestureType === 'insert'" class="acu-swipe-overlay acu-swipe-right">
        <i class="fa-solid fa-plus"></i>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * DataCard 数据卡片组件 ⭐核心组件
 *
 * 用于展示单条数据记录，支持：
 * - 网格/列表两种视图模式
 * - 点击单元格触发原地编辑
 * - 变更高亮显示
 * - 待删除状态显示（印章样式）
 * - 移动端滑动手势（下拉新增、上划删除）- 使用 VueUse useSwipe
 * - 右键菜单
 * - 防误触（选词时不触发手势）
 */

import { computed, ref, watch, watchEffect } from 'vue';
import { useCardGestures, useIsMobile, useSelectionGuardEnhanced } from '../composables';
import { useDataStore } from '../stores/useDataStore';
import type { TableCell, TableRow } from '../types';
import Badge from './Badge.vue';
import InlineEditor from './InlineEditor.vue';

interface Props {
  /** 行数据 */
  data: TableRow;
  /** 所属表格 ID */
  tableId: string;
  /** 表格名称 (用于生成 key) */
  tableName: string;
  /** 是否有变更 */
  isChanged?: boolean;
  /** 布局方向：horizontal-横向布局, vertical-纵向布局 */
  layout?: 'horizontal' | 'vertical';
  /** 视图模式：card-卡片视图, list-列表视图 */
  viewMode?: 'list' | 'card';
  /** 是否显示索引 */
  showIndex?: boolean;
  /** 是否显示头部 */
  showHeader?: boolean;
  /** 标题列索引（如果设置，该列将显示在头部） */
  titleColIndex?: number;
}

const props = withDefaults(defineProps<Props>(), {
  isChanged: false,
  layout: 'vertical',
  viewMode: 'card',
  showIndex: true,
  showHeader: true,
  titleColIndex: 1, // Skip first null column (original code uses 1, not 0)
});

const emit = defineEmits<{
  /** 单元格点击事件 */
  cellClick: [rowIndex: number, colIndex: number];
  /** 插入行事件 */
  insertRow: [];
  /** 切换删除状态事件 */
  toggleDelete: [];
  /** 右键菜单事件 */
  contextMenu: [event: MouseEvent, rowIndex: number];
}>();

// ============================================================
// 状态
// ============================================================

const cardRef = ref<HTMLElement>();
const editingCell = ref<number | null>(null);
const dataStore = useDataStore();

// 手势指示器 DOM refs（跨 iframe 生产构建修复需要）
const pullTopRef = ref<HTMLElement>();
const pullBottomRef = ref<HTMLElement>();
const swipeLeftRef = ref<HTMLElement>();
const swipeRightRef = ref<HTMLElement>();

// 移动端检测
const { isMobile } = useIsMobile();

// 边缘提示状态
const showEdgeHint = ref(false);
const edgeHintTimer = ref<ReturnType<typeof setTimeout> | null>(null);

// ============================================================
// 计算属性
// ============================================================

/** 行唯一键 */
const rowKey = computed(() => `${props.tableName}-row-${props.data.index}`);

/** 是否待删除 */
const isDeleting = computed(() => dataStore.pendingDeletes.has(rowKey.value));

/** 标题单元格 */
const titleCell = computed(() => {
  if (props.titleColIndex >= 0 && props.data.cells.length > props.titleColIndex) {
    return props.data.cells[props.titleColIndex];
  }
  return null;
});

/** 显示用单元格（排除第0列和标题列） */
const displayCells = computed(() => {
  // 始终跳过第 0 列 (通常是 null 或索引列)
  let cells = props.data.cells.filter((_, idx) => idx > 0);

  // 如果显示头部且有标题列，也排除标题列
  if (props.showHeader && titleCell.value && props.titleColIndex > 0) {
    cells = cells.filter((_, idx) => idx + 1 !== props.titleColIndex); // +1 因为已经跳过了第0列
  }

  return cells;
});

/** 判断是否为长文本单元格 */
const isFullWidthCell = (cell: TableCell): boolean => {
  const value = String(cell.value);
  const key = cell.key.toLowerCase();
  // 超过 50 字符，或包含特定关键词的列
  return (
    value.length > 50 ||
    key.includes('描述') ||
    key.includes('说明') ||
    key.includes('备注') ||
    key.includes('内容') ||
    key.includes('detail') ||
    key.includes('description')
  );
};

/** Grid 布局单元格（短文本） */
const gridCells = computed(() => displayCells.value.filter(cell => !isFullWidthCell(cell)));

/** Full-Width 布局单元格（长文本） */
const fullWidthCells = computed(() => displayCells.value.filter(cell => isFullWidthCell(cell)));

// ============================================================
// 高亮逻辑
// ============================================================

/**
 * 获取单元格变更类型对应的 CSS class
 * @param colIndex 列索引
 * @returns CSS class 对象
 */
function getCellChangeClass(colIndex: number): Record<string, boolean> {
  const cellId = `${props.tableName}-${props.data.index}-${colIndex}`;
  const changeType = dataStore.getCellChangeType(cellId);

  return {
    'acu-cell-changed': changeType !== null,
    'acu-cell-changed-manual': changeType === 'manual',
    'acu-cell-changed-ai': changeType === 'ai',
  };
}

/**
 * 行变更类型对应的 CSS class（用于整行高亮）
 * 手动高亮优先显示，AI高亮次之
 */
const rowHighlightClass = computed(() => {
  const changeType = dataStore.getRowChangeType(props.tableName, props.data.index, props.data.cells.length);

  // 根据变更类型返回对应的高亮样式类
  if (changeType === 'manual') {
    return 'acu-highlight-changed acu-highlight-manual';
  } else if (changeType === 'ai') {
    return 'acu-highlight-changed acu-highlight-ai';
  }
  return '';
});

// ============================================================
// 移动端手势系统 (VueUse 实现)
// ============================================================

/** 文本选择检测（增强版防误触） */
const { isSelecting, shouldBlockInteraction, wasSelecting } = useSelectionGuardEnhanced();

/** 手势回调 */
const handleInsertRow = () => {
  console.info('[ACU DataCard] 手势触发新增行');
  emit('insertRow');
};

const handleToggleDelete = () => {
  console.info('[ACU DataCard] 手势触发切换删除', { isDeleting: isDeleting.value });
  emit('toggleDelete');
};

/** 使用新的手势 composable */
const { isSwiping, gestureType, atStart, atEnd, checkScrollEdge, lengthX, lengthY } = useCardGestures(cardRef, {
  layout: props.layout,
  horizontalThreshold: 50, // 原版阈值
  verticalThreshold: 40, // 原版阈值
  edgeThreshold: 10,
  onInsertRow: handleInsertRow,
  onToggleDelete: handleToggleDelete,
});

/** 横向布局的拉动高度和透明度（与原版一致） */
const pullHeight = computed(() => {
  if (props.layout !== 'horizontal') return 0;
  const absY = Math.abs(lengthY?.value || 0);
  return Math.min(absY * 0.6, 120);
});

const pullOpacity = computed(() => {
  return Math.min(pullHeight.value / 80, 1);
});

/** 竖向布局的滑动宽度和透明度（与原版一致） */
const swipeWidth = computed(() => {
  if (props.layout !== 'vertical') return 0;
  const absX = Math.abs(lengthX?.value || 0);
  return Math.min(absX * 0.7, 120);
});

const swipeOpacity = computed(() => {
  return Math.min(swipeWidth.value / 60, 1);
});

// ============================================================
// 跨 iframe 生产构建修复：直接 DOM 操作
// 问题：Vue 3 响应式绑定 (:style) 在生产构建 + 跨 iframe 场景下失效
// 解决：使用 watchEffect 直接操作 DOM 元素的 style 属性
// ============================================================

// 横向布局拉动指示器样式
watchEffect(() => {
  if (pullTopRef.value) {
    pullTopRef.value.style.height = `${pullHeight.value}px`;
    pullTopRef.value.style.opacity = String(pullOpacity.value);
  }
  if (pullBottomRef.value) {
    pullBottomRef.value.style.height = `${pullHeight.value}px`;
    pullBottomRef.value.style.opacity = String(pullOpacity.value);
  }
});

// 竖向布局滑动指示器样式
watchEffect(() => {
  if (swipeLeftRef.value) {
    swipeLeftRef.value.style.width = `${swipeWidth.value}px`;
    swipeLeftRef.value.style.opacity = String(swipeOpacity.value);
  }
  if (swipeRightRef.value) {
    swipeRightRef.value.style.width = `${swipeWidth.value}px`;
    swipeRightRef.value.style.opacity = String(swipeOpacity.value);
  }
});

// 监听边缘状态，显示提示
watch([atStart, atEnd], ([start, end]) => {
  if (isMobile.value && (start || end)) {
    // 清除之前的定时器
    if (edgeHintTimer.value) {
      clearTimeout(edgeHintTimer.value);
    }
    showEdgeHint.value = true;
    // 2秒后隐藏
    edgeHintTimer.value = setTimeout(() => {
      showEdgeHint.value = false;
    }, 2000);
  }
});

// ============================================================
// 方法
// ============================================================

/**
 * 滚动事件处理（用于边缘检测）
 */
const handleScroll = (e: Event) => {
  checkScrollEdge(e);
};

/**
 * 点击单元格（点按触发编辑，非长按）
 */
const handleCellClick = (colIndex: number) => {
  // 选词时不触发编辑（包括最近刚结束选词）
  if (shouldBlockInteraction() || wasSelecting.value) {
    console.info('[ACU] 检测到选词操作或刚结束选词，阻止点击事件');
    return;
  }

  // 滑动中不触发编辑
  if (isSwiping.value) {
    console.info('[ACU] 滑动中，阻止点击事件');
    return;
  }

  // 待删除行不能编辑
  if (isDeleting.value) {
    console.info('[ACU] 待删除行不能编辑');
    return;
  }

  editingCell.value = colIndex;
  emit('cellClick', props.data.index, colIndex);
};

/**
 * 点击标题 (直接触发编辑，绕过部分防误触检测)
 */
const handleTitleClick = () => {
  if (props.titleColIndex < 0) return;

  // 待删除行不能编辑
  if (isDeleting.value) {
    console.info('[ACU] 待删除行不能编辑标题');
    return;
  }

  // 直接设置编辑状态，绕过选词和滑动检测（标题编辑是明确意图）
  console.info('[ACU DataCard] 标题点击，触发编辑 colIndex:', props.titleColIndex);
  editingCell.value = props.titleColIndex;
  emit('cellClick', props.data.index, props.titleColIndex);
};

/**
 * 保存单元格
 */
const handleCellSave = (colIndex: number, value: string) => {
  // 调用 store 更新 (使用 tableName 作为 tableId，因为 processToTableData 使用 sheet.name)
  dataStore.updateCell(props.tableName, props.data.index, colIndex, value);

  // 关闭编辑器
  editingCell.value = null;
};

/**
 * 右键菜单（仅 PC 端）
 * 移动端不应触发右键菜单，长按应保留系统原生复制功能
 */
const handleContextMenu = (e: MouseEvent) => {
  // 使用 UA 检测真正的移动设备，避免 PC 触摸屏或小窗口被误判
  // 注意：useIsMobile 可能因为 window.innerWidth < 768 而误判
  const MOBILE_UA_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const isTrulyMobile = MOBILE_UA_REGEX.test(navigator.userAgent);

  if (isTrulyMobile) {
    console.info('[ACU] 移动端不触发右键菜单');
    return;
  }
  emit('contextMenu', e, props.data.index);
};
</script>
