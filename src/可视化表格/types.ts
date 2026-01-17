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
  /** 移动端底部安全区大小 (0-150px，0表示禁用) */
  mobileSafeAreaBottom?: number;
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
  value: string | number;
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
}

// ============================================================
// 主题美化与高亮配置
// ============================================================

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
  /** 高亮颜色配置 */
  highlight: HighlightConfig;
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
  | 'nativeEdit'; // 打开原生编辑器

/** 看板快捷按钮配置 */
export interface WidgetAction {
  id: WidgetActionId;
  icon: string; // FA 图标 class
  label: string; // 显示标签
  tooltip?: string; // 悬浮提示
}

/** 看板显示风格 */
export type WidgetDisplayStyle = 'grid' | 'list' | 'compact';

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
  type: 'table' | 'stats' | 'custom' | 'updateStatus' | 'optionsPanel';
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
};

/** 看板模板 - 用于快速添加 */
export const WIDGET_TEMPLATES: Record<string, Partial<DashboardWidgetConfig>> = {
  npc: {
    type: 'table',
    title: 'NPC',
    icon: 'fa-users',
    displayColumns: ['名称', '姓名', 'name', 'Name', '状态', '好感度'],
    maxRows: 8,
    actions: ['goToTable', 'relationshipGraph'],
    colSpan: 1,
    displayStyle: 'grid',
  },
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
    actions: ['goToTable', 'clear'],
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
};

/** 表格名称关键词匹配规则 */
export const TABLE_KEYWORD_RULES: Record<string, string[]> = {
  npc: ['NPC', 'npc', '人物', '角色', '关系', '好感', '重要人物'],
  task: ['任务', 'Task', 'task', 'Quest', 'quest', '日程'],
  item: ['物品', '道具', 'Item', 'item', '背包', '库存', '装备'],
  character: ['主角', '玩家', 'Player', 'player', '属性', 'protagonist'],
  location: ['地点', '位置', 'Location', 'location', '场景'],
};
