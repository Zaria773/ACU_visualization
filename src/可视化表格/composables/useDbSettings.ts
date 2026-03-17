/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 数据库配置读写 Composable
 * 用于管理 AutoCardUpdater 数据库的设置配置
 *
 * 配置存储逻辑：
 * - 优先使用 api.getUpdateConfigParams() / api.setUpdateConfigParams() 操作
 * - 回退到 localStorage 读写 shujuku_*_allSettings_v2
 */

import { ref } from 'vue';
import { getCore } from '../utils';

// ============================================================
// 类型定义
// ============================================================

/** 数据库设置接口 */
export interface DbSettings {
  /** AI读取上下文层数 */
  autoUpdateThreshold?: number;
  /** 每N层自动更新一次 */
  autoUpdateFrequency?: number;
  /** 每批次更新楼层数 */
  updateBatchSize?: number;
  /** 保留X层楼不更新（前端预设参数） */
  skipUpdateFloors?: number;
  /** 其他设置项 */
  [key: string]: unknown;
}

/** 表格信息接口 (从 API 获取) */
export interface TableInfo {
  /** 表格 key (如 sheet_0) */
  key: string;
  /** 表格名称 */
  name: string;
  /** 是否是总结表/大纲表 */
  isSummaryOrOutline: boolean;
}

/** 预设执行结果 */
export interface PresetExecuteResult {
  success: boolean;
  message: string;
  affectedTables?: string[];
}

/** 手动更新表选择结果 */
export interface ManualSelectedTablesResult {
  selectedTables: string[];
  hasManualSelection: boolean;
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 查找数据库设置存储的 Key (兼容多个版本)
 * @returns localStorage 键名
 */
function findDatabaseSettingsKey(): string {
  // 优先检查最新版本
  const direct80 = 'shujuku_v80_allSettings_v2';
  if (localStorage.getItem(direct80)) return direct80;

  const direct70 = 'shujuku_v70_allSettings_v2';
  if (localStorage.getItem(direct70)) return direct70;

  // 通配匹配
  const keys = Object.keys(localStorage || {});
  const found = keys.find(k => /^shujuku_.*_allSettings_v2$/.test(k));

  return found || direct80;
}

/**
 * 从 localStorage 读取设置
 */
function readFromLocalStorage(): DbSettings {
  try {
    const key = findDatabaseSettingsKey();
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('[ACU] 读取 localStorage 设置失败:', e);
    return {};
  }
}

/**
 * 写入设置到 localStorage
 */
function writeToLocalStorage(settings: DbSettings): void {
  try {
    const key = findDatabaseSettingsKey();
    const existing = readFromLocalStorage();
    localStorage.setItem(key, JSON.stringify({ ...existing, ...settings }));
  } catch (e) {
    console.warn('[ACU] 写入 localStorage 设置失败:', e);
  }
}

// ============================================================
// Composable
// ============================================================

export function useDbSettings() {
  /** 设置状态 */
  const settings = ref<DbSettings>({});

  /** 是否正在加载 */
  const isLoading = ref(false);

  /** 是否已初始化 */
  const isInitialized = ref(false);

  /**
   * 读取设置
   * 优先使用 api.getUpdateConfigParams()，回退到 localStorage
   */
  async function loadSettings(): Promise<DbSettings> {
    isLoading.value = true;

    try {
      const api = getCore().getDB();

      // 优先使用 5.5 新 API: getUpdateConfigParams
      if (api && typeof api.getUpdateConfigParams === 'function') {
        const configParams = api.getUpdateConfigParams();
        // 同时读取 localStorage 中的前端独有参数（如 skipUpdateFloors）
        const localSettings = readFromLocalStorage();
        const merged: DbSettings = {
          ...localSettings,
          autoUpdateThreshold: configParams.autoUpdateThreshold,
          autoUpdateFrequency: configParams.autoUpdateFrequency,
          updateBatchSize: configParams.updateBatchSize,
        };
        settings.value = merged;
        console.info('[ACU] 通过 getUpdateConfigParams 读取设置');
        return merged;
      }

      // 回退到 localStorage
      const localSettings = readFromLocalStorage();
      settings.value = localSettings;
      console.info('[ACU] 从 localStorage 读取设置');
      return localSettings;
    } catch (e) {
      console.error('[ACU] 读取设置失败:', e);
      settings.value = {};
      return {};
    } finally {
      isLoading.value = false;
      isInitialized.value = true;
    }
  }

  /**
   * 保存设置
   * 优先使用 api.setUpdateConfigParams()，回退到 localStorage
   * @param newSettings 要保存的设置
   */
  async function saveSettings(newSettings: Partial<DbSettings>): Promise<boolean> {
    try {
      const api = getCore().getDB();

      // 合并设置
      const mergedSettings = { ...settings.value, ...newSettings };

      // 优先使用 5.5 新 API: setUpdateConfigParams
      if (api && typeof api.setUpdateConfigParams === 'function') {
        // 只传后端认识的参数
        const apiParams: Record<string, number> = {};
        if (mergedSettings.autoUpdateThreshold !== undefined) {
          apiParams.autoUpdateThreshold = mergedSettings.autoUpdateThreshold;
        }
        if (mergedSettings.autoUpdateFrequency !== undefined) {
          apiParams.autoUpdateFrequency = mergedSettings.autoUpdateFrequency;
        }
        if (mergedSettings.updateBatchSize !== undefined) {
          apiParams.updateBatchSize = mergedSettings.updateBatchSize;
        }

        api.setUpdateConfigParams(apiParams);
        settings.value = mergedSettings;
        // 前端独有参数（如 skipUpdateFloors）也写入 localStorage 保存
        writeToLocalStorage(mergedSettings);
        console.info('[ACU] 通过 setUpdateConfigParams 保存设置成功');
        return true;
      }

      // 回退到 localStorage
      writeToLocalStorage(mergedSettings);
      settings.value = mergedSettings;
      console.info('[ACU] 通过 localStorage 保存设置');
      return true;
    } catch (e) {
      console.error('[ACU] 保存设置失败:', e);
      // 尝试写入 localStorage
      try {
        writeToLocalStorage({ ...settings.value, ...newSettings });
        settings.value = { ...settings.value, ...newSettings };
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * 更新单个设置项（实时保存）
   * @param key 设置键
   * @param value 设置值
   */
  async function updateSetting<K extends keyof DbSettings>(key: K, value: DbSettings[K]): Promise<void> {
    await saveSettings({ [key]: value } as Partial<DbSettings>);
  }

  /**
   * 执行手动更新
   * 优先使用 api.manualUpdate()，回退到 api.triggerUpdate()
   */
  async function executeManualUpdate(): Promise<boolean> {
    try {
      const api = getCore().getDB();

      if (!api) {
        console.warn('[ACU] 数据库 API 不可用');
        return false;
      }

      // 优先使用 manualUpdate（新版逻辑，带进度条）
      if (typeof api.manualUpdate === 'function') {
        await api.manualUpdate();
        console.info('[ACU] 手动更新执行成功 (manualUpdate)');
        return true;
      }

      // 回退到 triggerUpdate（旧版逻辑）
      if (typeof api.triggerUpdate === 'function') {
        const result = await api.triggerUpdate();
        console.info('[ACU] 手动更新执行成功 (triggerUpdate):', result);
        return !!result;
      }

      console.warn('[ACU] 没有可用的更新方法');
      return false;
    } catch (e) {
      console.error('[ACU] 手动更新失败:', e);
      return false;
    }
  }

  /**
   * 获取所有表格的元信息列表
   * 用于表格选择器 UI
   * 从 exportTableAsJson 解析表格名称和 key
   */
  function getTableList(): TableInfo[] {
    try {
      const api = getCore().getDB();

      if (!api) {
        console.warn('[ACU] 数据库 API 不可用');
        return [];
      }

      // 从 exportTableAsJson 解析表格名称
      if (typeof api.exportTableAsJson === 'function') {
        const data = api.exportTableAsJson();
        if (data && typeof data === 'object') {
          const tables: TableInfo[] = [];
          Object.keys(data).forEach(key => {
            if (!key.startsWith('sheet_')) return;
            const table = data[key];
            const name = table?.name || key;
            // 简单判断是否是总结表/大纲表
            const isSummaryOrOutline =
              name.includes('总结') ||
              name.includes('大纲') ||
              name.includes('纪要') ||
              name.toLowerCase().includes('summary') ||
              name.toLowerCase().includes('outline');
            tables.push({ key, name, isSummaryOrOutline });
          });
          console.info('[ACU] 从 exportTableAsJson 解析表格列表:', tables.length);
          return tables;
        }
      }

      console.warn('[ACU] 无法获取表格列表');
      return [];
    } catch (e) {
      console.error('[ACU] 获取表格列表失败:', e);
      return [];
    }
  }

  // ============================================================
  // 手动更新表选择 API（5.5 新增）
  // ============================================================

  /**
   * 读取后端保存的手动更新表选择
   * @returns {ManualSelectedTablesResult} 包含 selectedTables (sheetKeys) 和 hasManualSelection
   */
  function loadManualSelectedTables(): ManualSelectedTablesResult {
    try {
      const api = getCore().getDB();
      if (api && typeof api.getManualSelectedTables === 'function') {
        const result = api.getManualSelectedTables();
        console.info('[ACU] 读取手动更新表选择:', result);
        return result;
      }
      return { selectedTables: [], hasManualSelection: false };
    } catch (e) {
      console.warn('[ACU] 读取手动更新表选择失败:', e);
      return { selectedTables: [], hasManualSelection: false };
    }
  }

  /**
   * 保存手动更新表选择到后端
   * @param sheetKeys 要选择的表格 key 数组 (如 ['sheet_0', 'sheet_1'])
   */
  function saveManualSelectedTables(sheetKeys: string[]): boolean {
    try {
      const api = getCore().getDB();
      if (api && typeof api.setManualSelectedTables === 'function') {
        const result = api.setManualSelectedTables(sheetKeys);
        console.info('[ACU] 保存手动更新表选择:', sheetKeys, '结果:', result);
        return result;
      }
      console.warn('[ACU] setManualSelectedTables API 不可用');
      return false;
    } catch (e) {
      console.warn('[ACU] 保存手动更新表选择失败:', e);
      return false;
    }
  }

  /**
   * 清除手动更新表选择（恢复全选状态）
   */
  function clearManualSelectedTables(): boolean {
    try {
      const api = getCore().getDB();
      if (api && typeof api.clearManualSelectedTables === 'function') {
        const result = api.clearManualSelectedTables();
        console.info('[ACU] 清除手动更新表选择, 结果:', result);
        return result;
      }
      return false;
    } catch (e) {
      console.warn('[ACU] 清除手动更新表选择失败:', e);
      return false;
    }
  }

  /**
   * 使用预设参数执行更新
   * 流程: setUpdateConfigParams → setManualSelectedTables → manualUpdate
   *
   * @param presetSettings 更新参数设置
   * @param targetSheetKeys 要更新的表格 sheetKey 列表（空数组=更新全部）
   * @param silent 是否静默模式（暂未使用）
   */
  async function executeWithPreset(
    presetSettings: Partial<DbSettings>,
    targetSheetKeys: string[] = [],
    silent = false,
  ): Promise<PresetExecuteResult> {
    try {
      const api = getCore().getDB();

      if (!api) {
        return { success: false, message: '数据库 API 不可用' };
      }

      // 步骤1: 设置更新参数
      if (typeof api.setUpdateConfigParams === 'function') {
        const apiParams: Record<string, number> = {};
        if (presetSettings.autoUpdateThreshold !== undefined) {
          apiParams.autoUpdateThreshold = presetSettings.autoUpdateThreshold;
        }
        if (presetSettings.autoUpdateFrequency !== undefined) {
          apiParams.autoUpdateFrequency = presetSettings.autoUpdateFrequency;
        }
        if (presetSettings.updateBatchSize !== undefined) {
          apiParams.updateBatchSize = presetSettings.updateBatchSize;
        }
        api.setUpdateConfigParams(apiParams);
        console.info('[ACU] 已设置更新配置参数:', apiParams);
      } else {
        // 回退：保存到 localStorage
        await saveSettings(presetSettings);
      }

      // 步骤2: 设置手动更新表选择
      if (targetSheetKeys.length > 0) {
        if (typeof api.setManualSelectedTables === 'function') {
          api.setManualSelectedTables(targetSheetKeys);
          console.info('[ACU] 已设置手动更新表选择:', targetSheetKeys);
        }
      } else {
        // 空数组 = 更新全部，清除手动选择
        if (typeof api.clearManualSelectedTables === 'function') {
          api.clearManualSelectedTables();
          console.info('[ACU] 已清除手动更新表选择（更新全部）');
        }
      }

      // 步骤3: 执行手动更新
      const success = await executeManualUpdate();
      return {
        success,
        message: success ? '更新成功' : '更新失败',
      };
    } catch (e) {
      console.error('[ACU] 预设执行失败:', e);
      return { success: false, message: String(e) };
    }
  }

  return {
    // 状态
    settings,
    isLoading,
    isInitialized,

    // 方法
    loadSettings,
    saveSettings,
    updateSetting,
    executeManualUpdate,
    getTableList,
    executeWithPreset,

    // 手动更新表选择 API (5.5)
    loadManualSelectedTables,
    saveManualSelectedTables,
    clearManualSelectedTables,

    // 工具
    findDatabaseSettingsKey,
  };
}
