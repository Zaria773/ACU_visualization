<template>
  <transition name="hidden-popup">
    <div v-if="visible" class="acu-tabs-popup" @click.stop>
      <div class="popup-tabs-grid" :style="{ '--acu-nav-cols': gridColumns }">
        <!-- 统一 Tab 列表（已过滤和排序） -->
        <button
          v-for="tab in allVisibleTabs"
          :key="tab.id"
          class="acu-nav-btn"
          :class="{
            'acu-nav-btn-special': isSpecialTab(tab.id),
            active: activeTab === tab.id,
            'has-issues': !isSpecialTab(tab.id) && hasTabIssues(tab.name),
            'has-ai-changes': !isSpecialTab(tab.id) && !hasTabIssues(tab.name) && hasTabAiChanges(tab.name),
          }"
          :title="tab.name"
          @click.stop="handleTabClick(tab.id)"
        >
          <i v-if="tab.icon" :class="tab.icon"></i>
          <span>{{ tab.name }}</span>
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
/**
 * TabsPopup - Tab 浮窗组件
 *
 * 功能说明:
 * - 当收纳Tab模式开启时，用于显示所有 Tab
 * - 点击 Tab 触发切换并关闭浮窗
 * - 复用原 TabBar 的样式
 * - 根据 useUIStore 中的 visibleTabs 配置过滤显示的 Tab（与 TabBar 保持一致）
 *
 * 用于:
 * - MainPanel 导航栏的"收纳Tab"按钮点击后弹出
 */

import { computed } from 'vue';
import { useDataStore } from '../stores/useDataStore';
import { TAB_DASHBOARD, TAB_OPTIONS, TAB_RELATIONSHIP_GRAPH, useUIStore } from '../stores/useUIStore';
import type { TabItem } from '../types';

interface Props {
  /** 是否可见 */
  visible: boolean;
  /** Tab 列表 */
  tabs: TabItem[];
  /** 当前活跃的 Tab */
  activeTab: string | null;
  /** 网格列数 CSS 值 */
  gridColumns?: string;
  /** 是否显示仪表盘 */
  showDashboard?: boolean;
  /** 是否显示关系图 */
  showRelationshipGraph?: boolean;
  /** 是否显示选项面板 */
  showOptionsPanel?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  gridColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
  showDashboard: true,
  showRelationshipGraph: false,
  showOptionsPanel: false,
});

const emit = defineEmits<{
  /** 关闭浮窗 */
  close: [];
  /** Tab 点击事件 */
  'tab-click': [tabId: string];
}>();

const dataStore = useDataStore();
const uiStore = useUIStore();

/**
 * 是否为特殊 Tab (仪表盘/选项面板/关系图)
 */
function isSpecialTab(tabId: string): boolean {
  return tabId === TAB_DASHBOARD || tabId === TAB_OPTIONS || tabId === TAB_RELATIONSHIP_GRAPH;
}

/**
 * 构建完整的 Tab 对象（包括仪表盘、关系图和选项面板）
 */
function createTabObject(tabId: string): TabItem | undefined {
  if (tabId === TAB_DASHBOARD) {
    return { id: TAB_DASHBOARD, name: '仪表盘', icon: 'fas fa-home' };
  }
  if (tabId === TAB_RELATIONSHIP_GRAPH) {
    return { id: TAB_RELATIONSHIP_GRAPH, name: '关系图', icon: 'fas fa-project-diagram' };
  }
  if (tabId === TAB_OPTIONS) {
    return { id: TAB_OPTIONS, name: '选项', icon: 'fas fa-sliders-h' };
  }
  return props.tabs.find(t => t.id === tabId);
}

/**
 * 获取最终显示的 Tab 列表（统一排序）
 * - 如果 visibleTabs 为空数组，使用默认顺序：仪表盘 -> 所有普通表格 -> 关系图 -> 选项面板
 * - 否则严格按照 visibleTabs 中的顺序显示
 *
 * 与 TabBar.vue 的 allVisibleTabs 保持一致的过滤和排序逻辑
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
    tabs.push(...props.tabs);

    // 关系图（在选项面板之前）
    if (props.showRelationshipGraph) {
      tabs.push({ id: TAB_RELATIONSHIP_GRAPH, name: '关系图', icon: 'fas fa-project-diagram' });
    }

    // 选项面板
    if (props.showOptionsPanel) {
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
      if (tab.id === TAB_RELATIONSHIP_GRAPH && !props.showRelationshipGraph) return false;
      if (tab.id === TAB_OPTIONS && !props.showOptionsPanel) return false;
      return true;
    });
});

/**
 * 检查指定 Tab 是否有完整性问题
 * @param tabName Tab 名称（表格名称）
 */
function hasTabIssues(tabName: string): boolean {
  return dataStore.hasTableIssues(tabName);
}

/**
 * 检查指定 Tab 是否有 AI 变更
 * @param tabName Tab 名称（表格名称）
 */
function hasTabAiChanges(tabName: string): boolean {
  return dataStore.hasTableAiChanges(tabName);
}

/**
 * 处理 Tab 点击
 * @param tabId Tab ID
 */
const handleTabClick = (tabId: string) => {
  emit('tab-click', tabId);
  emit('close');
};
</script>

<style scoped lang="scss">
/* 样式已迁移至 styles/overlays/overlays.scss */
</style>
