<template>
  <div class="acu-tab-config-panel">
    <!-- 展示区：当前显示的 Tab（网格布局，复用导航栏样式） -->
    <div class="acu-config-section acu-visible-area">
      <h4>
        <i class="fas fa-eye"></i>
        展示中 ({{ visibleTabItems.length }})
        <button class="acu-btn-text acu-btn-reset" @click.stop="handleReset"><i class="fas fa-undo"></i> 重置</button>
      </h4>
      <div v-if="visibleTabItems.length > 0" class="acu-tab-visible-grid" :style="gridStyle">
        <button
          v-for="(tab, index) in visibleTabItems"
          :key="tab.id"
          class="acu-nav-btn acu-tab-config-btn"
          :class="{
            'acu-nav-btn-special': isAggregateTab(tab.type),
            dragging: draggedIndex === index,
          }"
          draggable="true"
          :title="'点击移除，拖拽排序'"
          @click.stop="handleHide(tab.id)"
          @dragstart="handleDragStart($event, index)"
          @dragover.prevent="handleDragOver($event, index)"
          @drop="handleDrop($event, index)"
          @dragend="handleDragEnd"
        >
          <i v-if="tab.icon" :class="tab.icon"></i>
          <span>{{ tab.name }}</span>
          <span v-if="isAggregateTab(tab.type)" class="tab-type-badge-mini">{{ getTypeBadge(tab.type) }}</span>
        </button>
      </div>
      <div v-else class="acu-empty-hint">
        <i class="fas fa-info-circle"></i>
        <span>展示区为空时显示全部Tab，从下方添加需要的</span>
      </div>
    </div>

    <!-- 不展示区：隐藏的 Tab -->
    <div class="acu-config-section acu-hidden-area">
      <h4>
        <i class="fas fa-eye-slash"></i>
        未展示 ({{ hiddenTabItems.length }})
        <button class="acu-btn-text acu-btn-clear" title="将展示区所有Tab移到未展示区" @click.stop="handleClearAll">
          <i class="fas fa-angle-double-down"></i> 全部下移
        </button>
      </h4>
      <div v-if="hiddenTabItems.length > 0" class="acu-tab-hidden-list">
        <button
          v-for="tab in hiddenTabItems"
          :key="tab.id"
          class="acu-tab-hidden-item"
          :class="{ 'is-special': isAggregateTab(tab.type) }"
          :title="'添加 ' + tab.name"
          @click.stop="handleShow(tab.id)"
        >
          <i v-if="tab.icon" :class="tab.icon" class="tab-icon"></i>
          <span class="tab-name">{{ tab.name }}</span>
          <span v-if="isAggregateTab(tab.type)" class="tab-type-badge">{{ getTypeBadge(tab.type) }}</span>
          <i class="fas fa-plus add-icon"></i>
        </button>
      </div>
      <div v-else class="acu-empty-hint">
        <i class="fas fa-check-circle"></i>
        <span>所有表格都已展示</span>
      </div>
    </div>

    <!-- 提示信息（固定在底部） -->
    <div class="acu-config-hint acu-config-hint-fixed">
      <i class="fas fa-info-circle"></i>
      <span>点击移除/添加，拖拽排序 | 展示区为空时主界面显示全部</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * TabConfigPanel - 表格展示配置面板
 *
 * 功能说明:
 * - 双区域布局：展示区（可见Tab）和不展示区（隐藏Tab）
 * - 展示区支持拖拽排序和点击移除
 * - 不展示区支持点击添加
 * - 支持特殊表格类型（仪表盘、行动选项、选项表）
 * - 空选择时显示全部表格
 *
 * 用于:
 * - 设置弹窗中的"表格展示配置"功能
 *
 * 关键：使用 sheetId 作为 Tab ID，与 App.vue 的 tabList 保持一致
 */

import { computed, ref } from 'vue';
import { useConfigStore } from '../../stores/useConfigStore';
import { useDataStore } from '../../stores/useDataStore';
import { TAB_DASHBOARD, TAB_OPTIONS, TAB_RELATIONSHIP_GRAPH, useUIStore } from '../../stores/useUIStore';
import { isCharacterTable, processJsonData } from '../../utils';

// CSS 列数变量
const configStore = useConfigStore();

/**
 * 展示区网格样式
 * - 关联设置面板的"表格按钮列数"配置
 * - 自适应(0)时：尽可能多放，保证表名完全显示
 * - 固定列数时：使用设置的列数
 */
const gridStyle = computed(() => {
  const cols = configStore.config.gridColumns;
  if (cols === 0) {
    // 自适应：每项最小宽度 90px，保证表名显示
    return { gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' };
  }
  // 固定列数
  return { gridTemplateColumns: `repeat(${cols}, 1fr)` };
});

const uiStore = useUIStore();
const dataStore = useDataStore();

/** Tab 项目类型 */
interface TabConfigItem {
  id: string;
  name: string;
  icon?: string;
  type: 'normal' | 'dashboard' | 'options' | 'special' | 'graph';
}

/**
 * 获取所有可用的表格（包括特殊类型）
 * 关键：使用 sheetId 作为 Tab ID，与 App.vue 的 tabList 保持一致
 */
const allTabs = computed<TabConfigItem[]>(() => {
  const tabs: TabConfigItem[] = [];

  // 仪表盘（如果配置显示）
  if (configStore.config.showDashboard) {
    tabs.push({
      id: TAB_DASHBOARD,
      name: '仪表盘',
      icon: 'fas fa-home',
      type: 'dashboard',
    });
  }

  // 从 stagedData 获取表格，使用 sheetId 作为 ID（与 App.vue 一致）
  const staged = dataStore.stagedData;
  if (staged) {
    const processed = processJsonData(staged);
    if (processed) {
      for (const [tableName, tableData] of Object.entries(processed)) {
        const sheetId = tableData.key; // 使用 sheetId 作为 ID
        const isOptions = tableName.includes('选项');
        tabs.push({
          id: sheetId,
          name: tableName,
          icon: isOptions ? 'fas fa-sliders-h' : undefined,
          type: isOptions ? 'special' : 'normal',
        });
      }
    }
  }

  // 关系图（如果有角色表格）
  const hasCharacterTables = tabs.some(t => t.type === 'normal' && isCharacterTable(t.name, t.id));
  if (hasCharacterTables) {
    tabs.push({
      id: TAB_RELATIONSHIP_GRAPH,
      name: '关系图',
      icon: 'fas fa-project-diagram',
      type: 'graph',
    });
  }

  // 选项面板（如果有选项类表格）
  const hasOptionsTables = tabs.some(t => t.type === 'special');
  if (hasOptionsTables) {
    tabs.push({
      id: TAB_OPTIONS,
      name: '选项面板',
      icon: 'fas fa-sliders-h',
      type: 'options',
    });
  }

  return tabs;
});

/**
 * 当前可见的 Tab 列表
 * - 如果 visibleTabs 为空，展示区为空（用户可从隐藏区添加）
 * - 否则按照 visibleTabs 顺序显示
 */
const visibleTabItems = computed<TabConfigItem[]>(() => {
  const visibleIds = uiStore.visibleTabs;

  // 空数组时展示区为空，让用户从隐藏区选择
  if (!visibleIds || visibleIds.length === 0) {
    return [];
  }

  // 按照 visibleTabs 顺序返回
  return visibleIds
    .map(id => allTabs.value.find(tab => tab.id === id))
    .filter((tab): tab is TabConfigItem => tab !== undefined);
});

/**
 * 当前隐藏的 Tab 列表
 * - 如果 visibleTabs 为空，隐藏区显示所有Tab
 * - 否则显示不在 visibleTabs 中的 Tab
 */
const hiddenTabItems = computed<TabConfigItem[]>(() => {
  const visibleIds = uiStore.visibleTabs;

  // 空数组时隐藏区显示所有 Tab
  if (!visibleIds || visibleIds.length === 0) {
    return allTabs.value;
  }

  // 过滤出不在 visibleTabs 中的 Tab
  return allTabs.value.filter(tab => !visibleIds.includes(tab.id));
});

/**
 * 判断是否为聚合类型的 Tab（需要显示特殊徽章）
 * - dashboard: 仪表盘
 * - graph: 关系图
 * - options: 选项面板（聚合所有选项表）
 * 注意：special（带"选项"字眼的普通表格）不是聚合类型
 */
const isAggregateTab = (type: string): boolean => {
  return type === 'dashboard' || type === 'graph' || type === 'options';
};

/**
 * 获取类型徽章文本
 */
const getTypeBadge = (type: string): string => {
  switch (type) {
    case 'dashboard':
      return '首页';
    case 'graph':
      return '关系';
    case 'options':
      return '聚合';
    default:
      return '';
  }
};

// ============================================================
// 拖拽排序逻辑
// ============================================================

const draggedIndex = ref<number | null>(null);

const handleDragStart = (e: DragEvent, index: number) => {
  draggedIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }
  // 不添加 dragging 类，避免样式变化
};

const handleDragOver = (e: DragEvent, index: number) => {
  e.preventDefault();
  if (draggedIndex.value === null || draggedIndex.value === index) return;
  // 不添加视觉反馈类，避免样式闪烁
};

const handleDrop = (e: DragEvent, targetIndex: number) => {
  e.preventDefault();
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) return;

  // 获取当前顺序：如果是空数组（显示全部模式），先初始化为所有 Tab ID
  let currentOrder = [...uiStore.visibleTabs];
  if (currentOrder.length === 0) {
    currentOrder = allTabs.value.map(t => t.id);
  }

  // 重新排序
  const [removed] = currentOrder.splice(draggedIndex.value, 1);
  currentOrder.splice(targetIndex, 0, removed);
  uiStore.setVisibleTabs(currentOrder);

  // 清理视觉状态
  const items = document.querySelectorAll('.acu-tab-config-btn');
  items.forEach(item => item.classList.remove('drop-target'));
  draggedIndex.value = null;
};

const handleDragEnd = () => {
  draggedIndex.value = null;
};

// ============================================================
// 显示/隐藏操作
// ============================================================

/**
 * 将 Tab 添加到展示区
 */
const handleShow = (tabId: string) => {
  const currentVisible = [...uiStore.visibleTabs];

  if (!currentVisible.includes(tabId)) {
    // 添加到末尾
    currentVisible.push(tabId);
    uiStore.setVisibleTabs(currentVisible);
  }
};

/**
 * 将 Tab 从展示区移除
 */
const handleHide = (tabId: string) => {
  const currentVisible = [...uiStore.visibleTabs];

  // 如果当前是"显示全部"模式（空数组），先初始化为所有 Tab
  if (currentVisible.length === 0) {
    const allIds = allTabs.value.map(t => t.id);
    const filtered = allIds.filter(id => id !== tabId);
    // 至少保留一个 Tab
    if (filtered.length > 0) {
      uiStore.setVisibleTabs(filtered);
    }
    return;
  }

  const index = currentVisible.indexOf(tabId);
  if (index > -1) {
    // 至少保留一个 Tab
    if (currentVisible.length > 1) {
      currentVisible.splice(index, 1);
      uiStore.setVisibleTabs(currentVisible);
    }
  }
};

/**
 * 重置为默认（显示全部表格）
 * 将所有Tab添加到展示区
 */
const handleReset = () => {
  // 重置时将所有Tab添加到展示区
  const allIds = allTabs.value.map(t => t.id);
  uiStore.setVisibleTabs(allIds);
};

/**
 * 全部下移（清空展示区）
 * 将所有展示区的Tab移到隐藏区
 */
const handleClearAll = () => {
  uiStore.setVisibleTabs([]);
};
</script>

<style scoped lang="scss">
/* 样式已迁移到 styles/components/settings-panel.scss */
</style>
