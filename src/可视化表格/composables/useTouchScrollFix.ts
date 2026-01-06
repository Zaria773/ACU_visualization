/**
 * useTouchScrollFix.ts - 横向布局触摸滚动修复
 *
 * 【核弹级防穿透 v2】智能识别长卡片滚动
 * 在父窗口 document 上监听触摸事件，解决横向布局卡片内滑动问题
 *
 * 原版参考：6.4.1.ts:4489-4544
 */

import { onMounted, onUnmounted, ref } from 'vue';

/**
 * 触摸滚动修复 Composable
 *
 * 功能：
 * - 在横向布局模式下，阻止纵向滑动导致的父容器滚动
 * - 智能检测可滚动区域，放行卡片内部纵向滚动
 * - 横向滑动不阻止，让父容器可以横向滚动
 *
 * 随 Vue 组件生命周期自动管理事件监听器
 */
export function useTouchScrollFix() {
  // 触摸起始坐标
  const startX = ref(0);
  const startY = ref(0);

  // 事件监听器引用（用于清理）
  let touchStartHandler: ((e: TouchEvent) => void) | null = null;
  let touchMoveHandler: ((e: TouchEvent) => void) | null = null;

  /**
   * touchstart 事件处理
   * 记录触摸起始坐标
   */
  function handleTouchStart(e: TouchEvent) {
    const target = e.target as HTMLElement;

    // 只处理横向布局面板内的触摸
    if (!target.closest?.('.acu-layout-horizontal .acu-panel-content')) {
      return;
    }

    const touch = e.touches[0];
    startX.value = touch.clientX;
    startY.value = touch.clientY;
  }

  /**
   * touchmove 事件处理
   * 智能判断是否阻止默认滚动行为
   */
  function handleTouchMove(e: TouchEvent) {
    const target = e.target as HTMLElement;

    // 只处理横向布局面板内的触摸
    if (!target.closest?.('.acu-layout-horizontal .acu-panel-content')) {
      return;
    }

    // 可编辑元素直接放行
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target as HTMLElement).isContentEditable) {
      return;
    }

    // 向上遍历检测是否有可滚动区域
    // 原版逻辑：只要发现可滚动区域就直接放行，不做边界检测
    let node: HTMLElement | null = target;
    let shouldAllowScroll = false;

    while (node && node.classList && !node.classList.contains('acu-panel-content')) {
      // 检测元素是否有纵向滚动能力
      if (node.scrollHeight > node.clientHeight) {
        const style = window.getComputedStyle(node);
        if (['auto', 'scroll'].includes(style.overflowY)) {
          // 发现可滚动区域，直接放行
          shouldAllowScroll = true;
          break;
        }
      }
      node = node.parentElement;
    }

    // 如果有可滚动区域，放行内部滚动
    if (shouldAllowScroll) {
      return;
    }

    // 计算滑动方向
    const touch = e.touches[0];
    const dx = touch.clientX - startX.value;
    const dy = touch.clientY - startY.value;

    // 只有纵向滑动才阻止默认行为（阻止父容器滚动）
    // 横向滑动不阻止，让父容器可以横向滚动
    if (Math.abs(dy) > Math.abs(dx)) {
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  }

  /**
   * 安装触摸事件监听器
   */
  function install() {
    const pDoc = window.parent?.document;
    if (!pDoc) {
      console.warn('[ACU] 无法访问父窗口 document，触摸滚动修复未安装');
      return;
    }

    // 创建事件处理函数
    touchStartHandler = handleTouchStart;
    touchMoveHandler = handleTouchMove;

    // 使用 capture: true 确保在冒泡前捕获事件
    // 使用 passive: false 允许 preventDefault
    pDoc.addEventListener('touchstart', touchStartHandler, { capture: true, passive: false });
    pDoc.addEventListener('touchmove', touchMoveHandler, { capture: true, passive: false });

    console.info('[ACU] 触摸滚动修复已安装（composable 管理）');
  }

  /**
   * 卸载触摸事件监听器
   */
  function uninstall() {
    const pDoc = window.parent?.document;
    if (!pDoc) return;

    if (touchStartHandler) {
      pDoc.removeEventListener('touchstart', touchStartHandler, { capture: true } as EventListenerOptions);
      touchStartHandler = null;
    }

    if (touchMoveHandler) {
      pDoc.removeEventListener('touchmove', touchMoveHandler, { capture: true } as EventListenerOptions);
      touchMoveHandler = null;
    }

    console.info('[ACU] 触摸滚动修复已卸载');
  }

  // 生命周期挂载
  onMounted(() => {
    install();
  });

  onUnmounted(() => {
    uninstall();
  });

  // 返回手动控制接口（一般不需要使用）
  return {
    install,
    uninstall,
  };
}
