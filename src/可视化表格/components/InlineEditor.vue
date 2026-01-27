<template>
  <div class="acu-inline-editor" @click.stop @mousedown.stop @pointerdown.stop>
    <textarea
      ref="textareaRef"
      v-model="localValue"
      class="acu-edit-textarea"
      @blur="handleSave"
      @keydown="handleKeydown"
      @click.stop
      @mousedown.stop
      @pointerdown.stop
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend.stop
    />
  </div>
</template>

<script setup lang="ts">
/**
 * InlineEditor 内联编辑器组件
 * 用于在单元格内直接编辑内容
 *
 * 功能：
 * - 自动获取焦点并将光标移到末尾
 * - 根据内容自动调整高度（使用 scrollHeight）
 * - Escape 键取消编辑
 * - Enter 键保存（Shift+Enter 换行）
 * - 失焦自动保存
 * - 移动端：选中文本时交给系统处理，否则阻止冒泡
 * - 阻止 pointerdown/mousedown 事件冒泡，防止触发面板收起
 */

import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

interface Props {
  /** 初始值 */
  value: string | number;
  /** 最小高度 (px) */
  minHeight?: number;
}

const props = withDefaults(defineProps<Props>(), {
  minHeight: 24,
});

const emit = defineEmits<{
  /** 保存事件，传递新值 */
  save: [value: string];
  /** 取消事件 */
  cancel: [];
}>();

// 文本框引用
const textareaRef = ref<HTMLTextAreaElement>();

// 本地编辑值
const localValue = ref(String(props.value));

// 是否已触发保存（防止重复触发）
const hasSaved = ref(false);

// 当前是否有选中的文本（用于移动端手势控制）
const hasTextSelection = ref(false);

/**
 * 检测是否有文本被选中
 */
const checkTextSelection = () => {
  const selection = window.getSelection();
  hasTextSelection.value = selection !== null && selection.toString().length > 0;
};

/**
 * 自动调整高度（使用 scrollHeight）
 * 参考原代码 6.4.1.ts 的 autoResize 逻辑
 *
 * 注意：不设置 maxHeight，让 textarea 完全展开显示所有内容
 * 用户通过滚动卡片来调整光标位置，而不是滚动 textarea
 */
const autoResize = () => {
  const textarea = textareaRef.value;
  if (!textarea) return;

  // 保存当前高度，避免跳动
  const currentHeight = textarea.offsetHeight;

  // 临时设置高度为 0 来获取准确的 scrollHeight
  // 使用 visibility: hidden 避免视觉跳动
  const originalVisibility = textarea.style.visibility;
  textarea.style.visibility = 'hidden';
  textarea.style.height = '0px';

  // 获取实际内容高度
  const scrollHeight = textarea.scrollHeight;
  const newHeight = Math.max(scrollHeight, props.minHeight);

  // 恢复可见性
  textarea.style.visibility = originalVisibility;

  // 如果新高度与当前相同，直接恢复当前高度避免重绘
  if (newHeight === currentHeight && currentHeight > 0) {
    textarea.style.height = `${currentHeight}px`;
    return;
  }

  // 设置新高度（不限制最大高度，完全展开）
  textarea.style.height = `${newHeight}px`;
};

/**
 * 监听值变化，自动调整高度
 */
watch(localValue, () => {
  nextTick(autoResize);
});

/**
 * 保存处理
 * 只有当值真正改变时才触发保存
 */
const handleSave = () => {
  if (hasSaved.value) return;
  hasSaved.value = true;

  // 比较当前值与原始值，只有真正改变才触发保存
  const originalValue = String(props.value);
  if (localValue.value !== originalValue) {
    emit('save', localValue.value);
  } else {
    // 值没有改变，触发取消（关闭编辑框但不做任何操作）
    emit('cancel');
  }
};

/**
 * 键盘事件处理
 */
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    // Escape 取消编辑
    e.preventDefault();
    e.stopPropagation();
    hasSaved.value = true; // 防止 blur 时再次触发
    emit('cancel');
  } else if (e.key === 'Enter' && !e.shiftKey) {
    // Enter 保存（非 Shift+Enter）
    e.preventDefault();
    e.stopPropagation();
    handleSave();
  }
  // Shift+Enter 允许换行，不做处理
};

/**
 * 移动端 touchstart 处理
 * 阻止冒泡，但保留系统的选择功能
 */
const handleTouchStart = (e: TouchEvent) => {
  // 始终阻止冒泡，防止触发卡片的手势或面板收起
  e.stopPropagation();
  // 不阻止默认行为，保留文本选择和光标定位功能
};

/**
 * 移动端 touchmove 处理
 * 如果有选中文本，交给系统处理；否则阻止冒泡（允许 textarea 内部滚动）
 */
const handleTouchMove = (e: TouchEvent) => {
  // 检测是否有选中文本
  checkTextSelection();

  if (hasTextSelection.value) {
    // 有选中文本时，让系统处理（如调整选择范围）
    // 仍然阻止冒泡，防止触发外层滑动
    e.stopPropagation();
    return;
  }

  // 阻止冒泡，允许 textarea 内部纵向滚动
  e.stopPropagation();
  // 不阻止默认行为，保留 textarea 的滚动功能
};

/**
 * 组件挂载时自动聚焦并将光标移到末尾
 */
onMounted(() => {
  nextTick(() => {
    const textarea = textareaRef.value;
    if (!textarea) return;

    // 先设置初始高度（基于 scrollHeight），避免视觉跳动
    // 在聚焦前就设置好高度
    const scrollHeight = textarea.scrollHeight;
    const initialHeight = Math.max(scrollHeight, props.minHeight);
    textarea.style.height = `${initialHeight}px`;

    // 聚焦并将光标移到末尾（而不是全选）
    textarea.focus();
    const len = textarea.value.length;
    textarea.setSelectionRange(len, len);
  });

  // 监听 selectionchange 事件以检测文本选择状态
  document.addEventListener('selectionchange', checkTextSelection);
});

/**
 * 组件卸载时清理事件监听
 */
onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', checkTextSelection);
});
</script>
