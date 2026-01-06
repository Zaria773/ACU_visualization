/**
 * ACU Visualizer 类型定义
 */

// ============================================================
// 存储键常量 (保持与原代码兼容)
// ============================================================

/** 存储键名常量 - 兼容旧版本 */
export const STORAGE_KEYS = {
  /** 数据快照 */
  SNAPSHOT: 'acu_data_snapshot_v18_5',
  /** 表格顺序 */
  TABLE_ORDER: 'acu_table_order',
  /** 当前活跃标签页 */
  ACTIVE_TAB: 'acu_active_tab',
  /** UI 配置 */
  UI_CONFIG: 'acu_ui_config_v18',
  /** 折叠状态 */
  UI_COLLAPSE: 'acu_ui_collapse',
  /** 表格高度 */
  TABLE_HEIGHTS: 'acu_table_heights',
  /** 倒序表格列表 */
  REVERSE_TABLES: 'acu_reverse_tables',
  /** 固定状态 */
  PIN: 'acu_pin',
  /** 表格样式 */
  TABLE_STYLES: 'acu_table_styles',
  /** 窗口配置 */
  WINDOW_CONFIG: 'acu_win_config',
  /** V5 隔离设置 */
  V5_SETTINGS: 'shujuku_v34_allSettings_v2',
} as const;

// ============================================================
// 配置相关类型
// ============================================================

/** ACU 配置对象类型 */
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
}

/** 导航栏按钮配置 */
export interface NavButtonConfig {
  /** 按钮 ID */
  id: string;
  /** 图标 class (FontAwesome) */
  icon: string;
  /** 显示标签 */
  label: string;
  /** 长按触发的按钮 ID */
  longPress?: string;
  /** 是否默认隐藏 (仅通过长按触发) */
  hidden?: boolean;
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
