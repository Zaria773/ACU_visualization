<template>
  <div v-if="visible" class="acu-node-config-overlay" @click.self="handleClose">
    <div class="acu-node-config-panel">
      <div class="acu-node-config-header">
        <span>选择显示的字符</span>
        <button class="acu-close-btn" @click.stop="handleClose">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="acu-node-config-body">
        <p class="acu-node-fullname">全名：{{ fullName }}</p>
        <p class="acu-node-hint">点击选择要显示的字符（可多选）</p>
        <div class="acu-char-selector">
          <button
            v-for="(char, index) in displayChars"
            :key="index"
            class="acu-char-btn"
            :class="{ active: selectedIndices.has(index) }"
            @click.stop="toggleCharSelection(index)"
          >
            {{ char }}
          </button>
        </div>
        <p class="acu-node-preview">预览：{{ previewLabel }}</p>
        <div class="acu-node-config-actions">
          <button class="acu-action-btn secondary" @click.stop="resetToFullName">显示全名</button>
          <button class="acu-action-btn primary" @click.stop="applyAndClose">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * NodeLabelDialog.vue - 节点标签选择弹窗
 *
 * 功能：
 * - 支持中英文名称的字符选择
 * - 中文名按字符分割，英文名按单词分割
 * - 多选支持
 * - 可复用于关系图和头像管理
 */

import { computed, ref, watch } from 'vue';

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  /** 是否显示 */
  visible: boolean;
  /** 节点全名 */
  fullName: string;
  /** 初始选中的索引 */
  initialIndices?: number[];
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  fullName: '',
  initialIndices: () => [],
});

const emit = defineEmits<{
  /** 关闭弹窗 */
  (e: 'close'): void;
  /** 应用选择 */
  (e: 'apply', data: { displayLabel: string; selectedIndices: number[] }): void;
  /** 重置为全名 */
  (e: 'reset'): void;
}>();

// ============================================================
// 状态
// ============================================================

/** 当前选中的索引集合 */
const selectedIndices = ref<Set<number>>(new Set());

// ============================================================
// 辅助函数
// ============================================================

/**
 * 检测是否为英文名（包含空格且主要是英文字符）
 */
function isEnglishName(name: string): boolean {
  return /^[A-Za-z\s'-]+$/.test(name) && name.includes(' ');
}

/**
 * 获取显示的字符数组
 * - 英文名按单词分割
 * - 中文名按字符分割
 */
function getDisplayCharsFromName(fullName: string): string[] {
  if (!fullName) return [];
  if (isEnglishName(fullName)) {
    return fullName.split(' ').filter(Boolean);
  }
  return fullName.split('');
}

/**
 * 获取默认选中的索引
 */
function getDefaultIndicesFromName(fullName: string): number[] {
  const chars = getDisplayCharsFromName(fullName);
  if (isEnglishName(fullName)) {
    // 英文名：默认选中第一个单词
    return [0];
  }
  // 中文名：默认选中最后一个字
  return chars.length > 0 ? [chars.length - 1] : [];
}

/**
 * 获取默认显示标签
 */
function getDefaultLabel(fullName: string): string {
  if (isEnglishName(fullName)) {
    // 英文名：取第一个单词（名字）
    const firstName = fullName.split(' ')[0];
    return firstName.length > 6 ? firstName.slice(0, 6) : firstName;
  }
  // 中文名：取最后一个字
  return fullName.length > 0 ? fullName[fullName.length - 1] : fullName;
}

// ============================================================
// 计算属性
// ============================================================

/** 字符数组 */
const displayChars = computed(() => getDisplayCharsFromName(props.fullName));

/** 预览标签 */
const previewLabel = computed(() => {
  if (!props.fullName) return '';

  const chars = displayChars.value;
  const selectedChars = Array.from(selectedIndices.value)
    .sort((a, b) => a - b)
    .map(i => chars[i])
    .filter(Boolean);

  if (selectedChars.length === 0) {
    return getDefaultLabel(props.fullName);
  }

  // 英文名用空格连接，中文名直接连接
  if (isEnglishName(props.fullName)) {
    return selectedChars.join(' ');
  }
  return selectedChars.join('');
});

// ============================================================
// 事件处理
// ============================================================

/** 切换字符选择 */
function toggleCharSelection(index: number) {
  const newSet = new Set(selectedIndices.value);
  if (newSet.has(index)) {
    newSet.delete(index);
  } else {
    newSet.add(index);
  }
  selectedIndices.value = newSet;
}

/** 应用并关闭 */
function applyAndClose() {
  emit('apply', {
    displayLabel: previewLabel.value,
    selectedIndices: Array.from(selectedIndices.value),
  });
  emit('close');
}

/** 重置为全名 */
function resetToFullName() {
  emit('reset');
  emit('close');
}

/** 关闭弹窗 */
function handleClose() {
  emit('close');
}

// ============================================================
// 监听器
// ============================================================

// 当弹窗打开或全名变化时，初始化选中状态
watch(
  () => [props.visible, props.fullName, props.initialIndices],
  ([visible]) => {
    if (visible) {
      if (props.initialIndices && props.initialIndices.length > 0) {
        selectedIndices.value = new Set(props.initialIndices);
      } else {
        selectedIndices.value = new Set(getDefaultIndicesFromName(props.fullName));
      }
    }
  },
  { immediate: true },
);

// ============================================================
// 导出供外部使用的工具函数
// ============================================================

defineExpose({
  isEnglishName,
  getDisplayChars: getDisplayCharsFromName,
  getDefaultIndices: getDefaultIndicesFromName,
  getDefaultLabel,
});
</script>
