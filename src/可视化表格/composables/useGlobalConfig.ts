/**
 * 全局配置管理 Composable
 *
 * 负责管理存储在酒馆全局变量中的配置信息，包括：
 * 1. 全局配置 (Global Config): 按钮配置等 (与聊天无关)
 * 2. 聊天配置 (Chat Config): Tab 显示/排序、表格高度等 (按 Chat ID 分隔)
 *
 * 对应全局变量键名: acu_visualizer_config
 */

import { useDebounceFn } from '@vueuse/core';
import { klona } from 'klona';
import { computed, ref, toRaw } from 'vue';
import type { ButtonGroup } from '../types';

// eventOn 和 tavern_events 是全局可用的，定义在 @types/iframe/event.d.ts
// getVariables 和 replaceVariables 是全局可用的，定义在 @types/function/variables.d.ts
// SillyTavern 是全局可用的，定义在 @types/iframe/exported.sillytavern.d.ts

// ============================================================
// 类型定义
// ============================================================

/** 聊天特定配置 */
export interface ChatConfig {
  /** 可见的 Tab ID 列表 */
  visibleTabs: string[];
  /** Tab 排序列表 */
  tabOrder: string[];
  /** 表格高度记录 (tableId -> height) */
  tableHeights: Record<string, number>;
  /** 表格显示样式 (tableId -> style) */
  tableStyles: Record<string, 'list' | 'card'>;
  /** 倒序显示的表格 ID 列表 */
  reverseTables: string[];
}

/** 全局通用配置 */
export interface GlobalConfig {
  /** 可见的按钮 ID 列表 */
  visibleButtons: string[];
  /** 按钮排序列表 */
  buttonOrder: string[];
  /** 按钮收纳组 */
  buttonGroups: ButtonGroup[];
  /** 长按是否直接执行 */
  longPressDirectExec: boolean;
}

/** 完整配置结构 */
export interface ACUVisualizerConfig {
  /** 配置版本号 */
  configVersion: number;
  /** 全局配置 */
  global: GlobalConfig;
  /** 聊天配置集合 */
  chats: Record<string, ChatConfig>;
  /** 最后使用的聊天 ID */
  lastChatId?: string;
}

// ============================================================
// 常量定义
// ============================================================

const GLOBAL_CONFIG_KEY = 'acu_visualizer_config';
const CURRENT_CONFIG_VERSION = 1;

/** 默认聊天配置 */
const DEFAULT_CHAT_CONFIG: ChatConfig = {
  visibleTabs: [], // 空数组表示显示所有
  tabOrder: [],
  tableHeights: {},
  tableStyles: {},
  reverseTables: [],
};

/** 默认全局配置 */
const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  visibleButtons: ['save', 'collapseTab', 'refresh', 'director', 'toggle', 'settings'],
  buttonOrder: [
    'save',
    'collapseTab',
    'refresh',
    'director',
    'toggle',
    'settings',
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

/** 默认完整配置 */
const DEFAULT_CONFIG: ACUVisualizerConfig = {
  configVersion: CURRENT_CONFIG_VERSION,
  global: DEFAULT_GLOBAL_CONFIG,
  chats: {},
};

// ============================================================
// 状态管理
// ============================================================

// 单例状态，保证多处引用一致
const configState = ref<ACUVisualizerConfig>(klona(DEFAULT_CONFIG));
const currentChatId = ref<string>('default');
const isLoaded = ref(false);

// ============================================================
// Composable
// ============================================================

/**
 * 全局配置管理 Composable
 *
 * @example
 * ```ts
 * const { getChatConfig, setChatConfig, getGlobalConfig, setGlobalConfig } = useGlobalConfig();
 *
 * // 获取当前聊天的 Tab 配置
 * const visibleTabs = getChatConfig('visibleTabs');
 *
 * // 设置当前聊天的 Tab 排序
 * setChatConfig('tabOrder', ['tab1', 'tab2', 'tab3']);
 *
 * // 获取全局按钮配置
 * const visibleButtons = getGlobalConfig('visibleButtons');
 *
 * // 设置全局按钮顺序
 * setGlobalConfig('buttonOrder', ['save', 'refresh', 'settings']);
 * ```
 */
export function useGlobalConfig() {
  /**
   * 获取当前聊天 ID
   * 优先使用 SillyTavern API，失败则返回 'default'
   */
  function getCurrentChatId(): string {
    try {
      if (typeof SillyTavern !== 'undefined' && SillyTavern.getCurrentChatId) {
        return SillyTavern.getCurrentChatId() || 'default';
      }
    } catch (e) {
      console.warn('[ACU] 获取聊天 ID 失败:', e);
    }
    return 'default';
  }

  /**
   * 从全局变量加载配置
   */
  function loadFromGlobalVariables(): void {
    try {
      if (typeof getVariables !== 'function') {
        console.warn('[ACU] getVariables 不可用，使用默认配置');
        return;
      }

      const globalVars = getVariables({ type: 'global' });
      const storedConfig = globalVars[GLOBAL_CONFIG_KEY] as ACUVisualizerConfig | undefined;

      if (storedConfig) {
        // 合并配置，确保新字段存在
        configState.value = {
          ...klona(DEFAULT_CONFIG),
          ...storedConfig,
          global: {
            ...DEFAULT_GLOBAL_CONFIG,
            ...(storedConfig.global || {}),
          },
          chats: storedConfig.chats || {},
        };
      } else {
        configState.value = klona(DEFAULT_CONFIG);
      }

      // 更新当前聊天 ID
      currentChatId.value = getCurrentChatId();
      isLoaded.value = true;

      console.info('[ACU] 全局配置加载成功', {
        chatId: currentChatId.value,
        version: configState.value.configVersion,
      });
    } catch (e) {
      console.error('[ACU] 加载全局配置失败:', e);
    }
  }

  /**
   * 保存配置到全局变量 (防抖)
   */
  const saveToGlobalVariables = useDebounceFn(() => {
    try {
      if (typeof getVariables !== 'function' || typeof replaceVariables !== 'function') {
        return;
      }

      const globalVars = getVariables({ type: 'global' });

      // 准备要保存的数据
      const configToSave = toRaw(configState.value);
      configToSave.lastChatId = currentChatId.value;

      replaceVariables(
        {
          ...globalVars,
          [GLOBAL_CONFIG_KEY]: configToSave,
        },
        { type: 'global' },
      );

      console.debug('[ACU] 全局配置已保存');
    } catch (e) {
      console.error('[ACU] 保存全局配置失败:', e);
    }
  }, 1000); // 1秒防抖

  /**
   * 获取当前聊天的配置项
   * @param key 配置键名
   * @returns 配置值，如果不存在则返回默认值
   */
  function getChatConfig<K extends keyof ChatConfig>(key: K): ChatConfig[K] {
    const chatId = currentChatId.value;
    const chatConfig = configState.value.chats[chatId];

    // 如果当前聊天没有配置，返回默认值
    if (!chatConfig) {
      return DEFAULT_CHAT_CONFIG[key];
    }

    return chatConfig[key] ?? DEFAULT_CHAT_CONFIG[key];
  }

  /**
   * 设置当前聊天的配置项
   * @param key 配置键名
   * @param value 配置值
   */
  function setChatConfig<K extends keyof ChatConfig>(key: K, value: ChatConfig[K]): void {
    const chatId = currentChatId.value;

    // 确保当前聊天的配置对象存在
    if (!configState.value.chats[chatId]) {
      configState.value.chats[chatId] = klona(DEFAULT_CHAT_CONFIG);
    }

    configState.value.chats[chatId][key] = value;
    saveToGlobalVariables();
  }

  /**
   * 获取全局配置项
   * @param key 配置键名
   * @returns 配置值，如果不存在则返回默认值
   */
  function getGlobalConfig<K extends keyof GlobalConfig>(key: K): GlobalConfig[K] {
    return configState.value.global[key] ?? DEFAULT_GLOBAL_CONFIG[key];
  }

  /**
   * 设置全局配置项
   * @param key 配置键名
   * @param value 配置值
   */
  function setGlobalConfig<K extends keyof GlobalConfig>(key: K, value: GlobalConfig[K]): void {
    configState.value.global[key] = value;
    saveToGlobalVariables();
  }

  /**
   * 初始化监听器
   */
  function initListeners(): void {
    // 监听聊天切换
    if (typeof tavern_events !== 'undefined') {
      eventOn(tavern_events.CHAT_CHANGED, (newChatId: string) => {
        console.info('[ACU] 聊天切换:', newChatId);
        currentChatId.value = newChatId || 'default';
        // 切换聊天后，不需要重新加载整个配置，因为所有聊天的配置都在内存中了
        // 但如果需要处理"新聊天使用默认配置"的逻辑，可以在这里处理
      });
    }
  }

  // 注意：自动初始化已移除，需要在 index.ts 中统一调用 loadFromGlobalVariables() 和 initListeners()

  return {
    // 状态
    /** 是否已加载配置 */
    isLoaded,
    /** 当前聊天 ID (响应式) */
    currentChatId: computed(() => currentChatId.value),

    // 核心 API
    /** 获取当前聊天的配置项 */
    getChatConfig,
    /** 设置当前聊天的配置项 */
    setChatConfig,
    /** 获取全局配置项 */
    getGlobalConfig,
    /** 设置全局配置项 */
    setGlobalConfig,

    // 持久化
    /** 从全局变量加载配置 */
    loadFromGlobalVariables,
    /** 保存配置到全局变量 (防抖) */
    saveToGlobalVariables,
  };
}
