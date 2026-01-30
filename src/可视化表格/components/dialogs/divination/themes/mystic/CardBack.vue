<template>
  <div class="mystic-card-back">
    <img
      :src="displayUrl"
      alt="Mystic Tarot Card Back"
      class="mystic-card-back__image"
      @load="handleImageLoad"
      @error="handleImageError"
    />
    <!-- 光泽遮罩 -->
    <div class="mystic-card-back__sheen"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  /** 卡背图片 URL，默认使用神秘塔罗风格图片 */
  imageUrl?: string;
}

const props = withDefaults(defineProps<Props>(), {
  imageUrl: '',
});

const emit = defineEmits<{
  (e: 'load', aspectRatio: number): void;
}>();

// 神秘塔罗默认卡背
const DEFAULT_IMAGE = 'https://i.postimg.cc/rmY9D1fL/wei-xin-tu-pian-20260121220508-79-297.jpg';

// 计算实际显示的 URL：如果传入为空，则使用默认图
const displayUrl = computed(() => {
  return props.imageUrl && props.imageUrl.trim() !== '' ? props.imageUrl : DEFAULT_IMAGE;
});

function handleImageLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  if (img.naturalWidth && img.naturalHeight) {
    const ratio = img.naturalWidth / img.naturalHeight;
    emit('load', ratio);
  }
}

function handleImageError(e: Event) {
  // 图片加载失败时回退到默认图（如果当前不是默认图）
  const img = e.target as HTMLImageElement;
  if (img.src !== DEFAULT_IMAGE) {
    img.src = DEFAULT_IMAGE;
  }
}
</script>
