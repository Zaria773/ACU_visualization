/**
 * 主题美化与高亮配置 Store
 * 管理主题预设、自定义变量、高亮颜色、自定义 CSS
 */

import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { ACUScriptVariables, HighlightConfig, ThemePreset, ThemeVariables } from '../types';
import { THEME_VAR_CSS_MAP } from '../types';
import { HIGHLIGHT_COLORS, THEMES, useConfigStore } from './useConfigStore';

/** 脚本 ID - 用于脚本变量存储 */
const SCRIPT_ID = 'acu_visualizer_ui';

/** 主题预设存储键 */
const STORAGE_KEY_THEME_PRESETS = 'acu_theme_presets_v1';

/** 自定义 CSS 存储键 */
const STORAGE_KEY_CUSTOM_CSS = 'acu_custom_css_v1';

/** 默认高亮颜色配置 */
export const DEFAULT_HIGHLIGHT_CONFIG: HighlightConfig = {
  manualColor: 'orange',
  manualHex: '#d35400',
  aiColor: 'blue',
  aiHex: '#3498db',
  titleColor: 'orange',
  titleHex: '#d35400',
};

/**
 * 从 hex 颜色生成透明背景色
 */
function hexToBgRgba(hex: string, opacity: number = 0.1): string {
  const normalizedHex = hex.startsWith('#') ? hex : `#${hex}`;
  const r = parseInt(normalizedHex.slice(1, 3), 16);
  const g = parseInt(normalizedHex.slice(3, 5), 16);
  const b = parseInt(normalizedHex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * 从预设颜色 key 或自定义 hex 获取颜色值
 */
function getColorValue(colorKey: string, customHex?: string): string {
  if (colorKey === 'custom' && customHex) {
    return customHex;
  }
  const preset = HIGHLIGHT_COLORS[colorKey as keyof typeof HIGHLIGHT_COLORS];
  return preset?.main || '#d35400';
}

export const useThemeStore = defineStore('acu-theme', () => {
  // ============================================================
  // 状态
  // ============================================================

  /** 主题预设列表 */
  const presets = ref<ThemePreset[]>([]);

  /** 当前激活的预设 ID (为空表示使用当前配置) */
  const activePresetId = ref<string | null>(null);

  /** 当前编辑的主题变量覆盖 (未保存到预设的临时状态) */
  const currentThemeVars = ref<Partial<ThemeVariables>>({});

  /** 当前高亮颜色配置 */
  const currentHighlight = ref<HighlightConfig>({ ...DEFAULT_HIGHLIGHT_CONFIG });

  /** 自定义 CSS */
  const customCSS = ref<string>('');

  /** 是否已加载 */
  const isLoaded = ref(false);

  // ============================================================
  // 计算属性
  // ============================================================

  const configStore = useConfigStore();

  /** 当前基础主题 ID */
  const baseTheme = computed(() => configStore.config.theme);

  /** 手动修改高亮色 */
  const manualHighlightColor = computed(() => {
    return getColorValue(currentHighlight.value.manualColor, currentHighlight.value.manualHex);
  });

  /** AI 填表高亮色 */
  const aiHighlightColor = computed(() => {
    return getColorValue(currentHighlight.value.aiColor, currentHighlight.value.aiHex);
  });

  /** 标题颜色 */
  const titleColor = computed(() => {
    return getColorValue(currentHighlight.value.titleColor, currentHighlight.value.titleHex);
  });

  /** 标题背景颜色 */
  const titleBgColor = computed(() => {
    return hexToBgRgba(titleColor.value, 0.08);
  });

  /** 当前激活的预设 */
  const activePreset = computed(() => {
    if (!activePresetId.value) return null;
    return presets.value.find(p => p.id === activePresetId.value) || null;
  });

  // ============================================================
  // 持久化
  // ============================================================

  /**
   * 从存储加载配置
   */
  function loadFromStorage() {
    try {
      // 从 localStorage 加载预设列表
      const presetsJson = localStorage.getItem(STORAGE_KEY_THEME_PRESETS);
      if (presetsJson) {
        presets.value = JSON.parse(presetsJson);
      }

      // 从 localStorage 加载自定义 CSS
      const savedCSS = localStorage.getItem(STORAGE_KEY_CUSTOM_CSS);
      if (savedCSS) {
        customCSS.value = savedCSS;
      }

      // 从脚本变量加载当前配置
      if (typeof getVariables === 'function') {
        const scriptVars = getVariables({ type: 'script', script_id: SCRIPT_ID }) as ACUScriptVariables;

        if (scriptVars?.activePresetId) {
          activePresetId.value = scriptVars.activePresetId;
        }

        if (scriptVars?.themePresets) {
          // 合并脚本变量中的预设 (优先)
          presets.value = scriptVars.themePresets;
        }
      }

      // 从 configStore 同步高亮配置
      syncFromConfigStore();

      isLoaded.value = true;
      console.info('[ACU Theme] 已加载主题配置');
    } catch (e) {
      console.error('[ACU Theme] 加载配置失败:', e);
      isLoaded.value = true;
    }
  }

  /**
   * 保存到存储
   */
  function saveToStorage() {
    try {
      // 保存预设列表到 localStorage
      localStorage.setItem(STORAGE_KEY_THEME_PRESETS, JSON.stringify(presets.value));

      // 保存自定义 CSS 到 localStorage
      localStorage.setItem(STORAGE_KEY_CUSTOM_CSS, customCSS.value);

      // 保存到脚本变量
      if (typeof getVariables === 'function' && typeof replaceVariables === 'function') {
        const scriptVars = getVariables({ type: 'script', script_id: SCRIPT_ID }) as ACUScriptVariables;

        const newVars: ACUScriptVariables = {
          ...scriptVars,
          themePresets: presets.value,
          activePresetId: activePresetId.value || undefined,
        };

        replaceVariables(newVars, { type: 'script', script_id: SCRIPT_ID });
      }

      // 同步到 configStore
      syncToConfigStore();

      console.info('[ACU Theme] 已保存主题配置');
    } catch (e) {
      console.error('[ACU Theme] 保存配置失败:', e);
    }
  }

  /**
   * 从 configStore 同步高亮配置
   */
  function syncFromConfigStore() {
    const config = configStore.config;
    currentHighlight.value = {
      manualColor: config.highlightManualColor || config.highlightColor || 'orange',
      manualHex: config.customHighlightManualHex,
      aiColor: config.highlightAiColor || 'blue',
      aiHex: config.customHighlightAiHex,
      titleColor: config.titleColor || 'orange',
      titleHex: config.customTitleHex,
    };
  }

  /**
   * 同步高亮配置到 configStore
   */
  function syncToConfigStore() {
    configStore.updateConfig({
      highlightManualColor: currentHighlight.value.manualColor,
      highlightColor: currentHighlight.value.manualColor, // 兼容旧配置
      customHighlightManualHex: currentHighlight.value.manualHex,
      highlightAiColor: currentHighlight.value.aiColor,
      customHighlightAiHex: currentHighlight.value.aiHex,
      titleColor: currentHighlight.value.titleColor,
      customTitleHex: currentHighlight.value.titleHex,
      // 强制开启高亮
      highlightNew: true,
      customTitleColor: true,
    });
  }

  // ============================================================
  // 预设管理
  // ============================================================

  /**
   * 创建新预设
   */
  function createPreset(name: string): ThemePreset {
    const preset: ThemePreset = {
      id: `preset_${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      baseTheme: baseTheme.value,
      themeVars: { ...currentThemeVars.value },
      highlight: { ...currentHighlight.value },
      customCSS: customCSS.value,
    };

    presets.value.push(preset);
    saveToStorage();
    return preset;
  }

  /**
   * 保存当前配置到预设
   */
  function saveCurrentToPreset(name: string): ThemePreset {
    return createPreset(name);
  }

  /**
   * 删除预设
   */
  function deletePreset(presetId: string) {
    const index = presets.value.findIndex(p => p.id === presetId);
    if (index > -1) {
      presets.value.splice(index, 1);

      // 如果删除的是当前激活的预设，清空激活状态
      if (activePresetId.value === presetId) {
        activePresetId.value = null;
      }

      saveToStorage();
    }
  }

  /**
   * 应用预设
   */
  function applyPreset(presetId: string) {
    const preset = presets.value.find(p => p.id === presetId);
    if (!preset) return;

    // 设置基础主题
    configStore.setTheme(preset.baseTheme);

    // 应用主题变量覆盖
    currentThemeVars.value = { ...preset.themeVars };

    // 应用高亮配置
    currentHighlight.value = { ...preset.highlight };

    // 应用自定义 CSS
    customCSS.value = preset.customCSS || '';

    // 更新激活状态
    activePresetId.value = presetId;

    saveToStorage();
  }

  /**
   * 更新预设
   */
  function updatePreset(presetId: string, updates: Partial<ThemePreset>) {
    const index = presets.value.findIndex(p => p.id === presetId);
    if (index > -1) {
      presets.value[index] = { ...presets.value[index], ...updates };
      saveToStorage();
    }
  }

  /**
   * 重命名预设
   */
  function renamePreset(presetId: string, newName: string) {
    updatePreset(presetId, { name: newName });
  }

  // ============================================================
  // 高亮颜色配置
  // ============================================================

  /**
   * 设置手动修改高亮颜色
   */
  function setManualHighlightColor(colorKey: string, customHex?: string) {
    currentHighlight.value.manualColor = colorKey;
    currentHighlight.value.manualHex = customHex;
    saveToStorage();
  }

  /**
   * 设置 AI 填表高亮颜色
   */
  function setAiHighlightColor(colorKey: string, customHex?: string) {
    currentHighlight.value.aiColor = colorKey;
    currentHighlight.value.aiHex = customHex;
    saveToStorage();
  }

  /**
   * 设置标题颜色
   */
  function setTitleColor(colorKey: string, customHex?: string) {
    currentHighlight.value.titleColor = colorKey;
    currentHighlight.value.titleHex = customHex;
    saveToStorage();
  }

  // ============================================================
  // 主题变量配置
  // ============================================================

  /**
   * 设置主题变量
   */
  function setThemeVar(key: keyof ThemeVariables, value: string) {
    currentThemeVars.value[key] = value;
  }

  /**
   * 移除主题变量覆盖 (恢复基础主题值)
   */
  function removeThemeVar(key: keyof ThemeVariables) {
    delete currentThemeVars.value[key];
  }

  /**
   * 清空所有主题变量覆盖
   */
  function clearThemeVars() {
    currentThemeVars.value = {};
  }

  // ============================================================
  // 自定义 CSS
  // ============================================================

  /**
   * 设置自定义 CSS
   */
  function setCustomCSS(css: string) {
    customCSS.value = css;
    saveToStorage();
  }

  /**
   * 清空自定义 CSS
   */
  function clearCustomCSS() {
    customCSS.value = '';
    saveToStorage();
  }

  // ============================================================
  // CSS 变量注入
  // ============================================================

  /**
   * 获取要注入的 CSS 变量样式字符串
   */
  function getInjectedStyles(): string {
    const styles: string[] = [];

    // 1. 注入主题变量覆盖
    for (const [key, value] of Object.entries(currentThemeVars.value)) {
      if (value) {
        const cssVar = THEME_VAR_CSS_MAP[key as keyof ThemeVariables];
        if (cssVar) {
          styles.push(`${cssVar}: ${value};`);
        }
      }
    }

    // 2. 注入高亮颜色
    styles.push(`--acu-highlight: ${manualHighlightColor.value};`);
    styles.push(`--acu-highlight-manual: ${manualHighlightColor.value};`);
    styles.push(`--acu-highlight-manual-bg: ${hexToBgRgba(manualHighlightColor.value)};`);
    styles.push(`--acu-highlight-ai: ${aiHighlightColor.value};`);
    styles.push(`--acu-highlight-ai-bg: ${hexToBgRgba(aiHighlightColor.value)};`);
    styles.push(`--acu-title-color: ${titleColor.value};`);
    styles.push(`--acu-title-color-bg: ${titleBgColor.value};`);
    styles.push(`--acu-accent: ${titleColor.value};`);

    if (styles.length === 0) return '';

    return `.acu-wrapper { ${styles.join(' ')} }`;
  }

  /**
   * 获取完整的注入 CSS (变量 + 自定义 CSS)
   */
  function getFullInjectedCSS(): string {
    const varStyles = getInjectedStyles();
    const userCSS = customCSS.value;

    return [varStyles, userCSS].filter(Boolean).join('\n\n');
  }

  // ============================================================
  // 初始化
  // ============================================================

  // 监听变化自动保存
  watch(
    [currentHighlight, currentThemeVars, customCSS],
    () => {
      if (isLoaded.value) {
        saveToStorage();
      }
    },
    { deep: true },
  );

  return {
    // 状态
    presets,
    activePresetId,
    currentThemeVars,
    currentHighlight,
    customCSS,
    isLoaded,

    // 计算属性
    baseTheme,
    manualHighlightColor,
    aiHighlightColor,
    titleColor,
    titleBgColor,
    activePreset,

    // 持久化
    loadFromStorage,
    saveToStorage,
    syncFromConfigStore,
    syncToConfigStore,

    // 预设管理
    createPreset,
    saveCurrentToPreset,
    deletePreset,
    applyPreset,
    updatePreset,
    renamePreset,

    // 高亮颜色
    setManualHighlightColor,
    setAiHighlightColor,
    setTitleColor,

    // 主题变量
    setThemeVar,
    removeThemeVar,
    clearThemeVars,

    // 自定义 CSS
    setCustomCSS,
    clearCustomCSS,

    // CSS 注入
    getInjectedStyles,
    getFullInjectedCSS,
  };
});
