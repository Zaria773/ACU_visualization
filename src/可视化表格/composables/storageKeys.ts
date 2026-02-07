/**
 * ACU 可视化表格 - 统一存储键定义
 *
 * 存储策略：
 * - 主存储：extensionSettings.acu_visualizer（酒馆原生，最稳定）
 * - 本地缓存：localStorage（离线回退）
 * - 大文件：IndexedDB（头像、背景等）
 */

import type { GraphConfig } from '../stores/useGraphConfigStore';
import type {
  ACUConfig,
  BackgroundConfig,
  ButtonGroup,
  CustomFont,
  DashboardConfig,
  DivinationConfig,
  DivinationPreset,
  FloatingBallAppearance,
  GlobalTagLibrary,
  HighlightConfig,
  ThemePreset,
  ThemeVarOpacities,
  ThemeVariables,
} from '../types';

// === 单元格锁定类型 ===

/** 单行的锁定信息 */
export interface RowLockInfo {
  /** 是否整行锁定 */
  _fullRow: boolean;
  /** 字段级锁定的值 */
  _fields: Record<string, string>;
  /** 整行锁定时的完整快照 */
  _snapshot: Record<string, string> | null;
}

/** 表的锁定数据 */
export type TableLocks = Record<string, RowLockInfo>;

/** 完整的锁定存储结构 */
export interface LockStorage {
  [tableName: string]: TableLocks;
}

// === extensionSettings 键名 ===
export const EXT_SETTINGS_KEY = 'acu_visualizer';

// === 类型定义 ===

/** 聊天特定配置 */
export interface ChatSpecificConfig {
  visibleTabs: string[];
  tabOrder: string[];
  tableHeights: Record<string, number>;
  tableStyles: Record<string, 'list' | 'card'>;
  reverseTables: string[];
  cellLocks: LockStorage; // 单元格锁定按聊天分隔
  graphConfig?: GraphConfig; // 关系图配置（按聊天分隔）
}

/** 按钮配置 */
export interface ButtonsConfig {
  visibleButtons: string[];
  buttonOrder: string[];
  buttonGroups: ButtonGroup[];
  longPressDirectExec: boolean;
}

/** 主题配置 */
export interface ThemeConfig {
  presets: ThemePreset[];
  activePresetId: string | null;
  themeVars: Partial<ThemeVariables>;
  themeVarOpacities: ThemeVarOpacities;
  highlight: HighlightConfig;
  backgroundConfig: BackgroundConfig;
  customCSS: string;
}

/** 抽签配置 */
export interface DivinationFullConfig {
  config: DivinationConfig;
  presets: DivinationPreset[];
  activePresetId: string | null;
}

/** 悬浮球外观配置 */
export interface BallConfig {
  appearance: FloatingBallAppearance;
  customFonts: CustomFont[];
}

/** ACU 配置根结构 - 存储在 extensionSettings.acu_visualizer */
export interface ACUExtensionSettings {
  version: number;
  lastUpdated: number;

  // 全局配置（跨聊天共享）
  tabs: string[]; // 保留，可能用于未来的 Tab 配置
  buttons: ButtonsConfig;
  theme: ThemeConfig;
  ui: Partial<ACUConfig>;
  dashboard: Partial<DashboardConfig>;
  tagLibrary: GlobalTagLibrary;
  divination: DivinationFullConfig;
  ball: BallConfig;

  // 聊天配置（按 ChatID 分隔）
  chats: {
    [chatId: string]: ChatSpecificConfig;
  };
}

// === 本地存储键（localStorage） ===
export const LOCAL_KEYS = {
  // 数据快照（用于恢复上次状态）
  DATA_SNAPSHOT: 'acu_data_snapshot_v18_5',

  // extensionSettings 的本地缓存（离线回退用）
  CONFIG_CACHE: 'acu_config_cache_v1',

  // 窗口位置（纯本地，不需要同步）
  WINDOW_POSITION: 'acu_win_position',

  // 悬浮球位置（纯本地）
  BALL_POSITION: 'acu_ball_position',

  // 本地 UI 状态
  LOCAL_STATE: 'acu_local_state',
} as const;

// === IndexedDB 存储键（大文件） ===
export const IDB_KEYS = {
  // 头像图片
  AVATAR_STORE: 'acu_avatars',

  // 背景图片
  BACKGROUND_STORE: 'acu_backgrounds',

  // 行历史记录
  ROW_HISTORY: 'acu_row_history',
} as const;

/** 本地状态 - 存储在 localStorage（纯本地，不同步） */
export interface ACULocalState {
  windowPosition: { x: number; y: number; width: number; isCentered: boolean };
  isCollapsed: boolean;
  isPinned: boolean;
  activeTab: string | null;
  layout: 'horizontal' | 'vertical';
}

// === 默认值 ===
export const DEFAULT_LOCAL_STATE: ACULocalState = {
  windowPosition: { x: 0, y: 0, width: 400, isCentered: true },
  isCollapsed: false,
  isPinned: false,
  activeTab: null,
  layout: 'horizontal',
};

export const DEFAULT_CHAT_CONFIG: ChatSpecificConfig = {
  visibleTabs: [],
  tabOrder: [],
  tableHeights: {},
  tableStyles: {},
  reverseTables: [],
  cellLocks: {},
};
