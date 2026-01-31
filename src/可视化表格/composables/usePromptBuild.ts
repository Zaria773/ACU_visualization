/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 提示词拼装 Composable
 *
 * 功能：根据抽签结果拼装最终提示词
 *
 * @example
 * ```typescript
 * import { buildPrompt } from './usePromptBuild';
 * import type { DrawResult } from './usePromptBuild';
 *
 * const result: DrawResult = {
 *   luck: { id: 'lucky', name: '大吉', prompt: '命运站在主角这边...', weight: 15, color: '#90ee90' },
 *   words: ['静电噪音', '半截粉笔'],
 * };
 *
 * const prompt = buildPrompt(result);
 * console.log(prompt);
 * ```
 */

import type { LuckTier, LuckTier as LuckTierType } from './useDraw';

// ============================================
// 类型定义
// ============================================

/**
 * 抽签结果
 */
export interface DrawResult {
  /** 抽中的运势档位 */
  luck: LuckTier;
  /** 抽中的关键词列表 */
  words: string[];
}

/**
 * 完整抽签结果（包含维度，预留扩展）
 */
export interface FullDrawResult extends DrawResult {
  /** 各维度抽取结果（预留扩展） */
  dimensions?: Array<{
    dimensionName: string;
    tierName: string;
    prompt: string;
  }>;
  /** 拼装后的最终提示词 */
  finalPrompt?: string;
}

// ============================================
// 模板定义
// ============================================

/**
 * 默认模板片段
 * 用于在没有自定义模板时动态构建提示词
 */
const TEMPLATE_PARTS = {
  HEADER: '<user>行动顺利度：',
  LUCK: '{{luck}}',
  WORDS: `在接下来的描写中，请自然地融入以下要素：[ {{words}} ]`,
  DIMENSIONS: '{{dimensions}}',
};

/**
 * 默认完整模板（用于展示或作为自定义模板的基础）
 */
export const DEFAULT_TEMPLATE = `${TEMPLATE_PARTS.HEADER}
${TEMPLATE_PARTS.LUCK}
${TEMPLATE_PARTS.WORDS}
${TEMPLATE_PARTS.DIMENSIONS}`;

// 兼容旧代码导出，避免报错，但建议逐步迁移使用 DEFAULT_TEMPLATE
export const TEMPLATE_SIMPLE = `${TEMPLATE_PARTS.HEADER}\n${TEMPLATE_PARTS.LUCK}`;
export const TEMPLATE_FULL = `${TEMPLATE_PARTS.HEADER}\n${TEMPLATE_PARTS.LUCK}\n${TEMPLATE_PARTS.WORDS}`;
export const TEMPLATE_WITH_DIMENSIONS = DEFAULT_TEMPLATE;

// ============================================
// 核心函数
// ============================================

/**
 * 根据抽签结果拼装提示词
 *
 * @param result - 抽签结果
 * @returns 拼装后的提示词
 */
export function buildPrompt(result: DrawResult): string {
  // 转换为 FullDrawResult 格式调用统一逻辑
  return buildFullPrompt({
    luck: result.luck,
    words: result.words,
    dimensions: [],
  });
}

/**
 * 根据完整抽签结果拼装提示词（包含维度）
 *
 * @param result - 完整抽签结果
 * @returns 拼装后的提示词
 */
export function buildFullPrompt(result: FullDrawResult): string {
  const { luck, words, dimensions } = result;

  const parts: string[] = [TEMPLATE_PARTS.HEADER];

  // 1. 运势 (必须存在)
  if (luck.prompt) {
    parts.push(luck.prompt);
  }

  // 2. 关键词 (如果有)
  if (words && words.length > 0) {
    const wordsText = TEMPLATE_PARTS.WORDS.replace('{{words}}', words.join('、'));
    parts.push(wordsText);
  }

  // 3. 维度 (如果有)
  if (dimensions && dimensions.length > 0) {
    const dimensionsText = dimensions
      .filter(d => d.prompt && d.prompt.trim())
      .map(d => d.prompt)
      .join('\n');

    if (dimensionsText) {
      parts.push(dimensionsText);
    }
  }

  return parts.join('\n');
}

/**
 * 使用自定义模板拼装提示词
 *
 * @param template - 自定义模板字符串
 * @param result - 抽签结果
 * @returns 拼装后的提示词
 *
 * @example
 * ```typescript
 * const customTemplate = `【系统指令】\n运势: {{luck}}\n关键词: {{words}}`;
 * const prompt = buildPromptWithTemplate(customTemplate, result);
 * ```
 */
export function buildPromptWithTemplate(template: string, result: DrawResult): string {
  const { luck, words } = result;

  return template.replace('{{luck}}', luck.prompt).replace('{{words}}', words.join('、'));
}

/**
 * 验证模板格式是否正确
 *
 * @param template - 模板字符串
 * @returns 验证结果
 */
export function validateTemplate(template: string): {
  valid: boolean;
  hasLuckPlaceholder: boolean;
  hasWordsPlaceholder: boolean;
  hasDimensionsPlaceholder: boolean;
} {
  return {
    valid: template.includes('{{luck}}'),
    hasLuckPlaceholder: template.includes('{{luck}}'),
    hasWordsPlaceholder: template.includes('{{words}}'),
    hasDimensionsPlaceholder: template.includes('{{dimensions}}'),
  };
}

/**
 * 提取模板中的占位符
 *
 * @param template - 模板字符串
 * @returns 占位符列表
 */
export function extractPlaceholders(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const placeholders: string[] = [];
  let match;

  while ((match = regex.exec(template)) !== null) {
    if (!placeholders.includes(match[1])) {
      placeholders.push(match[1]);
    }
  }

  return placeholders;
}

/**
 * 预览提示词（截断显示）
 *
 * @param prompt - 完整提示词
 * @param maxLength - 最大长度，默认100
 * @returns 截断后的预览文本
 */
export function previewPrompt(prompt: string, maxLength = 100): string {
  if (prompt.length <= maxLength) {
    return prompt;
  }
  return prompt.slice(0, maxLength) + '...';
}

/**
 * 格式化关键词列表为显示文本
 *
 * @param words - 关键词列表
 * @param separator - 分隔符，默认顿号
 * @returns 格式化后的文本
 */
export function formatWords(words: string[], separator = '、'): string {
  return words.join(separator);
}

// ============================================
// Composable 封装（Vue 3）
// ============================================

import { computed, ref, type Ref } from 'vue';

export interface UsePromptBuildOptions {
  /** 自定义模板 */
  customTemplate?: string;
}

export interface UsePromptBuildReturn {
  /** 当前抽签结果 */
  result: Ref<DrawResult | null>;
  /** 生成的提示词 */
  prompt: Ref<string>;
  /** 提示词预览（截断） */
  preview: Ref<string>;
  /** 设置抽签结果 */
  setResult: (luck: LuckTierType, words: string[]) => void;
  /** 清空结果 */
  clear: () => void;
  /** 使用自定义模板生成 */
  buildWithTemplate: (template: string) => string;
}

/**
 * 提示词拼装 Composable
 *
 * 提供响应式的提示词生成功能
 *
 * @example
 * ```typescript
 * const { result, prompt, preview, setResult } = usePromptBuild();
 *
 * // 设置抽签结果
 * setResult(luck, ['词1', '词2']);
 *
 * // 访问生成的提示词
 * console.log(prompt.value);
 * console.log(preview.value); // 截断预览
 * ```
 */
export function usePromptBuild(options: UsePromptBuildOptions = {}): UsePromptBuildReturn {
  const { customTemplate } = options;

  const result = ref<DrawResult | null>(null);

  // 计算生成的提示词
  const prompt = computed(() => {
    if (!result.value) return '';

    if (customTemplate) {
      return buildPromptWithTemplate(customTemplate, result.value);
    }

    return buildPrompt(result.value);
  });

  // 截断预览
  const preview = computed(() => previewPrompt(prompt.value, 100));

  // 设置抽签结果
  function setResult(luck: LuckTierType, words: string[]): void {
    result.value = { luck, words };
    console.info('[usePromptBuild] 生成提示词:', preview.value);
  }

  // 清空结果
  function clear(): void {
    result.value = null;
  }

  // 使用自定义模板生成
  function buildWithTemplate(template: string): string {
    if (!result.value) return '';
    return buildPromptWithTemplate(template, result.value);
  }

  return {
    result,
    prompt,
    preview,
    setResult,
    clear,
    buildWithTemplate,
  };
}
