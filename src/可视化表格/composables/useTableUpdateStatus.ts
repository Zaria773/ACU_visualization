/**
 * 表格更新状态 Composable
 * 用于获取所有表格的更新状态信息，供仪表盘看板使用
 *
 * 数据来源：
 * - 表格数据: api.exportTableAsJson()
 * - 模板配置: api.getTableTemplate() (含 updateConfig)
 * - 全局设置: extensionSettings.__userscripts[shujuku_*] 或 localStorage 回退
 * - 更新记录: chat[].TavernDB_ACU_IsolatedData
 *
 * 版本兼容：
 * - 9.5: localStorage shujuku_*_allSettings_v2
 * - 10.5+: extensionSettings shujuku_v*__userscript_settings_v1
 * - 12.1: extensionSettings shujuku_v104__userscript_settings_v1
 */

import { computed, ref } from 'vue';
import { getCore } from '../utils';

// ============================================================
// 类型定义
// ============================================================

/**
 * 表格更新状态项
 */
export interface TableUpdateStatus {
  /** 表格 key (如 sheet_0) */
  sheetKey: string;
  /** 表格名称 */
  name: string;
  /** 更新频率 (-1=沿用全局, 0=禁用, >0=实际频率) */
  updateFrequency: number;
  /** 有效频率（已解析全局默认值） */
  effectiveFrequency: number;
  /** 上次更新的 AI 楼层号 (从1开始计数，0 = 从未更新) */
  lastUpdatedAiFloor: number;
  /** 上次更新的 chat 数组索引 (实际楼层号，从0开始，-1 = 从未更新) */
  lastUpdatedChatIndex: number;
  /** 未记录楼层数（基于 AI 楼层计算） */
  unrecordedFloors: number;
  /** 当前总 AI 楼层数 */
  totalAiFloors: number;
  /** 当前总楼层数（chat.length） */
  totalFloors: number;
  /** 是否已找到历史更新记录 */
  hasHistory: boolean;
  /** 是否是总结/大纲表 */
  isSummaryOrOutline: boolean;
  /** 表格顺序编号 */
  orderNo: number;
}

/**
 * 数据库全局设置（从 localStorage 读取）
 */
export interface DbGlobalSettings {
  /** 数据隔离是否启用 */
  dataIsolationEnabled: boolean;
  /** 数据隔离代码 */
  dataIsolationCode: string;
  /** 全局更新频率 */
  autoUpdateFrequency: number;
  /** 全局跳过楼层数 */
  skipUpdateFloors: number;
}

/**
 * 聊天消息类型（简化版）
 */
interface ChatMessage {
  is_user?: boolean;
  mes?: string;
  TavernDB_ACU_IsolatedData?: Record<string, IsolatedDataEntry>;
  TavernDB_ACU_Identity?: string;
  TavernDB_ACU_ModifiedKeys?: string[];
  TavernDB_ACU_UpdateGroupKeys?: string[];
  TavernDB_ACU_IndependentData?: Record<string, unknown>;
  TavernDB_ACU_Data?: Record<string, unknown>;
  TavernDB_ACU_SummaryData?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * 隔离数据条目
 */
interface IsolatedDataEntry {
  independentData?: Record<string, unknown>;
  modifiedKeys?: string[];
  updateGroupKeys?: string[];
}

/**
 * 上次更新位置结果
 */
interface LastUpdateResult {
  /** AI 楼层号（从1开始） */
  aiFloor: number;
  /** chat 数组索引（从0开始） */
  chatIndex: number;
  /** 是否找到历史记录 */
  hasHistory: boolean;
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 从设置键名中提取版本号
 * @param key 设置键名，如 "shujuku_v104__userscript_settings_v1"
 * @returns 版本号数字，如 104；无法解析返回 0
 */
function extractVersionNumber(key: string): number {
  const match = key.match(/shujuku_v?(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * 从多个键中选择版本号最高的
 * @param keys 设置键名数组
 * @param pattern 匹配模式
 * @returns 版本号最高的键名，或 null
 */
function findHighestVersionKey(keys: string[], pattern: RegExp): string | null {
  const matchedKeys = keys.filter(k => pattern.test(k));
  if (matchedKeys.length === 0) return null;

  // 按版本号降序排序
  matchedKeys.sort((a, b) => extractVersionNumber(b) - extractVersionNumber(a));
  return matchedKeys[0];
}

/**
 * 数据库配置缓存（用于跨函数共享）
 */
interface DbConfigCache {
  versionPrefix: string; // 如 "shujuku_v104"
  isolationCode: string;
  userscripts: Record<string, unknown>;
}
let dbConfigCache: DbConfigCache | null = null;

/**
 * 获取数据库全局设置
 * 兼容多版本存储格式（9.5 / 10.5+ / 12.1）
 * ★ 修复：选择版本号最高的设置键
 */
function getDbGlobalSettings(): DbGlobalSettings {
  const w = window.parent || window;
  const defaultSettings: DbGlobalSettings = {
    dataIsolationEnabled: false,
    dataIsolationCode: '',
    autoUpdateFrequency: 2,
    skipUpdateFloors: 0,
  };

  try {
    // [优先] 从 SillyTavern extensionSettings 读取 (10.5+)
    const context = (
      w as unknown as {
        SillyTavern?: { getContext?: () => { extensionSettings?: { __userscripts?: Record<string, unknown> } } };
      }
    ).SillyTavern?.getContext?.();
    const userscripts = context?.extensionSettings?.__userscripts;

    if (userscripts) {
      const allKeys = Object.keys(userscripts);

      // ★ 选择版本号最高的设置键
      // 匹配: shujuku_v数字__userscript_settings_v1 (10.5+/12.1)
      const settingsKey = findHighestVersionKey(allKeys, /shujuku_v\d+__userscript_settings_v1/i);

      if (settingsKey && userscripts[settingsKey]) {
        const raw = userscripts[settingsKey];
        const settingsContainer = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);

        // 提取版本前缀（如 shujuku_v104）
        const versionPrefix = settingsKey.replace(/__userscript_settings_v1$/i, '');

        // 读取 globalMeta 获取当前激活的隔离标识
        const globalMetaKey = `${versionPrefix}_globalMeta_v1`;
        let activeIsolationCode = '';
        if (settingsContainer[globalMetaKey]) {
          const metaRaw = settingsContainer[globalMetaKey];
          const meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : (metaRaw as Record<string, unknown>);
          activeIsolationCode = String(meta.activeIsolationCode || '');
        }

        // 构建 profile 设置键
        const profileSettingsKey = `${versionPrefix}_profile_v1__${encodeURIComponent(activeIsolationCode) || '__default__'}__settings`;
        let profileSettings: Record<string, unknown> = {};

        if (settingsContainer[profileSettingsKey]) {
          const profRaw = settingsContainer[profileSettingsKey];
          profileSettings = typeof profRaw === 'string' ? JSON.parse(profRaw) : (profRaw as Record<string, unknown>);
        }

        // 缓存配置供模板读取使用
        dbConfigCache = {
          versionPrefix,
          isolationCode: activeIsolationCode,
          userscripts: settingsContainer,
        };

        // ★ 修复：根据 activeIsolationCode 是否非空判断隔离状态
        // 而不是从 profileSettings 读取（该字段可能不存在）
        const isIsolationEnabled = activeIsolationCode !== '';

        return {
          dataIsolationEnabled: isIsolationEnabled,
          dataIsolationCode: activeIsolationCode,
          autoUpdateFrequency: Number(profileSettings.autoUpdateFrequency) || 2,
          skipUpdateFloors: Number(profileSettings.skipUpdateFloors) || 0,
        };
      }
    }

    // [回退] 从 localStorage 读取（兼容旧版本 9.5）
    const localStorage = (w as Window & { localStorage: Storage }).localStorage;
    if (localStorage) {
      const keys = Object.keys(localStorage);
      // 选择版本号最高的 localStorage 键
      const localKey = findHighestVersionKey(keys, /shujuku.*settings/i);

      if (localKey) {
        const settings = JSON.parse(localStorage.getItem(localKey) || '{}');
        return {
          dataIsolationEnabled: !!settings.dataIsolationEnabled,
          dataIsolationCode: String(settings.dataIsolationCode || ''),
          autoUpdateFrequency: Number(settings.autoUpdateFrequency) || 2,
          skipUpdateFloors: Number(settings.skipUpdateFloors) || 0,
        };
      }
    }
  } catch (e) {
    console.warn('[ACU] 读取全局设置失败:', e);
  }

  dbConfigCache = null;
  return defaultSettings;
}

/**
 * 从 extensionSettings 获取模板配置
 * 用于 10.5 等没有 getTableTemplate() API 的版本
 * @returns 模板配置对象，或 null
 */
function getTemplateFromSettings(): Record<
  string,
  {
    name?: string;
    updateConfig?: {
      updateFrequency?: number;
      contextDepth?: number;
      batchSize?: number;
      skipFloors?: number;
    };
    orderNo?: number;
  }
> | null {
  if (!dbConfigCache) return null;

  try {
    const { versionPrefix, isolationCode, userscripts } = dbConfigCache;

    // 构建 profile 模板键
    const profileTemplateKey = `${versionPrefix}_profile_v1__${encodeURIComponent(isolationCode) || '__default__'}__template`;

    if (userscripts[profileTemplateKey]) {
      const templateRaw = userscripts[profileTemplateKey];
      const template =
        typeof templateRaw === 'string' ? JSON.parse(templateRaw) : (templateRaw as Record<string, unknown>);
      return template as Record<
        string,
        {
          name?: string;
          updateConfig?: {
            updateFrequency?: number;
            contextDepth?: number;
            batchSize?: number;
            skipFloors?: number;
          };
          orderNo?: number;
        }
      >;
    }
  } catch (e) {
    console.warn('[ACU] 读取模板配置失败:', e);
  }

  return null;
}

/**
 * 判断表格名称是否为总结/大纲表
 */
function checkIsSummaryOrOutline(name: string): boolean {
  const lowerName = name.toLowerCase();
  return (
    name.includes('总结') || name.includes('大纲') || lowerName.includes('summary') || lowerName.includes('outline')
  );
}

/**
 * 计算单个表格的上次更新位置
 * 逻辑来源: .kilocode/数据库/10.5index .js 第 6882-6950 行
 *
 * @param sheetKey 表格 key
 * @param chat 聊天记录数组
 * @param settings 全局设置
 * @param isSummary 是否是总结/大纲表
 * @returns 上次更新位置
 */
function getLastUpdatedPosition(
  sheetKey: string,
  chat: ChatMessage[],
  settings: DbGlobalSettings,
  isSummary: boolean,
): LastUpdateResult {
  const currentIsolationKey = settings.dataIsolationEnabled ? settings.dataIsolationCode : '';

  // 从后向前扫描聊天记录
  for (let i = chat.length - 1; i >= 0; i--) {
    const msg = chat[i];
    if (msg.is_user) continue;

    let wasUpdated = false;

    // [优先级1] 检查新版隔离数据 TavernDB_ACU_IsolatedData
    const isolatedData = msg.TavernDB_ACU_IsolatedData;
    if (isolatedData && isolatedData[currentIsolationKey]) {
      const tagData = isolatedData[currentIsolationKey];
      const updateGroupKeys = tagData.updateGroupKeys || [];
      const modifiedKeys = tagData.modifiedKeys || [];
      const independentData = tagData.independentData || {};

      if (updateGroupKeys.length > 0 && modifiedKeys.length > 0) {
        wasUpdated = updateGroupKeys.includes(sheetKey);
      } else if (modifiedKeys.includes(sheetKey)) {
        wasUpdated = true;
      } else if (independentData[sheetKey]) {
        wasUpdated = true;
      }
    }

    // [优先级2] 兼容旧版存储格式
    if (!wasUpdated) {
      const msgIdentity = msg.TavernDB_ACU_Identity;
      let isLegacyMatch = false;

      if (settings.dataIsolationEnabled) {
        isLegacyMatch = msgIdentity === settings.dataIsolationCode;
      } else {
        // 关闭隔离（无标签模式）：只匹配无标识数据
        isLegacyMatch = !msgIdentity;
      }

      if (isLegacyMatch) {
        const modifiedKeys = msg.TavernDB_ACU_ModifiedKeys || [];
        const updateGroupKeys = msg.TavernDB_ACU_UpdateGroupKeys || [];

        if (updateGroupKeys.length > 0 && modifiedKeys.length > 0) {
          wasUpdated = updateGroupKeys.includes(sheetKey);
        } else if (modifiedKeys.includes(sheetKey)) {
          wasUpdated = true;
        } else if (
          // 旧版兼容：没有 ModifiedKeys 字段时，回退到检查数据是否存在
          msg.TavernDB_ACU_IndependentData &&
          (msg.TavernDB_ACU_IndependentData as Record<string, unknown>)[sheetKey]
        ) {
          wasUpdated = true;
        } else if (
          isSummary &&
          msg.TavernDB_ACU_SummaryData &&
          (msg.TavernDB_ACU_SummaryData as Record<string, unknown>)[sheetKey]
        ) {
          wasUpdated = true;
        } else if (
          !isSummary &&
          msg.TavernDB_ACU_Data &&
          (msg.TavernDB_ACU_Data as Record<string, unknown>)[sheetKey]
        ) {
          wasUpdated = true;
        }
      }
    }

    if (wasUpdated) {
      // 计算 AI 楼层号（从1开始）
      const aiFloor = chat.slice(0, i + 1).filter(m => !m.is_user).length;
      return {
        aiFloor,
        chatIndex: i,
        hasHistory: true,
      };
    }
  }

  return {
    aiFloor: 0,
    chatIndex: -1,
    hasHistory: false,
  };
}

// ============================================================
// Composable
// ============================================================

/**
 * 表格更新状态 Composable
 * 用于获取所有表格的更新状态信息
 */
export function useTableUpdateStatus() {
  /** 状态列表 */
  const statusList = ref<TableUpdateStatus[]>([]);

  /** 是否正在加载 */
  const isLoading = ref(false);

  /** 上次刷新时间 */
  const lastRefreshTime = ref<Date | null>(null);

  /** 当前总 AI 楼层数 */
  const currentTotalAiFloors = ref(0);

  /** 当前总楼层数 */
  const currentTotalFloors = ref(0);

  /**
   * 刷新所有表格的更新状态
   * @returns 更新状态列表
   */
  async function refresh(): Promise<TableUpdateStatus[]> {
    isLoading.value = true;

    try {
      const api = getCore().getDB();
      const tableData = api?.exportTableAsJson?.();

      if (!tableData) {
        console.warn('[ACU] 无法获取表格数据');
        statusList.value = [];
        return [];
      }

      // 获取全局设置（会初始化 dbConfigCache）
      const settings = getDbGlobalSettings();

      // ★ 关键：优先从 API 获取模板配置，回退到 extensionSettings
      // 10.5 版本没有 getTableTemplate() API，需要从 extensionSettings 读取
      let template: Record<
        string,
        {
          name?: string;
          updateConfig?: {
            updateFrequency?: number;
            contextDepth?: number;
            batchSize?: number;
            skipFloors?: number;
          };
          orderNo?: number;
        }
      > | null = null;

      if (typeof api?.getTableTemplate === 'function') {
        // 12.1+ 版本：直接调用 API
        template = api.getTableTemplate() as typeof template;
      } else {
        // 10.5 等版本：从 extensionSettings 读取
        template = getTemplateFromSettings();
      }

      console.info(
        '[ACU] 模板来源:',
        template ? (typeof api?.getTableTemplate === 'function' ? 'API' : 'extensionSettings') : '无',
      );

      // 获取聊天记录
      const w = window.parent || window;
      const chat: ChatMessage[] =
        (w as unknown as { SillyTavern?: { getContext?: () => { chat?: ChatMessage[] } } }).SillyTavern?.getContext?.()
          ?.chat || [];

      // 统计楼层数
      const totalFloors = chat.length;
      const totalAiFloors = chat.filter(m => !m.is_user).length;
      currentTotalFloors.value = totalFloors;
      currentTotalAiFloors.value = totalAiFloors;

      const results: TableUpdateStatus[] = [];

      // 获取所有表格 key 并按顺序编号排序
      const sheetKeys = Object.keys(tableData)
        .filter(k => k.startsWith('sheet_'))
        .sort((a, b) => {
          // 优先使用模板中的 orderNo，回退到表格数据中的 _acu_orderNo
          const orderA =
            template?.[a]?.orderNo ?? (tableData[a] as { _acu_orderNo?: number })?._acu_orderNo ?? Infinity;
          const orderB =
            template?.[b]?.orderNo ?? (tableData[b] as { _acu_orderNo?: number })?._acu_orderNo ?? Infinity;
          return orderA - orderB;
        });

      // 遍历所有表格
      for (const sheetKey of sheetKeys) {
        const tableDataEntry = tableData[sheetKey] as {
          name?: string;
          _acu_orderNo?: number;
        };
        // ★ 从模板获取配置
        const templateEntry = template?.[sheetKey];

        // 表格名称：优先模板 > 表格数据
        const name = templateEntry?.name || tableDataEntry?.name;
        if (!name) continue;

        // ★ 从模板读取 updateConfig（这才是正确的数据源）
        const updateConfig = templateEntry?.updateConfig || {};
        const rawFreq = updateConfig.updateFrequency ?? -1;

        // 计算有效频率
        // -1 = 沿用全局设置
        // 0 = 禁用自动更新
        // >0 = 表级更新频率
        const effectiveFreq = rawFreq === -1 ? settings.autoUpdateFrequency : rawFreq;

        const isSummaryOrOutline = checkIsSummaryOrOutline(name);

        // 计算上次更新位置
        const { aiFloor, chatIndex, hasHistory } = getLastUpdatedPosition(sheetKey, chat, settings, isSummaryOrOutline);

        // 计算未记录楼层（基于 AI 楼层）
        const unrecordedFloors = hasHistory ? totalAiFloors - aiFloor : totalAiFloors;

        results.push({
          sheetKey,
          name,
          updateFrequency: rawFreq,
          effectiveFrequency: effectiveFreq,
          lastUpdatedAiFloor: aiFloor,
          lastUpdatedChatIndex: chatIndex,
          unrecordedFloors,
          totalAiFloors,
          totalFloors,
          hasHistory,
          isSummaryOrOutline,
          orderNo: templateEntry?.orderNo ?? tableDataEntry?._acu_orderNo ?? 999,
        });
      }

      statusList.value = results;
      lastRefreshTime.value = new Date();

      console.info(
        `[ACU] 表格更新状态刷新完成，共 ${results.length} 个表格，全局频率: ${settings.autoUpdateFrequency}`,
      );
      return results;
    } catch (e) {
      console.error('[ACU] 获取表格更新状态失败:', e);
      statusList.value = [];
      return [];
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 格式化上次更新显示
   * @param item 表格状态项
   * @returns 格式化字符串 "AI楼层/实际楼层" 或 "未初始"
   */
  function formatLastUpdate(item: TableUpdateStatus): string {
    if (!item.hasHistory) {
      return '未初始';
    }
    return `${item.lastUpdatedAiFloor}/${item.lastUpdatedChatIndex}`;
  }

  /**
   * 获取未记录楼层的样式类
   * @param item 表格状态项
   * @returns CSS 类名
   */
  function getUnrecordedClass(item: TableUpdateStatus): string {
    if (!item.hasHistory) return '';
    if (item.effectiveFrequency === 0) return ''; // 禁用的表格不显示状态

    const ratio = item.unrecordedFloors / item.effectiveFrequency;
    if (ratio >= 2) return 'danger'; // 超过2倍频率未更新
    if (ratio >= 1) return 'warning'; // 达到更新频率
    return 'success'; // 正常
  }

  return {
    /** 表格状态列表（只读计算属性） */
    statusList: computed(() => statusList.value),
    /** 是否正在加载（只读计算属性） */
    isLoading: computed(() => isLoading.value),
    /** 上次刷新时间（只读计算属性） */
    lastRefreshTime: computed(() => lastRefreshTime.value),
    /** 当前总 AI 楼层数（只读计算属性） */
    currentTotalAiFloors: computed(() => currentTotalAiFloors.value),
    /** 当前总楼层数（只读计算属性） */
    currentTotalFloors: computed(() => currentTotalFloors.value),
    /** 刷新状态 */
    refresh,
    /** 格式化上次更新显示 */
    formatLastUpdate,
    /** 获取未记录楼层样式类 */
    getUnrecordedClass,
  };
}
