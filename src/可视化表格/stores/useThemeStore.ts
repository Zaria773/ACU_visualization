
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 主题美化与高亮配置 Store
 * 管理主题预设、自定义变量、高亮颜色、自定义 CSS
 * 使用 ConfigManager 统一管理配置
 *
 * 注意：使用 ref + watch 模式而非 computed getter/setter
 * 这样可以确保直接修改对象属性时也能触发保存
 */

import { klona } from 'klona';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { getACUConfigManager } from '../composables/useACUConfigManager';
import { GLOBAL_THEME_BG_KEY, loadBackground } from '../composables/useBackgroundStorage';
import {
  type BackgroundConfig,
  DEFAULT_BACKGROUND_CONFIG,
  type HighlightConfig,
  THEME_VAR_CSS_MAP,
  type ThemePreset,
  type ThemeVariables,
  type ThemeVarOpacities,
} from '../types';
import { HIGHLIGHT_COLORS, useConfigStore } from './useConfigStore';

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
 * 将 hex 颜色转换为 rgba（用于主题变量透明度）
 * @param hex - 16进制颜色值
 * @param alpha - 透明度 (0-1)
 */
function hexToRgba(hex: string, alpha: number): string {
  const normalizedHex = hex.startsWith('#') ? hex : `#${hex}`;
  const r = parseInt(normalizedHex.slice(1, 3), 16);
  const g = parseInt(normalizedHex.slice(3, 5), 16);
  const b = parseInt(normalizedHex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  // 使用 ConfigManager 统一管理配置
  // ============================================================
  const configManager = getACUConfigManager();

  // ============================================================
  // 使用 ref + watch 模式确保响应式正确工作
  // ============================================================

  /** 主题预设列表 - 使用 ref 实现响应式 */
  const presets = ref<ThemePreset[]>(klona(configManager.config.theme?.presets || []));

  /** 当前激活的预设 ID (为空表示使用当前配置) */
  const activePresetId = ref<string | null>(configManager.config.theme?.activePresetId || null);

  /** 当前编辑的主题变量覆盖 (未保存到预设的临时状态) */
  const currentThemeVars = ref<Partial<ThemeVariables>>(klona(configManager.config.theme?.themeVars || {}));

  /** 当前主题变量透明度配置 (0-100，100=完全不透明) */
  const currentThemeVarOpacities = ref<ThemeVarOpacities>(klona(configManager.config.theme?.themeVarOpacities || {}));

  /** 当前高亮颜色配置 */
  const currentHighlight = ref<HighlightConfig>(klona(configManager.config.theme?.highlight || { ...DEFAULT_HIGHLIGHT_CONFIG }));

  /** 背景配置 */
  const backgroundConfig = ref<BackgroundConfig>(klona(configManager.config.theme?.backgroundConfig || { ...DEFAULT_BACKGROUND_CONFIG }));

  /** 自定义 CSS */
  const customCSS = ref<string>(configManager.config.theme?.customCSS || '');

  /** 是否已加载 (ConfigManager 在初始化时已加载) */
  const isLoaded = computed(() => configManager.isLoaded.value);

  // 监听所有主题配置变化，自动保存
  let isThemeInitializing = true;

  // 统一监听函数
  function syncToConfigManager() {
    if (isThemeInitializing) return;
    configManager.config.theme = {
      presets: klona(presets.value),
      activePresetId: activePresetId.value,
      themeVars: klona(currentThemeVars.value),
      themeVarOpacities: klona(currentThemeVarOpacities.value),
      highlight: klona(currentHighlight.value),
      backgroundConfig: klona(backgroundConfig.value),
      customCSS: customCSS.value,
    };
    configManager.saveConfig();
  }

  watch(presets, syncToConfigManager, { deep: true });
  watch(activePresetId, syncToConfigManager);
  watch(currentThemeVars, syncToConfigManager, { deep: true });
  watch(currentThemeVarOpacities, syncToConfigManager, { deep: true });
  watch(currentHighlight, syncToConfigManager, { deep: true });
  watch(backgroundConfig, syncToConfigManager, { deep: true });
  watch(customCSS, syncToConfigManager);

  // 初始化完成后允许保存
  setTimeout(() => {
    isThemeInitializing = false;
  }, 100);

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
  // 持久化 - 使用 ConfigManager
  // ============================================================

  /**
   * 从存储加载配置
   * @param force 是否强制重新加载
   */
  async function loadFromStorage(force = false) {
    // ConfigManager 在初始化时已加载配置，这里只需要处理背景图片恢复
    try {
      const activeId = activePresetId.value;
      const bgConfig = backgroundConfig.value;

      // 如果有激活的预设，尝试恢复背景图片
      if (activeId) {
        const preset = presets.value.find(p => p.id === activeId);
        if (preset && bgConfig.enabled && bgConfig.hasIndexedDBImage) {
          try {
            // 优先尝试使用预设 ID 加载
            let blobUrl = await loadBackground(preset.id);
            // 如果预设 ID 没有找到，回退到全局 key（兼容旧数据）
            if (!blobUrl) {
              blobUrl = await loadBackground(GLOBAL_THEME_BG_KEY);
            }
            if (blobUrl) {
              backgroundConfig.value.imageUrl = blobUrl;
              console.info('[ACU Theme] 已从 IndexedDB 恢复背景图片');
            }
          } catch (err) {
            console.warn('[ACU Theme] 恢复背景图片失败:', err);
          }
        }
        // 同步高亮配置到 configStore
        syncToConfigStore();
      } else if (bgConfig.enabled && bgConfig.hasIndexedDBImage) {
        // 没有激活预设，但有背景配置，尝试恢复
        try {
          const blobUrl = await loadBackground(GLOBAL_THEME_BG_KEY);
          if (blobUrl) {
            backgroundConfig.value.imageUrl = blobUrl;
            console.info('[ACU Theme] 已从 IndexedDB 恢复背景图片');
          }
        } catch (err) {
          console.warn('[ACU Theme] 恢复背景图片失败:', err);
        }
        // 从 configStore 同步高亮配置
        syncFromConfigStore();
      }

      console.info('[ACU Theme] 主题配置已就绪');
    } catch (e) {
      console.error('[ACU Theme] 加载配置失败:', e);
    }
  }

  /**
   * 保存到存储 - 使用 ConfigManager
   */
  function saveToStorage() {
    try {
      syncToConfigManager();
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
    const highlight = currentHighlight.value;
    configStore.updateConfig({
      highlightManualColor: highlight.manualColor,
      highlightColor: highlight.manualColor, // 兼容旧配置
      customHighlightManualHex: highlight.manualHex,
      highlightAiColor: highlight.aiColor,
      customHighlightAiHex: highlight.aiHex,
      titleColor: highlight.titleColor,
      customTitleHex: highlight.titleHex,
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
      themeVarOpacities: { ...currentThemeVarOpacities.value },
      highlight: { ...currentHighlight.value },
      backgroundConfig: { ...backgroundConfig.value },
      customCSS: customCSS.value,
    };

    presets.value = [...presets.value, preset];
    return preset;
  }

  /**
   * 保存当前配置到预设
   */
  function saveCurrentToPreset(name: string): ThemePreset {
    // 检查是否存在同名预设
    const currentPresets = [...presets.value];
    const existingIndex = currentPresets.findIndex(p => p.name === name);

    if (existingIndex > -1) {
      // 更新现有预设
      const existing = currentPresets[existingIndex];
      const updated: ThemePreset = {
        ...existing,
        baseTheme: baseTheme.value,
        themeVars: { ...currentThemeVars.value },
        themeVarOpacities: { ...currentThemeVarOpacities.value },
        highlight: { ...currentHighlight.value },
        backgroundConfig: { ...backgroundConfig.value },
        customCSS: customCSS.value,
      };

      currentPresets[existingIndex] = updated;
      presets.value = currentPresets;
      activePresetId.value = existing.id;

      // 如果有背景图片且存储在 IndexedDB，需要将其复制一份到预设 ID 对应的键下
      if (backgroundConfig.value.enabled && backgroundConfig.value.hasIndexedDBImage) {
        copyBackgroundToPreset(existing.id);
      }

      return updated;
    } else {
      // 创建新预设
      const preset = createPreset(name);
      activePresetId.value = preset.id;

      // 如果有背景图片且存储在 IndexedDB，需要将其复制一份到预设 ID 对应的键下
      if (backgroundConfig.value.enabled && backgroundConfig.value.hasIndexedDBImage) {
        copyBackgroundToPreset(preset.id);
      }

      return preset;
    }
  }

  /**
   * 将当前背景图片复制到预设存储键下
   */
  async function copyBackgroundToPreset(presetId: string) {
    try {
      let blobUrl: string | null = null;

      // 优先：如果当前内存中有 imageUrl (blob URL)，直接使用它
      if (backgroundConfig.value.imageUrl && backgroundConfig.value.imageUrl.startsWith('blob:')) {
        blobUrl = backgroundConfig.value.imageUrl;
      } else {
        // 1. 尝试从全局键加载 (当前正在使用的)
        blobUrl = await loadBackground(GLOBAL_THEME_BG_KEY);

        // 2. 如果全局没有，尝试从当前激活的预设键加载 (如果之前已经绑定过)
        if (!blobUrl && activePresetId.value && activePresetId.value !== presetId) {
          blobUrl = await loadBackground(activePresetId.value);
        }
      }

      if (blobUrl) {
        // 将 blob URL 转换为 Blob 对象
        const response = await fetch(blobUrl);
        const blob = await response.blob();

        // 保存到新预设 ID 下
        const { saveBackground } = await import('../composables/useBackgroundStorage');
        await saveBackground(presetId, blob, blob.type);
        console.info('[ACU Theme] 已将背景图片绑定到预设:', presetId);
      }
    } catch (e) {
      console.warn('[ACU Theme] 绑定背景图片到预设失败:', e);
    }
  }

  /**
   * 删除预设
   */
  function deletePreset(presetId: string) {
    const currentPresets = [...presets.value];
    const index = currentPresets.findIndex(p => p.id === presetId);
    if (index > -1) {
      currentPresets.splice(index, 1);
      presets.value = currentPresets;

      // 如果删除的是当前激活的预设，清空激活状态
      if (activePresetId.value === presetId) {
        activePresetId.value = null;
      }
    }
  }

  /** 是否正在应用预设（用于防止 watch 触发不必要的保存）*/
  const isApplyingPreset = ref(false);

  /**
   * 应用预设
   */
  async function applyPreset(presetId: string) {
    const preset = presets.value.find(p => p.id === presetId);
    if (!preset) return;

    // 标记正在应用预设，防止 watch 触发不必要的保存
    isApplyingPreset.value = true;

    try {
      // 先设置 activePresetId
      activePresetId.value = presetId;

      // 设置基础主题
      configStore.setTheme(preset.baseTheme);

      // 应用主题变量覆盖 - 完全替换对象
      currentThemeVars.value = { ...(preset.themeVars || {}) };

      // 应用主题变量透明度配置
      currentThemeVarOpacities.value = { ...(preset.themeVarOpacities || {}) };

      // 应用高亮配置
      currentHighlight.value = { ...preset.highlight };

      // 应用背景配置
      const newBgConfig = preset.backgroundConfig || { ...DEFAULT_BACKGROUND_CONFIG };

      // 先清除当前的 imageUrl，避免残留
      newBgConfig.imageUrl = '';
      backgroundConfig.value = { ...newBgConfig };

      // 恢复背景图片
      if (newBgConfig.enabled) {
        if (newBgConfig.hasIndexedDBImage) {
          // 使用预设 ID 作为背景图片的存储键
          const bgKey = preset.id;
          try {
            let blobUrl = await loadBackground(bgKey);
            // 如果预设 ID 没有找到，回退到全局 key（兼容旧数据）
            if (!blobUrl) {
              blobUrl = await loadBackground(GLOBAL_THEME_BG_KEY);
              if (blobUrl) {
                console.info('[ACU Theme] 预设应用：使用全局背景 (兼容)');
              }
            }
            if (blobUrl) {
              backgroundConfig.value.imageUrl = blobUrl;
              console.info('[ACU Theme] 预设应用：已恢复背景图片');
            } else {
              console.warn('[ACU Theme] 预设应用：IndexedDB 中未找到背景图片');
              // 标记为没有图片，避免下次继续尝试加载
              backgroundConfig.value.hasIndexedDBImage = false;
            }
          } catch (err) {
            console.warn('[ACU Theme] 预设应用：恢复背景图片失败', err);
          }
        } else if (newBgConfig.externalUrl) {
          // 使用外部 URL
          backgroundConfig.value.imageUrl = newBgConfig.externalUrl;
          console.info('[ACU Theme] 预设应用：使用外部背景 URL');
        }
      }

      // 应用自定义 CSS
      customCSS.value = preset.customCSS || '';

      // 同步高亮配置到 configStore
      syncToConfigStore();
    } finally {
      // 无论成功失败，都要重置标志
      isApplyingPreset.value = false;
    }
  }

  /**
   * 更新预设
   */
  function updatePreset(presetId: string, updates: Partial<ThemePreset>) {
    const currentPresets = [...presets.value];
    const index = currentPresets.findIndex(p => p.id === presetId);
    if (index > -1) {
      currentPresets[index] = { ...currentPresets[index], ...updates };
      presets.value = currentPresets;
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
    currentHighlight.value = {
      ...currentHighlight.value,
      manualColor: colorKey,
      manualHex: customHex,
    };
  }

  /**
   * 设置 AI 填表高亮颜色
   */
  function setAiHighlightColor(colorKey: string, customHex?: string) {
    currentHighlight.value = {
      ...currentHighlight.value,
      aiColor: colorKey,
      aiHex: customHex,
    };
  }

  /**
   * 设置标题颜色
   */
  function setTitleColor(colorKey: string, customHex?: string) {
    currentHighlight.value = {
      ...currentHighlight.value,
      titleColor: colorKey,
      titleHex: customHex,
    };
  }

  // ============================================================
  // 主题变量配置
  // ============================================================

  /**
   * 设置主题变量
   */
  function setThemeVar(key: keyof ThemeVariables, value: string) {
    currentThemeVars.value = {
      ...currentThemeVars.value,
      [key]: value,
    };
  }

  /**
   * 移除主题变量覆盖 (恢复基础主题值)
   */
  function removeThemeVar(key: keyof ThemeVariables) {
    const newVars = { ...currentThemeVars.value };
    delete newVars[key];
    currentThemeVars.value = newVars;
  }

  /**
   * 清空所有主题变量覆盖
   */
  function clearThemeVars() {
    currentThemeVars.value = {};
  }

  // ============================================================
  // 主题变量透明度配置
  // ============================================================

  /**
   * 设置主题变量透明度
   * @param key - 变量键名
   * @param opacity - 透明度值 (0-100，100=完全不透明)
   */
  function setThemeVarOpacity(key: keyof ThemeVariables, opacity: number) {
    currentThemeVarOpacities.value = {
      ...currentThemeVarOpacities.value,
      [key]: Math.max(0, Math.min(100, opacity)),
    };
  }

  /**
   * 移除主题变量透明度覆盖 (恢复默认100)
   */
  function removeThemeVarOpacity(key: keyof ThemeVariables) {
    const newOpacities = { ...currentThemeVarOpacities.value };
    delete newOpacities[key];
    currentThemeVarOpacities.value = newOpacities;
  }

  /**
   * 清空所有透明度配置
   */
  function clearThemeVarOpacities() {
    currentThemeVarOpacities.value = {};
  }

  // ============================================================
  // 背景配置
  // ============================================================

  /**
   * 设置背景配置
   */
  function setBackgroundConfig(config: Partial<BackgroundConfig>) {
    backgroundConfig.value = {
      ...backgroundConfig.value,
      ...config,
    };
  }

  /**
   * 获取背景配置
   */
  function getBackgroundConfig(): BackgroundConfig {
    return backgroundConfig.value;
  }

  // ============================================================
  // 自定义 CSS
  // ============================================================

  /**
   * 设置自定义 CSS
   */
  function setCustomCSS(css: string) {
    customCSS.value = css;
  }

  /**
   * 清空自定义 CSS
   */
  function clearCustomCSS() {
    customCSS.value = '';
  }

  // ============================================================
  // CSS 变量注入
  // ============================================================

  /**
   * 获取要注入的 CSS 变量样式字符串
   */
  function getInjectedStyles(): string {
    const styles: string[] = [];

    // 1. 注入主题变量覆盖（支持透明度）
    for (const [key, value] of Object.entries(currentThemeVars.value)) {
      if (value) {
        const cssVar = THEME_VAR_CSS_MAP[key as keyof ThemeVariables];
        if (cssVar) {
          // 获取透明度（默认100 = 完全不透明）
          const opacity = currentThemeVarOpacities.value[key as keyof ThemeVariables] ?? 100;

          if (opacity < 100 && value.startsWith('#')) {
            // 将颜色转换为 rgba
            const rgbaValue = hexToRgba(value, opacity / 100);
            styles.push(`${cssVar}: ${rgbaValue};`);
          } else {
            styles.push(`${cssVar}: ${value};`);
          }
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

    // 3. 注入背景配置
    if (backgroundConfig.value.enabled && backgroundConfig.value.imageUrl) {
      const bg = backgroundConfig.value;
      const posX = 50 + (bg.offsetX || 0);
      const posY = 50 + (bg.offsetY || 0);
      const scale = (bg.scale || 100) / 100;
      // auto 模式基准为 100%，cover 模式基准为 cover，统一使用 transform 缩放
      const size = bg.size === 'auto' ? '100%' : bg.size;

      styles.push(`--acu-bg-image: url("${bg.imageUrl}");`);
      styles.push(`--acu-bg-position: center center;`); // 固定居中，偏移由 transform 控制
      styles.push(`--acu-bg-size: ${size};`);
      styles.push(`--acu-bg-scale: ${scale};`);
      styles.push(`--acu-bg-offset-x: ${bg.offsetX || 0}%;`);
      styles.push(`--acu-bg-offset-y: ${bg.offsetY || 0}%;`);
      styles.push(`--acu-bg-repeat: no-repeat;`);
      styles.push(`--acu-bg-opacity: ${bg.opacity / 100};`);
      styles.push(`--acu-bg-blur: ${bg.blur}px;`);
    } else {
      styles.push(`--acu-bg-image: none;`);
    }

    if (styles.length === 0) return '';

    const styleBlock = styles.join(' ');

    // 生成背景样式规则
    // 同时注入到 .acu-app (全局继承) 和 .acu-wrapper/.acu-modal-container (覆盖主题类)
    let css = `.acu-app, .acu-wrapper, .acu-modal-container { ${styleBlock} }`;

    // 如果启用了背景，添加背景层样式
    if (backgroundConfig.value.enabled && backgroundConfig.value.imageUrl) {
      css += `
        .acu-data-display::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-image: var(--acu-bg-image);
          background-position: var(--acu-bg-position);
          background-size: var(--acu-bg-size);
          background-repeat: var(--acu-bg-repeat);
          transform: translate(var(--acu-bg-offset-x), var(--acu-bg-offset-y)) scale(var(--acu-bg-scale));
          transform-origin: center center;
          opacity: var(--acu-bg-opacity);
          filter: blur(var(--acu-bg-blur));
          pointer-events: none;
          z-index: -1;
          border-radius: 12px; /* 保持圆角一致 */
        }
        .acu-data-display {
          position: relative;
          z-index: 0;
          background: transparent !important; /* 让背景透出来 */
        }
      `;
    }

    return css;
  }

  /**
   * 获取完整的注入 CSS (变量 + 自定义 CSS)
   */
  function getFullInjectedCSS(): string {
    const varStyles = getInjectedStyles();
    const userCSS = customCSS.value;

    return [varStyles, userCSS].filter(Boolean).join('\n\n');
  }

  return {
    // 状态
    presets,
    activePresetId,
    currentThemeVars,
    currentThemeVarOpacities,
    currentHighlight,
    backgroundConfig,
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

    // 主题变量透明度
    setThemeVarOpacity,
    removeThemeVarOpacity,
    clearThemeVarOpacities,

    // 背景配置
    setBackgroundConfig,
    getBackgroundConfig,

    // 自定义 CSS
    setCustomCSS,
    clearCustomCSS,

    // CSS 注入
    getInjectedStyles,
    getFullInjectedCSS,
  };
});
