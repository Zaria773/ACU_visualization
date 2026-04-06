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
  DEFAULT_GLOBAL_TAB_CONFIG,
  DEFAULT_LOCAL_STATE,
  EXT_SETTINGS_KEY,
  LOCAL_KEYS,
  createDefaultExtensionSettingsV2,
  type ACUCoreSlotConfig,
  type ACUExtensionSettings,
  type ACUExtensionSettingsV2,
  type ACULocalState,
  type AcuSettingsSlotKey,
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

// 默认运行态配置（当前槽位投影）
const DEFAULT_CONFIG: ACUExtensionSettings = {
  version: 2,
  lastUpdated: Date.now(),
  tabs: [],
  globalTabConfig: { ...DEFAULT_GLOBAL_TAB_CONFIG },
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

  // 双槽位原始结构
  const rawSettings = reactive<ACUExtensionSettingsV2>(createDefaultExtensionSettingsV2());

  // 当前按 media 解析出的运行槽位
  const resolvedSlotKey = ref<AcuSettingsSlotKey>('pc');

  // 投影锁（防止切槽过程中误保存）
  const isApplyingSlot = ref(false);

  function isMobileMedia(): boolean {
    // 关键：脚本运行在 iframe 中，优先按父窗口（酒馆主页面）判断设备类型
    // 避免使用 iframe 自身宽度导致“PC 被误判为手机”
    const query = '(max-width: 768px)';

    try {
      if (window.parent && window.parent !== window && typeof window.parent.matchMedia === 'function') {
        return window.parent.matchMedia(query).matches;
      }
    } catch (error) {
      // 访问父窗口失败（极少数场景），回退到当前窗口
      console.warn('[ACU] 读取父窗口 media 失败，回退当前窗口判断:', error);
    }

    return window.matchMedia(query).matches;
  }

  function resolveSlotByMedia(): AcuSettingsSlotKey {
    return isMobileMedia() ? 'mobile' : 'pc';
  }

  function deepMergeSlotConfig(stored: Partial<ACUCoreSlotConfig> | undefined): ACUCoreSlotConfig {
    return {
      globalTabConfig: {
        ...DEFAULT_GLOBAL_TAB_CONFIG,
        ...(stored?.globalTabConfig || {}),
      },
      buttons: {
        ...DEFAULT_BUTTONS_CONFIG,
        ...(stored?.buttons || {}),
      },
      theme: {
        ...DEFAULT_THEME_CONFIG,
        ...(stored?.theme || {}),
        highlight: {
          ...DEFAULT_THEME_CONFIG.highlight,
          ...((stored?.theme as any)?.highlight || {}),
        },
        backgroundConfig: {
          ...DEFAULT_THEME_CONFIG.backgroundConfig,
          ...((stored?.theme as any)?.backgroundConfig || {}),
        },
      },
      ui: {
        ...DEFAULT_CONFIG.ui,
        ...(stored?.ui || {}),
      },
      dashboard: {
        ...DEFAULT_CONFIG.dashboard,
        ...(stored?.dashboard || {}),
      },
      tagLibrary: {
        categories: (stored?.tagLibrary as any)?.categories || [],
        tags: (stored?.tagLibrary as any)?.tags || [],
      },
      divination: {
        ...DEFAULT_DIVINATION_CONFIG,
        ...(stored?.divination || {}),
        config: {
          ...DEFAULT_DIVINATION_CONFIG.config,
          ...((stored?.divination as any)?.config || {}),
        },
      },
      ball: {
        ...DEFAULT_BALL_CONFIG,
        ...(stored?.ball || {}),
        appearance: {
          ...DEFAULT_BALL_CONFIG.appearance,
          ...((stored?.ball as any)?.appearance || {}),
        },
      },
    };
  }

  function deepMergeV2Settings(stored: Partial<ACUExtensionSettingsV2> | undefined): ACUExtensionSettingsV2 {
    const defaults = createDefaultExtensionSettingsV2();
    return {
      ...defaults,
      ...stored,
      version: typeof stored?.version === 'number' ? stored.version : defaults.version,
      lastUpdated: typeof stored?.lastUpdated === 'number' ? stored.lastUpdated : defaults.lastUpdated,
      shared: {
        tabs: stored?.shared?.tabs || [],
        chats: stored?.shared?.chats || {},
      },
      slots: {
        pc: deepMergeSlotConfig(stored?.slots?.pc),
        mobile: deepMergeSlotConfig(stored?.slots?.mobile),
      },
    };
  }

  function deepMergeLegacyConfig(stored: Partial<ACUExtensionSettings>): ACUExtensionSettings {
    return {
      ...DEFAULT_CONFIG,
      ...(stored || {}),
      globalTabConfig: {
        ...DEFAULT_GLOBAL_TAB_CONFIG,
        ...(stored.globalTabConfig || {}),
      },
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

  function isV2Settings(value: unknown): value is ACUExtensionSettingsV2 {
    const data = value as any;
    return Boolean(data && typeof data === 'object' && data.shared && data.slots && data.slots.pc && data.slots.mobile);
  }

  function normalizeStoredSettingsInput(value: unknown, source: string): unknown {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        console.info(`[ACU 迁移排查] ${source} 为字符串，已解析为对象`);
        return parsed;
      } catch (error) {
        console.warn(`[ACU 迁移排查] ${source} 字符串 JSON 解析失败，按旧配置处理`, error);
        return {};
      }
    }
    return value;
  }

  function migrateLegacySettingsToV2(legacy: Partial<ACUExtensionSettings>): ACUExtensionSettingsV2 {
    const mergedLegacy = deepMergeLegacyConfig(legacy);
    const slotPayload = deepMergeSlotConfig({
      globalTabConfig: mergedLegacy.globalTabConfig,
      buttons: mergedLegacy.buttons,
      theme: mergedLegacy.theme,
      ui: mergedLegacy.ui,
      dashboard: mergedLegacy.dashboard,
      tagLibrary: mergedLegacy.tagLibrary,
      divination: mergedLegacy.divination,
      ball: mergedLegacy.ball,
    });

    return {
      version: 2,
      lastUpdated: typeof mergedLegacy.lastUpdated === 'number' ? mergedLegacy.lastUpdated : Date.now(),
      shared: {
        tabs: mergedLegacy.tabs || [],
        chats: mergedLegacy.chats || {},
      },
      slots: {
        // 迁移规则：旧配置完整复制到 pc + mobile
        pc: deepMergeSlotConfig(slotPayload),
        mobile: deepMergeSlotConfig(slotPayload),
      },
    };
  }

  function applySlotToRuntime(slotKey: AcuSettingsSlotKey): void {
    isApplyingSlot.value = true;
    try {
      const slot = rawSettings.slots[slotKey];
      Object.assign(config, {
        version: rawSettings.version,
        lastUpdated: rawSettings.lastUpdated,
        tabs: [...rawSettings.shared.tabs],
        globalTabConfig: { ...slot.globalTabConfig },
        buttons: { ...slot.buttons },
        theme: {
          ...slot.theme,
          highlight: { ...slot.theme.highlight },
          backgroundConfig: { ...slot.theme.backgroundConfig },
        },
        ui: { ...(slot.ui || {}) },
        dashboard: { ...(slot.dashboard || {}) },
        tagLibrary: {
          categories: [...(slot.tagLibrary?.categories || [])],
          tags: [...(slot.tagLibrary?.tags || [])],
        },
        divination: {
          ...slot.divination,
          config: { ...slot.divination.config },
          presets: [...(slot.divination.presets || [])],
        },
        ball: {
          ...slot.ball,
          appearance: { ...slot.ball.appearance },
          customFonts: [...(slot.ball.customFonts || [])],
        },
        chats: rawSettings.shared.chats || {},
      });
      resolvedSlotKey.value = slotKey;
    } finally {
      isApplyingSlot.value = false;
    }
  }

  function commitRuntimeToSlot(slotKey: AcuSettingsSlotKey): void {
    rawSettings.version = 2;
    rawSettings.lastUpdated = Date.now();

    rawSettings.shared = {
      tabs: [...(config.tabs || [])],
      chats: config.chats || {},
    };

    rawSettings.slots[slotKey] = deepMergeSlotConfig({
      globalTabConfig: config.globalTabConfig,
      buttons: config.buttons,
      theme: config.theme,
      ui: config.ui,
      dashboard: config.dashboard,
      tagLibrary: config.tagLibrary,
      divination: config.divination,
      ball: config.ball,
    });

    config.version = rawSettings.version;
    config.lastUpdated = rawSettings.lastUpdated;
  }

  async function persistRawSettings(): Promise<void> {
    try {
      console.info('[ACU 迁移排查] 开始持久化 rawSettings 到 extensionSettings', {
        key: EXT_SETTINGS_KEY,
        version: rawSettings.version,
        hasPcSlot: Boolean(rawSettings?.slots?.pc),
        hasMobileSlot: Boolean(rawSettings?.slots?.mobile),
      });

      if (!SillyTavern?.extensionSettings) {
        console.warn('[ACU 迁移排查] extensionSettings 不可用，仅写入本地缓存');
        cacheToLocal();
        return;
      }

      SillyTavern.extensionSettings[EXT_SETTINGS_KEY] = JSON.parse(JSON.stringify(rawSettings));
      await SillyTavern.saveSettingsDebounced();
      cacheToLocal();
      console.info('[ACU 迁移排查] 持久化完成（extensionSettings + 本地缓存）');
    } catch (error) {
      console.error('[ACU 迁移排查] 持久化失败，保留本地缓存兜底', error);
      cacheToLocal();
    }
  }

  /**
   * 加载配置（从 extensionSettings，同步操作）
   */
  function loadConfig(): void {
    let migratedFromLegacy = false;

    try {
      const storedRaw = SillyTavern?.extensionSettings?.[EXT_SETTINGS_KEY];
      const stored = normalizeStoredSettingsInput(storedRaw, 'extensionSettings');
      console.info('[ACU 迁移排查] 读取 extensionSettings 完成', {
        key: EXT_SETTINGS_KEY,
        hasStored: Boolean(stored),
        rawType: typeof storedRaw,
      });

      if (!stored) {
        console.warn('[ACU] extensionSettings 未就绪或为空，尝试从本地缓存恢复');
        const cacheRestore = restoreFromCache();
        if (cacheRestore.restored) {
          // 关键修复：缓存为旧结构时，迁移后立即写回 extensionSettings，避免“只迁移到运行态不持久化”
          if (cacheRestore.migratedFromLegacy) {
            void persistRawSettings();
          }
          console.info('[ACU] 已从本地缓存恢复配置');
          loadLocalState();
          isLoaded.value = true;
          return;
        }
      }

      if (stored) {
        const storedIsV2 = isV2Settings(stored);
        const mergedV2 = storedIsV2
          ? deepMergeV2Settings(stored)
          : migrateLegacySettingsToV2(stored as Partial<ACUExtensionSettings>);

        migratedFromLegacy = !storedIsV2;
        Object.assign(rawSettings, mergedV2);
        console.info('[ACU 迁移排查] 读取到 extensionSettings 结构判定', {
          storedIsV2,
          migratedFromLegacy,
          version: (stored as any)?.version,
          slotsKeys: Object.keys(((stored as any)?.slots || {}) as Record<string, unknown>),
        });
        console.info(migratedFromLegacy ? '[ACU] 旧配置已迁移到双槽位结构' : '[ACU] 双槽位配置加载成功');
      } else {
        Object.assign(rawSettings, createDefaultExtensionSettingsV2());
        console.info('[ACU] 首次使用或配置丢失，初始化双槽位默认配置');
      }

      resolvedSlotKey.value = resolveSlotByMedia();
      applySlotToRuntime(resolvedSlotKey.value);

      loadLocalState();
      cacheToLocal();

      if (migratedFromLegacy) {
        console.info('[ACU 迁移排查] 检测到旧配置迁移，触发持久化写回 extensionSettings');
        void persistRawSettings();
      }
    } catch (e) {
      console.warn('[ACU] 配置加载失败，尝试从本地缓存恢复:', e);

      const cacheRestore = restoreFromCache();
      if (!cacheRestore.restored) {
        Object.assign(rawSettings, createDefaultExtensionSettingsV2());
        resolvedSlotKey.value = resolveSlotByMedia();
        applySlotToRuntime(resolvedSlotKey.value);
        console.warn('[ACU] 使用默认双槽位配置');
      } else if (cacheRestore.migratedFromLegacy) {
        // 关键修复：异常恢复路径同样保证迁移结果写回 extensionSettings
        void persistRawSettings();
      }
    }

    isLoaded.value = true;
  }

  async function saveCurrentConfig(): Promise<void> {
    if (isApplyingSlot.value) return;
    try {
      const autoSlot = resolveSlotByMedia();
      resolvedSlotKey.value = autoSlot;
      commitRuntimeToSlot(autoSlot);
      await persistRawSettings();
    } catch (e) {
      console.error('[ACU] 配置保存失败:', e);
    }
  }

  async function saveConfigToSlot(slotKey: AcuSettingsSlotKey): Promise<void> {
    if (isApplyingSlot.value) return;
    try {
      commitRuntimeToSlot(slotKey);
      await persistRawSettings();
    } catch (e) {
      console.error(`[ACU] 保存到槽位 ${slotKey} 失败:`, e);
    }
  }

  /**
   * 兼容旧调用：保存到当前自动命中的槽位
   */
  async function saveConfig(): Promise<void> {
    await saveCurrentConfig();
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
      localStorage.setItem(LOCAL_KEYS.CONFIG_CACHE, JSON.stringify(rawSettings));
    } catch (e) {
      // localStorage 可能满，忽略
    }
  }

  /**
   * 从本地缓存恢复
   */
  function restoreFromCache(): { restored: boolean; migratedFromLegacy: boolean } {
    try {
      const cached = localStorage.getItem(LOCAL_KEYS.CONFIG_CACHE);
      if (!cached) return { restored: false, migratedFromLegacy: false };

      const parsedRaw = JSON.parse(cached);
      const parsed = normalizeStoredSettingsInput(parsedRaw, 'localStorage.CONFIG_CACHE');
      const cachedIsV2 = isV2Settings(parsed);
      const mergedV2 = cachedIsV2
        ? deepMergeV2Settings(parsed as Partial<ACUExtensionSettingsV2>)
        : migrateLegacySettingsToV2(parsed as Partial<ACUExtensionSettings>);

      Object.assign(rawSettings, mergedV2);
      resolvedSlotKey.value = resolveSlotByMedia();
      applySlotToRuntime(resolvedSlotKey.value);

      // 关键修复：即使 extensionSettings 暂时不可写，也先把本地缓存升级为 V2，避免重复迁移
      if (!cachedIsV2) {
        cacheToLocal();
      }

      return { restored: true, migratedFromLegacy: !cachedIsV2 };
    } catch (e) {
      // 忽略
    }
    return { restored: false, migratedFromLegacy: false };
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
        exportVersion: 2,
        exportTime: Date.now(),
        config: { ...config },
        rawSettings: JSON.parse(JSON.stringify(rawSettings)),
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

      if (!data.exportVersion || (!data.config && !data.rawSettings)) {
        return { success: false, message: '无效的配置文件格式' };
      }

      const nextRawSettings = isV2Settings(data.rawSettings)
        ? deepMergeV2Settings(data.rawSettings as Partial<ACUExtensionSettingsV2>)
        : migrateLegacySettingsToV2((data.config || {}) as Partial<ACUExtensionSettings>);

      Object.assign(rawSettings, nextRawSettings);
      resolvedSlotKey.value = resolveSlotByMedia();
      applySlotToRuntime(resolvedSlotKey.value);
      await persistRawSettings();

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
    Object.assign(rawSettings, createDefaultExtensionSettingsV2());
    resolvedSlotKey.value = resolveSlotByMedia();
    applySlotToRuntime(resolvedSlotKey.value);
    await persistRawSettings();

    Object.assign(localState, DEFAULT_LOCAL_STATE);
    saveLocalState();
  }

  return {
    isLoaded,
    rawSettings,
    resolvedSlotKey,
    config,
    localState,
    loadConfig,
    resolveSlotByMedia,
    applySlotToRuntime,
    saveCurrentConfig,
    saveConfigToSlot,
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
