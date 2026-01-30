<template>
  <div v-if="visible" class="acu-modal-container" @click.self="handleClose">
    <div class="acu-modal acu-preset-save-modal">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">保存为预设</span>
        <button class="acu-close-pill" @click.stop="handleClose">完成</button>
      </div>

      <!-- 内容 -->
      <div class="acu-modal-body">
        <!-- 预设名称输入 -->
        <div class="acu-settings-group">
          <input
            ref="inputRef"
            v-model="presetName"
            type="text"
            class="acu-settings-input"
            placeholder="输入预设名称"
            @keyup.enter="handleSave"
          />
        </div>

        <!-- 重名警告 -->
        <div v-if="isDuplicate" class="acu-preset-warning">
          <i class="fas fa-exclamation-circle"></i>
          已存在同名预设，保存将覆盖原有配置
        </div>

        <!-- 保存内容摘要 -->
        <div v-if="summaryItems.length > 0" class="acu-preset-summary">
          <div class="acu-preset-summary-title">将保存以下配置：</div>
          <ul class="acu-preset-summary-list">
            <li v-for="(item, index) in summaryItems" :key="index">{{ item }}</li>
          </ul>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="acu-modal-footer">
        <button class="acu-modal-btn secondary" @click.stop="handleClose">取消</button>
        <button class="acu-modal-btn primary" :disabled="!canSave" @click.stop="handleSave">
          {{ isDuplicate ? '覆盖保存' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  visible: boolean;
  /** 预设类型 */
  presetType?: 'manual-update' | 'theme' | 'divination';
  /** 摘要信息列表 */
  summaryItems?: string[];
  /** 初始预设名称 */
  initialName?: string;
  /** 检查重名的函数 */
  checkDuplicate?: (name: string) => boolean;
}

const props = withDefaults(defineProps<Props>(), {
  presetType: 'manual-update',
  summaryItems: () => [],
  initialName: '',
  checkDuplicate: () => false,
});

const emit = defineEmits<{
  'update:visible': [value: boolean];
  save: [name: string];
}>();

// ============================================================
// State
// ============================================================

const inputRef = ref<HTMLInputElement | null>(null);
const presetName = ref('');

// ============================================================
// 计算属性
// ============================================================

/** 是否可以保存 */
const canSave = computed(() => presetName.value.trim().length > 0);

/** 是否重名 */
const isDuplicate = computed(() => {
  const name = presetName.value.trim();
  if (!name) return false;
  return props.checkDuplicate?.(name) ?? false;
});

// ============================================================
// 生命周期
// ============================================================

// 弹窗打开时初始化
watch(
  () => props.visible,
  visible => {
    if (visible) {
      presetName.value = props.initialName || '';
      // 聚焦输入框
      nextTick(() => {
        inputRef.value?.focus();
      });
    }
  },
  { immediate: true },
);

// ============================================================
// 事件处理
// ============================================================

function handleClose() {
  emit('update:visible', false);
}

function handleSave() {
  const name = presetName.value.trim();
  if (!name) return;

  emit('save', name);
  emit('update:visible', false);
}
</script>

<style scoped lang="scss">
/* 组件特定样式使用 scoped，因为是全局弹窗渲染在父窗口 */
</style>
