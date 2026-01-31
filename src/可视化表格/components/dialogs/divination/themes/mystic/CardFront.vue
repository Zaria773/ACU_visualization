<template>
  <div class="mystic-card-front">
    <!-- 基础纹理/渐变 -->
    <div class="mystic-card-front__texture"></div>

    <!-- 双层金边 -->
    <div class="mystic-card-front__border-outer"></div>
    <div class="mystic-card-front__border-inner"></div>

    <!-- Art Nouveau 风格四角装饰 -->
    <div class="mystic-card-front__corner mystic-card-front__corner--tl"></div>
    <div class="mystic-card-front__corner mystic-card-front__corner--tr"></div>
    <div class="mystic-card-front__corner mystic-card-front__corner--bl"></div>
    <div class="mystic-card-front__corner mystic-card-front__corner--br"></div>

    <!-- 中心光晕 -->
    <div class="mystic-card-front__glow"></div>

    <!-- 内容区 -->
    <div class="mystic-card-front__content">
      <!-- 顶部星星装饰 -->
      <div class="mystic-card-front__top-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
        </svg>
      </div>

      <!-- 加载状态 -->
      <template v-if="loading">
        <div class="mystic-card-front__loading">
          <div class="mystic-card-front__spinner"></div>
          <p class="mystic-card-front__loading-text">命运显现中...</p>
        </div>
      </template>

      <!-- 内容 -->
      <template v-else>
        <!-- 运势标题 -->
        <div class="mystic-card-front__title">
          <h2 class="mystic-card-front__luck-name">{{ displayLuckName }}</h2>
          <div class="mystic-card-front__divider"></div>
        </div>

        <!-- 维度标签 -->
        <div v-if="!peepMode && dimensions.length > 0" class="mystic-card-front__dimensions">
          <span v-for="(dimValue, idx) in dimensions" :key="idx" class="mystic-card-front__dimension-tag">
            {{ dimValue }}
          </span>
        </div>
        <div v-else-if="peepMode && dimensions.length > 0" class="mystic-card-front__dimensions">
          <span v-for="(dimValue, idx) in dimensions" :key="idx" class="mystic-card-front__dimension-tag">
            ???
          </span>
        </div>

        <!-- 主信息区 -->
        <div class="mystic-card-front__message-box">
          <template v-if="displayWords.length > 0">
            <div class="mystic-card-front__word-list">
              <div v-for="(word, idx) in displayWords" :key="idx" class="mystic-card-front__word-item">
                {{ word }}
              </div>
            </div>
          </template>
        </div>
      </template>

      <!-- 底部装饰 -->
      <div class="mystic-card-front__bottom-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  /** 运势名称 */
  luckName: string;
  /** 运势颜色（当前主题未使用，保留接口兼容） */
  luckColor?: string;
  /** 维度值列表 */
  dimensions?: string[];
  /** 关键词列表 */
  words: string[];
  /** 是否加载中 */
  loading?: boolean;
  /** 偷看模式 */
  peepMode?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  luckColor: '#ffd700',
  dimensions: () => [],
  loading: false,
  peepMode: false,
});

import { computed } from 'vue';

// 运势名称显示逻辑
const displayLuckName = computed(() => {
  if (!props.peepMode) return props.luckName;
  return '???';
});

// 遮罩算法
function maskText(text: string): string {
  if (!text) return '';
  // 60% 概率遮罩
  return text
    .split('')
    .map(char => {
      // 保留标点符号
      if (/[\p{P}\s]/u.test(char)) return char;
      return Math.random() < 0.6 ? '...' : char;
    })
    .join('');
}

// 关键词显示逻辑
const displayWords = computed(() => {
  if (!props.peepMode) return props.words;
  return props.words.map(maskText);
});
</script>
