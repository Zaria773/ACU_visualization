/**
 * ACU 可视化表格 - 统一存储键定义
 *
 * 存储策略：
 * - 主存储：extensionSettings.acu_visualizer（酒馆原生，最稳定）
 * - 本地缓存：localStorage（离线回退）
 * - 大文件：IndexedDB（头像、背景等）
 */

import type { GraphConfig } from '../stores/useGraphConfigStore';
import {
  DEFAULT_BACKGROUND_CONFIG,
  type ACUConfig,
  type BackgroundConfig,
  type ButtonGroup,
  type CustomFont,
  type DashboardConfig,
  type DivinationConfig,
  type DivinationPreset,
  type FloatingBallAppearance,
  type GlobalTagLibrary,
  type HighlightConfig,
  type ThemePreset,
  type ThemeVarOpacities,
  type ThemeVariables,
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

/** 全局表格 Tab 配置（跨聊天共享，按表名） */
export interface GlobalTabConfig {
  /** 可见表格名列表；空数组=全部显示 */
  visibleTabs: string[];
  /** 表格名排序；空数组=默认顺序 */
  tabOrder: string[];
}

/** 聊天特定配置 */
export interface ChatSpecificConfig {
  /**
   * @deprecated 旧版本遗留字段（按聊天）
   * 现在表格展示配置已改为全局 globalTabConfig，保留仅用于迁移读取
   */
  visibleTabs?: string[];
  /**
   * @deprecated 旧版本遗留字段（按聊天）
   * 现在表格展示配置已改为全局 globalTabConfig，保留仅用于迁移读取
   */
  tabOrder?: string[];
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

/** ACU 运行态配置投影（供 store 使用） */
export interface ACUExtensionSettings {
  version: number;
  lastUpdated: number;

  // 运行态保持与历史结构兼容
  tabs: string[]; // 旧字段，保留兼容
  globalTabConfig: GlobalTabConfig;
  buttons: ButtonsConfig;
  theme: ThemeConfig;
  ui: Partial<ACUConfig>;
  dashboard: Partial<DashboardConfig>;
  tagLibrary: GlobalTagLibrary;
  divination: DivinationFullConfig;
  ball: BallConfig;

  // 聊天配置（共享，不槽位化）
  chats: {
    [chatId: string]: ChatSpecificConfig;
  };
}

/** 双槽位 key */
export type AcuSettingsSlotKey = 'pc' | 'mobile';

/** 槽位核心配置（仅 extensionSettings 核心域） */
export interface ACUCoreSlotConfig {
  globalTabConfig: GlobalTabConfig;
  buttons: ButtonsConfig;
  theme: ThemeConfig;
  ui: Partial<ACUConfig>;
  dashboard: Partial<DashboardConfig>;
  tagLibrary: GlobalTagLibrary;
  divination: DivinationFullConfig;
  ball: BallConfig;
}

/** 双槽位存储结构（存储在 extensionSettings.acu_visualizer） */
export interface ACUExtensionSettingsV2 {
  version: number;
  lastUpdated: number;
  shared: {
    tabs: string[];
    chats: {
      [chatId: string]: ChatSpecificConfig;
    };
  };
  slots: Record<AcuSettingsSlotKey, ACUCoreSlotConfig>;
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
  tableHeights: {},
  tableStyles: {},
  reverseTables: [],
  cellLocks: {},
};

export const DEFAULT_GLOBAL_TAB_CONFIG: GlobalTabConfig = {
  visibleTabs: [],
  tabOrder: [],
};

/** 默认槽位配置工厂（仅用于双槽位核心配置） */
export function createDefaultCoreSlotConfig(): ACUCoreSlotConfig {
  return {
    globalTabConfig: { ...DEFAULT_GLOBAL_TAB_CONFIG },
    buttons: {
      visibleButtons: ['save', 'collapseTab', 'refresh', 'toggle', 'settings'],
      buttonOrder: [
        'save',
        'collapseTab',
        'refresh',
        'toggle',
        'settings',
        'director',
        'saveAs',
        'undo',
        'manualUpdate',
        'purge',
        'pin',
        'openNative',
      ],
      buttonGroups: [],
      longPressDirectExec: false,
    },
    theme: {
      presets: [],
      activePresetId: null,
      themeVars: {},
      themeVarOpacities: {},
      highlight: {
        manualColor: 'orange',
        manualHex: '#d35400',
        aiColor: 'blue',
        aiHex: '#3498db',
        titleColor: 'orange',
        titleHex: '#d35400',
      },
      backgroundConfig: { ...DEFAULT_BACKGROUND_CONFIG },
      customCSS: '',
    },
    ui: {},
    dashboard: { widgets: [], layout: 'grid', columns: 2, showStats: true },
    tagLibrary: { categories: [], tags: [] },
    divination: {
      config: {
        enabled: true,
        drawCount: 4,
        enableBias: true,
        autoSync: true,
        cardBackImage: '',
        themeColor: '#6b4c9a',
        themeId: 'wafuku',
        flipMode: 'auto',
        peepMode: false,
        dimensions: [],
        customTemplate: '',
        enableWordDrawing: true,
        enableTableWords: true,
        enableWordPool: false,
        wordDrawMode: 'perItem',
        wordsPerItem: 1,
        tablePoolConfig: {},
        categoryConfig: {},
        tableSyncConfig: {},
      },
      presets: [],
      activePresetId: null,
    },
    ball: {
      appearance: {
        type: 'icon',
        content: 'fa-layer-group',
        size: 50,
        notifyAnimation: 'ripple',
        borderColor: '#ffffff',
        borderOpacity: 40,
        bgColor: '#ffffff',
        bgOpacity: 25,
        imageInvert: false,
      },
      customFonts: [],
    },
  };
}

/** 默认双槽位配置工厂 */
export function createDefaultExtensionSettingsV2(): ACUExtensionSettingsV2 {
  return {
    version: 2,
    lastUpdated: Date.now(),
    shared: {
      tabs: [],
      chats: {},
    },
    slots: {
      pc: createDefaultCoreSlotConfig(),
      mobile: createDefaultCoreSlotConfig(),
    },
  };
}
