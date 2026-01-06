<template>
  <Transition name="toast">
    <div v-if="visible" class="acu-toast" :class="typeClass">
      <i :class="iconClass"></i>
      <span class="acu-toast-message">{{ message }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  visible: boolean;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
});

const typeClass = computed(() => `acu-toast-${props.type}`);

const iconClass = computed(() => {
  switch (props.type) {
    case 'success':
      return 'fas fa-check-circle';
    case 'error':
      return 'fas fa-times-circle';
    case 'warning':
      return 'fas fa-exclamation-triangle';
    case 'info':
    default:
      return 'fas fa-info-circle';
  }
});
</script>
