<template>
  <div class="acu-action-bar">
    <button
      v-for="btnId in sortedVisibleButtonIds"
      :key="btnId"
      class="acu-action-btn"
      :class="getButtonClass(btnId)"
      :title="getButtonLabel(btnId)"
      @click="handleClick(btnId)"
      @mousedown="startLongPress(btnId)"
      @mouseup="endLongPress"
      @mouseleave="endLongPress"
      @touchstart.passive="startLongPress(btnId)"
      @touchend="endLongPress"
    >
      <i :class="['fas', getButtonIcon(btnId)]"></i>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * ActionBar - 导航栏按钮组件
 *
 * 功能说明:
 * - 根据 configStore 配置动态渲染可见按钮
 * - 支持长按触发额外操作（如保存->另存为，设置->原生编辑器）
 * - 按钮顺序可配置
 * - 特殊按钮样式（危险按钮、切换按钮等）
 *
 * 用于:
 * - 主面板顶部导航栏
 */

import { computed, ref } from 'vue';
import { NAV_BUTTONS, useConfigStore } from '../stores/useConfigStore';
import type { NavButtonConfig } from '../types';

interface Props {
  /** 是否有未保存的更改 */
  hasChanges?: boolean;
  /** 是否已固定面板 */
  isPinned?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  hasChanges: false,
  isPinned: false,
});

const emit = defineEmits<{
  /** 保存 */
  save: [];
  /** 另存为 */
  saveAs: [];
  /** 刷新 */
  refresh: [];
  /** 手动更新 */
  manualUpdate: [];
  /** 清除范围 */
  purge: [];
  /** 固定面板 */
  pin: [];
  /** 收起面板 */
  toggle: [];
  /** 打开设置 */
  settings: [];
  /** 打开原生编辑器 */
  openNative: [];
}>();

const configStore = useConfigStore();

// ============================================================
// 按钮配置获取
// ============================================================

/** 获取排序后的可见按钮 ID 列表 */
const sortedVisibleButtonIds = computed(() => {
  return configStore.sortedVisibleButtons;
});

/**
 * 获取按钮配置
 * @param buttonId 按钮 ID
 */
const getButtonConfig = (buttonId: string): NavButtonConfig | undefined => {
  return NAV_BUTTONS.find(btn => btn.id === buttonId);
};

/**
 * 获取按钮图标
 * @param buttonId 按钮 ID
 */
const getButtonIcon = (buttonId: string): string => {
  const config = getButtonConfig(buttonId);
  return config?.icon || 'fa-circle';
};

/**
 * 获取按钮标签
 * @param buttonId 按钮 ID
 */
const getButtonLabel = (buttonId: string): string => {
  const config = getButtonConfig(buttonId);
  return config?.label || buttonId;
};

/**
 * 获取按钮样式类
 * @param buttonId 按钮 ID
 */
const getButtonClass = (buttonId: string): string[] => {
  const classes: string[] = [];

  // 危险按钮样式（清除范围）
  if (buttonId === 'purge') {
    classes.push('acu-btn-danger');
  }

  // 切换按钮样式（固定面板）
  if (buttonId === 'pin') {
    classes.push('acu-btn-toggle');
    if (props.isPinned) {
      classes.push('active');
    }
  }

  // 保存按钮有更改时的样式
  if (buttonId === 'save' && props.hasChanges) {
    classes.push('has-changes');
  }

  return classes;
};

// ============================================================
// 长按检测
// ============================================================

let longPressTimer: ReturnType<typeof setTimeout> | null = null;
const isLongPress = ref(false);

/**
 * 开始长按计时
 * @param buttonId 按钮 ID
 */
const startLongPress = (buttonId: string) => {
  const config = getButtonConfig(buttonId);
  if (!config?.longPress) return;

  isLongPress.value = false;
  longPressTimer = setTimeout(() => {
    isLongPress.value = true;
    // 触发长按对应的事件
    emitAction(config.longPress!);
  }, 600);
};

/**
 * 结束长按计时
 */
const endLongPress = () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
};

// ============================================================
// 事件处理
// ============================================================

/**
 * 触发按钮动作事件
 * @param actionId 动作 ID
 */
const emitAction = (actionId: string) => {
  switch (actionId) {
    case 'save':
      emit('save');
      break;
    case 'saveAs':
      emit('saveAs');
      break;
    case 'refresh':
      emit('refresh');
      break;
    case 'manualUpdate':
      emit('manualUpdate');
      break;
    case 'purge':
      emit('purge');
      break;
    case 'pin':
      emit('pin');
      break;
    case 'toggle':
      emit('toggle');
      break;
    case 'settings':
      emit('settings');
      break;
    case 'openNative':
      emit('openNative');
      break;
    default:
      console.warn(`[ActionBar] 未知的动作 ID: ${actionId}`);
  }
};

/**
 * 处理按钮点击
 * @param buttonId 按钮 ID
 */
const handleClick = (buttonId: string) => {
  // 如果是长按触发，不执行点击
  if (isLongPress.value) {
    isLongPress.value = false;
    return;
  }

  emitAction(buttonId);
};
</script>

<style scoped lang="scss">
/* 样式已迁移至 styles/components/buttons.scss */
</style>
