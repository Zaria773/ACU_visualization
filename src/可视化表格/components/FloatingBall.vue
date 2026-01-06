<template>
  <div ref="ballRef" class="acu-floating-ball-vue" :class="{ docked: isDocked }">
    <i v-if="!isDocked" class="fa-solid fa-layer-group"></i>
  </div>
</template>

<script setup lang="ts">
/**
 * FloatingBall.vue - 悬浮球组件
 * 手动实现拖拽（不使用 VueUse useDraggable）
 * 支持跨 iframe 场景（使用 window.parent 尺寸）
 *
 * 注意：跨 iframe + 生产构建场景下：
 * 1. VueUse useDraggable 完全失效 → 使用 jQuery $('body').on() 绑定拖拽事件
 * 2. v-show 和 :style 绑定是可用的
 * 3. 使用 Pinia store 直接调用避免 emit 潜在问题
 *
 * 参考实现：src/手机界面/index.vue 的拖拽逻辑
 */

import { useStorage } from '@vueuse/core';
import { onMounted, onUnmounted, ref, watchEffect } from 'vue';
import { useUIStore } from '../stores';
import type { BallPosition } from '../types';

// ============================================================
// Store 实例（直接调用，不使用 Vue emit）
// ============================================================

const uiStore = useUIStore();

/** 获取目标窗口尺寸（支持跨 iframe） */
function getTargetWindowSize() {
  const targetWindow = window.parent && window.parent !== window ? window.parent : window;
  return {
    width: targetWindow.innerWidth,
    height: targetWindow.innerHeight,
  };
}

/** 验证位置是否在屏幕内，如果不在则修正 */
function validateAndFixPosition(pos: BallPosition): BallPosition {
  const { width: winWidth, height: winHeight } = getTargetWindowSize();
  const ballSize = 50; // 悬浮球尺寸
  const padding = 10; // 边缘间距

  let { x, y } = pos;

  // 边界检查 - 参考原代码 6.4.1.ts 第 143-150 行
  if (x > winWidth - ballSize) x = winWidth - ballSize - padding;
  if (y > winHeight - ballSize) y = winHeight - ballSize - padding;
  if (x < 0) x = padding;
  if (y < 0) y = padding;

  return { x, y };
}

/** 获取默认位置 */
function getDefaultPosition(): BallPosition {
  const { height: winHeight } = getTargetWindowSize();
  return {
    x: 20,
    y: winHeight - 150,
  };
}

// ============================================================
// 状态
// ============================================================

const ballRef = ref<HTMLElement>();

/** 持久化的悬浮球位置（使用 acu_ 前缀） */
const savedPosition = useStorage<BallPosition>('acu_float_ball_pos', getDefaultPosition());

/** 当前位置 */
const x = ref(savedPosition.value.x);
const y = ref(savedPosition.value.y);

/** 拖拽状态 */
const isDragging = ref(false);
const wasDragging = ref(false);

/** 停靠状态 */
const isDocked = ref(false);

/** 点击计时器 (用于区分单击/双击) */
let clickTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================================
// 跨 iframe 生产构建修复：直接 DOM 操作
// 问题：Vue 3 响应式绑定 (:style) 在生产构建 + 跨 iframe 场景下失效
// 解决：使用 watchEffect 直接操作 DOM 元素的 style 属性
// ============================================================

watchEffect(() => {
  if (ballRef.value) {
    ballRef.value.style.left = `${x.value}px`;
    ballRef.value.style.top = `${y.value}px`;
    ballRef.value.style.cursor = isDragging.value ? 'grabbing' : 'grab';
  }
});

// ============================================================
// 手动拖拽实现（使用 jQuery $('body').on() 绑定到父窗口）
// 参考：src/手机界面/index.vue 的成功实现
// 关键：脚本项目中 $ 已指向 window.parent.$，所以 $('body') 会选中父窗口的 body
// ============================================================

function handlePointerDown(e: PointerEvent) {
  // 只响应左键
  if (e.button !== 0) return;

  e.preventDefault();
  e.stopPropagation();

  const el = ballRef.value;
  if (!el) return;

  // 记录初始位置
  const startX = e.clientX;
  const startY = e.clientY;
  const initialLeft = x.value;
  const initialTop = y.value;

  isDragging.value = true;
  wasDragging.value = false;

  // 拖拽阈值检测
  let hasMoved = false;

  const handlePointerMove = (moveE: JQuery.TriggeredEvent) => {
    const originalEvent = moveE.originalEvent as PointerEvent;
    const dx = originalEvent.clientX - startX;
    const dy = originalEvent.clientY - startY;

    // 超过 3px 才算移动
    if (!hasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      hasMoved = true;
      wasDragging.value = true;
    }

    if (hasMoved) {
      moveE.preventDefault();

      // 计算新位置
      let newX = initialLeft + dx;
      let newY = initialTop + dy;

      // 边界限制
      const { width: winWidth, height: winHeight } = getTargetWindowSize();
      const ballSize = 50;
      const padding = 10;

      if (newX < padding) newX = padding;
      if (newX > winWidth - ballSize - padding) newX = winWidth - ballSize - padding;
      if (newY < padding) newY = padding;
      if (newY > winHeight - ballSize - padding) newY = winHeight - ballSize - padding;

      x.value = newX;
      y.value = newY;
    }
  };

  const handlePointerUp = () => {
    isDragging.value = false;

    // 使用 jQuery 移除事件（关键！$('body') 指向父窗口的 body）
    $('body').off('pointermove', handlePointerMove);
    $('body').off('pointerup', handlePointerUp);

    // 如果发生了拖拽，保存位置
    if (wasDragging.value) {
      savedPosition.value = { x: x.value, y: y.value };
      console.info('[ACU FloatingBall] 位置已保存:', x.value, y.value);
    }
  };

  // 使用 jQuery 绑定到父窗口 body（关键！脚本项目中 $ 已指向 window.parent.$）
  $('body').on('pointermove', handlePointerMove);
  $('body').on('pointerup', handlePointerUp);
}

function handleClick(e: MouseEvent) {
  // 如果刚刚拖拽结束，忽略这次点击
  if (wasDragging.value) {
    wasDragging.value = false;
    e.stopPropagation();
    return;
  }

  // 停靠状态点击恢复
  if (isDocked.value) {
    isDocked.value = false;
    e.stopPropagation();
    return;
  }

  // 区分单击/双击
  if (clickTimer) {
    // 双击 - 进入停靠模式
    clearTimeout(clickTimer);
    clickTimer = null;
    isDocked.value = true;
    // 直接调用 store，不使用 emit（跨 iframe 生产构建 emit 可能失效）
    console.info('[ACU FloatingBall] 双击 - 进入停靠模式');
  } else {
    // 可能是单击，等待确认
    clickTimer = setTimeout(() => {
      clickTimer = null;
      // 直接调用 store 打开面板，不使用 emit
      uiStore.openPanel();
      console.info('[ACU FloatingBall] 单击 - 打开面板');
    }, 250);
  }
}

// ============================================================
// 生命周期 - 初始化和事件绑定
// ============================================================

onMounted(() => {
  const el = ballRef.value;
  if (!el) {
    console.error('[ACU FloatingBall] ballRef 未绑定到 DOM');
    return;
  }

  // 验证保存的位置是否在屏幕内
  const validatedPos = validateAndFixPosition(savedPosition.value);
  if (validatedPos.x !== savedPosition.value.x || validatedPos.y !== savedPosition.value.y) {
    console.info('[ACU FloatingBall] 位置越界，已自动修正:', savedPosition.value, '->', validatedPos);
    savedPosition.value = validatedPos;
  }
  x.value = validatedPos.x;
  y.value = validatedPos.y;

  // 手动绑定 pointerdown 事件（关键！不通过 Vue 模板绑定）
  el.addEventListener('pointerdown', handlePointerDown);
  el.addEventListener('click', handleClick);

  console.info('[ACU FloatingBall] 事件已绑定');
});

// 监听窗口 resize，重新检查位置
const handleResize = () => {
  const validatedPos = validateAndFixPosition({ x: x.value, y: y.value });

  if (validatedPos.x !== x.value || validatedPos.y !== y.value) {
    x.value = validatedPos.x;
    y.value = validatedPos.y;
    savedPosition.value = validatedPos;
    console.info('[ACU FloatingBall] 窗口大小变化，位置已调整');
  }
};

onMounted(() => {
  const targetWindow = window.parent ?? window;
  targetWindow.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  // 清理定时器
  if (clickTimer) {
    clearTimeout(clickTimer);
  }

  // 移除事件监听
  const el = ballRef.value;
  if (el) {
    el.removeEventListener('pointerdown', handlePointerDown);
    el.removeEventListener('click', handleClick);
  }

  const targetWindow = window.parent ?? window;
  targetWindow.removeEventListener('resize', handleResize);
});

// ============================================================
// 暴露方法
// ============================================================

defineExpose({
  /** 重置位置到默认 */
  resetPosition: () => {
    const defaultY = (window.parent?.innerHeight ?? window.innerHeight) - 150;
    x.value = 20;
    y.value = defaultY;
    savedPosition.value = { x: x.value, y: y.value };
  },
  /** 设置停靠状态 */
  setDocked: (docked: boolean) => {
    isDocked.value = docked;
  },
});
</script>

<!-- 样式已迁移至 styles/components/floating-ball.scss -->
