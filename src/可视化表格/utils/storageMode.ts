/**
 * 存储模式检测工具
 *
 * 用于检测当前数据库的存储模式（SQLite 还是原生模式），
 * 以及 SQLite 模式下所需的 AutoCardUpdaterAPI 是否可用。
 *
 * 设计目标：解决数据库 v10.5+ SQLite 模板下，前端绕过数据库 API
 * 直接修改 chat 数据导致用户修改被 AI 自动填表覆盖的问题。
 *
 * @see plans/双路保存方案-SQLite模式适配.md
 */

import type { RawDatabaseData } from '../types';

/**
 * 存储模式类型
 * - `'sqlite'`：数据库 v10.5+ 的 SQLite 内存数据库模式（带 ddl 字段）
 * - `'native'`：原生 / 兼容模式（旧模板）
 */
export type StorageMode = 'sqlite' | 'native';

/**
 * 从设置键名中提取版本号
 * @param key 设置键名，如 `"shujuku_v104__userscript_settings_v1"`
 * @returns 版本号数字，如 `104`；无法解析返回 `0`
 */
function extractVersionNumber(key: string): number {
  const match = key.match(/shujuku_v?(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * 从多个键中选择版本号最高的
 *
 * 与 [`useDataPersistence.ts`](../composables/useDataPersistence.ts:233) 中的同名函数保持一致逻辑。
 * 在多版本数据库共存的环境下，需要选最新版本对应的设置项。
 *
 * @param keys 设置键名数组
 * @param pattern 匹配模式
 * @returns 版本号最高的键名，未匹配到返回 `null`
 */
function findHighestVersionKey(keys: string[], pattern: RegExp): string | null {
  const matchedKeys = keys.filter(k => pattern.test(k));
  if (matchedKeys.length === 0) {
    return null;
  }
  // 按版本号降序排序
  matchedKeys.sort((a, b) => extractVersionNumber(b) - extractVersionNumber(a));
  return matchedKeys[0];
}

/**
 * 检测当前数据库的存储模式
 *
 * 检测优先级：
 * 1. **优先级 A：检查数据中的 ddl 字段**
 *    - 遍历 `rawData` 中所有以 `sheet_` 开头的 key
 *    - 任一 sheet 的 `sourceData.ddl` 存在（非空字符串）即认为是 SQLite 模式
 *    - 这是最可靠的判断（数据层），但需要有数据
 * 2. **优先级 B：从 SillyTavern extensionSettings 读取**
 *    - 获取 `SillyTavern.getContext().extensionSettings.__userscripts`
 *    - 找到匹配 `shujuku_v\d+__userscript_settings_v1` 的最新版本键
 *    - 解析其中 `${versionPrefix}__settings.storageMode` 字段
 *    - 即使数据为空也可判断（全局模式）
 * 3. **fallback**：返回 `'native'`
 *
 * 任一外部访问失败都会被 try/catch 兜住，静默降级到下一条路径。
 *
 * @param rawData 原始数据库数据（可选，未提供时跳过优先级 A）
 * @returns 检测到的存储模式
 */
export function detectStorageMode(rawData?: RawDatabaseData | null): StorageMode {
  // ============================================================
  // 优先级 A：检查数据中的 ddl 字段
  // ============================================================
  try {
    if (rawData && typeof rawData === 'object') {
      for (const sheetId of Object.keys(rawData)) {
        if (!sheetId.startsWith('sheet_')) {
          continue;
        }
        const sheet = rawData[sheetId];
        if (!sheet || typeof sheet !== 'object') {
          continue;
        }
        // RawDatabaseData 类型未定义 sourceData，这里运行时访问需断言
        const sourceData = (sheet as { sourceData?: { ddl?: unknown } }).sourceData;
        const ddl = sourceData?.ddl;
        if (typeof ddl === 'string' && ddl.length > 0) {
          return 'sqlite';
        }
      }
    }
  } catch (e) {
    console.warn('[ACU][storageMode] 通过 ddl 检测失败，继续走下一条路径:', e);
  }

  // ============================================================
  // 优先级 B：从 SillyTavern extensionSettings 读取
  // ============================================================
  try {
    const w = (window.parent || window) as Window &
      typeof globalThis & {
        SillyTavern?: {
          getContext?: () => {
            extensionSettings?: {
              __userscripts?: Record<string, unknown>;
            };
          };
        };
      };

    const ctx = w.SillyTavern?.getContext?.();
    const userscripts = ctx?.extensionSettings?.__userscripts;

    if (userscripts && typeof userscripts === 'object') {
      const allKeys = Object.keys(userscripts);
      const settingsKey = findHighestVersionKey(allKeys, /^shujuku_v\d+__userscript_settings_v1$/i);

      if (settingsKey && userscripts[settingsKey]) {
        // 整个设置容器可能是 JSON 字符串或对象（来源于酒馆插件设置存储）
        const rawContainer = userscripts[settingsKey];
        const container = (typeof rawContainer === 'string'
          ? JSON.parse(rawContainer)
          : rawContainer) as unknown as Record<string, unknown>;

        // 提取版本前缀（如 shujuku_v104）
        const versionPrefix = settingsKey.replace(/__userscript_settings_v1$/i, '');
        const settingsField = `${versionPrefix}__settings`;

        if (container[settingsField] != null) {
          // 内层 settings 同样可能是 JSON 字符串或对象
          const rawSettings = container[settingsField];
          const settings = (typeof rawSettings === 'string'
            ? JSON.parse(rawSettings)
            : rawSettings) as unknown as Record<string, unknown>;

          if (settings && settings.storageMode === 'sqlite') {
            return 'sqlite';
          }
        }
      }
    }
  } catch (e) {
    console.warn('[ACU][storageMode] 通过 extensionSettings 读取 storageMode 失败，使用默认 native:', e);
  }

  // ============================================================
  // fallback
  // ============================================================
  return 'native';
}

/**
 * 检查 AutoCardUpdaterAPI 是否支持 SQLite 路径所需的全部方法
 *
 * SQLite 模式的双路保存方案需要调用以下 API 方法：
 * - `updateCell` —— 单元格更新
 * - `updateRow` —— 整行更新（多 cell 一次性提交）
 * - `insertRow` —— 新增行
 * - `deleteRow` —— 删除行
 * - `refreshDataAndWorldbook` —— 强制刷新数据 + 重建 SQLite + 重新注入世界书
 *
 * 注：v10.5 之前的旧版数据库 API 没有 `refreshDataAndWorldbook`，
 * 因此此函数在旧版环境会返回 `false`，从而避免走错路径。
 *
 * @returns 全部方法都存在返回 `true`，任一缺失返回 `false`
 */
export function checkSqliteApiAvailable(): boolean {
  try {
    const w = (window.parent || window) as Window &
      typeof globalThis & {
        AutoCardUpdaterAPI?: Record<string, unknown>;
      };

    const api =
      w.AutoCardUpdaterAPI ||
      (window as unknown as { AutoCardUpdaterAPI?: Record<string, unknown> }).AutoCardUpdaterAPI;

    if (!api || typeof api !== 'object') {
      return false;
    }

    const requiredMethods = ['updateCell', 'updateRow', 'insertRow', 'deleteRow', 'refreshDataAndWorldbook'] as const;

    for (const method of requiredMethods) {
      if (typeof (api as Record<string, unknown>)[method] !== 'function') {
        return false;
      }
    }

    return true;
  } catch (e) {
    console.warn('[ACU][storageMode] 检测 AutoCardUpdaterAPI 可用性失败:', e);
    return false;
  }
}
