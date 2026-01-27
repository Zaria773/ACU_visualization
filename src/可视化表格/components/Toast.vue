<template>
  <Transition name="toast">
    <div v-if="visible" class="acu-toast">
      <i class="fas fa-info-circle"></i>
      <span class="acu-toast-message">{{ message }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
interface Props {
  visible: boolean;
  message: string;
}

defineProps<Props>();
</script>
