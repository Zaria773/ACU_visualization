<template>
  <div class="acu-tab-bar">
    <!-- 排序提示 -->
    <div class="acu-order-controls" :class="{ visible: isEditingOrder }">
      <span>
        <i class="fas fa-info-circle"></i>
        拖拽调整顺序，完成后点击
        <button class="acu-order-done-btn" @click="exitEditingOrder"><i class="fas fa-check"></i> 完成</button>
      </span>
    </div>

    <!-- Tab 网格区域 -->
    <div class="acu-nav-tabs-area" :style="{ '--acu-nav-cols': gridColumns }">
      <!-- 仪表盘 Tab (如果显示) -->
      <button
        v-if="showDashboard"
        class="acu-nav-btn acu-nav-btn-special"
        :class="{ active: activeTab === TAB_DASHBOARD }"
        @click.stop="selectTab(TAB_DASHBOARD)"
      >
        <i class="fas fa-home"></i>
        <span>仪表盘</span>
      </button>

      <!-- 动态 Tab 列表（根据可见性配置过滤） -->
      <button
        v-for="tab in filteredTabs"
        :key="tab.id"
        class="acu-nav-btn"
        :class="{
          active: activeTab === tab.id,
          'drag-handle': isEditingOrder,
        }"
        :draggable="isEditingOrder"
        @click.stop="selectTab(tab.id)"
        @dragstart="handleDragStart($event, tab)"
        @dragover.prevent="handleDragOver($event, tab)"
        @drop="handleDrop($event, tab)"
        @dragend="handleDragEnd"
      >
        <i v-if="tab.icon" :class="tab.icon"></i>
        <span>{{ tab.name }}</span>
      </button>

      <!-- 选项面板 Tab (如果有选项类表格) -->
      <button
        v-if="hasOptionsTabs"
        class="acu-nav-btn acu-nav-btn-special"
        :class="{ active: activeTab === TAB_OPTIONS }"
        @click.stop="selectTab(TAB_OPTIONS)"
      >
        <i class="fas fa-sliders-h"></i>
        <span>选项</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * TabBar.vue - 标签栏组件
 * 支持 Tab 切换、拖拽排序和可见性过滤
 *
 * 根据 useUIStore 中的 visibleTabs 配置过滤显示的 Tab：
 * - 如果 visibleTabs 为空数组，显示全部 Tab
 * - 否则按照 visibleTabs 中的顺序过滤显示
 */

import { computed, ref, watch } from 'vue';
import { TAB_DASHBOARD, TAB_OPTIONS, useUIStore } from '../stores/useUIStore';
import type { TabItem } from '../types';

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  /** Tab 列表 */
  tabs: TabItem[];
  /** 当前活跃 Tab */
  activeTab: string | null;
  /** 是否显示仪表盘 */
  showDashboard?: boolean;
  /** 是否有选项类 Tab */
  hasOptionsTabs?: boolean;
  /** 是否处于排序编辑模式 */
  isEditingOrder?: boolean;
  /** 网格列数 CSS */
  gridColumns?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showDashboard: true,
  hasOptionsTabs: false,
  isEditingOrder: false,
  gridColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
});

const emit = defineEmits<{
  /** Tab 切换 */
  'tab-change': [tabId: string];
  /** 排序变更 */
  'order-change': [newOrder: string[]];
  /** 退出排序模式 */
  'exit-editing': [];
}>();

// ============================================================
// Store
// ============================================================

const uiStore = useUIStore();

// ============================================================
// 状态
// ============================================================

/** 排序后的 Tab 列表 (本地副本) */
const sortedTabs = ref<TabItem[]>([]);

/**
 * 根据 visibleTabs 配置过滤后的 Tab 列表
 * - 如果 visibleTabs 为空数组，显示全部 Tab
 * - 否则按照 visibleTabs 中的顺序过滤显示
 */
const filteredTabs = computed(() => {
  const visibleTabs = uiStore.visibleTabs;

  // 空数组表示显示全部
  if (!visibleTabs || visibleTabs.length === 0) {
    return sortedTabs.value;
  }

  // 根据配置顺序过滤
  return visibleTabs
    .map(tabId => sortedTabs.value.find(t => t.id === tabId))
    .filter((tab): tab is TabItem => tab !== undefined);
});

/** 当前拖拽的 Tab */
let draggedTab: TabItem | null = null;

/** 拖拽目标 Tab */
let dropTargetTab: TabItem | null = null;

// ============================================================
// 监听 props 变化
// ============================================================

watch(
  () => props.tabs,
  newTabs => {
    sortedTabs.value = [...newTabs];
  },
  { immediate: true, deep: true },
);

// ============================================================
// 方法
// ============================================================

/**
 * 选择 Tab
 */
const selectTab = (tabId: string) => {
  // 排序模式下不切换 Tab
  if (props.isEditingOrder) return;
  emit('tab-change', tabId);
};

/**
 * 退出排序模式
 */
const exitEditingOrder = () => {
  emit('exit-editing');
};

// ============================================================
// 拖拽排序 (原生 HTML5 Drag & Drop)
// ============================================================

const handleDragStart = (e: DragEvent, tab: TabItem) => {
  if (!props.isEditingOrder) {
    e.preventDefault();
    return;
  }
  draggedTab = tab;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab.id);
  }
  // 添加拖拽样式
  (e.target as HTMLElement).classList.add('dragging');
};

const handleDragOver = (e: DragEvent, tab: TabItem) => {
  if (!props.isEditingOrder || !draggedTab) return;
  e.preventDefault();
  dropTargetTab = tab;
};

const handleDrop = (e: DragEvent, tab: TabItem) => {
  if (!props.isEditingOrder || !draggedTab) return;
  e.preventDefault();

  const fromIndex = sortedTabs.value.findIndex(t => t.id === draggedTab!.id);
  const toIndex = sortedTabs.value.findIndex(t => t.id === tab.id);

  if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
    // 重新排序
    const [removed] = sortedTabs.value.splice(fromIndex, 1);
    sortedTabs.value.splice(toIndex, 0, removed);

    // 发送新顺序
    emit(
      'order-change',
      sortedTabs.value.map(t => t.id),
    );
  }

  draggedTab = null;
  dropTargetTab = null;
};

const handleDragEnd = (e: DragEvent) => {
  (e.target as HTMLElement).classList.remove('dragging');
  draggedTab = null;
  dropTargetTab = null;
};

// ============================================================
// 暴露方法
// ============================================================

defineExpose({
  /** 获取当前排序 */
  getCurrentOrder: () => sortedTabs.value.map(t => t.id),
  /** 获取当前过滤后显示的 Tab */
  getVisibleTabs: () => filteredTabs.value.map(t => t.id),
});
</script>

<!-- 样式已迁移至 styles/components/navigation.scss -->
