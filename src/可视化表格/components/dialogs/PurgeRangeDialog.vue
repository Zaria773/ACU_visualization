<template>
  <div v-if="visible" class="acu-modal-container acu-purge-overlay" @click.self="handleCancel">
    <div ref="dialogRef" class="acu-modal acu-purge-range-modal">
      <!-- 标题区 -->
      <div class="acu-purge-title">清除数据范围</div>

      <!-- 内容区 -->
      <div class="acu-purge-content">
        <!-- 装饰图标 -->
        <div class="acu-purge-icon">
          <i class="fa-solid fa-eraser"></i>
        </div>

        <!-- 提示文字 -->
        <p class="acu-purge-hint">
          请输入要清除数据的楼层范围<br />
          <span class="acu-purge-hint-sub">(起始楼层 - 结束楼层)</span>
        </p>

        <!-- 范围输入 -->
        <div class="acu-purge-inputs">
          <input
            ref="startInputRef"
            v-model.number="startFloor"
            type="number"
            class="acu-purge-input"
            placeholder="Start"
            min="0"
            @keydown.enter="focusEndInput"
          />
          <span class="acu-purge-separator">-</span>
          <input
            ref="endInputRef"
            v-model.number="endFloor"
            type="number"
            class="acu-purge-input"
            placeholder="End"
            min="0"
            @keydown.enter="handleConfirm"
          />
        </div>
      </div>

      <!-- 按钮区 -->
      <div class="acu-purge-btns">
        <button class="acu-purge-btn acu-purge-btn-advanced" @click="handleOpenAdvanced">
          <i class="fas fa-cogs"></i>
          高级
        </button>
        <div class="acu-purge-btns-right">
          <button class="acu-purge-btn acu-purge-btn-cancel" @click="handleCancel">取消</button>
          <button class="acu-purge-btn acu-purge-btn-confirm" :disabled="!canConfirm" @click="handleConfirm">
            确认清除
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 高级清除弹窗 -->
  <AdvancedPurgeDialog
    v-model:visible="showAdvancedDialog"
    :initial-start-floor="startFloor ?? undefined"
    :initial-end-floor="endFloor ?? undefined"
    @confirm="handleAdvancedConfirm"
  />
</template>

<script setup lang="ts">
import { onClickOutside } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { toast } from '../../composables/useToast';
import AdvancedPurgeDialog from './AdvancedPurgeDialog.vue';

interface Props {
  visible: boolean;
  maxFloor?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxFloor: 999,
});

const emit = defineEmits<{
  'update:visible': [value: boolean];
  confirm: [startFloor: number, endFloor: number];
}>();

const dialogRef = ref<HTMLElement>();
const startInputRef = ref<HTMLInputElement>();
const endInputRef = ref<HTMLInputElement>();
const startFloor = ref<number | null>(null);
const endFloor = ref<number | null>(null);
const hasInputError = ref(false);
const showAdvancedDialog = ref(false);

/**
 * 计算默认清除楼层范围 (与原代码逻辑一致)
 * 策略：优先寻找最近的有数据痕迹的楼层，否则使用最后一楼
 */
function getDefaultFloorRange(): { start: number; end: number } {
  let ST = (window as any).SillyTavern || (window.parent ? (window.parent as any).SillyTavern : null);
  if (!ST && (window as any).top && (window as any).top.SillyTavern) {
    ST = (window as any).top.SillyTavern;
  }

  let targetIdx = -1;
  let lastIdx = 0;

  if (ST && ST.chat) {
    lastIdx = Math.max(0, ST.chat.length - 1);
    // 策略: 优先寻找最近的有真实数据的楼层（跳过空结构）
    for (let i = ST.chat.length - 1; i >= 0; i--) {
      const msg = ST.chat[i];
      if (!msg.is_user && msg.TavernDB_ACU_IsolatedData) {
        // 检查是否真的有数据（不是空结构）
        const tags = Object.keys(msg.TavernDB_ACU_IsolatedData);
        let hasRealData = false;
        for (const tag of tags) {
          const tagData = msg.TavernDB_ACU_IsolatedData[tag];
          if (tagData && tagData.independentData && Object.keys(tagData.independentData).length > 0) {
            hasRealData = true;
            break;
          }
        }
        if (hasRealData) {
          targetIdx = i;
          break;
        }
      }
    }
  }

  // 默认范围逻辑：找到有数据的楼层就用它，否则用最后一楼
  const defaultStart = targetIdx !== -1 ? targetIdx : lastIdx;
  const defaultEnd = targetIdx !== -1 ? targetIdx : lastIdx;

  return { start: defaultStart, end: defaultEnd };
}

// 验证是否可以确认
const canConfirm = computed(() => {
  if (startFloor.value === null || endFloor.value === null) return false;
  if (isNaN(startFloor.value) || isNaN(endFloor.value)) return false;
  if (startFloor.value < 0 || endFloor.value < 0) return false;
  if (startFloor.value > endFloor.value) return false;
  return true;
});

// 重置状态 - 当弹窗显示时，计算默认楼层范围
watch(
  () => props.visible,
  visible => {
    if (visible) {
      // 每次打开弹窗时，重新计算默认楼层范围
      const defaultRange = getDefaultFloorRange();
      startFloor.value = defaultRange.start;
      endFloor.value = defaultRange.end;
      hasInputError.value = false;
      // 注意：移除自动聚焦，避免移动端弹出键盘
    }
  },
);

// 点击外部关闭
onClickOutside(dialogRef, () => {
  handleCancel();
});

// 聚焦到结束楼层输入框
const focusEndInput = () => {
  endInputRef.value?.focus();
};

// 确认
const handleConfirm = () => {
  if (canConfirm.value && startFloor.value !== null && endFloor.value !== null) {
    emit('confirm', startFloor.value, endFloor.value);
    emit('update:visible', false);
  } else {
    // 显示错误效果
    hasInputError.value = true;
    setTimeout(() => {
      hasInputError.value = false;
    }, 500);
    toast.warning('请输入有效的楼层范围 (Start <= End)');
  }
};

// 取消
const handleCancel = () => {
  emit('update:visible', false);
};

// 打开高级清除弹窗
const handleOpenAdvanced = () => {
  showAdvancedDialog.value = true;
};

// 高级清除完成后的回调
const handleAdvancedConfirm = () => {
  // 高级清除完成后关闭当前弹窗
  emit('update:visible', false);
};
</script>
