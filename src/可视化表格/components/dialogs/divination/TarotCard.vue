<template>
  <div
    class="tarot-card"
    :class="{ 'tarot-card--flipped': isFlipped }"
    @click.stop="handleClick"
  >
    <div class="tarot-card__inner">
      <!-- 卡背（初始显示） -->
      <div class="tarot-card__face tarot-card__back">
        <CardBack :image-url="cardBackImage" />
      </div>

      <!-- 卡面（翻转后显示） -->
      <div class="tarot-card__face tarot-card__front">
        <CardFront
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
import { computed } from 'vue';
import CardBack from './CardBack.vue';
import CardFront from './CardFront.vue';
// 导入全局类型，因为 result 来自 store
import type { DivinationResult } from '../../../types';
// 导入局部显示类型
import type { CardDisplayData } from './types';

interface Props {
  /** 是否已翻转 */
  isFlipped: boolean;
  /** 抽签结果数据 (全局结构) */
  result: DivinationResult | null;
  /** 卡背图片 URL */
  cardBackImage?: string;
}

const props = withDefaults(defineProps<Props>(), {
  cardBackImage: 'https://i.postimg.cc/j2MPbGv3/IMG-1590.jpg',
});

const emit = defineEmits<{
  (e: 'flip'): void;
  (e: 'confirm'): void;
}>();

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
