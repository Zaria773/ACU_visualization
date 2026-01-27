<template>
  <div class="card-back">
    <img :src="imageUrl" alt="Tarot Card Back" class="card-back__image" />
    <div class="card-back__overlay"></div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  /** 卡背图片 URL，默认使用神秘塔罗风格图片 */
  imageUrl?: string;
}

withDefaults(defineProps<Props>(), {
  imageUrl: 'https://i.postimg.cc/j2MPbGv3/IMG-1590.jpg',
});
</script>
