<!-- eslint-disable @typescript-eslint/ban-ts-comment -->
<!-- @ts-nocheck -->
<template>
  <div
    class="tarot-card"
    :class="[
      `tarot-card--theme-${themeId}`,
      { 'tarot-card--flipped': isFlipped }
    ]"
    :style="cardStyle"
    @click.stop="handleClick"
  >
    <div class="tarot-card__inner">
      <!-- 卡背（初始显示） -->
      <div class="tarot-card__face tarot-card__back">
        <component
          :is="theme.CardBack"
          :image-url="effectiveBackImage"
          @load="handleCardBackLoad"
        />
      </div>

      <!-- 卡面（翻转后显示） -->
      <div class="tarot-card__face tarot-card__front">
        <component
          :is="theme.CardFront"
          v-if="displayData"
          :luck-name="displayData.luckName"
          :luck-color="displayData.luckColor"
          :dimensions="displayData.dimensions"
          :words="displayData.words"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { getTheme } from './themes';
// 导入全局类型，因为 result 来自 store
import type { DivinationResult } from '../../../types';
// 导入局部显示类型
import type { CardDisplayData } from './types';

interface Props {
  /** 主题 ID */
  themeId?: string;
  /** 是否已翻转 */
  isFlipped: boolean;
  /** 抽签结果数据 (全局结构) */
  result: DivinationResult | null;
  /** 卡背图片 URL（优先级高于主题默认） */
  cardBackImage?: string;
}

const props = withDefaults(defineProps<Props>(), {
  themeId: 'wafuku',
  cardBackImage: '',
});

const emit = defineEmits<{
  (e: 'flip'): void;
  (e: 'confirm'): void;
}>();

// 获取当前主题
const theme = computed(() => getTheme(props.themeId));

// 计算实际使用的卡背图
const effectiveBackImage = computed(() => {
  return props.cardBackImage || theme.value.defaultBackImage || '';
});

// 卡片宽高比，默认 220/385 (~0.57)
const aspectRatio = ref(220 / 385);

// 动态计算卡片样式
const cardStyle = computed(() => {
  return {
    aspectRatio: `${aspectRatio.value}`,
  };
});

function handleCardBackLoad(ratio: number) {
  // 限制宽高比范围，防止过长或过宽
  // 范围：0.5 (2:1) 到 1.0 (1:1)
  const clampedRatio = Math.max(0.5, Math.min(1.0, ratio));
  aspectRatio.value = clampedRatio;
}

// 将全局 Result 转换为 CardFront 所需的 DisplayData
const displayData = computed<CardDisplayData | null>(() => {
  if (!props.result) return null;

  return {
    luckName: props.result.luck.name,
    luckColor: props.result.luck.color,
    // 提取维度值：store 返回的是 { name, value } 结构
    dimensions: props.result.dimensions.map(d => d.value),
    words: props.result.words,
  };
});

function handleClick() {
  if (!props.isFlipped) {
    emit('flip');
  } else {
    emit('confirm');
  }
}
</script>
