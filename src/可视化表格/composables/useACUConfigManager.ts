/**
 * ACU 统一配置管理器
 *
 * 使用 extensionSettings 作为主存储
 * - 读取：直接从 SillyTavern.extensionSettings 读取（同步，无需等待）
 * - 写入：修改后调用 saveSettingsDebounced() 持久化
 */

import { reactive, ref } from 'vue';
import { DEFAULT_BACKGROUND_CONFIG } from '../types';
import {
  DEFAULT_CHAT_CONFIG,
  DEFAULT_LOCAL_STATE,
  EXT_SETTINGS_KEY,
  LOCAL_KEYS,
  type ACUExtensionSettings,
  type ACULocalState,
  type BallConfig,
  type ButtonsConfig,
  type ChatSpecificConfig,
  type DivinationFullConfig,
  type ThemeConfig,
} from './storageKeys';

/** 默认按钮配置（导演控制台默认不展示） */
export const DEFAULT_BUTTONS_CONFIG: ButtonsConfig = {
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
};

/** 默认主题配置 */
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
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
};

/** 默认抽签配置 */
export const DEFAULT_DIVINATION_CONFIG: DivinationFullConfig = {
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
};

/** 默认悬浮球配置 */
export const DEFAULT_BALL_CONFIG: BallConfig = {
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
};

// 默认配置
const DEFAULT_CONFIG: ACUExtensionSettings = {
  version: 1,
  lastUpdated: Date.now(),
  tabs: [],
  buttons: { ...DEFAULT_BUTTONS_CONFIG },
  theme: { ...DEFAULT_THEME_CONFIG },
  ui: {},
  dashboard: { widgets: [], layout: 'grid', columns: 2, showStats: true },
  tagLibrary: { categories: [], tags: [] },
  divination: { ...DEFAULT_DIVINATION_CONFIG },
  ball: { ...DEFAULT_BALL_CONFIG },
  chats: {},
};

export function useACUConfigManager() {
  const isLoaded = ref(false);
  const config = reactive<ACUExtensionSettings>({ ...DEFAULT_CONFIG });
  const localState = reactive<ACULocalState>({ ...DEFAULT_LOCAL_STATE });

  /**
   * 深度合并配置（确保嵌套默认值存在）
   */
  function deepMergeConfig(stored: Partial<ACUExtensionSettings>): ACUExtensionSettings {
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      // 深度合并嵌套对象，确保新字段有默认值
      buttons: {
        ...DEFAULT_BUTTONS_CONFIG,
        ...(stored.buttons || {}),
      },
      theme: {
        ...DEFAULT_THEME_CONFIG,
        ...(stored.theme || {}),
        highlight: {
          ...DEFAULT_THEME_CONFIG.highlight,
          ...((stored.theme as any)?.highlight || {}),
        },
        backgroundConfig: {
          ...DEFAULT_THEME_CONFIG.backgroundConfig,
          ...((stored.theme as any)?.backgroundConfig || {}),
        },
      },
      ui: {
        ...DEFAULT_CONFIG.ui,
        ...(stored.ui || {}),
      },
      dashboard: {
        ...DEFAULT_CONFIG.dashboard,
        ...(stored.dashboard || {}),
      },
      tagLibrary: {
        categories: (stored.tagLibrary as any)?.categories || [],
        tags: (stored.tagLibrary as any)?.tags || [],
      },
      divination: {
        ...DEFAULT_DIVINATION_CONFIG,
        ...(stored.divination || {}),
        config: {
          ...DEFAULT_DIVINATION_CONFIG.config,
          ...((stored.divination as any)?.config || {}),
        },
      },
      ball: {
        ...DEFAULT_BALL_CONFIG,
        ...(stored.ball || {}),
        appearance: {
          ...DEFAULT_BALL_CONFIG.appearance,
          ...((stored.ball as any)?.appearance || {}),
        },
      },
      chats: stored.chats || {},
    };
  }

  /**
   * 加载配置（从 extensionSettings，同步操作）
   */
  function loadConfig(): void {
    try {
      // extensionSettings 在页面加载时就已可用，无需等待 API
      const stored = SillyTavern.extensionSettings[EXT_SETTINGS_KEY];

      if (stored) {
        const merged = deepMergeConfig(stored);
        Object.assign(config, merged);
        console.info('[ACU] 配置加载成功');
      } else {
        // 首次使用，初始化默认配置
        Object.assign(config, DEFAULT_CONFIG);
        saveConfig(); // 保存默认配置
        console.info('[ACU] 首次使用，初始化默认配置');
      }

      // 加载本地状态
      loadLocalState();

      // 同时缓存到 localStorage（离线回退用）
      cacheToLocal();
    } catch (e) {
      console.warn('[ACU] 配置加载失败，尝试从本地缓存恢复:', e);

      if (!restoreFromCache()) {
        Object.assign(config, DEFAULT_CONFIG);
        console.warn('[ACU] 使用默认配置');
      }
    }

    isLoaded.value = true;
  }

  /**
   * 保存配置（到 extensionSettings）
   */
  async function saveConfig(): Promise<void> {
    try {
      config.lastUpdated = Date.now();
      SillyTavern.extensionSettings[EXT_SETTINGS_KEY] = { ...config };
      await SillyTavern.saveSettingsDebounced();

      // 同步更新本地缓存
      cacheToLocal();
    } catch (e) {
      console.error('[ACU] 配置保存失败:', e);
    }
  }

  /**
   * 加载本地状态（从 localStorage）
   */
  function loadLocalState(): void {
    try {
      const stored = localStorage.getItem(LOCAL_KEYS.LOCAL_STATE);
      if (stored) {
        Object.assign(localState, DEFAULT_LOCAL_STATE, JSON.parse(stored));
      }
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 保存本地状态（到 localStorage）
   */
  function saveLocalState(): void {
    try {
      localStorage.setItem(LOCAL_KEYS.LOCAL_STATE, JSON.stringify(localState));
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 缓存到 localStorage（离线回退用）
   */
  function cacheToLocal(): void {
    try {
      localStorage.setItem(LOCAL_KEYS.CONFIG_CACHE, JSON.stringify(config));
    } catch (e) {
      // localStorage 可能满，忽略
    }
  }

  /**
   * 从本地缓存恢复
   */
  function restoreFromCache(): boolean {
    try {
      const cached = localStorage.getItem(LOCAL_KEYS.CONFIG_CACHE);
      if (cached) {
        const merged = deepMergeConfig(JSON.parse(cached));
        Object.assign(config, merged);
        return true;
      }
    } catch (e) {
      // 忽略
    }
    return false;
  }

  /**
   * 获取当前聊天的配置
   */
  function getChatConfig(chatId: string): ChatSpecificConfig {
    return config.chats[chatId] ?? { ...DEFAULT_CHAT_CONFIG };
  }

  /**
   * 设置当前聊天的配置
   */
  function setChatConfig(chatId: string, chatConfig: Partial<ChatSpecificConfig>): void {
    if (!config.chats[chatId]) {
      config.chats[chatId] = { ...DEFAULT_CHAT_CONFIG };
    }
    Object.assign(config.chats[chatId], chatConfig);
    saveConfig();
  }

  /**
   * 导出全部配置
   */
  function exportAllConfigs(): string {
    return JSON.stringify(
      {
        exportVersion: 1,
        exportTime: Date.now(),
        config: { ...config },
        localState: { ...localState },
      },
      null,
      2,
    );
  }

  /**
   * 导入配置
   */
  async function importConfigs(jsonString: string): Promise<{ success: boolean; message: string }> {
    try {
      const data = JSON.parse(jsonString);

      if (!data.exportVersion || !data.config) {
        return { success: false, message: '无效的配置文件格式' };
      }

      Object.assign(config, DEFAULT_CONFIG, data.config);
      await saveConfig();

      if (data.localState) {
        Object.assign(localState, DEFAULT_LOCAL_STATE, data.localState);
        saveLocalState();
      }

      return { success: true, message: '配置导入成功' };
    } catch (e) {
      return { success: false, message: `导入失败: ${e}` };
    }
  }

  /**
   * 重置为默认配置
   */
  async function resetToDefault(): Promise<void> {
    Object.assign(config, DEFAULT_CONFIG);
    config.version = 1;
    config.lastUpdated = Date.now();
    await saveConfig();

    Object.assign(localState, DEFAULT_LOCAL_STATE);
    saveLocalState();
  }

  return {
    isLoaded,
    config,
    localState,
    loadConfig,
    saveConfig,
    loadLocalState,
    saveLocalState,
    getChatConfig,
    setChatConfig,
    exportAllConfigs,
    importConfigs,
    resetToDefault,
  };
}

// 单例
let _instance: ReturnType<typeof useACUConfigManager> | null = null;

export function getACUConfigManager() {
  if (!_instance) {
    _instance = useACUConfigManager();
  }
  return _instance;
}
