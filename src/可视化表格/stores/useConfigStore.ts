/**
 * 配置状态管理 Store
 * 迁移原代码中的配置管理逻辑 (getConfig/saveConfig)
 */

import { useStorage } from '@vueuse/core';
import type { ACUConfig, NavButtonConfig } from '../types';

/** 存储键常量 (保持与原代码兼容) */
const STORAGE_KEY_UI_CONFIG = 'acu_ui_config_v18';

/** 导航栏按钮定义 */
export const NAV_BUTTONS: NavButtonConfig[] = [
  { id: 'save', icon: 'fa-save', label: '保存', longPress: 'saveAs' },
  { id: 'saveAs', icon: 'fa-file-export', label: '另存为' },
  { id: 'refresh', icon: 'fa-sync-alt', label: '刷新' },
  { id: 'manualUpdate', icon: 'fa-hand-sparkles', label: '手动更新' },
  { id: 'purge', icon: 'fa-eraser', label: '清除范围' },
  { id: 'pin', icon: 'fa-thumbtack', label: '固定面板' },
  { id: 'toggle', icon: 'fa-compress', label: '收起面板' },
  { id: 'openNative', icon: 'fa-external-link-alt', label: '原生编辑器' },
  { id: 'settings', icon: 'fa-cog', label: '设置', longPress: 'openNative' },
];

/** 导航栏按钮 ID 类型 */
export type NavButtonId = (typeof NAV_BUTTONS)[number]['id'];

/** 默认可见按钮列表 */
const DEFAULT_VISIBLE_BUTTONS = ['save', 'refresh', 'manualUpdate', 'settings', 'pin', 'toggle'];

/** 默认按钮顺序 */
const DEFAULT_BUTTON_ORDER = ['save', 'saveAs', 'refresh', 'manualUpdate', 'purge', 'pin', 'toggle', 'settings'];

/** 默认配置 - 对应原代码 DEFAULT_CONFIG */
export const DEFAULT_CONFIG: ACUConfig = {
  theme: 'retro',
  fontFamily: 'default',
  cardWidth: 280,
  fontSize: 13,
  itemsPerPage: 20,
  highlightNew: true,
  highlightColor: 'orange',
  highlightManualColor: 'orange',
  highlightAiColor: 'blue',
  customTitleColor: false,
  titleColor: 'orange',
  layout: 'vertical',
  limitLongText: true,
  showDashboard: true,
  showPagination: true,
  lockPanel: false,
  purgeConfirmation: true,
  gridColumns: 0,
  autoSave: false,
  autoSaveDelay: 5000,
  visibleButtons: DEFAULT_VISIBLE_BUTTONS,
  buttonOrder: DEFAULT_BUTTON_ORDER,
};

/** 主题配置列表 */
export const THEMES = [
  { id: 'retro', name: '复古羊皮', icon: 'fa-scroll' },
  { id: 'dark', name: '极夜深空', icon: 'fa-moon' },
  { id: 'modern', name: '现代清爽', icon: 'fa-sun' },
  { id: 'forest', name: '森之物语', icon: 'fa-tree' },
  { id: 'ocean', name: '深海幽蓝', icon: 'fa-water' },
  { id: 'cyber', name: '赛博霓虹', icon: 'fa-bolt' },
  { id: 'purple', name: '梦幻浅紫', icon: 'fa-magic' },
] as const;

/** 字体配置列表 */
export const FONTS = [
  { id: 'default', name: '系统默认 (Modern)', val: `'Segoe UI', 'Microsoft YaHei', sans-serif` },
  { id: 'hanchan', name: '寒蝉全圆体', val: `"寒蝉全圆体", sans-serif` },
  { id: 'maple', name: 'Maple Mono (代码风)', val: `"Maple Mono NF CN", monospace` },
  { id: 'huiwen', name: '汇文明朝体 (Huiwen)', val: `"Huiwen-mincho", serif` },
  { id: 'cooper', name: 'Cooper正楷', val: `"CooperZhengKai", serif` },
  { id: 'yffyt', name: 'YFFYT (艺术体)', val: `"YFFYT", sans-serif` },
  { id: 'fusion', name: 'Fusion Pixel (像素风)', val: `"Fusion Pixel 12px M latin", monospace` },
  { id: 'wenkai', name: '霞鹜文楷 (WenKai)', val: `"LXGW WenKai", serif` },
  { id: 'notosans', name: '思源黑体 (Noto Sans)', val: `"Noto Sans CJK", sans-serif` },
  { id: 'zhuque', name: '朱雀仿宋 (Zhuque)', val: `"Zhuque Fangsong (technical preview)", serif` },
] as const;

/** 高亮颜色配置 */
export const HIGHLIGHT_COLORS = {
  orange: { main: '#d35400', bg: 'rgba(211, 84, 0, 0.1)', name: '活力橙' },
  red: { main: '#e74c3c', bg: 'rgba(231, 76, 60, 0.1)', name: '警示红' },
  blue: { main: '#3498db', bg: 'rgba(52, 152, 219, 0.1)', name: '天空蓝' },
  green: { main: '#27ae60', bg: 'rgba(39, 174, 96, 0.1)', name: '自然绿' },
  purple: { main: '#9b59b6', bg: 'rgba(155, 89, 182, 0.1)', name: '罗兰紫' },
  teal: { main: '#1abc9c', bg: 'rgba(26, 188, 156, 0.1)', name: '青绿' },
  pink: { main: '#e91e63', bg: 'rgba(233, 30, 99, 0.1)', name: '少女粉' },
  lime: { main: '#82c91e', bg: 'rgba(130, 201, 30, 0.1)', name: '酸橙' },
  indigo: { main: '#3f51b5', bg: 'rgba(63, 81, 181, 0.1)', name: '靛蓝' },
  cyan: { main: '#00bcd4', bg: 'rgba(0, 188, 212, 0.1)', name: '青色' },
  brown: { main: '#795548', bg: 'rgba(121, 85, 72, 0.1)', name: '咖啡' },
  grey: { main: '#607d8b', bg: 'rgba(96, 125, 139, 0.1)', name: '蓝灰' },
} as const;

export const useConfigStore = defineStore('acu-config', () => {
  // ============================================================
  // 持久化状态 - 使用 useStorage 自动同步 localStorage
  // ============================================================

  /** 配置状态 - 合并默认值 */
  const config = useStorage<ACUConfig>(STORAGE_KEY_UI_CONFIG, DEFAULT_CONFIG, localStorage, {
    mergeDefaults: true, // 确保新增的配置项有默认值
  });

  // ============================================================
  // Getters
  // ============================================================

  /** 当前主题 */
  const theme = computed(() => config.value.theme);

  /** 当前字体 */
  const fontFamily = computed(() => config.value.fontFamily);

  /** 当前字体值 */
  const fontFamilyValue = computed(() => {
    const font = FONTS.find(f => f.id === config.value.fontFamily);
    return font?.val || FONTS[0].val;
  });

  /** 当前高亮颜色对象 (兼容旧配置) */
  const highlightColorObj = computed(() => {
    return HIGHLIGHT_COLORS[config.value.highlightColor as keyof typeof HIGHLIGHT_COLORS] || HIGHLIGHT_COLORS.orange;
  });

  /** 手动修改高亮颜色对象 */
  const highlightManualColorObj = computed(() => {
    // 优先使用新配置，兼容旧配置
    const colorKey = config.value.highlightManualColor || config.value.highlightColor;
    return HIGHLIGHT_COLORS[colorKey as keyof typeof HIGHLIGHT_COLORS] || HIGHLIGHT_COLORS.orange;
  });

  /** AI填表高亮颜色对象 */
  const highlightAiColorObj = computed(() => {
    const colorKey = config.value.highlightAiColor || 'blue';
    return HIGHLIGHT_COLORS[colorKey as keyof typeof HIGHLIGHT_COLORS] || HIGHLIGHT_COLORS.blue;
  });

  /** 当前标题颜色对象 */
  const titleColorObj = computed(() => {
    if (config.value.customTitleColor) {
      return HIGHLIGHT_COLORS[config.value.titleColor as keyof typeof HIGHLIGHT_COLORS] || HIGHLIGHT_COLORS.orange;
    }
    return highlightManualColorObj.value;
  });

  /** 网格列数 CSS 值 */
  const gridColumnsCss = computed(() => {
    return config.value.gridColumns && config.value.gridColumns > 0
      ? `repeat(${config.value.gridColumns}, 1fr)`
      : 'repeat(auto-fill, minmax(110px, 1fr))';
  });

  // ============================================================
  // Actions
  // ============================================================

  /**
   * 更新配置
   * @param updates 要更新的配置项
   */
  function updateConfig(updates: Partial<ACUConfig>) {
    config.value = { ...config.value, ...updates };
  }

  /**
   * 重置配置为默认值
   */
  function resetConfig() {
    config.value = { ...DEFAULT_CONFIG };
  }

  /**
   * 设置主题
   * @param themeId 主题 ID
   */
  function setTheme(themeId: string) {
    updateConfig({ theme: themeId });
  }

  /**
   * 设置字体
   * @param fontId 字体 ID
   */
  function setFontFamily(fontId: string) {
    updateConfig({ fontFamily: fontId });
  }

  /**
   * 设置布局模式
   * @param layout 布局模式
   */
  function setLayout(layout: 'vertical' | 'horizontal') {
    updateConfig({ layout });
  }

  /**
   * 设置高亮颜色 (兼容旧API，同时更新手动修改高亮色)
   * @param colorKey 颜色 key
   */
  function setHighlightColor(colorKey: string) {
    updateConfig({ highlightColor: colorKey, highlightManualColor: colorKey });
  }

  /**
   * 设置手动修改高亮颜色
   * @param colorKey 颜色 key
   */
  function setHighlightManualColor(colorKey: string) {
    updateConfig({ highlightManualColor: colorKey, highlightColor: colorKey });
  }

  /**
   * 设置AI填表高亮颜色
   * @param colorKey 颜色 key
   */
  function setHighlightAiColor(colorKey: string) {
    updateConfig({ highlightAiColor: colorKey });
  }

  /**
   * 设置标题颜色
   * @param colorKey 颜色 key
   */
  function setTitleColor(colorKey: string) {
    updateConfig({ titleColor: colorKey });
  }

  /**
   * 切换高亮新内容
   */
  function toggleHighlightNew() {
    updateConfig({ highlightNew: !config.value.highlightNew });
  }

  /**
   * 切换自定义标题颜色
   */
  function toggleCustomTitleColor() {
    updateConfig({ customTitleColor: !config.value.customTitleColor });
  }

  /**
   * 切换显示仪表盘
   */
  function toggleShowDashboard() {
    updateConfig({ showDashboard: !config.value.showDashboard });
  }

  /**
   * 切换显示分页
   */
  function toggleShowPagination() {
    updateConfig({ showPagination: !config.value.showPagination });
  }

  /**
   * 切换锁定面板
   */
  function toggleLockPanel() {
    updateConfig({ lockPanel: !config.value.lockPanel });
  }

  /**
   * 切换长文本限制
   */
  function toggleLimitLongText() {
    updateConfig({ limitLongText: !config.value.limitLongText });
  }

  // ============================================================
  // 导航栏按钮配置 Actions
  // ============================================================

  /**
   * 更新可见按钮列表
   * @param buttons 按钮 ID 列表
   */
  function setVisibleButtons(buttons: string[]) {
    config.value.visibleButtons = buttons;
  }

  /**
   * 更新按钮顺序
   * @param order 按钮 ID 顺序列表
   */
  function setButtonOrder(order: string[]) {
    config.value.buttonOrder = order;
  }

  /**
   * 检查按钮是否可见
   * @param buttonId 按钮 ID
   */
  function isButtonVisible(buttonId: string): boolean {
    return config.value.visibleButtons.includes(buttonId);
  }

  /**
   * 切换按钮可见性
   * @param buttonId 按钮 ID
   */
  function toggleButtonVisibility(buttonId: string) {
    const current = [...config.value.visibleButtons];
    const index = current.indexOf(buttonId);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(buttonId);
    }
    config.value.visibleButtons = current;
  }

  /**
   * 获取排序后的可见按钮列表
   */
  const sortedVisibleButtons = computed(() => {
    const order = config.value.buttonOrder;
    const visible = config.value.visibleButtons;
    // 按照 buttonOrder 的顺序过滤出可见的按钮
    return order.filter((id: string) => visible.includes(id));
  });

  /**
   * 获取按钮配置
   * @param buttonId 按钮 ID
   */
  function getButtonConfig(buttonId: string): NavButtonConfig | undefined {
    return NAV_BUTTONS.find(btn => btn.id === buttonId);
  }

  return {
    // 状态
    config,

    // Getters
    theme,
    fontFamily,
    fontFamilyValue,
    highlightColorObj,
    highlightManualColorObj,
    highlightAiColorObj,
    titleColorObj,
    gridColumnsCss,

    // Actions
    updateConfig,
    resetConfig,
    setTheme,
    setFontFamily,
    setLayout,
    setHighlightColor,
    setHighlightManualColor,
    setHighlightAiColor,
    setTitleColor,
    toggleHighlightNew,
    toggleCustomTitleColor,
    toggleShowDashboard,
    toggleShowPagination,
    toggleLockPanel,
    toggleLimitLongText,

    // 导航栏按钮配置
    setVisibleButtons,
    setButtonOrder,
    isButtonVisible,
    toggleButtonVisibility,
    sortedVisibleButtons,
    getButtonConfig,
  };
});
