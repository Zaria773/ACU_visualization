<template>
  <div class="acu-tab-config-panel">
    <div class="acu-config-header">
      <h3>表格展示选择</h3>
      <button class="acu-btn-text" @click="handleReset"><i class="fas fa-undo"></i> 重置</button>
    </div>

    <!-- 已选中的表格 -->
    <div class="acu-config-section">
      <h4>已选中的表格 ({{ selectedTabItems.length }})</h4>
      <SortableList :items="selectedTabItems" :show-remove="true" @reorder="handleReorder" @remove="handleRemove">
        <template #empty>
          <span>未选择任何表格，将显示全部</span>
        </template>
      </SortableList>
    </div>

    <!-- 可用表格库 -->
    <div class="acu-config-section">
      <h4>可用表格</h4>
      <div class="acu-tab-grid">
        <button
          v-for="tab in availableTabs"
          :key="tab.id"
          class="acu-tab-grid-item"
          :class="{ selected: isSelected(tab.id) }"
          @click="toggleTab(tab)"
        >
          <span class="tab-name">{{ tab.label }}</span>
          <i v-if="isSelected(tab.id)" class="fas fa-check"></i>
        </button>
      </div>
    </div>

    <!-- 提示信息 -->
    <div class="acu-config-hint">
      <i class="fas fa-info-circle"></i>
      <span>未选择任何表格时将显示全部表格</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * TabConfigPanel - 表格展示选择面板
 *
 * 功能说明:
 * - 允许用户选择哪些表格 Tab 显示在 Tab 栏
 * - 调整已选中 Tab 的显示顺序（使用上下移动按钮）
 * - 空选择时显示全部表格
 *
 * 用于:
 * - 设置弹窗中的"表格展示选择"功能
 */

import { computed } from 'vue';
import { useDataStore } from '../../stores/useDataStore';
import { useUIStore } from '../../stores/useUIStore';
import type { SortableItem } from '../ui/SortableList.vue';
import SortableList from '../ui/SortableList.vue';

const uiStore = useUIStore();
const dataStore = useDataStore();

/** Tab 项目类型 */
interface TabItem {
  id: string;
  label: string;
}

/**
 * 从 dataStore 获取所有可用的表格
 * dataStore.tables 是 Record<string, RowData[]>，键名即表格名称
 */
const availableTabs = computed<TabItem[]>(() => {
  const tableNames = Object.keys(dataStore.tables);
  return tableNames.map(name => ({
    id: name,
    label: name,
  }));
});

/** 当前选中的表格 ID 列表 */
const selectedTabs = computed(() => uiStore.visibleTabs);

/**
 * 转换为 SortableList 需要的格式
 * 保持已选中表格的顺序
 */
const selectedTabItems = computed<SortableItem[]>(() => {
  const result: SortableItem[] = [];
  for (const tabId of selectedTabs.value) {
    const tab = availableTabs.value.find(t => t.id === tabId);
    if (tab) {
      result.push({
        id: tab.id,
        name: tab.label,
        label: tab.label,
      });
    }
  }
  return result;
});

/**
 * 检查表格是否已选中
 * @param tabId 表格 ID
 */
const isSelected = (tabId: string): boolean => {
  return selectedTabs.value.includes(tabId);
};

/**
 * 切换表格选中状态
 * @param tab 表格项
 */
const toggleTab = (tab: TabItem): void => {
  uiStore.toggleTabVisibility(tab.id);
};

/**
 * 处理重新排序
 * @param items 排序后的项目列表
 */
const handleReorder = (items: SortableItem[]): void => {
  const newOrder = items.map(item => item.id);
  uiStore.setVisibleTabs(newOrder);
};

/**
 * 处理移除项目
 * @param item 要移除的项目
 */
const handleRemove = (item: SortableItem): void => {
  uiStore.toggleTabVisibility(item.id);
};

/**
 * 重置为默认（显示全部表格）
 */
const handleReset = (): void => {
  uiStore.resetVisibleTabs();
};
</script>

<style scoped lang="scss">
/* 样式已迁移到 styles/components/settings-panel.scss */
</style>
