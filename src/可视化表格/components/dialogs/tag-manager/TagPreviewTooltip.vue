<!-- TagPreviewTooltip.vue - 标签预览浮窗（PC悬浮/移动端点按显示） -->
<!-- 不使用 Teleport，直接在弹窗内渲染，通过 position: fixed 定位 -->
<template>
  <div
    v-if="uiStore.tagPreviewTooltip.visible"
    class="acu-tag-preview-tooltip"
    :style="tooltipStyle"
  >
    {{ uiStore.tagPreviewTooltip.content }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useUIStore } from '../../../stores/useUIStore';

const uiStore = useUIStore();

// 计算浮窗位置样式
// 注意：不使用 inline transform，CSS 动画已经处理了 translate(-50%, -100%)
const tooltipStyle = computed(() => {
  const { x, y } = uiStore.tagPreviewTooltip;

  // 获取父窗口视口尺寸（跨 iframe 场景）
  const viewportWidth = window.parent?.innerWidth || window.innerWidth;

  // 预估浮窗宽度（最大300px）
  const estimatedWidth = 300;

  // 计算水平位置，防止超出边界
  let left = x;
  if (left + estimatedWidth / 2 > viewportWidth - 20) {
    left = viewportWidth - estimatedWidth / 2 - 20;
  }
  if (left - estimatedWidth / 2 < 20) {
    left = estimatedWidth / 2 + 20;
  }

  // 只返回 left/top，transform 由 CSS 控制
  return {
    left: `${left}px`,
    top: `${y - 10}px`, // 显示在触发点上方
  };
});
</script>
