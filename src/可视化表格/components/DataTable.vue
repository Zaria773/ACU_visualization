<template>
  <div class="acu-data-table" :class="{ 'acu-table-loading': isLoading }">
    <!-- 固定工具栏 -->
    <div class="acu-table-toolbar">
      <!-- 左侧：表名 + (条数) -->
      <div class="acu-toolbar-left">
        <span class="acu-table-title">{{ tableName }}</span>
        <span class="acu-table-count">({{ totalRows }})</span>
        <span v-if="changedCount > 0" class="acu-table-badge acu-badge-changed">{{ changedCount }}</span>
        <span v-if="deletingCount > 0" class="acu-table-badge acu-badge-deleting">{{ deletingCount }}</span>
      </div>

      <!-- 右侧：从右到左 - 关闭、搜索、高度拖手、倒序、视图切换 -->
      <div class="acu-toolbar-right">
        <!-- 视图切换按钮 -->
        <button
          class="acu-toolbar-btn"
          :title="viewMode === 'card' ? '切换到列表视图' : '切换到卡片视图'"
          @click="toggleViewMode"
        >
          <i :class="viewMode === 'card' ? 'fas fa-list' : 'fas fa-th-large'"></i>
        </button>

        <!-- 倒序按钮 -->
        <button
          class="acu-toolbar-btn"
          :class="{ active: isReversed }"
          title="倒序显示"
          @click="toggleReverse"
        >
          <i class="fas fa-sort-amount-down-alt"></i>
        </button>

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
          <input
            v-model="localSearchTerm"
            type="text"
            class="acu-search-input"
            placeholder="搜索..."
            @input="handleSearchInput"
          />
          <i v-if="localSearchTerm" class="fas fa-times acu-search-clear" @click="clearSearch"></i>
        </div>

        <!-- 关闭按钮 -->
        <button class="acu-toolbar-btn acu-close-btn" title="关闭数据区" @click.stop="handleClose">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>

    <!-- 数据卡片列表 -->
    <div ref="containerRef" class="acu-cards-container" :class="[`acu-view-${viewMode}`]">
      <DataCard
        v-for="row in paginatedRows"
        :key="`${tableId}-${row.index}`"
        :data="row"
        :table-id="tableId"
        :table-name="tableName"
        :is-changed="isRowChanged(row)"
        :layout="configStore.config.layout"
        :view-mode="viewMode"
        :show-index="showIndex"
        :show-header="showHeader"
        :title-col-index="titleColIndex"
        :show-history-button="true"
        @cell-click="handleCellClick"
        @insert-row="handleInsertRow(row.index)"
        @toggle-delete="handleToggleDelete(row.index)"
        @context-menu="handleContextMenu"
        @show-history="handleShowHistory(row)"
      />

      <!-- 空状态 -->
      <div v-if="filteredRows.length === 0" class="acu-empty-state">
        <i class="fas fa-inbox"></i>
        <p>{{ emptyText }}</p>
      </div>
    </div>

    <!-- 分页器 (读取全局配置) -->
    <slot name="pagination">
      <div v-if="shouldShowPagination && totalPages > 1" class="acu-pagination-container">
        <!-- 上一页 (固定在最左) -->
        <div
          class="acu-page-btn acu-page-arrow"
          :class="{ disabled: currentPage === 1 }"
          title="上一页"
          @click="currentPage > 1 && goToPage(currentPage - 1)"
        >
          <i class="fa-solid fa-chevron-left"></i>
        </div>

        <!-- 中间数字区 (居中) -->
        <div class="acu-pagination-numbers">
          <template v-for="page in paginationList" :key="page">
            <div v-if="page === '...'" class="acu-page-dots">...</div>
            <div
              v-else
              class="acu-page-btn"
              :class="{ active: page === currentPage }"
              @click="goToPage(page as number)"
            >
              {{ page }}
            </div>
          </template>
        </div>

        <!-- 下一页 (固定在最右) -->
        <div
          class="acu-page-btn acu-page-arrow"
          :class="{ disabled: currentPage === totalPages }"
          title="下一页"
          @click="currentPage < totalPages && goToPage(currentPage + 1)"
        >
          <i class="fa-solid fa-chevron-right"></i>
        </div>
      </div>
    </slot>
  </div>
</template>

<script setup lang="ts">
/**
 * DataTable 数据表格容器组件
 *
 * 用于组织和展示 DataCard 组件的容器，支持：
 * - 搜索过滤
 * - 排序逻辑：变动行优先 > 倒序设置 > 原始索引
 * - 分页
 * - 网格/列表视图切换
 * - 事件传递
 */

import { computed, nextTick, ref, watch } from 'vue';
import { useCellLock } from '../composables';
import { useConfigStore } from '../stores/useConfigStore';
import { useDataStore } from '../stores/useDataStore';
import { useUIStore } from '../stores/useUIStore';
import type { TableRow } from '../types';
import DataCard from './DataCard.vue';

interface Props {
  /** 表格 ID (用于数据访问) */
  tableId: string;
  /** 表格名称 (用于显示和生成 key) */
  tableName: string;
  /** 表格数据 */
  rows: TableRow[];
  /** 表头 */
  headers?: string[];
  /** 外部传入的搜索词 */
  searchTerm?: string;
  /** 是否显示索引 */
  showIndex?: boolean;
  /** 是否显示卡片头部 */
  showHeader?: boolean;
  /** 是否显示分页 */
  showPagination?: boolean;
  /** 空状态文本 */
  emptyText?: string;
  /** 是否加载中 */
  isLoading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  headers: () => [],
  searchTerm: '',
  showIndex: true,
  showHeader: true,
  showPagination: true,
  emptyText: '暂无数据',
  isLoading: false,
});

const emit = defineEmits<{
  /** 单元格点击事件 */
  cellClick: [tableId: string, rowIndex: number, colIndex: number];
  /** 插入行事件 */
  insertRow: [tableId: string, afterIndex: number];
  /** 切换删除状态事件 */
  toggleDelete: [tableId: string, rowIndex: number];
  /** 右键菜单事件 */
  contextMenu: [event: MouseEvent, tableId: string, rowIndex: number];
  /** 搜索词变更事件 */
  searchChange: [term: string];
  /** 页码变更事件 */
  pageChange: [page: number];
  /** 关闭数据区事件 */
  close: [];
  /** 高度拖拽开始事件 */
  heightDragStart: [event: PointerEvent, handleEl: HTMLElement];
  /** 高度重置事件 */
  heightReset: [];
  /** 显示历史记录事件 */
  showHistory: [tableId: string, tableName: string, rowIndex: number, rowData: TableRow];
}>();

// ============================================================
// Stores
// ============================================================

const dataStore = useDataStore();
const configStore = useConfigStore();
const uiStore = useUIStore();

// ============================================================
// 状态
// ============================================================

const containerRef = ref<HTMLElement>();
const heightHandleRef = ref<HTMLElement>();
const viewMode = ref<'list' | 'card'>(uiStore.getTableStyle(props.tableName));
const localSearchTerm = ref(props.searchTerm);
const currentPage = ref(1);

// ============================================================
// 计算属性
// ============================================================

/**
 * 标题列索引
 * 对于 '总结' 或 '大纲' 类型的表，查找 '索引'/'编号'/'代码' 列
 * 否则使用默认值 1（跳过第一个 null 列）
 */
const titleColIndex = computed(() => {
  // 检查是否是 '总结' 或 '大纲' 表
  if (props.tableName.includes('总结') || props.tableName.includes('大纲')) {
    // 查找包含 '索引'/'编号'/'代码' 的列
    const idx = props.headers.findIndex(h => h && (h.includes('索引') || h.includes('编号') || h.includes('代码')));
    if (idx > 0) {
      return idx;
    }
  }
  // 默认返回 1（跳过第一个 null 列）
  return 1;
});

/** 是否倒序显示 */
const isReversed = computed(() => uiStore.isTableReversed(props.tableName));

/** 过滤后的数据 */
const filteredRows = computed(() => {
  let rows = props.rows;

  // 锁定筛选：只显示有锁定的行
  if (uiStore.showLockedOnly && uiStore.isLockEditMode) {
    const cellLock = useCellLock();
    rows = rows.filter(row => {
      const headers = row.cells.map(c => c.key);
      const rowData = row.cells.map(c => String(c.value ?? ''));
      const rowKey = cellLock.getRowKey(props.tableName, rowData, headers, row.index);
      if (!rowKey) return false;
      return cellLock.hasRowAnyLockPending(props.tableName, rowKey);
    });
  }

  // 搜索过滤
  const term = localSearchTerm.value.toLowerCase().trim();
  if (!term) return rows;

  return rows.filter(row => row.cells.some(cell => String(cell.value).toLowerCase().includes(term)));
});

/**
 * 获取行变更类型
 * @returns 'manual' | 'ai' | null
 */
function getRowChangeType(row: TableRow): 'manual' | 'ai' | null {
  return dataStore.getRowChangeType(props.tableName, row.index, row.cells.length);
}

/**
 * 变更类型优先级：manual = 2, ai = 1, null = 0
 */
function getChangePriority(changeType: 'manual' | 'ai' | null): number {
  if (changeType === 'manual') return 2;
  if (changeType === 'ai') return 1;
  return 0;
}

/** 排序后的数据：手动高亮 > AI高亮 > 倒序设置 > 原始索引 */
const sortedRows = computed(() => {
  const rows = [...filteredRows.value];

  return rows.sort((a, b) => {
    // 1. 手动高亮优先，AI高亮次之
    const aChangeType = getRowChangeType(a);
    const bChangeType = getRowChangeType(b);
    const aPriority = getChangePriority(aChangeType);
    const bPriority = getChangePriority(bChangeType);

    if (aPriority !== bPriority) {
      return bPriority - aPriority; // 高优先级排前面
    }

    // 2. 按索引排序（考虑倒序设置）
    return isReversed.value ? b.index - a.index : a.index - b.index;
  });
});

/** 每页条数 */
const itemsPerPage = computed(() => configStore.config.itemsPerPage || 20);

/** 总页数 */
const totalPages = computed(() => Math.max(1, Math.ceil(sortedRows.value.length / itemsPerPage.value)));

/** 当前页数据 */
const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return sortedRows.value.slice(start, start + itemsPerPage.value);
});

/** 总行数 */
const totalRows = computed(() => props.rows.length);

/** 变更行数 */
const changedCount = computed(() => {
  return props.rows.filter(row => isRowChanged(row)).length;
});

/** 待删除行数 */
const deletingCount = computed(() => {
  return props.rows.filter(row => {
    const rowKey = `${props.tableName}-row-${row.index}`;
    return dataStore.pendingDeletes.has(rowKey);
  }).length;
});

/** 是否显示分页器（综合 prop 和全局配置） */
const shouldShowPagination = computed(() => {
  // prop 和全局配置都为 true 时才显示
  return props.showPagination && configStore.config.showPagination !== false;
});

/** 分页列表（带省略号） */
const paginationList = computed(() => {
  const pages: (number | string)[] = [];
  const total = totalPages.value;
  const current = currentPage.value;

  if (total <= 7) {
    // 总页数较少，全部显示
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
  } else {
    // 总页数较多，使用省略号
    pages.push(1);

    if (current > 3) {
      pages.push('...');
    }

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (current < total - 2) {
      pages.push('...');
    }

    pages.push(total);
  }

  return pages;
});

// ============================================================
// 方法
// ============================================================

/**
 * 判断行是否有变更
 */
function isRowChanged(row: TableRow): boolean {
  return dataStore.isRowChanged(props.tableName, row.index, row.cells.length);
}

/**
 * 切换倒序显示
 */
function toggleReverse() {
  uiStore.toggleTableReverse(props.tableName);
}

/**
 * 切换视图模式
 */
function toggleViewMode() {
  viewMode.value = viewMode.value === 'card' ? 'list' : 'card';
}

/**
 * 关闭数据区
 */
function handleClose() {
  emit('close');
}

/**
 * 处理搜索输入
 */
function handleSearchInput() {
  // 搜索时重置页码
  currentPage.value = 1;
  emit('searchChange', localSearchTerm.value);
}

/**
 * 清除搜索
 */
function clearSearch() {
  localSearchTerm.value = '';
  currentPage.value = 1;
  emit('searchChange', '');
}

/**
 * 跳转到指定页
 */
function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  emit('pageChange', page);

  // 滚动到顶部
  nextTick(() => {
    containerRef.value?.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/**
 * 处理单元格点击
 */
function handleCellClick(rowIndex: number, colIndex: number) {
  emit('cellClick', props.tableId, rowIndex, colIndex);
}

/**
 * 处理插入行
 */
function handleInsertRow(afterIndex: number) {
  emit('insertRow', props.tableId, afterIndex);
}

/**
 * 处理切换删除
 */
function handleToggleDelete(rowIndex: number) {
  emit('toggleDelete', props.tableId, rowIndex);
}

/**
 * 处理右键菜单
 */
function handleContextMenu(event: MouseEvent, rowIndex: number) {
  emit('contextMenu', event, props.tableId, rowIndex);
}

/**
 * 处理高度拖拽开始
 */
function handleHeightDragStart(e: PointerEvent) {
  if (heightHandleRef.value) {
    emit('heightDragStart', e, heightHandleRef.value);
  }
}

/**
 * 处理高度重置
 */
function handleHeightReset() {
  emit('heightReset');
}

/**
 * 移动端双击检测 - 用于重置高度
 * 检测两次 touchend 间隔小于 300ms 则认为是双击
 */
let lastHeightTouchTime = 0;
function handleHeightTouchEnd() {
  const now = Date.now();
  if (now - lastHeightTouchTime < 300) {
    // 双击触发 - 重置高度
    handleHeightReset();
    lastHeightTouchTime = 0; // 重置，避免连续触发
  } else {
    lastHeightTouchTime = now;
  }
}

/**
 * 处理显示历史记录
 */
function handleShowHistory(row: TableRow) {
  emit('showHistory', props.tableId, props.tableName, row.index, row);
}

// ============================================================
// 监听
// ============================================================

// 监听外部搜索词变化
watch(
  () => props.searchTerm,
  newTerm => {
    localSearchTerm.value = newTerm;
  },
);

// 监听视图模式变化，保存到 store
watch(viewMode, newMode => {
  uiStore.setTableStyle(props.tableName, newMode);
});

// 监听总页数变化，确保当前页有效
watch(totalPages, newTotal => {
  if (currentPage.value > newTotal) {
    currentPage.value = Math.max(1, newTotal);
  }
});
</script>
