<template>
  <div
    ref="ballRef"
    class="acu-floating-ball-vue"
    :class="ballClasses"
    :style="ballStyle"
    :title="hasIntegrityIssues ? issueTooltip : '点击打开面板'"
    @click="handleClick"
  >
    <!-- 图标内容 - 根据类型动态渲染 -->
    <template v-if="!isDocked">
      <!-- FontAwesome 图标 -->
      <i v-if="appearance.type === 'icon'" :class="['fa-solid', appearance.content]"></i>
      <!-- Emoji -->
      <span v-else-if="appearance.type === 'emoji'" class="ball-emoji">{{ appearance.content }}</span>
      <!-- 图片 - 使用 div + background-image 支持裁剪参数 -->
      <div
        v-else-if="appearance.type === 'image' && appearance.content"
        class="ball-image"
        :class="{ 'ball-image-invert': appearance.imageInvert }"
        :style="imageStyle"
      ></div>
    </template>
    <!-- 问题徽章 -->
    <span v-if="hasIntegrityIssues && !isDocked" class="acu-issue-badge">!</span>
  </div>
</template>

<script setup lang="ts">
/**
 * FloatingBall.vue - 悬浮球组件
 * 使用 VueUse useDraggableWithSnap 实现拖拽
 * 支持跨 iframe 场景（使用 window.parent 尺寸）
 * 支持自定义外观和 AI 填表通知动画
 */

import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useDraggableWithSnap, useParentEventListener } from '../composables';
import { useBallAppearanceStore, useDataStore, useUIStore } from '../stores';
import type { BallPosition } from '../types';
import { hexToRgba } from '../utils';

// ============================================================
// Store 实例
// ============================================================

const uiStore = useUIStore();
const dataStore = useDataStore();
const ballAppearanceStore = useBallAppearanceStore();

// ============================================================
// 完整性检测状态
// ============================================================

/** 是否有完整性问题 */
const hasIntegrityIssues = computed(() => dataStore.hasIntegrityIssues);

/** 问题提示文本 */
const issueTooltip = computed(() => {
  if (!hasIntegrityIssues.value) return '';
  return dataStore.getIntegritySummary();
});

// ============================================================
// 悬浮球外观配置
// ============================================================

/** 外观配置 */
const appearance = computed(() => ballAppearanceStore.appearance);

/** 图片样式（应用裁剪参数） */
const imageStyle = computed(() => {
  const app = appearance.value;
  if (app.type !== 'image' || !app.content) return {};
  return {
    backgroundImage: `url('${app.content}')`,
    backgroundPosition: `${app.imageOffsetX ?? 50}% ${app.imageOffsetY ?? 50}%`,
    backgroundSize: `${app.imageScale ?? 150}%`,
    backgroundRepeat: 'no-repeat',
  };
});

/** AI 填表通知状态 */
const isAiNotifying = ref(false);

/** 通知动画计时器 */
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 触发 AI 填表通知动画
 * @param duration 动画持续时间（毫秒），默认 3000
 */
function triggerAiNotify(duration = 3000) {
  if (notifyTimer) {
    clearTimeout(notifyTimer);
  }
  isAiNotifying.value = true;
  notifyTimer = setTimeout(() => {
    isAiNotifying.value = false;
    notifyTimer = null;
  }, duration);
}

/** 计算的 class 列表 */
const ballClasses = computed(() => ({
  docked: isDocked.value,
  'has-issues': hasIntegrityIssues.value,
  'ai-notify': isAiNotifying.value,
  'anim-ripple': isAiNotifying.value && appearance.value.notifyAnimation === 'ripple',
  'anim-arc': isAiNotifying.value && appearance.value.notifyAnimation === 'arc',
}));

/** 计算的样式（含 CSS 变量和位置） */
const ballStyle = computed(() => {
  const app = appearance.value;
  return {
    '--ball-size': `${app.size}px`,
    '--ball-border-color': app.borderColor,
    '--ball-border-color-rgba': hexToRgba(app.borderColor, app.borderOpacity),
    '--ball-bg-color': hexToRgba(app.bgColor, app.bgOpacity),
    ...positionStyle.value,
  };
});

// ============================================================
// 辅助函数
// ============================================================

/** 获取目标窗口尺寸（支持跨 iframe） */
function getTargetWindowSize() {
  const targetWindow = window.parent && window.parent !== window ? window.parent : window;
  return {
    width: targetWindow.innerWidth,
    height: targetWindow.innerHeight,
  };
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

/** 停靠状态 */
const isDocked = ref(false);

/** 点击计时器 (用于区分单击/双击) */
let clickTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================================
// 使用 VueUse 封装的拖拽功能
// ============================================================

const defaultPos = getDefaultPosition();
const {
  x,
  y,
  style: positionStyle,
  isDragging,
  wasDragging,
} = useDraggableWithSnap(ballRef, {
  initialX: defaultPos.x,
  initialY: defaultPos.y,
  edgePadding: 10,
  elementWidth: computed(() => appearance.value.size).value,
  useParentWindow: true,
  onPositionChange: (newX, newY) => {
    console.info('[ACU FloatingBall] 位置已保存:', newX, newY);
  },
});

// ============================================================
// 点击处理（区分单击/双击）
// ============================================================

function handleClick(e: MouseEvent) {
  console.log('[ACU FloatingBall] handleClick, wasDragging:', wasDragging.value, 'isDragging:', isDragging.value);

  // 如果刚刚拖拽结束，忽略这次点击
  if (wasDragging.value) {
    wasDragging.value = false;
    e.stopPropagation();
    console.log('[ACU FloatingBall] 忽略拖拽后的点击');
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
    console.info('[ACU FloatingBall] 双击 - 进入停靠模式');
  } else {
    // 可能是单击，等待确认
    clickTimer = setTimeout(() => {
      clickTimer = null;
      uiStore.openPanel();
      console.info('[ACU FloatingBall] 单击 - 打开面板');
    }, 250);
  }
}

// ============================================================
// 窗口 resize 处理
// ============================================================

useParentEventListener('resize', () => {
  const { width: winWidth, height: winHeight } = getTargetWindowSize();
  const ballSize = appearance.value.size;
  const padding = 10;

  let needUpdate = false;

  // 边界检查
  if (x.value > winWidth - ballSize - padding) {
    x.value = winWidth - ballSize - padding;
    needUpdate = true;
  }
  if (y.value > winHeight - ballSize - padding) {
    y.value = winHeight - ballSize - padding;
    needUpdate = true;
  }
  if (x.value < padding) {
    x.value = padding;
    needUpdate = true;
  }
  if (y.value < padding) {
    y.value = padding;
    needUpdate = true;
  }

  if (needUpdate) {
    console.info('[ACU FloatingBall] 窗口大小变化，位置已调整');
  }
});

// ============================================================
// 生命周期
// ============================================================

onMounted(() => {
  // 从全局变量加载外观配置
  ballAppearanceStore.loadFromGlobalVariables();
});

onUnmounted(() => {
  if (clickTimer) {
    clearTimeout(clickTimer);
  }
  if (notifyTimer) {
    clearTimeout(notifyTimer);
  }
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
  },
  /** 设置停靠状态 */
  setDocked: (docked: boolean) => {
    isDocked.value = docked;
  },
  /** 触发 AI 填表通知动画 */
  triggerAiNotify,
  /** 获取当前外观配置 */
  getAppearance: () => appearance.value,
});
</script>

<!-- 样式已迁移至 styles/components/floating-ball.scss -->
