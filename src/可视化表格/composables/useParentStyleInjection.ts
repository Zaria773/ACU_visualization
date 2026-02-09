/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * ACU Visualizer - Parent Style Injection Composable
 *
 * 由于脚本运行在 iframe 中，需要将样式注入到父窗口
 * 使用 teleport 机制将编译后的 CSS 注入到 window.parent.document.head
 */

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { FONTS, THEMES, useConfigStore } from '../stores/useConfigStore';
import { useThemeStore } from '../stores/useThemeStore';
import { getCore } from '../utils/index';

// 导入编译后的 CSS（通过 ?raw 导入）
import compiledStyles from '../styles/index.scss?raw';

// 样式元素 ID 前缀
const STYLE_ID_PREFIX = 'acu-styles';

// 动态字体 ID
const DYNAMIC_FONT_ID = 'acu-dynamic-font';

// 主题自定义 CSS ID
const THEME_CUSTOM_ID = 'acu-theme-custom';

declare function getScriptId(): string;

/**
 * 将 Hex 颜色转换为 RGB 值字符串
 * @param hex - 如 "#d35400" 或 "d35400"
 * @returns 如 "211, 84, 0"
 */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
}

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
  const themeStore = useThemeStore();
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
  const themeCustomStyleEl = ref<HTMLStyleElement | null>(null);

  // 是否已初始化
  const isInitialized = ref(false);

  // 字体 URL 映射
  const FONT_IMPORT_URLS: Record<string, string> = {
    hanchan: 'https://fontsapi.zeoseven.com/3/main/result.css',
    maple: 'https://fontsapi.zeoseven.com/442/main/result.css',
    huiwen: 'https://fontsapi.zeoseven.com/256/main/result.css',
    cooper: 'https://fontsapi.zeoseven.com/482/main/result.css',
    yffyt: 'https://fontsapi.zeoseven.com/446/main/result.css',
    fusion: 'https://fontsapi.zeoseven.com/570/main/result.css',
    wenkai: 'https://fontsapi.zeoseven.com/292/main/result.css',
    notosans: 'https://fontsapi.zeoseven.com/69/main/result.css',
    zhuque: 'https://fontsapi.zeoseven.com/7/main/result.css',
  };

  // 已加载字体缓存
  const loadedFonts = new Set<string>();

  /**
   * 加载字体（非阻塞）
   */
  const loadFont = (fontId: string): void => {
    const url = FONT_IMPORT_URLS[fontId];
    if (!url || fontId === 'default' || loadedFonts.has(fontId)) {
      return;
    }

    const parentDoc = getParentDoc();
    const linkId = `acu-font-${fontId}`;

    // 检查是否已存在
    if (parentDoc.getElementById(linkId)) {
      loadedFonts.add(fontId);
      return;
    }

    // 创建 link 元素
    const link = parentDoc.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = url;
    link.setAttribute('data-source', 'acu-visualizer-font');
    parentDoc.head.appendChild(link);

    loadedFonts.add(fontId);
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
      /* 主容器字体 */
      .acu-wrapper,
      .acu-modal-container,
      .acu-attachment-picker-overlay,
      .acu-toast,
      .acu-edit-dialog,
      .acu-cell-menu,
      .acu-nav-container,
      #acu-ghost-preview {
        font-family: ${fontFamily} !important;
      }

      /* 所有文本元素字体（排除图标） */
      .acu-wrapper p,
      .acu-wrapper div:not(.fa):not(.fas):not(.far):not(.fab),
      .acu-wrapper span:not(.fa):not(.fas):not(.far):not(.fab),
      .acu-wrapper label,
      .acu-wrapper button,
      .acu-wrapper a,
      .acu-wrapper input,
      .acu-wrapper select,
      .acu-wrapper textarea,
      .acu-wrapper th,
      .acu-wrapper td,
      .acu-modal-container p,
      .acu-modal-container div:not(.fa):not(.fas):not(.far):not(.fab),
      .acu-modal-container span:not(.fa):not(.fas):not(.far):not(.fab),
      .acu-modal-container label,
      .acu-modal-container button,
      .acu-modal-container a,
      .acu-modal-container input,
      .acu-modal-container select,
      .acu-modal-container textarea,
      .acu-modal-container th,
      .acu-modal-container td {
        font-family: ${fontFamily} !important;
      }

      /* Toast - 字体跟随设置，颜色使用主文本色 */
      .acu-toast,
      .acu-toast p,
      .acu-toast div,
      .acu-toast span,
      .acu-toast-message {
        font-family: ${fontFamily} !important;
        color: var(--acu-text-main) !important;
        text-shadow: none !important;
      }

      /* Toast 图标 */
      .acu-toast i {
        font-family: 'Font Awesome 6 Free', 'Font Awesome 5 Free', FontAwesome !important;
        color: var(--acu-text-main) !important;
      }

      /* Tab/导航按钮 - 普通态：主文本色 */
      .acu-tab-btn,
      .acu-tab-btn span,
      .acu-tab-btn i,
      .acu-nav-btn,
      .acu-nav-btn span,
      .acu-nav-btn i {
        font-family: ${fontFamily} !important;
        text-shadow: none !important;
        color: var(--acu-text-main) !important;
      }

      /* 导航按钮激活状态 - 背景使用主文本色，文字使用面板背景色(反色) */
      .acu-nav-btn.active,
      .acu-nav-btn.active span,
      .acu-nav-btn.active i {
        background: var(--acu-text-main) !important;
        background-color: var(--acu-text-main) !important;
        color: var(--acu-bg-panel) !important;
      }

      /* 卡片文本 */
      .acu-data-card,
      .acu-data-card p,
      .acu-data-card div:not(.fa):not(.fas):not(.far):not(.fab),
      .acu-data-card span:not(.fa):not(.fas):not(.far):not(.fab),
      .acu-card-label,
      .acu-card-value,
      .acu-grid-label,
      .acu-grid-value,
      .acu-full-label,
      .acu-full-value,
      .acu-editable-title {
        font-family: ${fontFamily} !important;
        text-shadow: none !important;
      }

      /* 其他组件 */
      .acu-panel-title,
      .acu-settings-label,
      .acu-btn-block,
      .acu-nav-btn,
      .acu-edit-textarea {
        font-family: ${fontFamily} !important;
      }

      /* 保护 Font Awesome 图标字体 */
      .acu-wrapper i.fa,
      .acu-wrapper i.fas,
      .acu-wrapper i.far,
      .acu-wrapper i.fab,
      .acu-wrapper .fa,
      .acu-wrapper .fas,
      .acu-wrapper .far,
      .acu-wrapper .fab,
      .acu-modal-container i.fa,
      .acu-modal-container i.fas,
      .acu-modal-container i.far,
      .acu-modal-container i.fab,
      .acu-modal-container .fa,
      .acu-modal-container .fas,
      .acu-modal-container .far,
      .acu-modal-container .fab {
        font-family: 'Font Awesome 6 Free', 'Font Awesome 5 Free', FontAwesome !important;
      }

      /* 颜色污染防护 - 只重置 text-shadow，不覆盖颜色 */
      .acu-wrapper p,
      .acu-wrapper div,
      .acu-wrapper span,
      .acu-wrapper label,
      .acu-wrapper button,
      .acu-modal-container p,
      .acu-modal-container div,
      .acu-modal-container span,
      .acu-modal-container label,
      .acu-modal-container button {
        text-shadow: none !important;
      }

      /* 卡片标题 - 使用主题色 + 用户字体 */
      .acu-editable-title,
      .acu-panel-title {
        color: var(--acu-title-color) !important;
        font-family: ${fontFamily} !important;
      }

      /* 仪表盘标题和内容 */
      .acu-dash-title,
      .acu-dash-title span,
      .acu-dash-title-text {
        font-family: ${fontFamily} !important;
        color: var(--acu-title-color) !important;
        text-shadow: none !important;
      }

      /* 仪表盘图标 */
      .acu-dash-title i,
      .acu-dash-empty i,
      .acu-dash-card i,
      .acu-dash-npc-item i {
        font-family: 'Font Awesome 6 Free', 'Font Awesome 5 Free', FontAwesome !important;
        color: var(--acu-text-sub) !important;
      }

      /* 仪表盘空状态 */
      .acu-dash-empty,
      .acu-dash-empty span {
        font-family: ${fontFamily} !important;
        color: var(--acu-text-sub) !important;
        text-shadow: none !important;
      }

      /* 表格空状态"暂无数据" */
      .acu-empty-state,
      .acu-empty-state p,
      .acu-empty-state span,
      .acu-no-data {
        font-family: ${fontFamily} !important;
        color: var(--acu-text-sub) !important;
        text-shadow: none !important;
      }

      /* 空状态图标 */
      .acu-empty-state i {
        font-family: 'Font Awesome 6 Free', 'Font Awesome 5 Free', FontAwesome !important;
        color: var(--acu-text-sub) !important;
      }

      /* 卡片列名 label - 字体大小受设置控制 */
      label.acu-card-label,
      label.acu-grid-label,
      label.acu-full-label,
      .acu-data-card label.acu-card-label,
      .acu-data-card label.acu-grid-label,
      .acu-data-card label.acu-full-label,
      .acu-wrapper label.acu-card-label,
      .acu-wrapper label.acu-grid-label,
      .acu-wrapper label.acu-full-label {
        font-family: ${fontFamily} !important;
        font-size: calc(var(--acu-font-size, 13px) - 2px) !important;
        text-shadow: none !important;
      }

      /* hint文本 - 使用次要文本色，字体大小受设置控制 */
      .acu-wrapper .hint,
      .acu-wrapper .acu-text-sub,
      .acu-modal-container .hint,
      .acu-modal-container .acu-text-sub,
      .acu-settings-label .hint {
        color: var(--acu-text-sub) !important;
        font-size: calc(var(--acu-font-size, 13px) - 2px) !important;
      }

      /* Tab/Nav 图标使用 Font Awesome */
      .acu-tab-btn i,
      .acu-nav-btn i {
        font-family: 'Font Awesome 6 Free', 'Font Awesome 5 Free', FontAwesome !important;
      }

      /* 手动更新弹窗文本 */
      .acu-manual-update-dialog p,
      .acu-manual-update-dialog div,
      .acu-manual-update-dialog span,
      .acu-manual-update-dialog label,
      .acu-modal-body p,
      .acu-modal-body div,
      .acu-modal-body span,
      .acu-modal-body label {
        color: var(--acu-text-main) !important;
        text-shadow: none !important;
      }

      /* 设置面板返回按钮 - 使用主文本色 */
      .acu-modal-back,
      .acu-modal-back i,
      .acu-back-btn,
      .acu-back-btn i {
        color: var(--acu-text-main) !important;
        font-family: 'Font Awesome 6 Free', 'Font Awesome 5 Free', FontAwesome !important;
      }

      /* 设置面板关闭按钮 */
      .acu-modal-close i,
      .acu-close-pill i {
        font-family: 'Font Awesome 6 Free', 'Font Awesome 5 Free', FontAwesome !important;
        color: inherit !important;
      }

      /* 所有按钮字体 - 统一使用用户设置的字体 */
      .acu-wrapper button,
      .acu-modal-container button,
      .acu-close-pill,
      .acu-tool-btn,
      .acu-btn,
      .acu-btn-primary,
      .acu-btn-secondary,
      .acu-btn-danger,
      .acu-btn-save,
      .btn-cancel,
      .btn-confirm,
      .acu-preset-dropdown-btn,
      .acu-modal-btn,
      .acu-action-btn,
      .acu-page-btn,
      .acu-dialog-btn {
        font-family: ${fontFamily} !important;
      }

      /* 主题面板CSS按钮 */
      .acu-theme-panel button,
      .acu-css-actions button,
      .acu-css-actions .acu-tool-btn {
        font-family: ${fontFamily} !important;
      }

      /* 头像管理弹窗 */
      .acu-avatar-manager-modal button,
      .acu-avatar-manager-modal label,
      .acu-avatar-manager-modal span,
      .acu-avatar-manager button,
      .acu-avatar-manager label,
      .acu-avatar-manager span,
      .acu-avatar-dialog button,
      .acu-avatar-dialog label,
      .acu-avatar-dialog span {
        font-family: ${fontFamily} !important;
      }

      /* 设置面板标题图标 - 使用主文本色 */
      .acu-modal-header i:not(.acu-close-pill i),
      .acu-settings-title i {
        font-family: 'Font Awesome 6 Free', 'Font Awesome 5 Free', FontAwesome !important;
        color: var(--acu-text-main) !important;
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
      .acu-wrapper,
      .acu-modal-container,
      .acu-attachment-picker-overlay,
      .acu-toast,
      .acu-cell-menu {
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
        --acu-title-color-bg: ${titleColor.bg};
        --acu-title-color-rgb: ${hexToRgb(titleColor.main)};

        /* 导航栏 */
        --acu-nav-cols: ${gridColumnsCss};

        /* 文本限制 */
        --acu-text-max-height: ${config.limitLongText !== false ? '80px' : 'none'};
        --acu-text-overflow: ${config.limitLongText !== false ? 'auto' : 'visible'};
      }

      /* ============================================================
       * 双色高亮样式 (已移除背景色和动画效果)
       * ============================================================ */

      /* 手动修改高亮 (橙色系) - 覆盖值元素及其所有子元素 */
      .acu-cell-changed-manual .acu-grid-value,
      .acu-cell-changed-manual .acu-full-value,
      .acu-cell-changed-manual .acu-card-value,
      .acu-cell-changed-manual .acu-grid-value *,
      .acu-cell-changed-manual .acu-full-value *,
      .acu-cell-changed-manual .acu-card-value *,
      .acu-row-changed-manual .acu-editable-title {
        color: var(--acu-highlight-manual) !important;
        font-weight: 600;
      }

      /* AI填表高亮 (蓝色系) - 覆盖值元素及其所有子元素 */
      .acu-cell-changed-ai .acu-grid-value,
      .acu-cell-changed-ai .acu-full-value,
      .acu-cell-changed-ai .acu-card-value,
      .acu-cell-changed-ai .acu-grid-value *,
      .acu-cell-changed-ai .acu-full-value *,
      .acu-cell-changed-ai .acu-card-value *,
      .acu-row-changed-ai .acu-editable-title {
        color: var(--acu-highlight-ai) !important;
        font-weight: 600;
      }

      /* 通用变更高亮 (兼容旧样式) */
      .acu-cell-changed:not(.acu-cell-changed-manual):not(.acu-cell-changed-ai) .acu-grid-value,
      .acu-cell-changed:not(.acu-cell-changed-manual):not(.acu-cell-changed-ai) .acu-full-value,
      .acu-cell-changed:not(.acu-cell-changed-manual):not(.acu-cell-changed-ai) .acu-card-value,
      .acu-cell-changed:not(.acu-cell-changed-manual):not(.acu-cell-changed-ai) .acu-grid-value *,
      .acu-cell-changed:not(.acu-cell-changed-manual):not(.acu-cell-changed-ai) .acu-full-value *,
      .acu-cell-changed:not(.acu-cell-changed-manual):not(.acu-cell-changed-ai) .acu-card-value *,
      .acu-highlight-changed {
        color: var(--acu-title-color) !important;
        font-weight: 600;
      }

      /* ============================================================
       * 酒馆主题污染防护 - 最高优先级覆盖
       * 使用全局选择器 + !important 确保优先级高于酒馆主题
       * ============================================================ */

      /* 滑块 (Range Input) 完全重置 */
      .acu-wrapper input[type="range"],
      .acu-modal-container input[type="range"],
      .acu-settings-control input[type="range"] {
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
        width: 120px !important;
        height: 20px !important;
      }

      /* 滑块圆点 - Webkit */
      .acu-wrapper input[type="range"]::-webkit-slider-thumb,
      .acu-modal-container input[type="range"]::-webkit-slider-thumb,
      .acu-settings-control input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none !important;
        appearance: none !important;
        width: 16px !important;
        height: 16px !important;
        background: var(--acu-title-color) !important;
        background-color: var(--acu-title-color) !important;
        background-image: none !important;
        border-radius: 50% !important;
        border: none !important;
        margin-top: -5px !important;
        cursor: pointer !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2) !important;
      }

      /* 滑块轨道 - Webkit */
      .acu-wrapper input[type="range"]::-webkit-slider-runnable-track,
      .acu-modal-container input[type="range"]::-webkit-slider-runnable-track,
      .acu-settings-control input[type="range"]::-webkit-slider-runnable-track {
        -webkit-appearance: none !important;
        width: 100% !important;
        height: 6px !important;
        background: var(--acu-border) !important;
        background-color: var(--acu-border) !important;
        background-image: none !important;
        border-radius: 3px !important;
        border: none !important;
        cursor: pointer !important;
        box-shadow: none !important;
      }

      /* 滑块圆点 - Firefox */
      .acu-wrapper input[type="range"]::-moz-range-thumb,
      .acu-modal-container input[type="range"]::-moz-range-thumb,
      .acu-settings-control input[type="range"]::-moz-range-thumb {
        -moz-appearance: none !important;
        width: 16px !important;
        height: 16px !important;
        background: var(--acu-title-color) !important;
        background-color: var(--acu-title-color) !important;
        background-image: none !important;
        border-radius: 50% !important;
        border: none !important;
        cursor: pointer !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2) !important;
      }

      /* 滑块轨道 - Firefox */
      .acu-wrapper input[type="range"]::-moz-range-track,
      .acu-modal-container input[type="range"]::-moz-range-track,
      .acu-settings-control input[type="range"]::-moz-range-track {
        -moz-appearance: none !important;
        width: 100% !important;
        height: 6px !important;
        background: var(--acu-border) !important;
        background-color: var(--acu-border) !important;
        background-image: none !important;
        border-radius: 3px !important;
        border: none !important;
        cursor: pointer !important;
        box-shadow: none !important;
      }

      /* 输入框/选择框 污染防护 */
      .acu-wrapper input[type="text"],
      .acu-wrapper input[type="number"],
      .acu-wrapper input[type="password"],
      .acu-wrapper select,
      .acu-wrapper textarea,
      .acu-modal-container input[type="text"],
      .acu-modal-container input[type="number"],
      .acu-modal-container input[type="password"],
      .acu-modal-container select,
      .acu-modal-container textarea,
      .acu-settings-control input[type="text"],
      .acu-settings-control input[type="number"],
      .acu-settings-control select {
        background: var(--acu-card-bg) !important;
        background-color: var(--acu-card-bg) !important;
        background-image: none !important;
        border: 1px solid var(--acu-border) !important;
        border-radius: 6px !important;
        color: var(--acu-text-main) !important;
        font-family: inherit !important;
        font-size: 13px !important;
        text-shadow: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        filter: none !important;
      }

      .acu-wrapper input[type="text"]:hover,
      .acu-wrapper input[type="number"]:hover,
      .acu-wrapper select:hover,
      .acu-modal-container input[type="text"]:hover,
      .acu-modal-container input[type="number"]:hover,
      .acu-modal-container select:hover,
      .acu-settings-control input:hover,
      .acu-settings-control select:hover {
        border-color: var(--acu-title-color) !important;
        background: var(--acu-card-bg) !important;
        background-color: var(--acu-card-bg) !important;
        background-image: none !important;
        box-shadow: 0 0 0 2px var(--acu-title-color-bg) !important;
      }

      .acu-wrapper input[type="text"]:focus,
      .acu-wrapper input[type="number"]:focus,
      .acu-wrapper select:focus,
      .acu-modal-container input[type="text"]:focus,
      .acu-modal-container input[type="number"]:focus,
      .acu-modal-container select:focus,
      .acu-settings-control input:focus,
      .acu-settings-control select:focus {
        border-color: var(--acu-title-color) !important;
        background: var(--acu-card-bg) !important;
        background-color: var(--acu-card-bg) !important;
        background-image: none !important;
        box-shadow: 0 0 0 2px var(--acu-title-color-bg) !important;
        outline: none !important;
      }

      /* 选择框下拉箭头 */
      .acu-wrapper select,
      .acu-modal-container select,
      .acu-settings-control select {
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
        padding-right: 30px !important;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E") !important;
        background-repeat: no-repeat !important;
        background-position: right 8px center !important;
        background-size: 16px !important;
      }

      /* 滚动条 污染防护 */
      .acu-wrapper::-webkit-scrollbar,
      .acu-wrapper *::-webkit-scrollbar,
      .acu-modal-container::-webkit-scrollbar,
      .acu-modal-container *::-webkit-scrollbar {
        width: 6px !important;
        height: 6px !important;
      }

      .acu-wrapper::-webkit-scrollbar-track,
      .acu-wrapper *::-webkit-scrollbar-track,
      .acu-modal-container::-webkit-scrollbar-track,
      .acu-modal-container *::-webkit-scrollbar-track {
        background: transparent !important;
        background-color: transparent !important;
      }

      .acu-wrapper::-webkit-scrollbar-thumb,
      .acu-wrapper *::-webkit-scrollbar-thumb,
      .acu-modal-container::-webkit-scrollbar-thumb,
      .acu-modal-container *::-webkit-scrollbar-thumb {
        background: var(--acu-border) !important;
        background-color: var(--acu-border) !important;
        background-image: none !important;
        border-radius: 3px !important;
        border: none !important;
        box-shadow: none !important;
      }

      .acu-wrapper::-webkit-scrollbar-thumb:hover,
      .acu-wrapper *::-webkit-scrollbar-thumb:hover,
      .acu-modal-container::-webkit-scrollbar-thumb:hover,
      .acu-modal-container *::-webkit-scrollbar-thumb:hover {
        background: var(--acu-text-sub) !important;
        background-color: var(--acu-text-sub) !important;
      }

      /* 文本元素 污染防护 - 必须同时重置 font-family */
      /* 注意：font-size 不使用 !important，允许组件样式覆盖（如 .acu-global-time-primary { font-size: 1.4em }） */
      .acu-wrapper,
      .acu-wrapper p,
      .acu-wrapper div,
      .acu-wrapper span,
      .acu-wrapper label,
      .acu-wrapper li,
      .acu-wrapper a,
      .acu-wrapper button,
      .acu-wrapper th,
      .acu-wrapper td,
      .acu-modal-container,
      .acu-modal-container p,
      .acu-modal-container div,
      .acu-modal-container span,
      .acu-modal-container label,
      .acu-modal-container li,
      .acu-modal-container a,
      .acu-modal-container button,
      .acu-modal-container th,
      .acu-modal-container td {
        font-family: var(--acu-font-family) !important;
        font-size: var(--acu-font-size, 13px);
        text-shadow: none !important;
        line-height: 1.5;
      }

      /* 普通文本颜色 - 特定选择器 */
      .acu-settings-label,
      .acu-card-label,
      .acu-grid-label,
      .acu-full-label,
      .acu-wrapper .acu-card-value,
      .acu-wrapper .acu-grid-value,
      .acu-modal-container .acu-modal-body {
        color: var(--acu-text-main) !important;
        font-size: var(--acu-font-size, 13px) !important;
      }

      /* 次要文本颜色 */
      .acu-wrapper .hint,
      .acu-wrapper .acu-text-sub,
      .acu-modal-container .hint,
      .acu-modal-container .acu-text-sub,
      .acu-settings-label .hint {
        color: var(--acu-text-sub) !important;
        font-size: 11px !important;
      }

      /* 标题 - 使用 --acu-title-color 防止酒馆污染 */
      .acu-wrapper h1,
      .acu-wrapper h2,
      .acu-wrapper h3,
      .acu-wrapper h4,
      .acu-wrapper h5,
      .acu-wrapper h6,
      .acu-modal-container h1,
      .acu-modal-container h2,
      .acu-modal-container h3,
      .acu-modal-container h4,
      .acu-modal-container h5,
      .acu-modal-container h6 {
        color: var(--acu-title-color) !important;
        text-shadow: none !important;
        font-weight: 600 !important;
      }

      /* 弹窗标题 - 使用 --acu-text-main */
      .acu-settings-title,
      .acu-modal-title {
        color: var(--acu-text-main) !important;
        text-shadow: none !important;
        font-weight: 600 !important;
      }

      /* 面板标题和行标题 - 使用 --acu-title-color + 用户字体 */
      .acu-panel-title,
      .acu-editable-title,
      .acu-card-label,
      .acu-grid-label,
      .acu-full-label {
        color: var(--acu-title-color) !important;
        font-family: var(--acu-font-family) !important;
        text-shadow: none !important;
        font-weight: 600 !important;
      }

      /* Tab 按钮 - 精确保护 */
      .acu-tab-btn,
      .acu-tab-btn span,
      .acu-nav-btn,
      .acu-action-btn {
        font-family: var(--acu-font-family) !important;
        font-size: var(--acu-font-size, 13px) !important;
        text-shadow: none !important;
      }


      /* Tab 按钮字体 */
      .acu-tab-btn,
      .acu-nav-btn,
      .acu-action-btn {
        font-family: var(--acu-font-family) !important;
        font-size: var(--acu-font-size, 13px) !important;
        text-shadow: none !important;
      }

      /* 折叠栏标题 */
      .acu-settings-section .acu-settings-title,
      .acu-config-section h4,
      .acu-collapse-header,
      .acu-collapse-title,
      summary {
        font-family: var(--acu-font-family) !important;
        font-size: var(--acu-font-size, 13px) !important;
        color: var(--acu-text-main) !important;
        text-shadow: none !important;
      }

      /* 图标字体保护 - Font Awesome 不应被覆盖 */
      .acu-wrapper i.fa,
      .acu-wrapper i.fas,
      .acu-wrapper i.far,
      .acu-wrapper i.fab,
      .acu-wrapper .fa,
      .acu-wrapper .fas,
      .acu-wrapper .far,
      .acu-wrapper .fab,
      .acu-modal-container i.fa,
      .acu-modal-container i.fas,
      .acu-modal-container i.far,
      .acu-modal-container i.fab,
      .acu-modal-container .fa,
      .acu-modal-container .fas,
      .acu-modal-container .far,
      .acu-modal-container .fab {
        font-family: 'Font Awesome 6 Free', 'Font Awesome 5 Free', FontAwesome !important;
      }
    `;

    dynamicStyleEl.value.textContent = dynamicCSS;
  };

  /**
   * 创建主题自定义 CSS 样式元素
   */
  const createThemeCustomStyleElement = (): void => {
    const parentDoc = getParentDoc();
    const styleId = `${THEME_CUSTOM_ID}-${scriptId.value}`;

    // 移除旧的样式
    parentDoc.getElementById(styleId)?.remove();

    // 创建新的样式元素
    const styleEl = parentDoc.createElement('style');
    styleEl.id = styleId;
    styleEl.setAttribute('data-source', 'acu-visualizer-theme');
    parentDoc.head.appendChild(styleEl);
    themeCustomStyleEl.value = styleEl;

    console.info('[ACU Styles] Theme custom styles element created');
  };

  /**
   * 更新主题自定义 CSS
   * 从 themeStore 获取主题变量覆盖和自定义 CSS
   */
  const updateThemeCustomStyles = (): void => {
    if (!themeCustomStyleEl.value) return;

    // 从 themeStore 获取完整的自定义 CSS
    const customCSS = themeStore.getFullInjectedCSS();
    themeCustomStyleEl.value.textContent = customCSS;

    console.info('[ACU Styles] Theme custom styles updated');
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
    const targetFontId = fontId || configStore.config.fontFamily || 'default';

    // 加载字体（非阻塞）
    loadFont(targetFontId);

    // 重新注入字体样式
    injectFontStyles();

    console.info(`[ACU Styles] Font applied: ${targetFontId}`);
  };

  /**
   * 应用所有配置样式
   * 综合应用主题、布局、字体和动态变量
   */
  const applyAllStyles = (): void => {
    updateDynamicVariables();
    updateThemeCustomStyles();
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

    // 移除所有动态加载的字体 link
    loadedFonts.forEach(fontId => {
      parentDoc.getElementById(`acu-font-${fontId}`)?.remove();
    });
    loadedFonts.clear();

    // 移除主题自定义样式
    parentDoc.getElementById(`${THEME_CUSTOM_ID}-${id}`)?.remove();

    baseStyleEl.value = null;
    dynamicStyleEl.value = null;
    fontStyleEl.value = null;
    themeCustomStyleEl.value = null;
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

    // 初始加载字体
    applyFont();

    // 创建动态样式元素
    createDynamicStyleElement();

    // 创建主题自定义样式元素
    createThemeCustomStyleElement();

    // 加载主题配置
    themeStore.loadFromStorage();

    // 初始更新动态变量
    updateDynamicVariables();

    // 初始更新主题自定义样式
    updateThemeCustomStyles();

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

  // 监听主题自定义配置变化
  watch(
    [
      () => themeStore.currentThemeVars,
      () => themeStore.currentHighlight,
      () => themeStore.customCSS,
      () => themeStore.backgroundConfig,
    ],
    () => {
      if (!isInitialized.value) return;
      updateThemeCustomStyles();
    },
    { deep: true },
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
    updateThemeCustomStyles,
    applyTheme,
    applyLayout,
    applyFont,
    applyAllStyles,

    // 样式元素引用（用于调试）
    baseStyleEl,
    dynamicStyleEl,
    fontStyleEl,
    themeCustomStyleEl,
  };
}

// 导出类型
export type UseParentStyleInjection = ReturnType<typeof useParentStyleInjection>;
