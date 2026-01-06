/**
 * ACU 可视化表格类型定义
 */

/** 变更类型 - 用于区分手动修改和AI填表 */
export type ChangeType = 'manual' | 'ai' | null;

/** 配置类型 - 对应原代码中的 DEFAULT_CONFIG */
export interface ACUConfig {
  /** 主题 */
  theme: string;
  /** 字体 */
  fontFamily: string;
  /** 卡片宽度 */
  cardWidth: number;
  /** 字体大小 */
  fontSize: number;
  /** 每页条数 */
  itemsPerPage: number;
  /** 高亮新内容 */
  highlightNew: boolean;
  /** 高亮颜色 (兼容旧配置，作为手动修改高亮色的别名) */
  highlightColor: string;
  /** 手动修改高亮颜色 */
  highlightManualColor: string;
  /** AI填表高亮颜色 */
  highlightAiColor: string;
  /** 自定义标题颜色 */
  customTitleColor: boolean;
  /** 标题颜色 */
  titleColor: string;
  /** 布局模式 */
  layout: 'vertical' | 'horizontal';
  /** 限制长文本 */
  limitLongText: boolean;
  /** 显示仪表盘 */
  showDashboard: boolean;
  /** 显示分页 */
  showPagination: boolean;
  /** 锁定面板位置 */
  lockPanel: boolean;
  /** 清除数据确认弹窗 */
  purgeConfirmation: boolean;
  /** 底部按钮列数 (0 表示自动) */
  gridColumns?: number;
  /** 双列显示短文本 */
  dualColumnShortText?: boolean;
}

/** 表格数据类型 */
export interface TableData {
  /** 表格 key (如 sheet_1) */
  key: string;
  /** 表头 */
  headers: string[];
  /** 数据行 */
  rows: (string | number)[][];
}

/** 处理后的表格集合 */
export interface ProcessedTables {
  [tableName: string]: TableData;
}

/** 原始表格数据结构 (来自 API) */
export interface RawSheetData {
  /** 表格名称 - 可选，原代码仅处理有 name 属性的 sheet */
  name?: string;
  /** 表格内容 */
  content?: (string | number)[][];
}

/** 原始数据库数据 */
export interface RawDatabaseData {
  [sheetId: string]: RawSheetData;
}

/** 单元格标识信息 */
export interface CellIdentifier {
  /** 表格 key */
  tableKey: string;
  /** 表格名称 */
  tableName: string;
  /** 行索引 */
  rowIndex: number;
  /** 列索引 */
  colIndex: number;
  /** 单元格 ID (用于 diff 追踪) */
  cellId: string;
}

/** 高亮颜色配置 */
export interface HighlightColor {
  main: string;
  bg: string;
  name: string;
}

/** 高亮颜色集合 */
export interface HighlightColors {
  [key: string]: HighlightColor;
}

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

/** 窗口位置配置 */
export interface WindowConfig {
  left?: number | string;
  bottom?: number | string;
  width?: number;
  isCentered?: boolean;
}

/** 表格高度配置 */
export interface TableHeights {
  [tableName: string]: number;
}

/** 表格样式配置 */
export interface TableStyles {
  [tableName: string]: 'list' | 'grid';
}

/** 右键菜单选项 */
export interface MenuOptions {
  x: number;
  y: number;
  content: string;
  tableKey: string;
  tableName: string;
  rowIdx: number;
  colIdx: number;
}

/** 渲染上下文 */
export interface RenderContext {
  tables: ProcessedTables;
  config: ACUConfig;
  currentTab: string | null;
}
