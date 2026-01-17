<template>
  <transition name="hidden-popup">
    <div v-if="visible" class="acu-hidden-buttons-popup" @click.stop>
      <div class="popup-buttons-grid">
        <button
          v-for="btn in buttons"
          :key="btn.id"
          class="popup-button"
          :class="getButtonClass(btn.id)"
          :title="btn.label"
          @click.stop="handleButtonClick(btn.id)"
        >
          <i :class="['fa-solid', btn.icon]"></i>
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
/**
 * HiddenButtonsPopup - 隐藏按钮浮窗组件
 *
 * 功能说明:
 * - 显示未展示在导航栏的按钮
 * - 点击按钮触发对应功能
 * - 只显示图标，悬浮显示名称（title）
 *
 * 用于:
 * - MainPanel 导航栏的"更多"按钮点击后弹出
 */

import type { NavButtonConfig } from '../types';

interface Props {
  /** 是否可见 */
  visible: boolean;
  /** 要显示的按钮列表 */
  buttons: NavButtonConfig[];
  /** 是否已固定面板（用于 pin 按钮激活状态） */
  isPinned?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isPinned: false,
});

const emit = defineEmits<{
  /** 关闭浮窗 */
  close: [];
  /** 按钮点击事件 */
  'button-click': [buttonId: string];
}>();

/**
 * 获取按钮样式类
 * @param buttonId 按钮 ID
 */
const getButtonClass = (buttonId: string): string[] => {
  const classes: string[] = [];

  // 危险按钮样式（清除范围）
  if (buttonId === 'purge') {
    classes.push('btn-danger');
  }

  // 切换按钮样式（固定面板）
  if (buttonId === 'pin') {
    classes.push('btn-toggle');
    if (props.isPinned) {
      classes.push('active');
    }
  }

  return classes;
};

/**
 * 处理按钮点击
 * @param buttonId 按钮 ID
 */
const handleButtonClick = (buttonId: string) => {
  emit('button-click', buttonId);
  emit('close');
};
</script>

<style scoped lang="scss">
/* 样式已迁移至 styles/overlays/overlays.scss */
</style>
