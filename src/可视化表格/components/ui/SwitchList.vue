<template>
  <div class="acu-switch-list">
    <!-- 头部按钮区 -->
    <div class="acu-switch-list-header">
      <button
        class="acu-quick-select-btn"
        :class="{ active: isAllSelected }"
        @click.stop="handleSelectAll"
      >
        <i class="fas fa-check-double"></i>
        全选
      </button>
      <button class="acu-quick-select-btn" @click.stop="handleClear">
        <i class="fas fa-times"></i>
        清空
      </button>
    </div>

    <!-- 滚动列表区 -->
    <div class="acu-switch-list-body" :style="{ maxHeight }">
      <div
        v-for="item in items"
        :key="item.key"
        class="acu-switch-list-item"
        :class="[item.class, { 'is-selected': isSelected(item.key) }]"
        @click="toggleItem(item.key)"
      >
        <span class="item-label">
          {{ item.label }}
          <span v-if="item.badge" class="item-badge">{{ item.badge }}</span>
        </span>
        <label class="acu-switch small" @click.stop>
          <input type="checkbox" :checked="isSelected(item.key)" @change="toggleItem(item.key)" />
          <span class="slider"></span>
        </label>
      </div>
      <div v-if="items.length === 0" class="acu-switch-list-empty">
        <i class="fas fa-inbox"></i>
        {{ emptyText }}
      </div>
    </div>

    <!-- 底部统计区 -->
    <div class="acu-switch-list-footer">
      {{ footerText }}
      <span v-if="modelValue.length === 0 && emptyHint" class="empty-hint">{{ emptyHint }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SwitchList - 通用多选开关列表组件
 *
 * 功能：
 * - 带开关的可滚动选择列表
 * - 全选/清空快捷按钮（靠右）
 * - 底部统计信息
 * - 支持自定义徽章和样式类
 */

import { computed } from 'vue';

// ============================================================
// 类型定义
// ============================================================

export interface SwitchListItem {
  /** 唯一标识（用于 v-model 数组） */
  key: string;
  /** 显示文本 */
  label: string;
  /** 可选徽章（如 ★ 标记） */
  badge?: string;
  /** 可选额外样式类 */
  class?: string;
}

interface Props {
  /** 已选中的 key 列表 (v-model) */
  modelValue: string[];
  /** 列表项 */
  items: SwitchListItem[];
  /** 列表最大高度，默认 '280px' */
  maxHeight?: string;
  /** 空状态提示文本 */
  emptyText?: string;
  /** 底部统计模板，支持 {selected} 和 {total} 占位符 */
  footerTemplate?: string;
  /** 未选择时的附加提示（如 "(检测全部)"） */
  emptyHint?: string;
}

// ============================================================
// Props & Emits
// ============================================================

const props = withDefaults(defineProps<Props>(), {
  maxHeight: '280px',
  emptyText: '暂无数据',
  footerTemplate: '已选择: {selected}/{total}',
  emptyHint: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

// ============================================================
// 计算属性
// ============================================================

/** 是否全选 */
const isAllSelected = computed(() => {
  if (props.items.length === 0) return false;
  return props.modelValue.length === props.items.length;
});

/** 底部统计文本 */
const footerText = computed(() => {
  return props.footerTemplate
    .replace('{selected}', String(props.modelValue.length))
    .replace('{total}', String(props.items.length));
});

// ============================================================
// 方法
// ============================================================

/** 检查项是否选中 */
function isSelected(key: string): boolean {
  return props.modelValue.includes(key);
}

/** 切换项选中状态 */
function toggleItem(key: string): void {
  const newValue = [...props.modelValue];
  const index = newValue.indexOf(key);

  if (index === -1) {
    newValue.push(key);
  } else {
    newValue.splice(index, 1);
  }

  emit('update:modelValue', newValue);
}

/** 全选/取消全选 */
function handleSelectAll(): void {
  if (isAllSelected.value) {
    emit('update:modelValue', []);
  } else {
    emit('update:modelValue', props.items.map(item => item.key));
  }
}

/** 清空选择 */
function handleClear(): void {
  emit('update:modelValue', []);
}
</script>

<!-- 样式在 styles/components/switch-list.scss 中定义 -->
