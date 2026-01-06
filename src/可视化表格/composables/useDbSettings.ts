/**
 * 数据库配置读写 Composable
 * 用于管理 AutoCardUpdater 数据库的设置配置
 *
 * 配置存储逻辑：
 * - 优先使用 api.getSettings() / api.updateSettings() 操作
 * - 回退到 localStorage 读写 shujuku_*_allSettings_v2
 */

import { ref, watchEffect } from 'vue';
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
  /** 保留X层楼不更新 */
  skipUpdateFloors?: number;
  /** 其他设置项 */
  [key: string]: unknown;
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
   * 优先使用 API，回退到 localStorage
   */
  async function loadSettings(): Promise<DbSettings> {
    isLoading.value = true;

    try {
      const api = getCore().getDB();

      // 优先使用 API
      if (api && typeof api.getSettings === 'function') {
        const apiSettings = await api.getSettings();
        if (apiSettings && typeof apiSettings === 'object') {
          settings.value = apiSettings;
          console.info('[ACU] 从 API 读取设置成功');
          return apiSettings;
        }
      }

      // 回退到 localStorage
      const localSettings = readFromLocalStorage();
      settings.value = localSettings;
      console.info('[ACU] 从 localStorage 读取设置');
      return localSettings;
    } catch (e) {
      console.error('[ACU] 读取设置失败:', e);
      // 尝试从 localStorage 读取
      const localSettings = readFromLocalStorage();
      settings.value = localSettings;
      return localSettings;
    } finally {
      isLoading.value = false;
      isInitialized.value = true;
    }
  }

  /**
   * 保存设置
   * 优先使用 API，回退到 localStorage
   * @param newSettings 要保存的设置
   */
  async function saveSettings(newSettings: Partial<DbSettings>): Promise<boolean> {
    try {
      const api = getCore().getDB();

      // 合并设置
      const mergedSettings = { ...settings.value, ...newSettings };

      // 优先使用 API
      if (api && typeof api.updateSettings === 'function') {
        await api.updateSettings(mergedSettings);
        settings.value = mergedSettings;
        console.info('[ACU] 通过 API 保存设置成功');
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

    // 工具
    findDatabaseSettingsKey,
  };
}
