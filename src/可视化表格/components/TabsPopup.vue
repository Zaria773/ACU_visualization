<template>
  <transition name="hidden-popup">
    <div v-if="visible" class="acu-tabs-popup" @click.stop>
      <div class="popup-tabs-grid" :style="{ '--acu-nav-cols': gridColumns }">
        <!-- 仪表盘 Tab -->
        <button
          v-if="showDashboard"
          class="acu-nav-btn"
          :class="{ active: activeTab === TAB_DASHBOARD }"
          @click.stop="handleTabClick(TAB_DASHBOARD)"
        >
          <i class="fas fa-home"></i>
          <span>仪表盘</span>
        </button>

        <!-- 普通 Tab 列表 -->
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="acu-nav-btn"
          :class="{
            active: activeTab === tab.id,
            'has-issues': hasTabIssues(tab.name),
            'has-ai-changes': !hasTabIssues(tab.name) && hasTabAiChanges(tab.name),
          }"
          :title="tab.name"
          @click.stop="handleTabClick(tab.id)"
        >
          <i v-if="tab.icon" :class="tab.icon"></i>
          <span>{{ tab.name }}</span>
        </button>

        <!-- 关系图 Tab -->
        <button
          v-if="showRelationshipGraph"
          class="acu-nav-btn"
          :class="{ active: activeTab === TAB_RELATIONSHIP_GRAPH }"
          @click.stop="handleTabClick(TAB_RELATIONSHIP_GRAPH)"
        >
          <i class="fas fa-project-diagram"></i>
          <span>关系图</span>
        </button>

        <!-- 选项面板 Tab -->
        <button
          v-if="showOptionsPanel"
          class="acu-nav-btn"
          :class="{ active: activeTab === TAB_OPTIONS }"
          @click.stop="handleTabClick(TAB_OPTIONS)"
        >
          <i class="fas fa-sliders-h"></i>
          <span>选项</span>
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
 *
 * 用于:
 * - MainPanel 导航栏的"收纳Tab"按钮点击后弹出
 */

import { useDataStore } from '../stores/useDataStore';
import { TAB_DASHBOARD, TAB_OPTIONS, TAB_RELATIONSHIP_GRAPH } from '../stores/useUIStore';
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
