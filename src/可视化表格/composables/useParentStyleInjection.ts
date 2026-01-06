/**
 * ACU Visualizer - Parent Style Injection Composable
 *
 * 由于脚本运行在 iframe 中，需要将样式注入到父窗口
 * 使用 teleport 机制将编译后的 CSS 注入到 window.parent.document.head
 */

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { FONTS, THEMES, useConfigStore } from '../stores/useConfigStore';
import { getCore } from '../utils/index';

// 导入编译后的 CSS（通过 ?raw 导入）
import compiledStyles from '../styles/index.scss?raw';

// 样式元素 ID 前缀
const STYLE_ID_PREFIX = 'acu-styles';

// 动态字体 ID
const DYNAMIC_FONT_ID = 'acu-dynamic-font';

declare function getScriptId(): string;

/**
 * 父窗口样式注入 Composable
 *
 * 负责：
 * 1. 注入静态基础样式到父窗口
 * 2. 注入动态 CSS 变量（响应配置变化）
 * 3. 主题切换机制
 * 4. 字体加载与切换
 * 5. 脚本卸载时清理样式
 */
export function useParentStyleInjection() {
  const configStore = useConfigStore();
  const { $ } = getCore();

  // 获取父窗口 document
  const getParentDoc = () => {
    try {
      return window.parent?.document || document;
    } catch {
      return document;
    }
  };

  // 脚本 ID（用于样式隔离）
  const scriptId = computed(() => {
    try {
      return getScriptId();
    } catch {
      return 'acu-visualizer';
    }
  });

  // 样式元素引用
  const baseStyleEl = ref<HTMLStyleElement | null>(null);
  const dynamicStyleEl = ref<HTMLStyleElement | null>(null);
  const fontStyleEl = ref<HTMLStyleElement | null>(null);

  // 是否已初始化
  const isInitialized = ref(false);

  /**
   * 获取字体导入 CSS
   */
  const getFontImportCSS = (): string => {
    return `
      @import url("https://fontsapi.zeoseven.com/3/main/result.css");   /* 寒蝉全圆体 */
      @import url("https://fontsapi.zeoseven.com/442/main/result.css"); /* Maple Mono */
      @import url("https://fontsapi.zeoseven.com/256/main/result.css"); /* 汇文明朝 */
      @import url("https://fontsapi.zeoseven.com/482/main/result.css"); /* Cooper正楷 */
      @import url("https://fontsapi.zeoseven.com/446/main/result.css"); /* YFFYT */
      @import url("https://fontsapi.zeoseven.com/570/main/result.css"); /* Fusion Pixel */
      @import url("https://fontsapi.zeoseven.com/292/main/result.css"); /* 霞鹜文楷 */
      @import url("https://fontsapi.zeoseven.com/69/main/result.css");  /* 思源黑体 */
      @import url("https://fontsapi.zeoseven.com/7/main/result.css");   /* 朱雀仿宋 */
    `;
  };

  /**
   * 获取当前字体 CSS 值
   */
  const getFontFamilyValue = (): string => {
    const fontId = configStore.config.fontFamily || 'default';
    const font = FONTS.find(f => f.id === fontId);
    return font?.val || FONTS[0].val;
  };

  /**
   * 注入静态基础样式
   * 只在初始化时执行一次
   */
  const injectBaseStyles = (): void => {
    const parentDoc = getParentDoc();
    const styleId = `${STYLE_ID_PREFIX}-base-${scriptId.value}`;

    // 检查是否已存在
    if (parentDoc.getElementById(styleId)) {
      console.info('[ACU Styles] Base styles already injected');
      baseStyleEl.value = parentDoc.getElementById(styleId) as HTMLStyleElement;
      return;
    }

    // 创建样式元素
    const styleEl = parentDoc.createElement('style');
    styleEl.id = styleId;
    styleEl.setAttribute('data-source', 'acu-visualizer');
    styleEl.textContent = compiledStyles;
    parentDoc.head.appendChild(styleEl);
    baseStyleEl.value = styleEl;

    console.info('[ACU Styles] Base styles injected');
  };

  /**
   * 注入字体样式
   */
  const injectFontStyles = (): void => {
    const parentDoc = getParentDoc();
    const styleId = `${DYNAMIC_FONT_ID}-${scriptId.value}`;

    // 移除旧的字体样式
    parentDoc.getElementById(styleId)?.remove();

    // 创建新的字体样式元素
    const styleEl = parentDoc.createElement('style');
    styleEl.id = styleId;
    styleEl.setAttribute('data-source', 'acu-visualizer');

    const fontFamily = getFontFamilyValue();
    styleEl.textContent = `
      ${getFontImportCSS()}

      .acu-wrapper,
      .acu-edit-dialog,
      .acu-cell-menu,
      .acu-nav-container,
      .acu-data-card,
      .acu-panel-title,
      .acu-settings-label,
      .acu-btn-block,
      .acu-nav-btn,
      .acu-edit-textarea,
      #acu-ghost-preview {
        font-family: ${fontFamily} !important;
      }
    `;

    parentDoc.head.appendChild(styleEl);
    fontStyleEl.value = styleEl;

    console.info('[ACU Styles] Font styles injected');
  };

  /**
   * 创建动态样式元素
   */
  const createDynamicStyleElement = (): void => {
    const parentDoc = getParentDoc();
    const styleId = `${STYLE_ID_PREFIX}-dynamic-${scriptId.value}`;

    // 移除旧的动态样式
    parentDoc.getElementById(styleId)?.remove();

    // 创建新的动态样式元素
    const styleEl = parentDoc.createElement('style');
    styleEl.id = styleId;
    styleEl.setAttribute('data-source', 'acu-visualizer');
    parentDoc.head.appendChild(styleEl);
    dynamicStyleEl.value = styleEl;

    console.info('[ACU Styles] Dynamic styles element created');
  };

  /**
   * 更新动态 CSS 变量
   */
  const updateDynamicVariables = (): void => {
    if (!dynamicStyleEl.value) return;

    const config = configStore.config;
    const highlightColor = configStore.highlightColorObj;
    const highlightManualColor = configStore.highlightManualColorObj;
    const highlightAiColor = configStore.highlightAiColorObj;
    const titleColor = configStore.titleColorObj;

    // 计算导航栏列数
    const gridColumnsCss =
      config.gridColumns && config.gridColumns > 0
        ? `repeat(${config.gridColumns}, 1fr)`
        : 'repeat(auto-fill, minmax(110px, 1fr))';

    // 生成动态 CSS 变量
    const dynamicCSS = `
      .acu-wrapper {
        /* 卡片配置 */
        --acu-card-width: ${config.cardWidth || 280}px;
        --acu-font-size: ${config.fontSize || 13}px;

        /* 高亮色 (兼容旧样式) */
        --acu-highlight: ${highlightColor.main};
        --acu-highlight-bg: ${highlightColor.bg};
        --acu-accent: ${highlightColor.main};

        /* 手动修改高亮色 */
        --acu-highlight-manual: ${highlightManualColor.main};
        --acu-highlight-manual-bg: ${highlightManualColor.bg};

        /* AI填表高亮色 */
        --acu-highlight-ai: ${highlightAiColor.main};
        --acu-highlight-ai-bg: ${highlightAiColor.bg};

        /* 标题色 */
        --acu-title-color: ${titleColor.main};

        /* 导航栏 */
        --acu-nav-cols: ${gridColumnsCss};

        /* 文本限制 */
        --acu-text-max-height: ${config.limitLongText !== false ? '80px' : 'none'};
        --acu-text-overflow: ${config.limitLongText !== false ? 'auto' : 'visible'};
      }

      /* ============================================================
       * 双色高亮样式 (已移除背景色和动画效果)
       * ============================================================ */

      /* 手动修改高亮 (橙色系) - 仅保留文字颜色 */
      .acu-cell-changed-manual,
      .acu-row-changed-manual .acu-editable-title {
        color: var(--acu-highlight-manual) !important;
        font-weight: bold;
      }

      /* AI填表高亮 (蓝色系) - 仅保留文字颜色 */
      .acu-cell-changed-ai,
      .acu-row-changed-ai .acu-editable-title {
        color: var(--acu-highlight-ai) !important;
        font-weight: bold;
      }

      /* 通用变更高亮 (兼容旧样式) - 仅保留文字颜色 */
      .acu-cell-changed:not(.acu-cell-changed-manual):not(.acu-cell-changed-ai),
      .acu-highlight-changed {
        color: var(--acu-highlight) !important;
        font-weight: bold;
      }
    `;

    dynamicStyleEl.value.textContent = dynamicCSS;
  };

  /**
   * 应用主题类
   * 通过切换 .acu-theme-* 类来切换主题
   */
  const applyTheme = (themeId?: string): void => {
    const parentDoc = getParentDoc();
    const wrapper = parentDoc.querySelector('.acu-wrapper');
    if (!wrapper) return;

    const targetTheme = themeId || configStore.config.theme || 'retro';

    // 移除所有主题类
    THEMES.forEach(theme => {
      wrapper.classList.remove(`acu-theme-${theme.id}`);
    });

    // 添加新主题类
    wrapper.classList.add(`acu-theme-${targetTheme}`);

    console.info(`[ACU Styles] Theme applied: ${targetTheme}`);
  };

  /**
   * 应用布局模式
   */
  const applyLayout = (layout?: 'vertical' | 'horizontal'): void => {
    const parentDoc = getParentDoc();
    const display = parentDoc.querySelector('.acu-data-display');
    if (!display) return;

    const targetLayout = layout || configStore.config.layout || 'vertical';

    display.classList.remove('acu-layout-vertical', 'acu-layout-horizontal');
    display.classList.add(`acu-layout-${targetLayout}`);

    console.info(`[ACU Styles] Layout applied: ${targetLayout}`);
  };

  /**
   * 应用字体
   */
  const applyFont = (fontId?: string): void => {
    // 重新注入字体样式
    injectFontStyles();

    console.info(`[ACU Styles] Font applied: ${fontId || configStore.config.fontFamily}`);
  };

  /**
   * 应用所有配置样式
   * 综合应用主题、布局、字体和动态变量
   */
  const applyAllStyles = (): void => {
    updateDynamicVariables();
    applyTheme();
    applyLayout();
    applyFont();
  };

  /**
   * 清理所有注入的样式
   */
  const cleanup = (): void => {
    const parentDoc = getParentDoc();
    const id = scriptId.value;

    // 移除基础样式
    parentDoc.getElementById(`${STYLE_ID_PREFIX}-base-${id}`)?.remove();

    // 移除动态样式
    parentDoc.getElementById(`${STYLE_ID_PREFIX}-dynamic-${id}`)?.remove();

    // 移除字体样式
    parentDoc.getElementById(`${DYNAMIC_FONT_ID}-${id}`)?.remove();

    baseStyleEl.value = null;
    dynamicStyleEl.value = null;
    fontStyleEl.value = null;
    isInitialized.value = false;

    console.info('[ACU Styles] Styles cleaned up');
  };

  /**
   * 初始化样式系统
   */
  const init = (): void => {
    if (isInitialized.value) {
      console.info('[ACU Styles] Already initialized');
      return;
    }

    // 注入静态样式
    injectBaseStyles();

    // 注入字体样式
    injectFontStyles();

    // 创建动态样式元素
    createDynamicStyleElement();

    // 初始更新动态变量
    updateDynamicVariables();

    isInitialized.value = true;
    console.info('[ACU Styles] Style system initialized');
  };

  // 监听配置变化
  watch(
    () => configStore.config,
    newConfig => {
      if (!isInitialized.value) return;

      // 更新动态变量
      updateDynamicVariables();

      // 检测主题变化
      applyTheme(newConfig.theme);

      // 检测布局变化
      applyLayout(newConfig.layout);
    },
    { deep: true },
  );

  // 监听字体变化（单独监听以触发字体重新加载）
  watch(
    () => configStore.config.fontFamily,
    newFontId => {
      if (!isInitialized.value) return;
      applyFont(newFontId);
    },
  );

  // 生命周期
  onMounted(() => {
    init();
  });

  onUnmounted(() => {
    cleanup();
  });

  return {
    // 状态
    isInitialized,

    // 方法
    init,
    cleanup,
    updateDynamicVariables,
    applyTheme,
    applyLayout,
    applyFont,
    applyAllStyles,

    // 样式元素引用（用于调试）
    baseStyleEl,
    dynamicStyleEl,
    fontStyleEl,
  };
}

// 导出类型
export type UseParentStyleInjection = ReturnType<typeof useParentStyleInjection>;
