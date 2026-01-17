/**
 * 配置状态管理 Store
 * 迁移原代码中的配置管理逻辑 (getConfig/saveConfig)
 */

import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type {
  ACUConfig,
  ACUScriptVariables,
  ButtonGroup,
  CustomFont,
  FloatingBallAnimation,
  FloatingBallAppearance,
  NavButtonConfig,
} from '../types';

/** 存储键常量 (保持与原代码兼容) */
const STORAGE_KEY_UI_CONFIG = 'acu_ui_config_v18';

/** 脚本 ID - 用于脚本变量存储 */
const SCRIPT_ID = 'acu_visualizer_ui';

/** 悬浮球外观默认配置 - 保持现有毛玻璃效果 */
export const DEFAULT_BALL_APPEARANCE: FloatingBallAppearance = {
  type: 'icon',
  content: 'fa-layer-group',
  size: 50,
  notifyAnimation: 'ripple',
  borderColor: '#ffffff',
  borderOpacity: 40,
  bgColor: '#ffffff',
  bgOpacity: 25,
};

/** 导航栏按钮定义 */
export const NAV_BUTTONS: NavButtonConfig[] = [
  { id: 'save', icon: 'fa-save', label: '保存' },
  { id: 'saveAs', icon: 'fa-file-export', label: '另存为' },
  { id: 'undo', icon: 'fa-undo', label: '撤回' },
  { id: 'refresh', icon: 'fa-sync-alt', label: '刷新' },
  { id: 'manualUpdate', icon: 'fa-hand-sparkles', label: '手动更新' },
  { id: 'purge', icon: 'fa-eraser', label: '清除范围' },
  { id: 'pin', icon: 'fa-thumbtack', label: '固定面板' },
  { id: 'toggle', icon: 'fa-compress', label: '收起面板' },
  { id: 'openNative', icon: 'fa-external-link-alt', label: '原生编辑器' },
  { id: 'collapseTab', icon: 'fa-box-open', label: '收纳Tab' },
  { id: 'settings', icon: 'fa-cog', label: '设置' },
];

/** 导航栏按钮 ID 类型 */
export type NavButtonId = (typeof NAV_BUTTONS)[number]['id'];

/** 默认可见按钮列表 */
const DEFAULT_VISIBLE_BUTTONS = ['save', 'collapseTab', 'refresh', 'toggle', 'settings'];

/** 默认按钮顺序 */
const DEFAULT_BUTTON_ORDER = [
  'save',
  'collapseTab',
  'refresh',
  'toggle',
  'settings',
  'saveAs',
  'undo',
  'manualUpdate',
  'purge',
  'pin',
  'openNative',
];

/** 默认按钮收纳组 */
const DEFAULT_BUTTON_GROUPS: ButtonGroup[] = [];

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
  buttonGroups: DEFAULT_BUTTON_GROUPS,
  longPressDirectExec: false,
  clearTableOnSwipe: true,
  collapseTabBar: false,
  mobileSafeAreaBottom: 50,
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

  /**
   * 从 hex 颜色生成颜色对象
   */
  function hexToColorObj(hex: string): { main: string; bg: string; name: string } {
    // 确保 hex 格式正确
    const normalizedHex = hex.startsWith('#') ? hex : `#${hex}`;
    // 计算背景色 (10% 透明度)
    const r = parseInt(normalizedHex.slice(1, 3), 16);
    const g = parseInt(normalizedHex.slice(3, 5), 16);
    const b = parseInt(normalizedHex.slice(5, 7), 16);
    return {
      main: normalizedHex,
      bg: `rgba(${r}, ${g}, ${b}, 0.1)`,
      name: '自定义颜色',
    };
  }

  /** 当前高亮颜色对象 (兼容旧配置) */
  const highlightColorObj = computed(() => {
    return HIGHLIGHT_COLORS[config.value.highlightColor as keyof typeof HIGHLIGHT_COLORS] || HIGHLIGHT_COLORS.orange;
  });

  /** 手动修改高亮颜色对象 */
  const highlightManualColorObj = computed(() => {
    // 优先使用自定义 hex 颜色
    if (config.value.highlightManualColor === 'custom' && config.value.customHighlightManualHex) {
      return hexToColorObj(config.value.customHighlightManualHex);
    }
    // 兼容旧配置
    const colorKey = config.value.highlightManualColor || config.value.highlightColor;
    return HIGHLIGHT_COLORS[colorKey as keyof typeof HIGHLIGHT_COLORS] || HIGHLIGHT_COLORS.orange;
  });

  /** AI填表高亮颜色对象 */
  const highlightAiColorObj = computed(() => {
    // 优先使用自定义 hex 颜色
    if (config.value.highlightAiColor === 'custom' && config.value.customHighlightAiHex) {
      return hexToColorObj(config.value.customHighlightAiHex);
    }
    const colorKey = config.value.highlightAiColor || 'blue';
    return HIGHLIGHT_COLORS[colorKey as keyof typeof HIGHLIGHT_COLORS] || HIGHLIGHT_COLORS.blue;
  });

  /** 当前标题颜色对象 */
  const titleColorObj = computed(() => {
    if (config.value.customTitleColor) {
      // 优先使用自定义 hex 颜色
      if (config.value.titleColor === 'custom' && config.value.customTitleHex) {
        return hexToColorObj(config.value.customTitleHex);
      }
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
   * 获取未展示的按钮列表
   * - 排除已显示的按钮
   * - 排除已作为附属按钮的按钮
   * - 排除标记为 hidden 的按钮
   */
  const hiddenButtons = computed(() => {
    const visible = config.value.visibleButtons;
    const groups = config.value.buttonGroups || [];
    const usedSecondaries = groups.map(g => g.secondaryId).filter(Boolean);

    return NAV_BUTTONS.filter(btn => !btn.hidden && !visible.includes(btn.id) && !usedSecondaries.includes(btn.id));
  });

  /**
   * 是否有隐藏的按钮
   */
  const hasHiddenButtons = computed(() => hiddenButtons.value.length > 0);

  /**
   * 获取按钮配置
   * @param buttonId 按钮 ID
   */
  function getButtonConfig(buttonId: string): NavButtonConfig | undefined {
    return NAV_BUTTONS.find(btn => btn.id === buttonId);
  }

  // ============================================================
  // 按钮收纳组配置 Actions
  // ============================================================

  /**
   * 获取按钮收纳组列表
   */
  const buttonGroups = computed(() => config.value.buttonGroups || []);

  /**
   * 获取长按直接执行开关状态
   */
  const longPressDirectExec = computed(() => config.value.longPressDirectExec || false);

  /**
   * 设置按钮收纳组
   * @param groups 收纳组列表
   */
  function setButtonGroups(groups: ButtonGroup[]) {
    config.value.buttonGroups = groups;
  }

  /**
   * 添加按钮收纳组
   * @param primaryId 主按钮 ID
   * @param secondaryId 附属按钮 ID
   */
  function addButtonGroup(primaryId: string, secondaryId: string) {
    // 移除该附属按钮在其他组的关联，同时移除当前主按钮的旧组
    const groups = (config.value.buttonGroups || []).filter(
      g => g.secondaryId !== secondaryId && g.primaryId !== primaryId,
    );
    // 创建新的组
    groups.push({ primaryId, secondaryId });
    config.value.buttonGroups = [...groups]; // 使用新数组触发响应式更新
    console.log('[ACU] addButtonGroup:', primaryId, '->', secondaryId, 'groups:', config.value.buttonGroups);
  }

  /**
   * 移除按钮收纳组中的附属按钮
   * @param primaryId 主按钮 ID
   */
  function removeButtonGroupSecondary(primaryId: string) {
    const groups = (config.value.buttonGroups || []).filter(g => g.primaryId !== primaryId);
    config.value.buttonGroups = [...groups]; // 使用新数组触发响应式更新
    console.log('[ACU] removeButtonGroupSecondary:', primaryId, 'groups:', config.value.buttonGroups);
  }

  /**
   * 获取主按钮的附属按钮 ID
   * @param primaryId 主按钮 ID
   */
  function getSecondaryButtonId(primaryId: string): string | null {
    const group = (config.value.buttonGroups || []).find(g => g.primaryId === primaryId);
    return group?.secondaryId || null;
  }

  /**
   * 检查按钮是否被作为附属按钮使用
   * @param buttonId 按钮 ID
   */
  function isSecondaryButton(buttonId: string): boolean {
    return (config.value.buttonGroups || []).some(g => g.secondaryId === buttonId);
  }

  /**
   * 切换长按直接执行开关
   */
  function toggleLongPressDirectExec() {
    config.value.longPressDirectExec = !config.value.longPressDirectExec;
  }

  /**
   * 设置长按直接执行开关
   * @param value 是否启用
   */
  function setLongPressDirectExec(value: boolean) {
    config.value.longPressDirectExec = value;
  }

  /**
   * 重置按钮配置为默认值
   */
  function resetButtonConfig() {
    config.value.visibleButtons = [...DEFAULT_VISIBLE_BUTTONS];
    config.value.buttonOrder = [...DEFAULT_BUTTON_ORDER];
    config.value.buttonGroups = [...DEFAULT_BUTTON_GROUPS];
    config.value.longPressDirectExec = false;
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
    hiddenButtons,
    hasHiddenButtons,
    getButtonConfig,

    // 按钮收纳组配置
    buttonGroups,
    longPressDirectExec,
    setButtonGroups,
    addButtonGroup,
    removeButtonGroupSecondary,
    getSecondaryButtonId,
    isSecondaryButton,
    toggleLongPressDirectExec,
    setLongPressDirectExec,
    resetButtonConfig,
  };
});

// ============================================================
// 悬浮球外观配置 Store (独立管理，使用脚本变量持久化)
// ============================================================

export const useBallAppearanceStore = defineStore('acu-ball-appearance', () => {
  // ============================================================
  // 状态
  // ============================================================

  /** 悬浮球外观配置 */
  const appearance = ref<FloatingBallAppearance>({ ...DEFAULT_BALL_APPEARANCE });

  /** 自定义字体列表 */
  const customFonts = ref<CustomFont[]>([]);

  /** 是否已从脚本变量加载 */
  const isLoaded = ref(false);

  // ============================================================
  // 脚本变量持久化
  // ============================================================

  /**
   * 从脚本变量加载配置
   */
  function loadFromScriptVariables() {
    try {
      if (typeof getVariables !== 'function') {
        console.warn('[ACU] getVariables 不可用，使用默认配置');
        isLoaded.value = true;
        return;
      }

      const scriptVars = getVariables({ type: 'script', script_id: SCRIPT_ID }) as ACUScriptVariables;

      if (scriptVars?.ballAppearance) {
        appearance.value = { ...DEFAULT_BALL_APPEARANCE, ...scriptVars.ballAppearance };
      }

      if (scriptVars?.customFonts) {
        customFonts.value = scriptVars.customFonts;
      }

      isLoaded.value = true;
      console.info('[ACU] 已从脚本变量加载配置');
    } catch (e) {
      console.error('[ACU] 加载脚本变量失败:', e);
      isLoaded.value = true;
    }
  }

  /**
   * 保存配置到脚本变量
   */
  function saveToScriptVariables() {
    try {
      if (typeof getVariables !== 'function' || typeof replaceVariables !== 'function') {
        console.warn('[ACU] 脚本变量 API 不可用');
        return;
      }

      const scriptVars = getVariables({ type: 'script', script_id: SCRIPT_ID }) as ACUScriptVariables;

      const newVars: ACUScriptVariables = {
        ...scriptVars,
        configVersion: 1,
        ballAppearance: appearance.value,
        customFonts: customFonts.value,
      };

      replaceVariables(newVars, { type: 'script', script_id: SCRIPT_ID });
      console.info('[ACU] 已保存配置到脚本变量');
    } catch (e) {
      console.error('[ACU] 保存脚本变量失败:', e);
    }
  }

  // 监听变化自动保存
  watch(
    [appearance, customFonts],
    () => {
      if (isLoaded.value) {
        saveToScriptVariables();
      }
    },
    { deep: true },
  );

  // ============================================================
  // 悬浮球外观 Actions
  // ============================================================

  /**
   * 更新悬浮球外观配置
   * @param updates 要更新的配置项
   */
  function updateAppearance(updates: Partial<FloatingBallAppearance>) {
    appearance.value = { ...appearance.value, ...updates };
  }

  /**
   * 设置悬浮球图标
   * @param type 图标类型
   * @param content 图标内容
   */
  function setIcon(type: FloatingBallAppearance['type'], content: string) {
    appearance.value.type = type;
    appearance.value.content = content;
  }

  /**
   * 设置悬浮球尺寸
   * @param size 尺寸 (40-100)
   */
  function setSize(size: number) {
    appearance.value.size = Math.max(40, Math.min(100, size));
  }

  /**
   * 设置边框颜色和透明度
   * @param color 颜色 (hex)
   * @param opacity 透明度 (0-100)
   */
  function setBorderColor(color: string, opacity?: number) {
    appearance.value.borderColor = color;
    if (opacity !== undefined) {
      appearance.value.borderOpacity = opacity;
    }
  }

  /**
   * 设置背景颜色和透明度
   * @param color 颜色 (hex)
   * @param opacity 透明度 (0-100)
   */
  function setBgColor(color: string, opacity?: number) {
    appearance.value.bgColor = color;
    if (opacity !== undefined) {
      appearance.value.bgOpacity = opacity;
    }
  }

  /**
   * 设置通知动画类型
   * @param animation 动画类型
   */
  function setNotifyAnimation(animation: FloatingBallAnimation) {
    appearance.value.notifyAnimation = animation;
  }

  /**
   * 重置为默认外观
   */
  function resetAppearance() {
    appearance.value = { ...DEFAULT_BALL_APPEARANCE };
  }

  // ============================================================
  // 自定义字体 Actions
  // ============================================================

  /**
   * 添加自定义字体
   * @param font 字体配置 (不含 id)
   */
  function addFont(font: Omit<CustomFont, 'id'>): CustomFont {
    const newFont: CustomFont = {
      ...font,
      id: `custom_${Date.now()}`,
    };
    customFonts.value.push(newFont);
    return newFont;
  }

  /**
   * 移除自定义字体
   * @param fontId 字体 ID
   */
  function removeFont(fontId: string) {
    const index = customFonts.value.findIndex(f => f.id === fontId);
    if (index > -1) {
      customFonts.value.splice(index, 1);
    }
  }

  /**
   * 获取所有自定义字体的 @import URLs
   */
  const fontImportUrls = computed(() => {
    return customFonts.value.filter(f => f.importUrl).map(f => f.importUrl);
  });

  /**
   * 合并内置字体和自定义字体
   */
  const allFonts = computed(() => {
    return [
      ...FONTS,
      ...customFonts.value.map(f => ({
        id: f.id,
        name: f.name,
        val: f.fontFamily,
      })),
    ];
  });

  // ============================================================
  // 计算属性 - CSS 变量
  // ============================================================

  /**
   * 将 hex 颜色转换为 rgba
   */
  function hexToRgba(hex: string, opacity: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return hex;
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  }

  /**
   * 计算的 CSS 变量对象
   */
  const cssVariables = computed(() => {
    const app = appearance.value;
    return {
      '--ball-size': `${app.size}px`,
      '--ball-border-color': app.borderColor,
      '--ball-border-color-rgba': hexToRgba(app.borderColor, app.borderOpacity),
      '--ball-bg-color': hexToRgba(app.bgColor, app.bgOpacity),
    };
  });

  return {
    // 状态
    appearance,
    customFonts,
    isLoaded,

    // 脚本变量
    loadFromScriptVariables,
    saveToScriptVariables,

    // 悬浮球外观
    updateAppearance,
    setIcon,
    setSize,
    setBorderColor,
    setBgColor,
    setNotifyAnimation,
    resetAppearance,

    // 自定义字体
    addFont,
    removeFont,
    fontImportUrls,
    allFonts,

    // CSS 变量
    cssVariables,
    hexToRgba,
  };
});
