<template>
  <div class="acu-button-config-panel">
    <div class="acu-config-header">
      <h3>导航栏按钮配置</h3>
      <button class="acu-btn-text" @click="handleReset"><i class="fas fa-undo"></i> 重置</button>
    </div>

    <!-- 已启用的按钮 -->
    <div class="acu-config-section">
      <h4>已启用的按钮 ({{ selectedButtons.length }})</h4>
      <SortableList :items="selectedButtonItems" :show-remove="true" @reorder="handleReorder" @remove="handleRemove">
        <template #empty>
          <span>请至少选择一个按钮</span>
        </template>
      </SortableList>
    </div>

    <!-- 可用按钮 -->
    <div class="acu-config-section">
      <h4>可用按钮</h4>
      <div class="acu-button-list">
        <div
          v-for="btn in availableButtons"
          :key="btn.id"
          class="acu-button-item"
          :class="{ selected: isSelected(btn.id), disabled: btn.id === 'settings' }"
          @click="toggleButton(btn)"
        >
          <div class="button-main">
            <i :class="['fas', btn.icon]"></i>
            <span class="button-label">{{ btn.label }}</span>
            <i v-if="isSelected(btn.id)" class="fas fa-check check-icon"></i>
          </div>
          <div v-if="btn.longPress" class="button-hint">
            <span>长按: {{ getLongPressLabel(btn.longPress) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 提示信息 -->
    <div class="acu-config-hint">
      <i class="fas fa-info-circle"></i>
      <span>设置按钮不可隐藏，确保始终可以访问设置</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * NavButtonConfigPanel - 导航栏按钮配置面板
 *
 * 功能说明:
 * - 允许用户选择哪些按钮显示在导航栏
 * - 调整已选中按钮的显示顺序（使用上下移动按钮）
 * - 查看按钮的功能说明（包括长按功能）
 * - 设置按钮不可隐藏
 *
 * 用于:
 * - 设置弹窗中的"导航栏按钮配置"功能
 */

import { computed } from 'vue';
import { NAV_BUTTONS, useConfigStore } from '../../stores/useConfigStore';
import type { NavButtonConfig } from '../../types';
import type { SortableItem } from '../ui/SortableList.vue';
import SortableList from '../ui/SortableList.vue';

const configStore = useConfigStore();

/**
 * 可用按钮列表（过滤掉默认隐藏的按钮，如另存为、原生编辑器）
 * 这些按钮只能通过长按其他按钮触发
 */
const availableButtons = computed(() => {
  return NAV_BUTTONS.filter(btn => !btn.hidden);
});

/** 当前选中的按钮 ID 列表 */
const selectedButtons = computed(() => configStore.config.visibleButtons);

/**
 * 转换为 SortableList 需要的格式
 * 根据 buttonOrder 排序
 */
const selectedButtonItems = computed<SortableItem[]>(() => {
  const order = configStore.config.buttonOrder;
  const items: SortableItem[] = [];

  const sortedIds = selectedButtons.value.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));

  for (const btnId of sortedIds) {
    const btn = NAV_BUTTONS.find(b => b.id === btnId);
    if (btn) {
      items.push({
        id: btn.id,
        name: btn.label,
        label: btn.label,
        icon: btn.icon,
      });
    }
  }

  return items;
});

/** 长按功能标签映射 */
const longPressLabels: Record<string, string> = {
  saveAs: '另存为',
  openNative: '原生编辑器',
};

/**
 * 获取长按功能的显示标签
 * @param action 长按动作 ID
 */
const getLongPressLabel = (action: string): string => {
  return longPressLabels[action] || action;
};

/**
 * 检查按钮是否已选中
 * @param btnId 按钮 ID
 */
const isSelected = (btnId: string): boolean => {
  return selectedButtons.value.includes(btnId);
};

/**
 * 切换按钮选中状态
 * @param btn 按钮配置
 */
const toggleButton = (btn: NavButtonConfig): void => {
  // 设置按钮不可禁用
  if (btn.id === 'settings') return;
  configStore.toggleButtonVisibility(btn.id);
};

/**
 * 处理重新排序
 * @param items 排序后的项目列表
 */
const handleReorder = (items: SortableItem[]): void => {
  // 更新 buttonOrder，保留未选中按钮的相对位置
  const newOrder = items.map(item => item.id);
  const unselectedButtons = configStore.config.buttonOrder.filter(id => !selectedButtons.value.includes(id));
  configStore.setButtonOrder([...newOrder, ...unselectedButtons]);
};

/**
 * 处理移除按钮
 * @param item 要移除的按钮项
 */
const handleRemove = (item: SortableItem): void => {
  // 设置按钮不可移除
  if (item.id === 'settings') return;
  configStore.toggleButtonVisibility(item.id);
};

/**
 * 重置为默认配置
 */
const handleReset = (): void => {
  configStore.setVisibleButtons(['save', 'refresh', 'settings', 'pin', 'toggle']);
  configStore.setButtonOrder(['save', 'saveAs', 'refresh', 'manualUpdate', 'purge', 'pin', 'toggle', 'settings']);
};
</script>

<style scoped lang="scss">
/* 样式已迁移到 styles/components/settings-panel.scss */
</style>
