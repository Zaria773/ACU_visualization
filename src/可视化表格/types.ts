/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * ACU Visualizer 类型定义
 */

// ============================================================
// 配置相关类型
// ============================================================

/** 变更类型 - 用于区分手动修改和AI填表 */
export type ChangeType = 'manual' | 'ai' | null;

export interface ACUConfig {
  /** 主题 ID */
  theme: string;
  /** 字体 ID */
  fontFamily: string;
  /** 卡片宽度 */
  cardWidth: number;
  /** 字体大小 */
  fontSize: number;
  /** 每页显示条数 */
  itemsPerPage: number;
  /** 是否高亮新内容 */
  highlightNew: boolean;
  /** 高亮颜色 key (兼容旧配置，作为手动修改高亮色的别名) */
  highlightColor: string;
  /** 手动修改高亮颜色 key */
  highlightManualColor: string;
  /** AI填表高亮颜色 key */
  highlightAiColor: string;
  /** 是否使用自定义标题颜色 */
  customTitleColor: boolean;
  /** 标题颜色 key */
  titleColor: string;
  /** 自定义手动修改高亮色 (hex) */
  customHighlightManualHex?: string;
  /** 自定义 AI 填表高亮色 (hex) */
  customHighlightAiHex?: string;
  /** 自定义标题色 (hex) */
  customTitleHex?: string;
  /** 布局模式 */
  layout: 'vertical' | 'horizontal';
  /** 是否限制长文本 */
  limitLongText: boolean;
  /** 是否显示仪表盘 */
  showDashboard: boolean;
  /** 是否显示分页 */
  showPagination: boolean;
  /** 是否锁定面板位置 */
  lockPanel: boolean;
  /** 清除确认开关 */
  purgeConfirmation: boolean;
  /** 网格列数 (0 表示自动) */
  gridColumns: number;
  /** 是否启用自动保存 */
  autoSave?: boolean;
  /** 自动保存防抖延迟 (毫秒) */
  autoSaveDelay?: number;
  /** 可见的导航栏按钮 ID 列表 */
  visibleButtons: string[];
  /** 导航栏按钮顺序 */
  buttonOrder: string[];
  /** 按钮收纳组配置 */
  buttonGroups: ButtonGroup[];
  /** 长按是否直接执行附属功能（跳过弹出按钮） */
  longPressDirectExec: boolean;
  /** Swipe 时自动清除表格数据 */
  clearTableOnSwipe?: boolean;
  /** 是否收纳Tab栏（隐藏Tab栏，通过导航按钮弹出浮窗） */
  collapseTabBar?: boolean;
  /** 是否显示收纳Tab按钮（仅在收纳Tab栏开启时生效） */
  showCollapseTabButton?: boolean;
  /** 移动端底部安全区大小 (0-150px，0表示禁用) */
  mobileSafeAreaBottom?: number;
  /** 是否自动存入交互标签 */
  autoImportInteractions?: boolean;
}

/** 导航栏按钮配置 */
export interface NavButtonConfig {
  /** 按钮 ID */
  id: string;
  /** 图标 class (FontAwesome) */
  icon: string;
  /** 显示标签 */
  label: string;
  /** 是否默认隐藏 (仅通过长按触发) */
  hidden?: boolean;
}

/**
 * 按钮收纳组配置
 * 用于将两个按钮组合：主按钮正常点击，附属按钮通过长按触发
 */
export interface ButtonGroup {
  /** 主按钮 ID */
  primaryId: string;
  /** 附属按钮 ID（长按触发） */
  secondaryId: string | null;
}

/**
 * Tab 配置项（用于 Tab 自定义面板）
 */
export interface TabConfigEntry {
  /** Tab ID */
  id: string;
  /** Tab 名称 */
  name: string;
  /** Tab 图标 (可选) */
  icon?: string;
  /** Tab 类型 */
  type: 'normal' | 'dashboard' | 'options' | 'special';
  /** 是否可见 */
  visible: boolean;
  /** 排序索引 */
  order: number;
}

/** Tab 配置项 */
export interface TabConfigItem {
  /** Tab ID */
  id: string;
  /** Tab 名称 */
  name: string;
  /** Tab 图标 */
  icon: string;
  /** 是否可见 */
  visible: boolean;
  /** 排序索引 */
  order: number;
}

// ============================================================
// 数据相关类型
// ============================================================

/** 原始数据库数据类型 */
export interface RawDatabaseData {
  [sheetId: string]: {
    name?: string;
    content?: (string | number)[][];
  };
}

/** 表格行数据 */
export interface TableRow {
  /** 行索引 */
  index: number;
  /** 行唯一键 */
  key: string;
  /** 单元格数据 */
  cells: TableCell[];
  /** 是否有变更 */
  changed?: boolean;
  /** 是否待删除 */
  deleting?: boolean;
}

/** 表格单元格数据 */
export interface TableCell {
  /** 列索引 */
  colIndex: number;
  /** 列名/键 */
  key: string;
  /** 单元格值 */
  value: any;
  /** 是否有变更 */
  changed?: boolean;
}

/** 处理后的表格数据 */
export interface ProcessedTable {
  /** 表格 ID */
  id: string;
  /** 表格名称 */
  name: string;
  /** 表头 */
  headers: string[];
  /** 行数据 */
  rows: TableRow[];
}

// ============================================================
// UI 相关类型
// ============================================================

/** 悬浮球位置 */
export interface BallPosition {
  x: number;
  y: number;
}

/** 窗口配置 */
export interface WindowConfig {
  /** 窗口宽度 */
  width?: number;
  /** 左边距 */
  left?: string | number;
  /** 底边距 */
  bottom?: string | number;
  /** 是否居中 */
  isCentered?: boolean;
}

/** Tab 项类型 */
export interface TabItem {
  /** Tab ID */
  id: string;
  /** Tab 名称 */
  name: string;
  /** Tab 图标 */
  icon?: string;
  /** 是否特殊 Tab (仪表盘/选项) */
  special?: boolean;
}

// ============================================================
// 事件相关类型
// ============================================================

/** 单元格点击事件参数 */
export interface CellClickEvent {
  tableId: string;
  rowIndex: number;
  colIndex: number;
  value: string | number;
}

/** Tab 切换事件参数 */
export interface TabChangeEvent {
  tabId: string;
  previousTabId: string | null;
}

// ============================================================
// 主题/样式相关类型
// ============================================================

/** 主题配置 */
export interface ThemeConfig {
  id: string;
  name: string;
  icon: string;
}

/** 字体配置 */
export interface FontConfig {
  id: string;
  name: string;
  val: string;
}

/** 高亮颜色配置 */
export interface HighlightColor {
  main: string;
  bg: string;
  name: string;
}

// ============================================================
// 新增类型定义 - Vue 响应式系统集成
// ============================================================

/** 简化的单元格数据 (用于 Vue 组件) */
export interface CellData {
  /** 列名/键 */
  key: string;
  /** 单元格值 */
  value: string;
}

/** 简化的行数据 (用于 Vue 组件) */
export interface RowData {
  /** 行索引 */
  index: number;
  /** 单元格列表 */
  cells: CellData[];
}

/** 表格数据映射 (tableId -> 行数据列表) */
export type TableData = Record<string, RowData[]>;

/** 楼层信息 */
export interface FloorInfo {
  /** 楼层索引 */
  index: number;
  /** 是否自动选择 */
  isAuto: boolean;
  /** 选择原因说明 */
  reason: string;
}

/** 隔离数据结构 (保持与原代码兼容) */
export interface IsolatedDataEntry {
  /** 独立数据 */
  independentData: Record<string, RawDatabaseData[string]>;
  /** 修改过的键列表 */
  modifiedKeys: string[];
  /** 更新组键列表 */
  updateGroupKeys: string[];
}

/** 消息楼层的 ACU 数据结构 */
export interface MessageACUData {
  /** 隔离数据 (按配置键分组) */
  TavernDB_ACU_IsolatedData?: Record<string, IsolatedDataEntry>;
}

/** SillyTavern 聊天消息类型 */
export interface STChatMessage extends MessageACUData {
  /** 是否用户消息 */
  is_user?: boolean;
  /** 消息内容 */
  mes?: string;
  /** 其他属性 */
  [key: string]: unknown;
}

/** 保存结果类型 */
export interface SaveResult {
  /** 是否成功 */
  success: boolean;
  /** 保存到的楼层索引 (-1 表示失败) */
  savedToFloor: number;
  /** 错误信息 */
  error?: string;
}

// ============================================================
// 悬浮球外观配置
// ============================================================

/** 悬浮球动画类型 */
export type FloatingBallAnimation = 'ripple' | 'arc';

/** 悬浮球图标类型 */
export type FloatingBallIconType = 'icon' | 'emoji' | 'image';

/**
 * 悬浮球外观配置
 * 存储于脚本变量中，随酒馆同步
 */
export interface FloatingBallAppearance {
  /** 图标类型: FontAwesome图标 / Emoji / 自定义图片 */
  type: FloatingBallIconType;
  /**
   * 图标内容:
   * - type='icon': FA class (如 'fa-layer-group')
   * - type='emoji': Emoji字符 (如 '🎭')
   * - type='image': Base64 图片数据
   */
  content: string;
  /** 球体尺寸 (40-100px) */
  size: number;
  /** AI填表通知动画类型 */
  notifyAnimation: FloatingBallAnimation;
  /** 边框颜色 (hex 格式，如 '#90cdf4') */
  borderColor: string;
  /** 边框透明度 (0-100) */
  borderOpacity: number;
  /** 背景颜色 (hex 格式，如 '#2b2b2b') */
  bgColor: string;
  /** 背景透明度 (0-100) */
  bgOpacity: number;
  /** 图片 X 偏移 (0-100)，仅 type='image' 时有效 */
  imageOffsetX?: number;
  /** 图片 Y 偏移 (0-100)，仅 type='image' 时有效 */
  imageOffsetY?: number;
  /** 图片缩放比例 (100-300)，仅 type='image' 时有效 */
  imageScale?: number;
  /** 是否对图片应用反色效果，仅 type='image' 时有效 */
  imageInvert?: boolean;
}

// ============================================================
// 自定义字体配置
// ============================================================

/**
 * 自定义字体项
 * 用于用户添加的在线字体
 */
export interface CustomFont {
  /** 唯一 ID (自动生成) */
  id: string;
  /** 显示名称 */
  name: string;
  /** font-family 值 (如 '"Noto Sans SC", sans-serif') */
  fontFamily: string;
  /** @import URL (如 Google Fonts 链接), 可选 */
  importUrl?: string;
}

// ============================================================
// 脚本变量存储结构
// ============================================================

/**
 * ACU 脚本变量存储结构
 * 使用 getVariables({type: 'script', script_id}) 存取
 */
export interface ACUScriptVariables {
  /** 配置版本号 (用于迁移) */
  configVersion?: number;
  /** 悬浮球外观配置 */
  ballAppearance?: FloatingBallAppearance;
  /** 自定义字体列表 */
  customFonts?: CustomFont[];
  /**
   * 图片存储 (键: 存储键, 值: Base64)
   * 用于悬浮球图标、人际关系图头像等
   */
  images?: Record<string, string>;
  /**
   * 主题预设列表
   */
  themePresets?: ThemePreset[];
  /**
   * 当前激活的预设 ID (为空表示使用默认配置)
   */
  activePresetId?: string;
  /**
   * 主题变量覆盖
   */
  themeVars?: Partial<ThemeVariables>;
  /**
   * 主题变量透明度配置 (0-100)
   */
  themeVarOpacities?: ThemeVarOpacities;
  /**
   * 全局主题背景配置
   */
  backgroundConfig?: BackgroundConfig;
  /**
   * 自定义 CSS
   */
  customCSS?: string;
  /**
   * 抽签系统配置
   */
  divinationConfig?: DivinationConfig;
  /**
   * 抽签维度预设列表
   */
  divinationPresets?: DivinationPreset[];
  /**
   * 当前激活的抽签预设 ID
   */
  activeDivinationPresetId?: string;
}

// ============================================================
// 抽签系统相关类型
// ============================================================

/**
 * 抽签维度预设
 */
export interface DivinationPreset {
  /** 预设唯一 ID */
  id: string;
  /** 预设名称 */
  name: string;
  /** 创建时间 */
  createdAt: string;
  /** 维度配置列表 */
  dimensions: Dimension[];
  /** 是否为内置预设 (不可删除) */
  isBuiltin?: boolean;
}

export type BiasType = 'positive' | 'neutral' | 'negative';

export interface DivinationCategory {
  id: number; // 对应 Worldbook Entry uid
  name: string; // 显示名称 (去除后缀)
  bias: BiasType; // 倾向
  limit: number; // 强制抽取数量
  path: string[]; // 完整路径 (Keys + Name)
  words: string[]; // 解析后的词汇列表
  enabled: boolean; // 是否启用
  rawEntry: any; // 原始世界书条目引用
}

export interface DimensionTier {
  id: string; // 唯一标识
  name: string;
  weight: number;
  prompt: string;
  color?: string; // 颜色 (可选，用于运势等)
}

export interface Dimension {
  id: string;
  name: string;
  enabled: boolean;
  tiers: DimensionTier[];
}

export interface DivinationConfig {
  // 基础设置
  enabled: boolean; // 是否启用抽签系统，默认 true
  drawCount: number; // 总抽取数量 (目标值)，默认 4
  enableBias: boolean; // 是否启用倾向控制，默认 true
  autoSync: boolean; // 是否自动同步 ACU 表格，默认 true

  // 外观设置
  cardBackImage: string; // 卡背图 URL
  themeColor: string; // 主题色
  /** 卡面主题 ID (如 'wafuku', 'mystic') */
  themeId: string;

  // 行为设置
  flipMode: 'auto' | 'manual' | 'skip'; // 翻牌模式
  peepMode?: boolean; // 偷看模式

  // 维度配置 (包含运势，运势通常为第一个维度 id='luck')
  dimensions: Dimension[];

  // 高级设置
  customTemplate: string; // 自定义提示词模板

  // 词库设置
  /** @deprecated 请使用 enableTableWords */
  enableWordDrawing: boolean;
  /** 启用表格随机词 (原 enableWordDrawing) */
  enableTableWords: boolean;
  /** 启用世界书词库 */
  enableWordPool: boolean;

  /** 抽词模式: 'perItem'每项抽x个 | 'custom'自定义limit | 'mixed'混抽 */
  wordDrawMode: 'perItem' | 'custom' | 'mixed';

  /** 每项抽取数（perItem模式使用），1-10 */
  wordsPerItem: number;

  /**
   * @deprecated 使用 tablePoolConfig 代替
   * 表格列配置（旧版：按列分组）
   */
  tableColumnConfig?: Record<
    string,
    {
      enabled: boolean;
      limit: number; // 0 表示不限制
    }
  >;

  /**
   * 表词库配置（按表ID分组）
   * key = 表ID（不含 sheet_ 前缀）
   */
  tablePoolConfig: Record<
    string,
    {
      enabled: boolean;
      limit: number; // 0 表示不限制
    }
  >;

  /** 世界书分类配置（存储每分类的开关和limit） */
  categoryConfig: Record<
    string,
    {
      enabled: boolean;
      limit: number;
    }
  >;

  /**
   * 自动同步的表格配置
   * key = 表 ID
   * value = 是否启用自动同步
   */
  tableSyncConfig?: Record<string, boolean>;
}

export interface DivinationResult {
  luck: LuckTier;
  dimensions: { name: string; value: string; prompt: string }[];
  words: string[];
  timestamp?: number;
}

// ============================================================
// 主题美化与高亮配置
// ============================================================

/** 背景图片配置 */
export interface BackgroundConfig {
  /** 是否启用背景图片 */
  enabled: boolean;
  /** 是否有 IndexedDB 存储的图片（不存储 URL 本身，只标记状态） */
  hasIndexedDBImage: boolean;
  /** 外部图片 URL（http/https）- 直接存储，不放入 IndexedDB */
  externalUrl?: string;
  /**
   * 运行时图片 URL（blob URL 或 externalUrl）
   * 注意：此字段不应持久化，仅用于组件内渲染
   */
  imageUrl: string;
  /** 透明度 0-100 */
  opacity: number;
  /** 填充方式 */
  size: 'cover' | 'contain' | 'auto';
  /** 模糊度 0-20px */
  blur: number;
  /** 水平偏移百分比 (-50 ~ 50) */
  offsetX: number;
  /** 垂直偏移百分比 (-50 ~ 50) */
  offsetY: number;
  /** 缩放比例 (50 ~ 200) */
  scale: number;
}

/** 默认背景配置 */
export const DEFAULT_BACKGROUND_CONFIG: BackgroundConfig = {
  enabled: false,
  hasIndexedDBImage: false,
  externalUrl: undefined,
  imageUrl: '',
  opacity: 30,
  size: 'cover',
  blur: 0,
  offsetX: 0,
  offsetY: 0,
  scale: 100,
};

/**
 * 主题 CSS 变量配置
 * 对应 variables.scss 中的 18 个主题变量
 */
export interface ThemeVariables {
  // 背景色系列 (9个)
  /** 导航栏背景 */
  bgNav?: string;
  /** 面板背景 */
  bgPanel?: string;
  /** 卡片背景 */
  cardBg?: string;
  /** 表头背景 */
  tableHead?: string;
  /** 悬浮背景 */
  tableHover?: string;
  /** 徽章背景 */
  badgeBg?: string;
  /** 输入框背景 */
  inputBg?: string;
  /** 菜单背景 */
  menuBg?: string;
  /** 遮罩背景 */
  overlayBg?: string;

  // 文本色系列 (3个)
  /** 主文本色 */
  textMain?: string;
  /** 次要文本色 */
  textSub?: string;
  /** 菜单文本色 */
  menuText?: string;

  // 边框与按钮 (5个)
  /** 边框色 */
  border?: string;
  /** 按钮背景 */
  btnBg?: string;
  /** 按钮悬浮 */
  btnHover?: string;
  /** 按钮激活背景 */
  btnActiveBg?: string;
  /** 按钮激活文本 */
  btnActiveText?: string;

  // 效果 (1个)
  /** 阴影色 */
  shadow?: string;
}

/**
 * 高亮颜色配置
 */
export interface HighlightConfig {
  /** 手动修改高亮颜色 key (预设颜色 ID) */
  manualColor: string;
  /** 自定义手动修改高亮色 (hex) */
  manualHex?: string;
  /** AI 填表高亮颜色 key (预设颜色 ID) */
  aiColor: string;
  /** 自定义 AI 填表高亮色 (hex) */
  aiHex?: string;
  /** 标题颜色 key (预设颜色 ID) */
  titleColor: string;
  /** 自定义标题色 (hex) */
  titleHex?: string;
}

/**
 * 主题变量透明度配置 (0-100，100=完全不透明)
 */
export type ThemeVarOpacities = Partial<Record<keyof ThemeVariables, number>>;

/**
 * 主题预设配置
 * 保存用户自定义的主题+高亮配置组合
 */
export interface ThemePreset {
  /** 预设唯一 ID */
  id: string;
  /** 预设名称 */
  name: string;
  /** 创建时间 (ISO 字符串) */
  createdAt: string;
  /** 基础主题 ID (如 'retro', 'dark', 'modern' 等) */
  baseTheme: string;
  /**
   * 主题变量覆盖 (自定义的 CSS 变量值)
   * 只保存用户修改过的变量，未修改的使用基础主题值
   */
  themeVars?: Partial<ThemeVariables>;
  /** 主题变量透明度配置 */
  themeVarOpacities?: ThemeVarOpacities;
  /** 高亮颜色配置 */
  highlight: HighlightConfig;
  /** 背景配置 */
  backgroundConfig?: BackgroundConfig;
  /** 自定义 CSS 代码 */
  customCSS?: string;
}

/**
 * CSS 变量名称与键名映射
 * 用于在 ThemeVariables 接口和 CSS 变量之间转换
 */
export const THEME_VAR_CSS_MAP: Record<keyof ThemeVariables, string> = {
  bgNav: '--acu-bg-nav',
  bgPanel: '--acu-bg-panel',
  cardBg: '--acu-card-bg',
  tableHead: '--acu-table-head',
  tableHover: '--acu-table-hover',
  badgeBg: '--acu-badge-bg',
  inputBg: '--acu-input-bg',
  menuBg: '--acu-menu-bg',
  overlayBg: '--acu-overlay-bg',
  textMain: '--acu-text-main',
  textSub: '--acu-text-sub',
  menuText: '--acu-menu-text',
  border: '--acu-border',
  btnBg: '--acu-btn-bg',
  btnHover: '--acu-btn-hover',
  btnActiveBg: '--acu-btn-active-bg',
  btnActiveText: '--acu-btn-active-text',
  shadow: '--acu-shadow',
};

/**
 * 主题变量分组定义
 * 用于 UI 中分组显示 18 个变量
 */
export const THEME_VAR_GROUPS: Array<{
  id: string;
  name: string;
  icon: string;
  vars: Array<{ key: keyof ThemeVariables; label: string }>;
}> = [
  {
    id: 'background',
    name: '背景色',
    icon: 'fa-fill-drip',
    vars: [
      { key: 'bgNav', label: '导航栏背景' },
      { key: 'bgPanel', label: '面板背景' },
      { key: 'cardBg', label: '卡片背景' },
      { key: 'tableHead', label: '表头背景' },
      { key: 'tableHover', label: '悬浮背景' },
      { key: 'badgeBg', label: '徽章背景' },
      { key: 'inputBg', label: '输入框背景' },
      { key: 'menuBg', label: '菜单背景' },
      { key: 'overlayBg', label: '遮罩背景' },
    ],
  },
  {
    id: 'text',
    name: '文本色',
    icon: 'fa-font',
    vars: [
      { key: 'textMain', label: '主文本色' },
      { key: 'textSub', label: '次要文本色' },
      { key: 'menuText', label: '菜单文本色' },
    ],
  },
  {
    id: 'button',
    name: '边框与按钮',
    icon: 'fa-square',
    vars: [
      { key: 'border', label: '边框色' },
      { key: 'btnBg', label: '按钮背景' },
      { key: 'btnHover', label: '按钮悬浮' },
      { key: 'btnActiveBg', label: '按钮激活背景' },
      { key: 'btnActiveText', label: '按钮激活文本' },
    ],
  },
  {
    id: 'effect',
    name: '效果',
    icon: 'fa-magic',
    vars: [{ key: 'shadow', label: '阴影色' }],
  },
];

// ============================================================
// 仪表盘相关类型定义
// ============================================================

/** 看板快捷按钮 ID 类型 */
export type WidgetActionId =
  | 'goToTable' // 跳转到表格
  | 'clear' // 清除表格
  | 'undo' // 撤回
  | 'manualUpdate' // 手动更新
  | 'relationshipGraph' // 人物关系图
  | 'settings' // 设置
  | 'nativeEdit' // 打开原生编辑器
  | 'divination' // 抽签
  | 'console' // 导演控制台
  | 'quickReroll'; // 快捷重抽

/** 看板快捷按钮配置 */
export interface WidgetAction {
  id: WidgetActionId;
  icon: string; // FA 图标 class
  secondaryIcon?: string; // 次级图标（用于双图标显示）
  label: string; // 显示标签
  tooltip?: string; // 悬浮提示
}

/** 看板显示风格 */
export type WidgetDisplayStyle = 'grid' | 'list' | 'global' | 'interaction';

/** 显示风格选项（用于下拉框） */
export const DISPLAY_STYLE_OPTIONS: Array<{ value: WidgetDisplayStyle; label: string }> = [
  { value: 'list', label: '普通列表' },
  { value: 'grid', label: '普通网格' },
  { value: 'global', label: '全局状态' },
  { value: 'interaction', label: '交互表' },
];

/** 单个标签定义 */
export interface TagDefinition {
  /** 标签唯一 ID */
  id: string;
  /** 标签显示文本 */
  label: string;
  /** 提示词模板（支持通配符: {{value}}, {{rowTitle}}, {{playerName}}, {{tableName}}） */
  promptTemplate: string;
  /** 是否固定显示（无论是否从列匹配到） */
  isFixed: boolean;
}

/** 互动标签配置 */
export interface InteractiveTagConfig {
  /** 标签来源列（解析后匹配已定义标签） */
  sourceColumns: string[];
  /** 标签定义库 */
  tagDefinitions: TagDefinition[];
}

/** 单个看板配置 */
export interface DashboardWidgetConfig {
  /** 唯一 ID */
  id: string;
  /** 看板类型 */
  type: 'table' | 'stats' | 'custom' | 'updateStatus' | 'optionsPanel' | 'randomWordPool';
  /** 关联的表格 ID (type='table' 时必填) */
  tableId?: string;
  /** 显示标题 */
  title: string;
  /** 图标 (FA class) */
  icon: string;
  /** 提取的列名列表 (空=显示全部) */
  displayColumns: string[];
  /** 最大显示行数 */
  maxRows: number;
  /** 快捷按钮列表 */
  actions: WidgetActionId[];
  /** 排序索引 */
  order: number;
  /** 是否启用 */
  enabled: boolean;
  /** 宽度权重 (1=单格, 2=双格) */
  colSpan: 1 | 2;
  /** 显示风格 */
  displayStyle: WidgetDisplayStyle;
  /** 行标题列名（留空=默认第一列） */
  titleColumn?: string;
  /** 展示标签来源列名列表（纯展示徽章） */
  displayTagColumns?: string[];
  /** 互动标签配置 */
  interactiveTagConfig?: InteractiveTagConfig;
  /** 新标签系统配置（引用全局标签库） */
  widgetTagConfig?: WidgetTagConfig;
}

/** 仪表盘配置 */
export interface DashboardConfig {
  /** 看板列表 */
  widgets: DashboardWidgetConfig[];
  /** 布局模式 */
  layout: 'grid' | 'list';
  /** 列数 (grid 模式) */
  columns: number;
  /** 是否显示统计卡片 */
  showStats: boolean;
  /** 是否已完成首次默认组件初始化（防止重复添加已删除的组件） */
  hasInitializedDefaults?: boolean;
  /** 配置版本号，用于防止旧配置覆盖新配置（乐观锁） */
  configVersion?: number;
}

/** 预设快捷按钮配置 */
export const WIDGET_ACTIONS: Record<WidgetActionId, WidgetAction> = {
  goToTable: { id: 'goToTable', icon: 'fa-external-link-alt', label: '跳转', tooltip: '跳转到表格' },
  clear: { id: 'clear', icon: 'fa-eraser', label: '清除', tooltip: '清除表格数据' },
  undo: { id: 'undo', icon: 'fa-undo', label: '撤回', tooltip: '撤回上次修改' },
  manualUpdate: { id: 'manualUpdate', icon: 'fa-hand-sparkles', label: '更新', tooltip: '手动更新' },
  relationshipGraph: {
    id: 'relationshipGraph',
    icon: 'fa-project-diagram',
    label: '关系图',
    tooltip: '人物关系图',
  },
  settings: { id: 'settings', icon: 'fa-cog', label: '设置', tooltip: '看板设置' },
  nativeEdit: { id: 'nativeEdit', icon: 'fa-external-link-alt', label: '原生编辑器', tooltip: '打开原生编辑器' },
  divination: { id: 'divination', icon: 'fa-dice', label: '抽签', tooltip: '赛博算卦 - 注入隐藏提示词' },
  console: { id: 'console', icon: 'fa-solid fa-clapperboard', label: '导演控制台', tooltip: '打开导演控制台' },
  quickReroll: {
    id: 'quickReroll',
    icon: 'fa-dice',
    secondaryIcon: 'fa-redo-alt',
    label: '快捷重抽',
    tooltip: '抽签并替换最后一条用户消息中的剧情元指令',
  },
};

/** 看板模板 - 用于快速添加 */
export const WIDGET_TEMPLATES: Record<string, Partial<DashboardWidgetConfig>> = {
  task: {
    type: 'table',
    title: '任务',
    icon: 'fa-tasks',
    displayColumns: ['名称', '任务名', 'name', 'Name', '类型', '状态'],
    maxRows: 5,
    actions: ['goToTable'],
    colSpan: 1,
    displayStyle: 'list',
  },
  item: {
    type: 'table',
    title: '物品',
    icon: 'fa-box-open',
    displayColumns: ['名称', '物品名', 'name', 'Name', '数量'],
    maxRows: 12,
    actions: ['goToTable'],
    colSpan: 1,
    displayStyle: 'grid',
  },
  character: {
    type: 'table',
    title: '主角',
    icon: 'fa-user',
    displayColumns: [],
    maxRows: 1,
    actions: ['goToTable'],
    colSpan: 2,
    displayStyle: 'list',
  },
  location: {
    type: 'table',
    title: '地点',
    icon: 'fa-map-marker-alt',
    displayColumns: ['名称', '地点', 'name', 'Name', '描述'],
    maxRows: 5,
    actions: ['goToTable'],
    colSpan: 1,
    displayStyle: 'list',
  },
  global: {
    type: 'table',
    title: '全局状态',
    icon: 'fa-globe',
    displayColumns: [],
    maxRows: 1,
    actions: ['goToTable'],
    colSpan: 2,
    displayStyle: 'global',
  },
};

/** 表格名称关键词匹配规则 */
export const TABLE_KEYWORD_RULES: Record<string, string[]> = {
  task: ['任务', 'Task', 'task', 'Quest', 'quest', '日程'],
  item: ['物品', '道具', 'Item', 'item', '背包', '库存', '装备', '武器'],
  character: ['主角', '玩家', 'Player', 'player', 'protagonist'],
  location: ['地点', '位置', 'Location', 'location', '场景'],
  global: ['全局', 'Global'],
};

// ============================================================
// 标签系统相关类型定义
// ============================================================

/** 标签分类定义 */
export interface TagCategory {
  /** 分类唯一 ID */
  id: string;
  /** 分类完整路径（用 / 分隔层级，如 "互动/日常"） */
  path: string;
  /** 分类图标（可选，如 "🎭"，只有一级分类需要图标） */
  icon?: string;
  /** 创建时间 */
  createdAt: string;
}

/** 解析后的分类层级信息 */
export interface ParsedCategory {
  /** 原始分类 */
  category: TagCategory;
  /** 一级分类名 */
  level1: string;
  /** 二级分类名（可能为空） */
  level2: string;
  /** 剩余层级（如果有更深层级） */
  rest: string;
}

/** 互动标签定义 - 存储在全局变量中 */
export interface InteractiveTag {
  /** 标签唯一 ID */
  id: string;
  /** 标签显示文本 */
  label: string;
  /** 所属分类 ID（空字符串表示未分类） */
  categoryId: string;
  /** 提示词模板 */
  promptTemplate: string;
  /** 创建时间 */
  createdAt: string;
  /** 【新增】追加前二次编辑：true 时点击标签弹出编辑器让用户修改后再追加 */
  allowPreEdit?: boolean;
}

/** 全局标签库（不按表分） */
export interface GlobalTagLibrary {
  /** 所有分类 */
  categories: TagCategory[];
  /** 所有标签 */
  tags: InteractiveTag[];
}

/** 组件配置中的标签引用 */
export interface WidgetTagConfig {
  /** 已展示的标签 ID 列表 */
  displayedTagIds: string[];
  /** 【新增】已展示的分类 ID 列表（点击后弹出子标签选择） */
  displayedCategoryIds?: string[];
}

// ============================================================
// 标签管理器模式与导入导出类型
// ============================================================

/** 标签管理器模式 */
export type TagManagerMode =
  | 'normal' // 普通模式：点击编辑
  | 'create' // 新建模式：点击弹出空白编辑器
  | 'add' // 添加模式：点击添加到已展示
  | 'delete' // 删除模式：点击删除
  | 'migrate' // 迁移模式：选中后迁移
  | 'export'; // 导出模式：多选导出

/** 标签库导出格式 */
export interface TagLibraryExport {
  /** 格式版本 */
  version: '1.0';
  /** 导出时间 */
  exportedAt: string;
  /** 分类列表 */
  categories: Array<{
    id: string;
    path: string;
    icon?: string;
  }>;
  /** 标签列表 */
  tags: Array<{
    id: string;
    label: string;
    /** 分类路径（非 ID，便于跨库导入） */
    category: string;
    prompt: string;
    allowPreEdit?: boolean;
  }>;
}

/** 导入选项 */
export interface ImportOptions {
  /** 冲突处理策略 */
  conflictStrategy: 'overwrite' | 'rename';
}

/** 导入结果 */
export interface ImportResult {
  /** 是否成功 */
  success: boolean;
  /** 新增的分类数 */
  addedCategories: number;
  /** 新增的标签数 */
  addedTags: number;
  /** 更新的标签数（覆盖模式） */
  updatedTags: number;
  /** 重命名的标签数（重命名模式） */
  renamedTags: number;
  /** 错误信息（如果失败） */
  error?: string;
}

// ============================================================
// 全局 API 类型定义
// ============================================================

export interface AutoCardUpdaterAPI {
  // 表格模板相关
  getTemplatePresetNames: () => string[];
  switchTemplatePreset: (name: string) => Promise<{ success: boolean; message: string }>;
  importTemplateFromData: (data: string | object) => Promise<{ success: boolean; message: string }>;

  // 剧情推进相关
  getPlotPresetNames: () => string[];
  getCurrentPlotPreset: () => string;
  switchPlotPreset: (name: string) => boolean;
  importPlotPresetFromData: (
    data: string | object,
    options?: { overwrite?: boolean; switchTo?: boolean },
  ) => Promise<{ success: boolean; message: string; presetName?: string }>;
}

declare global {
  interface Window {
    AutoCardUpdaterAPI?: AutoCardUpdaterAPI;
  }
}
