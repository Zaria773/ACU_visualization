<template>
  <div class="acu-search-box" :class="{ focused: isFocused, 'has-value': searchTerm }">
    <div class="acu-search-input-wrapper">
      <!-- 搜索图标 -->
      <i class="fas fa-search acu-search-icon"></i>

      <!-- 搜索输入框 -->
      <input
        ref="inputRef"
        v-model="searchTerm"
        type="text"
        class="acu-search-input"
        :placeholder="placeholder"
        @focus="isFocused = true"
        @blur="isFocused = false"
        @keydown.escape="handleClear"
        @keydown.enter="handleEnter"
      />

      <!-- 清空按钮 -->
      <Transition name="acu-fade">
        <button v-if="searchTerm" class="acu-search-clear" title="清空搜索" @click="handleClear">
          <i class="fas fa-times"></i>
        </button>
      </Transition>
    </div>

    <!-- 搜索结果计数（可选） -->
    <Transition name="acu-fade">
      <div v-if="showResultCount && resultCount !== undefined" class="acu-search-result">
        <template v-if="resultCount > 0">
          找到 <strong>{{ resultCount }}</strong> 条结果
        </template>
        <template v-else-if="searchTerm">
          <span class="no-result">无匹配结果</span>
        </template>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
/**
 * SearchBox 搜索框组件
 *
 * 功能：
 * - 实时搜索（带防抖）
 * - 清空按钮
 * - 搜索图标
 * - 支持快捷键（Escape 清空，Enter 立即搜索）
 * - 可选显示搜索结果数量
 * - 自动聚焦选项
 */

import { ref, watch, onMounted } from 'vue';
import { useDebounceFn, useFocus } from '@vueuse/core';

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  /** 搜索关键词 (v-model) */
  modelValue: string;
  /** 搜索结果数量（可选，用于显示） */
  resultCount?: number;
  /** 防抖延迟时间（毫秒） */
  debounce?: number;
  /** 是否自动聚焦 */
  autofocus?: boolean;
  /** 占位符文本 */
  placeholder?: string;
  /** 是否显示结果计数 */
  showResultCount?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  debounce: 300,
  autofocus: false,
  placeholder: '搜索...',
  showResultCount: true,
});

const emit = defineEmits<{
  /** 更新搜索关键词 (v-model) */
  'update:modelValue': [value: string];
  /** 搜索事件（防抖后触发） */
  search: [value: string];
  /** 清空事件 */
  clear: [];
  /** 立即搜索事件（Enter 键触发） */
  searchImmediate: [value: string];
}>();

// ============================================================
// Refs
// ============================================================

const inputRef = ref<HTMLInputElement>();
const searchTerm = ref(props.modelValue);
const isFocused = ref(false);

// ============================================================
// VueUse Composables
// ============================================================

// 自动聚焦
if (props.autofocus) {
  onMounted(() => {
    inputRef.value?.focus();
  });
}

// 防抖搜索函数
const debouncedSearch = useDebounceFn((value: string) => {
  emit('update:modelValue', value);
  emit('search', value);
}, props.debounce);

// ============================================================
// Watchers
// ============================================================

// 监听输入变化，触发防抖搜索
watch(searchTerm, value => {
  debouncedSearch(value);
});

// 同步外部值变化
watch(
  () => props.modelValue,
  value => {
    if (value !== searchTerm.value) {
      searchTerm.value = value;
    }
  },
);

// ============================================================
// Methods
// ============================================================

/**
 * 清空搜索
 */
const handleClear = () => {
  searchTerm.value = '';
  emit('update:modelValue', '');
  emit('search', '');
  emit('clear');
  // 清空后保持焦点
  inputRef.value?.focus();
};

/**
 * 立即搜索（Enter 键）
 */
const handleEnter = () => {
  // 立即触发搜索，不等待防抖
  emit('update:modelValue', searchTerm.value);
  emit('search', searchTerm.value);
  emit('searchImmediate', searchTerm.value);
};

/**
 * 聚焦输入框
 */
const focus = () => {
  inputRef.value?.focus();
};

/**
 * 失焦输入框
 */
const blur = () => {
  inputRef.value?.blur();
};

/**
 * 选中全部文本
 */
const selectAll = () => {
  inputRef.value?.select();
};

// ============================================================
// Expose
// ============================================================

defineExpose({
  /** 聚焦输入框 */
  focus,
  /** 失焦输入框 */
  blur,
  /** 清空搜索 */
  clear: handleClear,
  /** 选中全部文本 */
  selectAll,
  /** 输入框元素引用 */
  inputRef,
});
</script>

<!-- 样式已迁移到 styles/components/inputs.scss -->
