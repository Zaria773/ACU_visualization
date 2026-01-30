<template>
  <div class="card-front">
    <!-- 纹理层 -->
    <div class="card-front__texture"></div>

    <!-- 内边框 -->
    <div class="card-front__border-outer"></div>
    <div class="card-front__border-inner"></div>

    <!-- 四角装饰 -->
    <CornerOrnament class="card-front__corner card-front__corner--tl" />
    <CornerOrnament class="card-front__corner card-front__corner--tr" />
    <CornerOrnament class="card-front__corner card-front__corner--bl" />
    <CornerOrnament class="card-front__corner card-front__corner--br" />

    <!-- 内容区 -->
    <div class="card-front__content">
      <!-- 顶部图标 -->
      <div class="card-front__top-icon">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
          />
          <path d="M20 3v4" />
          <path d="M22 5h-4" />
          <path d="M4 17v2" />
          <path d="M5 18H3" />
        </svg>
      </div>

      <!-- 运势名称 -->
      <h2 class="card-front__luck-name" :style="{ color: luckColor }">
        {{ luckName }}
      </h2>

      <!-- 维度展示区域 -->
      <div v-if="dimensions.length > 0" class="card-front__dimensions">
        <div
          v-for="(dimValue, idx) in dimensions"
          :key="idx"
          class="card-front__dimension-item"
        >
          {{ dimValue }}
        </div>
      </div>

      <!-- 关键词区域 -->
      <div class="card-front__keywords">
        <div
          v-for="(word, idx) in words"
          :key="idx"
          class="card-front__keyword"
        >
          <span class="card-front__keyword-line"></span>
          <span class="card-front__keyword-text">{{ word }}</span>
          <span class="card-front__keyword-line"></span>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import CornerOrnament from './CornerOrnament.vue';

interface Props {
  /** 运势名称 */
  luckName: string;
  /** 运势颜色 */
  luckColor?: string;
  /** 维度值列表 */
  dimensions?: string[];
  /** 关键词列表 */
  words: string[];
}

withDefaults(defineProps<Props>(), {
  luckColor: '#4A3728',
  dimensions: () => [],
});
</script>
