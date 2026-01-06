<template>
  <Transition name="modal">
    <div v-if="visible" class="acu-modal-container" @click.self="handleCancel">
      <div ref="dialogRef" class="acu-modal acu-input-floor-modal">
        <!-- 头部 -->
        <div class="acu-modal-header">
          <h3>
            <i class="fas fa-layer-group"></i>
            指定保存楼层
          </h3>
          <button class="acu-modal-close" @click="handleCancel">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- 内容 -->
        <div class="acu-modal-body">
          <div class="floor-input-group">
            <p class="floor-hint">输入目标楼层索引。正数为从头开始计数，负数为倒数计数（-1 表示最后一楼）。</p>

            <input
              ref="inputRef"
              v-model.number="floorIndex"
              type="number"
              class="floor-input"
              placeholder="例如: 5 或 -1"
              @keydown.enter="handleConfirm"
              @keydown.escape="handleCancel"
            />

            <div v-if="currentFloorInfo" class="floor-info">
              <i class="fas fa-info-circle"></i>
              <span>当前自动目标楼层: {{ currentFloorInfo }}</span>
            </div>

            <div v-if="validationError" class="floor-error">
              <i class="fas fa-exclamation-circle"></i>
              <span>{{ validationError }}</span>
            </div>
          </div>
        </div>

        <!-- 底部 -->
        <div class="acu-modal-footer">
          <button class="acu-modal-btn secondary" @click="handleCancel">取消</button>
          <button class="acu-modal-btn primary" :disabled="!isValidFloor" @click="handleConfirm">
            <i class="fas fa-save"></i>
            保存到此楼层
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onClickOutside } from '@vueuse/core';
import { computed, nextTick, ref, watch } from 'vue';

interface Props {
  visible: boolean;
  currentFloorInfo?: string;
  maxFloor?: number;
}

const props = withDefaults(defineProps<Props>(), {
  currentFloorInfo: '',
  maxFloor: 999,
});

const emit = defineEmits<{
  'update:visible': [value: boolean];
  confirm: [floorIndex: number];
}>();

const dialogRef = ref<HTMLElement>();
const inputRef = ref<HTMLInputElement>();
const floorIndex = ref<number | null>(null);

// 验证楼层有效性
const isValidFloor = computed(() => {
  if (floorIndex.value === null || floorIndex.value === undefined) return false;
  const floor = floorIndex.value;
  // 楼层不能为 0
  return Number.isInteger(floor) && floor !== 0;
});

// 验证错误信息
const validationError = computed(() => {
  if (floorIndex.value === null || floorIndex.value === undefined) return '';
  if (floorIndex.value === 0) return '楼层索引不能为 0';
  if (!Number.isInteger(floorIndex.value)) return '请输入整数';
  if (Math.abs(floorIndex.value) > props.maxFloor) {
    return `楼层索引超出范围 (±${props.maxFloor})`;
  }
  return '';
});

// 显示时自动聚焦
watch(
  () => props.visible,
  visible => {
    if (visible) {
      floorIndex.value = null;
      nextTick(() => {
        inputRef.value?.focus();
      });
    }
  },
);

// 点击外部关闭
onClickOutside(dialogRef, () => {
  handleCancel();
});

// 确认
const handleConfirm = () => {
  if (isValidFloor.value && floorIndex.value !== null) {
    emit('confirm', floorIndex.value);
    emit('update:visible', false);
  }
};

// 取消
const handleCancel = () => {
  emit('update:visible', false);
};
</script>
