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
      <!-- 统一 Tab 列表（包含仪表盘、普通表格、选项面板） -->
      <button
        v-for="tab in allVisibleTabs"
        :key="tab.id"
        class="acu-nav-btn"
        :class="{
          active: activeTab === tab.id,
          'drag-handle': isEditingOrder,
          'has-issues': !isSpecialTab(tab.id) && hasTabIssues(tab.name),
          'has-ai-changes': !isSpecialTab(tab.id) && !hasTabIssues(tab.name) && hasTabAiChanges(tab.name),
        }"
        :title="getTabTooltip(tab)"
        :draggable="isEditingOrder"
        @click.stop="selectTab(tab.id)"
        @dragstart="handleDragStart($event, tab)"
        @dragover.prevent="handleDragOver($event, tab)"
        @drop="handleDrop($event, tab)"
        @dragend="handleDragEnd"
      >
        <i :class="tab.icon || getSmartTabIcon(tab.name)"></i>
        <span>{{ tab.name }}</span>
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
import { useDataStore } from '../stores/useDataStore';
import { getSmartTabIcon, TAB_DASHBOARD, TAB_OPTIONS, TAB_RELATIONSHIP_GRAPH, useUIStore } from '../stores/useUIStore';
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
  /** 是否有关系图数据 */
  hasRelationshipGraph?: boolean;
  /** 是否处于排序编辑模式 */
  isEditingOrder?: boolean;
  /** 网格列数 CSS */
  gridColumns?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showDashboard: true,
  hasOptionsTabs: false,
  hasRelationshipGraph: false,
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
const dataStore = useDataStore();

// ============================================================
// 状态
// ============================================================

/** 排序后的 Tab 列表 (本地副本) */
const sortedTabs = ref<TabItem[]>([]);

/**
 * 是否为特殊 Tab (仪表盘/选项面板/关系图)
 */
function isSpecialTab(tabId: string): boolean {
  return tabId === TAB_DASHBOARD || tabId === TAB_OPTIONS || tabId === TAB_RELATIONSHIP_GRAPH;
}

/**
 * 构建完整的 Tab 对象（包括仪表盘、关系图和选项面板）
 * 注意：visibleTabs 存储的是表格名称 (name)，特殊 Tab 存储的是常量 ID
 * @param nameOrId 表格名称或特殊 Tab 的 ID
 */
function createTabObject(nameOrId: string): TabItem | undefined {
  // 特殊 Tab 使用常量 ID
  if (nameOrId === TAB_DASHBOARD) {
    return { id: TAB_DASHBOARD, name: '仪表盘', icon: 'fas fa-home' };
  }
  if (nameOrId === TAB_RELATIONSHIP_GRAPH) {
    return { id: TAB_RELATIONSHIP_GRAPH, name: '关系图', icon: 'fas fa-project-diagram' };
  }
  if (nameOrId === TAB_OPTIONS) {
    return { id: TAB_OPTIONS, name: '选项', icon: 'fas fa-sliders-h' };
  }
  // 普通表格使用名称匹配
  return sortedTabs.value.find(t => t.name === nameOrId);
}

/**
 * 获取最终显示的 Tab 列表（统一排序）
 * - 如果 visibleTabs 为空数组，使用默认顺序：仪表盘 -> 所有普通表格 -> 选项面板
 * - 否则严格按照 visibleTabs 中的顺序显示
 */
const allVisibleTabs = computed<TabItem[]>(() => {
  const visibleTabs = uiStore.visibleTabs;

  // 1. 如果配置为空（显示全部模式），使用默认顺序
  if (!visibleTabs || visibleTabs.length === 0) {
    const tabs: TabItem[] = [];

    // 仪表盘
    if (props.showDashboard) {
      tabs.push({ id: TAB_DASHBOARD, name: '仪表盘', icon: 'fas fa-home' });
    }

    // 普通表格
    tabs.push(...sortedTabs.value);

    // 关系图（在选项面板之前）
    if (props.hasRelationshipGraph) {
      tabs.push({ id: TAB_RELATIONSHIP_GRAPH, name: '关系图', icon: 'fas fa-project-diagram' });
    }

    // 选项面板
    if (props.hasOptionsTabs) {
      tabs.push({ id: TAB_OPTIONS, name: '选项', icon: 'fas fa-sliders-h' });
    }

    return tabs;
  }

  // 2. 如果有配置，严格按照配置顺序显示
  return visibleTabs
    .map(tabId => createTabObject(tabId))
    .filter((tab): tab is TabItem => {
      // 过滤掉 undefined 以及不应该显示的特殊 Tab（双重校验）
      if (!tab) return false;
      if (tab.id === TAB_DASHBOARD && !props.showDashboard) return false;
      if (tab.id === TAB_RELATIONSHIP_GRAPH && !props.hasRelationshipGraph) return false;
      if (tab.id === TAB_OPTIONS && !props.hasOptionsTabs) return false;
      return true;
    });
});

// ============================================================
// 完整性检测
// ============================================================

/**
 * 检查指定 Tab 是否有完整性问题
 * @param tabName Tab 名称（表格名称）
 */
function hasTabIssues(tabName: string): boolean {
  return dataStore.hasTableIssues(tabName);
}

/**
 * 检查指定 Tab 是否有 AI 填表变更
 * @param tabName Tab 名称（表格名称）
 */
function hasTabAiChanges(tabName: string): boolean {
  return dataStore.hasTableAiChanges(tabName);
}

/**
 * 获取 Tab 的 tooltip
 * @param tab Tab 配置
 */
function getTabTooltip(tab: TabItem): string {
  if (hasTabIssues(tab.name)) {
    const issues = dataStore.getTableIssues(tab.name);
    return `⚠️ 发现 ${issues.length} 个问题`;
  }
  return tab.name;
}

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
  getVisibleTabs: () => allVisibleTabs.value.map(t => t.id),
});
</script>

<!-- 样式已迁移至 styles/components/navigation.scss -->
