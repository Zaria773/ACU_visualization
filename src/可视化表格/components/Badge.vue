<template>
  <span class="acu-badge" :class="badgeClass">
    {{ displayValue }}
  </span>
</template>

<script setup lang="ts">
/**
 * Badge 徽章组件
 * 用于美化展示单元格值，根据内容自动选择样式
 *
 * 支持类型：
 * - default: 默认样式
 * - level: 等级样式 (匹配 Lv.数字)
 * - percent: 百分比样式 (匹配 数字%)
 * - male/female: 性别样式
 * - number: 数字样式
 * - success/warning/danger: 状态样式
 */

import { computed } from 'vue';

type BadgeType =
  | 'default' // 默认样式 (透明背景)
  | 'primary' // 主题色背景 (Subtle)
  | 'secondary' // 次要/灰色背景 (Subtle)
  | 'outline' // 轮廓样式
  | 'outline-primary' // 主题色轮廓
  | 'level' // 等级 (Primary)
  | 'percent' // 百分比 (Primary)
  | 'male' // 性别 (Default)
  | 'female' // 性别 (Default)
  | 'number' // 数字 (Primary)
  | 'success' // 成功 (Primary)
  | 'warning' // 警告 (Primary)
  | 'danger'; // 危险 (Primary)

interface Props {
  /** 显示的值 */
  value: string | number;
  /** 强制指定类型，不指定则自动检测 */
  type?: BadgeType;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'default',
});

/**
 * 自动检测内容类型并映射到样式类名
 */
const detectedType = computed((): string => {
  // 如果指定了非默认类型，直接使用
  if (props.type !== 'default') return props.type;

  const value = String(props.value);

  // 检测等级格式: Lv.数字 或 LV.数字 或 lv.数字
  if (/Lv\.?\s*\d+/i.test(value)) return 'level';

  // 检测百分比格式: 数字%
  if (/\d+(\.\d+)?%/.test(value)) return 'percent';

  // 检测性别 (使用默认样式，不加特殊色)
  if (value === '男') return 'male';
  if (value === '女') return 'female';

  // 检测纯数字 (使用 Primary 样式突出显示)
  if (/^[+-]?\d+(\.\d+)?$/.test(value.trim())) return 'number';

  // 默认类型
  return 'default';
});

/**
 * 计算徽章 CSS 类名
 */
const badgeClass = computed(() => {
  const type = detectedType.value;
  // 如果是新的标准类型，直接返回类名
  if (['primary', 'secondary', 'outline', 'outline-primary'].includes(type)) {
    return `acu-badge-${type}`;
  }
  // 否则返回兼容性类名 (在 SCSS 中有映射)
  return `acu-badge-${type}`;
});

/**
 * 显示值，空值显示占位符
 */
const displayValue = computed(() => {
  const val = props.value;
  if (val === null || val === undefined || val === '') {
    return '-';
  }
  return String(val);
});
</script>
