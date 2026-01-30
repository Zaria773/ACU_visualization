/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * useToast - 自定义 Toast 通知 Composable
 *
 * 解决系统 toastr 被高 z-index 面板遮挡的问题
 * 提供统一的通知接口
 */

import { ref } from 'vue';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
  timer: ReturnType<typeof setTimeout> | null;
}

const state = ref<ToastState>({
  visible: false,
  message: '',
  type: 'info',
  timer: null,
});

/**
 * 显示 Toast 通知
 * @param message 消息内容
 * @param type 通知类型
 * @param duration 显示时长 (毫秒)
 */
function show(message: string, type: ToastType = 'info', duration = 3000): void {
  // 清除之前的定时器
  if (state.value.timer) {
    clearTimeout(state.value.timer);
  }

  // 设置新的通知
  state.value.visible = true;
  state.value.message = message;
  state.value.type = type;

  // 设置自动隐藏
  state.value.timer = setTimeout(() => {
    state.value.visible = false;
    state.value.timer = null;
  }, duration);
}

/**
 * 隐藏 Toast
 */
function hide(): void {
  if (state.value.timer) {
    clearTimeout(state.value.timer);
  }
  state.value.visible = false;
  state.value.timer = null;
}

/**
 * 便捷方法
 */
function success(message: string, duration = 3000): void {
  show(message, 'success', duration);
}

function error(message: string, duration = 4000): void {
  show(message, 'error', duration);
}

function warning(message: string, duration = 3500): void {
  show(message, 'warning', duration);
}

function info(message: string, duration = 3000): void {
  show(message, 'info', duration);
}

export function useToast() {
  return {
    state,
    show,
    hide,
    success,
    error,
    warning,
    info,
  };
}

// 导出单例，供非组件代码使用（如 composables）
export const toast = {
  show,
  hide,
  success,
  error,
  warning,
  info,
};
