/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 数据持久化 Composable
 * 迁移原代码中的 saveDataToDatabase 函数逻辑
 * 新增: 自动保存(防抖)、兼容层数据迁移、10.3+指导表同步
 */

import { watchDebounced } from '@vueuse/core';
import { klona } from 'klona';
import type { WatchStopHandle } from 'vue';
import { useConfigStore } from '../stores/useConfigStore';
import { useDataStore } from '../stores/useDataStore';
import type { RawDatabaseData } from '../types';
import { getCore, getTableData } from '../utils/index';
import { toast } from './useToast';

/**
 * 动态查找 ACU 设置键 (旧版 localStorage 方式，仅作为回退)
 * 10.3+ 数据库使用动态版本号（如 shujuku_v100_allSettings_v2）
 * 旧版本使用固定版本号（如 shujuku_v34_allSettings_v2）
 */
function findACUSettingsKey(storage: Storage): string | null {
  const keys = Object.keys(storage);
  // 优先查找 v100+ 版本（10.3+ 数据库）
  const v100Key = keys.find(
    k => k.match(/^shujuku_v\d+_allSettings_v2$/) && parseInt(k.match(/v(\d+)/)?.[1] || '0') >= 100,
  );
  if (v100Key) return v100Key;

  // 回退到任何匹配的设置键
  const anyKey = keys.find(k => k.match(/^shujuku_v\d+_allSettings_v2$/));
  if (anyKey) return anyKey;

  return null;
}

// ============================================================
// 隔离配置获取 (兼容多版本存储格式)
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
 * 获取当前激活的隔离标签
 * 兼容多版本存储格式（9.5 / 10.5+ / 12.1）
 * @returns 隔离标签字符串，未启用隔离或获取失败返回空字符串
 */
function getActiveIsolationCode(): string {
  const w = window.parent || window;

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
        if (settingsContainer[globalMetaKey]) {
          const metaRaw = settingsContainer[globalMetaKey];
          const meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : (metaRaw as Record<string, unknown>);
          const activeCode = String(meta.activeIsolationCode || '');
          if (activeCode) {
            console.info(`[ACU] 使用隔离标签: "${activeCode}" (from extensionSettings)`);
          }
          return activeCode;
        }
      }
    }

    // [回退] 从 localStorage 读取（兼容旧版本 9.5）
    let storage = window.localStorage;
    let settingsKey = findACUSettingsKey(storage);

    // 如果 iframe 的 localStorage 没找到，尝试父窗口
    if (!settingsKey && window.parent) {
      try {
        storage = window.parent.localStorage;
        settingsKey = findACUSettingsKey(storage);
      } catch {
        // ignore cross-origin access
      }
    }

    if (settingsKey) {
      const settingsStr = storage.getItem(settingsKey);
      if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        if (settings.dataIsolationEnabled && settings.dataIsolationCode) {
          console.info(`[ACU] 使用隔离标签: "${settings.dataIsolationCode}" (from localStorage: ${settingsKey})`);
          return settings.dataIsolationCode;
        }
      }
    }
  } catch (e) {
    console.warn('[ACU] 读取隔离配置失败:', e);
  }

  return '';
}

// ============================================================
// 10.3+ 指导表 (SheetGuide) 相关常量和类型
// 兼容说明：旧版本数据库（9.5及以下）不存在此字段，我们的操作会被忽略
// ============================================================

/** 10.3+ 指导表字段名 */
const CHAT_SHEET_GUIDE_FIELD = 'TavernDB_ACU_InternalSheetGuide';
/** 指导表版本号 */
const CHAT_SHEET_GUIDE_VERSION = 1;
/** 表格排序字段 */
const TABLE_ORDER_FIELD = 'orderNo';

/** 指导表槽位数据 */
interface SheetGuideSlot {
  data: Record<string, unknown>;
  updatedAt: number;
  reason: string;
}

/** 指导表容器 */
interface SheetGuideContainer {
  version: number;
  tags: Record<string, SheetGuideSlot>;
}

/**
 * 构建指导表数据（只保留表头 + 参数，无数据行）
 * 与 10.3 的 normalizeGuideData_ACU 逻辑保持一致
 */
function buildSheetGuideData(rawData: RawDatabaseData): Record<string, unknown> {
  const out: Record<string, unknown> = { mate: { type: 'chatSheets', version: 1 } };

  Object.keys(rawData).forEach(k => {
    if (!k.startsWith('sheet_')) return;
    const sheet = rawData[k] as Record<string, unknown> | undefined;
    if (!sheet || typeof sheet !== 'object') return;

    // 只保留表头行（与10.3的normalizeGuideData_ACU一致）
    const content = sheet.content as (string | number)[][] | undefined;
    const headerRow = Array.isArray(content) && Array.isArray(content[0]) ? content[0] : [null];

    out[k] = {
      uid: sheet.uid || k,
      name: sheet.name || k,
      sourceData: sheet.sourceData || {
        note: '',
        initNode: '',
        insertNode: '',
        updateNode: '',
        deleteNode: '',
      },
      content: [headerRow], // 只有表头，无数据行
      updateConfig: sheet.updateConfig || {
        uiSentinel: -1,
        contextDepth: -1,
        updateFrequency: -1,
        batchSize: -1,
        skipFloors: -1,
      },
      exportConfig: sheet.exportConfig || {
        enabled: false,
        splitByRow: false,
        entryName: (sheet.name as string) || k,
        entryType: 'constant',
        keywords: '',
        preventRecursion: true,
        injectionTemplate: '',
      },
      [TABLE_ORDER_FIELD]: (sheet as Record<string, unknown>)[TABLE_ORDER_FIELD] ?? undefined,
    };
  });

  return out;
}
/**
 * 更新 chat[0] 中的指导表（10.3+ 兼容）
 * 如果数据库不支持指导表（9.5及以下），此操作会被静默忽略
 * @param ST SillyTavern 核心对象
 * @param configKey 隔离配置键（无隔离时为空字符串）
 * @param guideData 指导表数据
 */
function updateSheetGuide(ST: any, configKey: string, guideData: Record<string, unknown>): boolean {
  // 兼容性检查：确保 chat 存在且有消息
  if (!ST?.chat || ST.chat.length === 0) {
    console.info('[ACU] 无法更新指导表：聊天记录为空');
    return false;
  }

  const firstMsg = ST.chat[0];
  if (!firstMsg) {
    console.info('[ACU] 无法更新指导表：chat[0] 不存在');
    return false;
  }

  try {
    // 获取现有容器或创建新的
    let container: SheetGuideContainer | null = null;
    const raw = firstMsg[CHAT_SHEET_GUIDE_FIELD];

    if (raw) {
      if (typeof raw === 'string') {
        try {
          container = JSON.parse(raw) as SheetGuideContainer;
        } catch {
          container = null;
        }
      } else if (typeof raw === 'object') {
        container = raw as SheetGuideContainer;
      }
    }

    // 如果容器不存在或无效，创建新的
    if (!container || typeof container !== 'object') {
      container = { version: CHAT_SHEET_GUIDE_VERSION, tags: {} };
    }
    if (!container.tags || typeof container.tags !== 'object') {
      container.tags = {};
    }

    // 更新当前隔离标签的槽位
    container.version = CHAT_SHEET_GUIDE_VERSION;
    container.tags[configKey] = {
      data: guideData,
      updatedAt: Date.now(),
      reason: 'vue_visualizer_save',
    };

    // 写入 chat[0]
    firstMsg[CHAT_SHEET_GUIDE_FIELD] = container;
    console.info(
      `[ACU] 已更新 chat[0] 指导表 (tag=${configKey || '无标签'}, tables=${Object.keys(guideData).filter(k => k.startsWith('sheet_')).length})`,
    );
    return true;
  } catch (e) {
    console.warn('[ACU] 更新指导表失败:', e);
    return false;
  }
}

/**
 * 获取当前指导表信息（用于调试和冲突检测）
 */
function getSheetGuideInfo(
  ST: any,
  configKey: string,
): {
  exists: boolean;
  updatedAt: number | null;
  reason: string | null;
  tableCount: number;
} {
  const defaultResult = { exists: false, updatedAt: null, reason: null, tableCount: 0 };

  if (!ST?.chat?.[0]) return defaultResult;

  try {
    let container = ST.chat[0][CHAT_SHEET_GUIDE_FIELD];
    if (!container) return defaultResult;

    if (typeof container === 'string') {
      try {
        container = JSON.parse(container);
      } catch {
        return defaultResult;
      }
    }

    const slot = container?.tags?.[configKey];
    if (!slot) return defaultResult;

    const tableCount = Object.keys(slot.data || {}).filter(k => k.startsWith('sheet_')).length;

    return {
      exists: true,
      updatedAt: slot.updatedAt || null,
      reason: slot.reason || null,
      tableCount,
    };
  } catch {
    return defaultResult;
  }
}

/** 旧版本 localStorage 键名 - 用于兼容性检测 */
const LEGACY_KEYS = [
  'acu_table_order',
  'acu_reverse_tables',
  'acu_table_heights',
  'acu_active_tab',
  'acu_ui_collapse',
  'acu_pin',
  'acu_table_styles',
  'acu_win_config',
] as const;

/** V5 隔离设置键名 */
const STORAGE_KEY_V5_SETTINGS = 'acu_v5_isolation_settings';

export function useDataPersistence() {
  const dataStore = useDataStore();
  const configStore = useConfigStore();

  // ============================================================
  // 核心保存逻辑 (全量模式 - 另存为专用)
  // ============================================================

  /**
   * 执行全量保存操作 (原 executeCoreSave)
   * 将所有数据完整写入指定楼层（覆盖或新建）
   * @param dataToUse 要保存的数据
   * @param commitDeletes 是否提交删除操作
   * @param targetIndex 目标楼层索引 (-1 表示自动查找)
   */
  async function executeFullSave(
    dataToUse: RawDatabaseData,
    commitDeletes: boolean,
    targetIndex: number = -1,
  ): Promise<RawDatabaseData | null> {
    // 深拷贝一份数据，避免污染源
    const finalData = klona(dataToUse);

    // A. 处理删除操作
    if (commitDeletes && dataStore.pendingDeletes.size > 0) {
      for (const sheetId in finalData) {
        if (sheetId === 'mate') continue;

        const sheet = finalData[sheetId];
        if (!sheet || !sheet.name || !sheet.content) continue;

        const newContent: (string | number)[][] = [sheet.content[0]]; // 保留表头
        for (let i = 1; i < sheet.content.length; i++) {
          const realIdx = i - 1;
          // 只有不在删除列表里的行才保留
          if (!dataStore.pendingDeletes.has(`${sheet.name}-row-${realIdx}`)) {
            newContent.push(sheet.content[i]);
          }
        }
        sheet.content = newContent;
      }
    }

    try {
      // B. 获取 SillyTavern 核心对象
      let ST = (window as any).SillyTavern || (window.parent ? (window.parent as any).SillyTavern : null);
      if (!ST && (window as any).top && (window as any).top.SillyTavern) {
        ST = (window as any).top.SillyTavern;
      }

      // C. 获取隔离配置 Key（兼容 9.5 / 10.5+ / 12.1）
      const configKey = getActiveIsolationCode();

      // D. 定位目标楼层并保存
      if (ST && ST.chat && ST.chat.length > 0) {
        let targetMsg: any = null;
        let targetMsgIndex = -1;

        // 策略：指定索引 > 最近的有数据 AI 楼层 > 最新的 AI 楼层
        if (targetIndex >= 0 && targetIndex < ST.chat.length) {
          targetMsgIndex = targetIndex;
          targetMsg = ST.chat[targetMsgIndex];
        } else {
          // 1. 优先寻找已经存在 ACU 数据的 AI 消息 (倒序查找)
          for (let i = ST.chat.length - 1; i >= 0; i--) {
            if (!ST.chat[i].is_user && ST.chat[i].TavernDB_ACU_IsolatedData) {
              targetMsgIndex = i;
              targetMsg = ST.chat[i];
              break;
            }
          }
          // 2. 如果没找到，兜底使用最新的 AI 消息
          if (!targetMsg) {
            for (let i = ST.chat.length - 1; i >= 0; i--) {
              if (!ST.chat[i].is_user) {
                targetMsgIndex = i;
                targetMsg = ST.chat[i];
                break;
              }
            }
          }
        }

        // 写入数据
        if (targetMsg) {
          // 确定存储的 Key
          let finalKey = configKey;
          if (targetMsg.TavernDB_ACU_IsolatedData) {
            const existingKeys = Object.keys(targetMsg.TavernDB_ACU_IsolatedData);
            if (existingKeys.length > 0) {
              finalKey = existingKeys[0]; // 沿用已有的 Key
            }
          } else {
            targetMsg.TavernDB_ACU_IsolatedData = {};
          }

          // 初始化结构
          if (!targetMsg.TavernDB_ACU_IsolatedData[finalKey]) {
            targetMsg.TavernDB_ACU_IsolatedData[finalKey] = {
              independentData: {},
              modifiedKeys: [],
              updateGroupKeys: [],
            };
          }

          const tagData = targetMsg.TavernDB_ACU_IsolatedData[finalKey];
          if (!tagData.independentData) tagData.independentData = {};

          // 过滤并保存 sheet 数据
          const sheetsToSave = Object.keys(finalData).filter(k => k.startsWith('sheet_'));
          sheetsToSave.forEach(k => {
            tagData.independentData[k] = klona(finalData[k]);
          });

          // 记录修改过的 Key
          const existingKeys: string[] = tagData.modifiedKeys || [];
          tagData.modifiedKeys = [...new Set([...existingKeys, ...sheetsToSave])];

          // F. 同步更新指导表（10.3+ 兼容）
          // 注意：这一步对于旧版本数据库（9.5及以下）会被静默忽略
          // 对于新版本数据库（10.3+），这确保 merge 时能正确识别我们保存的数据
          if (sheetsToSave.length > 0) {
            const guideData = buildSheetGuideData(finalData);
            if (Object.keys(guideData).some(k => k.startsWith('sheet_'))) {
              updateSheetGuide(ST, finalKey, guideData);
            }
          }

          // 执行保存到聊天记录
          if (ST.saveChat) {
            await ST.saveChat();

            // E. 调用 API 同步世界书 (在 saveChat 成功后立即执行)
            await syncWorldbook();

            return { ...finalData, _savedToFloor: targetMsgIndex } as unknown as RawDatabaseData;
          }
        }
      }
    } catch (directErr) {
      console.error('[ACU] Core save error:', directErr);
      throw directErr;
    }

    // 兜底：如果没有通过 saveChat 保存，也尝试同步世界书
    await syncWorldbook();

    return finalData;
  }

  // ============================================================
  // 增量保存逻辑 (分布式保存)
  // ============================================================

  /**
   * 查找表格最近一次出现的数据楼层
   * @param ST SillyTavern 核心对象
   * @param tableId 表格 ID (sheet_xxx)
   * @param configKey 隔离配置键
   * @returns 楼层索引，未找到返回 -1
   */
  function findFloorForTable(ST: any, tableId: string, configKey: string): number {
    if (!ST || !ST.chat) return -1;

    // 倒序查找
    for (let i = ST.chat.length - 1; i >= 0; i--) {
      const msg = ST.chat[i];
      if (msg.is_user) continue;

      // 检查 TavernDB_ACU_IsolatedData
      if (msg.TavernDB_ACU_IsolatedData && typeof msg.TavernDB_ACU_IsolatedData === 'object') {
        // 优先检查当前隔离键
        const tagData = msg.TavernDB_ACU_IsolatedData[configKey];
        if (tagData && tagData.independentData && tagData.independentData[tableId]) {
          return i;
        }

        // 也可以检查无标签槽位（如果当前是空标签）
        if (!configKey && msg.TavernDB_ACU_IsolatedData[""] &&
          msg.TavernDB_ACU_IsolatedData[""].independentData &&
          msg.TavernDB_ACU_IsolatedData[""].independentData[tableId]) {
          return i;
        }
      }

      // 兼容性：检查旧数据结构
      if (msg.TavernDB_ACU_IndependentData && msg.TavernDB_ACU_IndependentData[tableId]) {
        // 如果开启了隔离，且旧数据有 Identity 且不匹配，则跳过
        if (configKey && msg.TavernDB_ACU_Identity && msg.TavernDB_ACU_Identity !== configKey) {
          continue;
        }
        return i;
      }
    }

    return -1;
  }

  /**
   * 执行增量保存操作 (分布式)
   * 仅保存发生变更的表格到其对应的历史楼层
   * @param dataToUse 完整的数据源
   * @param commitDeletes 是否提交删除操作
   * @param modifiedTableIds 发生变更的表格 ID 列表
   */
  async function executeIncrementalSave(
    dataToUse: RawDatabaseData,
    commitDeletes: boolean,
    modifiedTableIds: string[]
  ): Promise<RawDatabaseData | null> {
    if (modifiedTableIds.length === 0) return null;

    console.info('[ACU] 开始增量保存，涉及表格:', modifiedTableIds);

    // 深拷贝一份数据，避免污染源
    const finalData = klona(dataToUse);

    // A. 处理删除操作 (仅针对涉及的表)
    if (commitDeletes && dataStore.pendingDeletes.size > 0) {
      for (const sheetId of modifiedTableIds) {
        if (sheetId === 'mate') continue;

        const sheet = finalData[sheetId];
        if (!sheet || !sheet.name || !sheet.content) continue;

        const newContent: (string | number)[][] = [sheet.content[0]]; // 保留表头
        let hasDeletes = false;
        for (let i = 1; i < sheet.content.length; i++) {
          const realIdx = i - 1;
          if (!dataStore.pendingDeletes.has(`${sheet.name}-row-${realIdx}`)) {
            newContent.push(sheet.content[i]);
          } else {
            hasDeletes = true;
          }
        }
        if (hasDeletes) {
          sheet.content = newContent;
        }
      }
    }

    try {
      // B. 获取 SillyTavern 核心对象
      let ST = (window as any).SillyTavern || (window.parent ? (window.parent as any).SillyTavern : null);
      if (!ST && (window as any).top && (window as any).top.SillyTavern) {
        ST = (window as any).top.SillyTavern;
      }

      // C. 获取隔离配置 Key（兼容 9.5 / 10.5+ / 12.1）
      const configKey = getActiveIsolationCode();

      // D. 分组：为每个表寻找目标楼层
      const floorMap = new Map<number, Set<string>>(); // floorIndex -> Set<tableId>
      const newTables = new Set<string>(); // 找不到历史楼层的新表

      for (const tableId of modifiedTableIds) {
        const floorIdx = findFloorForTable(ST, tableId, configKey);
        if (floorIdx !== -1) {
          if (!floorMap.has(floorIdx)) floorMap.set(floorIdx, new Set());
          floorMap.get(floorIdx)!.add(tableId);
        } else {
          newTables.add(tableId);
        }
      }

      // E. 处理新表：归入最近的有数据 AI 楼层 (兜底)
      if (newTables.size > 0) {
        let targetIndex = -1;
        // 优先找最近的有数据 AI 楼层
        for (let i = ST.chat.length - 1; i >= 0; i--) {
          if (!ST.chat[i].is_user && ST.chat[i].TavernDB_ACU_IsolatedData) {
            targetIndex = i;
            break;
          }
        }
        // 没找到则找最新的 AI 楼层
        if (targetIndex === -1) {
          for (let i = ST.chat.length - 1; i >= 0; i--) {
            if (!ST.chat[i].is_user) {
              targetIndex = i;
              break;
            }
          }
        }

        if (targetIndex !== -1) {
          if (!floorMap.has(targetIndex)) floorMap.set(targetIndex, new Set());
          newTables.forEach(t => floorMap.get(targetIndex)!.add(t));
          console.info(`[ACU] 新增表格 ${Array.from(newTables).join(', ')} 将存入楼层 ${targetIndex}`);
        } else {
          console.warn('[ACU] 无法找到任何 AI 楼层来存放新表格');
        }
      }

      // F. 执行写入 (按楼层批量处理)
      let savedAny = false;
      for (const [floorIdx, tableIds] of floorMap.entries()) {
        const targetMsg = ST.chat[floorIdx];
        if (!targetMsg) continue;

        // 1. 准备数据结构
        let isolatedData = targetMsg.TavernDB_ACU_IsolatedData;
        // 如果是纯字符串 (旧版兼容)，尝试解析或初始化
        if (typeof isolatedData === 'string') {
          try { isolatedData = JSON.parse(isolatedData); } catch { isolatedData = {}; }
        }
        if (!isolatedData || typeof isolatedData !== 'object') {
          isolatedData = {};
        }

        // 2. 获取当前标签的数据槽
        // 注意：我们必须使用空字符串 "" 作为无标签的 key，而不是 undefined
        const slotKey = configKey || "";

        if (!isolatedData[slotKey]) {
          isolatedData[slotKey] = {
            independentData: {},
            modifiedKeys: [],
            updateGroupKeys: [],
          };
        }

        const currentTagData = isolatedData[slotKey];
        if (!currentTagData.independentData) currentTagData.independentData = {};

        // 3. 增量合并数据
        const tablesToUpdate = Array.from(tableIds);
        tablesToUpdate.forEach(tableId => {
          // 从 finalData 中获取最新数据写入
          if (finalData[tableId]) {
            currentTagData.independentData[tableId] = klona(finalData[tableId]);
          }
        });

        // 4. 更新 modifiedKeys
        const existingKeys = currentTagData.modifiedKeys || [];
        currentTagData.modifiedKeys = [...new Set([...existingKeys, ...tablesToUpdate])];

        // 5. 回写到消息对象
        targetMsg.TavernDB_ACU_IsolatedData = isolatedData;

        // 6. 兼容性更新 (旧字段)
        if (configKey) {
          targetMsg.TavernDB_ACU_Identity = configKey;
        }
        // 仅当没有其他标签干扰时，才敢更新根级别的 IndependentData
        // 简单起见，我们总是更新根级别字段以保持最大兼容性 (假设当前环境以此插件为主)
        targetMsg.TavernDB_ACU_IndependentData = currentTagData.independentData;
        targetMsg.TavernDB_ACU_ModifiedKeys = currentTagData.modifiedKeys;
        targetMsg.TavernDB_ACU_UpdateGroupKeys = currentTagData.updateGroupKeys;

        savedAny = true;
        console.info(`[ACU] 已更新楼层 ${floorIdx}，涉及表格: ${tablesToUpdate.join(', ')}`);
      }

      // G. 提交保存
      if (savedAny) {
        // 同步更新指导表 (可选，暂略，因为是增量更新)

        if (ST.saveChat) {
          await ST.saveChat();
          await syncWorldbook();
          // 返回完整数据以便更新快照
          return finalData;
        }
      }

    } catch (e) {
      console.error('[ACU] Incremental save error:', e);
      throw e;
    }

    await syncWorldbook();
    return finalData;
  }

  /**
   * 同步世界书条目
   */
  async function syncWorldbook(): Promise<void> {
    const api = getCore().getDB();
    if (api && api.syncWorldbookEntries) {
      try {
        await api.syncWorldbookEntries({ createIfNeeded: true });
      } catch (syncErr) {
        console.warn('[ACU] Worldbook sync failed after save:', syncErr);
      }
    } else {
      console.warn('[ACU] syncWorldbookEntries API not found, skipping sync.');
    }
  }

  // ============================================================
  // 主保存函数 (迁移自原 saveDataToDatabase)
  // ============================================================

  /**
   * 保存数据到数据库
   * @param tableData 表格数据 (可选，默认从暂存或 API 获取)
   * @param skipRender 是否跳过 UI 渲染
   * @param commitDeletes 是否提交删除操作
   * @param targetIndex 目标楼层索引 (-1 表示自动查找)
   * @returns 是否保存成功
   */
  async function saveToDatabase(
    tableData: RawDatabaseData | null = null,
    skipRender: boolean = false,
    commitDeletes: boolean = false,
    targetIndex: number = -1,
  ): Promise<boolean> {
    // 1. 状态锁检查
    if (dataStore.isSaving) {
      console.warn('[ACU] Save already in progress');
      return false;
    }

    // 2. 准备数据源
    let dataToUse = dataStore.getStagedData();
    if (!dataToUse) {
      dataToUse = tableData || getTableData();
    }

    if (!dataToUse) {
      console.warn('[ACU] 无数据可保存');
      return false;
    }

    const { $ } = getCore();
    const $saveBtn = $?.('#acu-btn-save-global, #acu-parent-container #acu-btn-save-global');
    let originalIcon = '';

    try {
      // 设置保存锁
      dataStore.isSaving = true;

      if (!skipRender && $saveBtn?.length) {
        originalIcon = $saveBtn.html();
        $saveBtn.html('<i class="fa-solid fa-spinner fa-spin"></i>').prop('disabled', true);
      }

      // 执行保存 (模式分发)
      let savedData: RawDatabaseData | null = null;

      if (targetIndex >= 0) {
        // [模式2] 全量覆盖模式 (另存为)
        console.info('[ACU] 执行全量保存 (另存为模式)...');
        savedData = await executeFullSave(dataToUse, commitDeletes, targetIndex);
      } else {
        // [模式1] 增量更新模式 (默认保存)
        console.info('[ACU] 执行增量保存 (默认模式)...');
        const modifiedTableIds = dataStore.getModifiedTableIds();

        if (modifiedTableIds.length === 0) {
          console.info('[ACU] 无变更，跳过保存');
          // 即使跳过保存，也返回 true (表示操作未失败)
          // 但为了清理可能的临时状态，我们模拟一个“成功”
          return true;
        }

        savedData = await executeIncrementalSave(dataToUse, commitDeletes, modifiedTableIds);
      }

      if (!skipRender) {
        // 获取目标楼层用于提示
        const savedFloor = (savedData as any)?._savedToFloor;
        if (savedFloor !== undefined) {
          toast.success(`已更新至第 ${savedFloor} 层 (覆盖旧数据)`);
        } else if (savedData) {
          // 增量保存成功提示
          toast.success('保存成功');
        }

        // 清理高亮
        const parentDoc = window.parent?.document || document;
        $(parentDoc).find('.acu-highlight-changed').removeClass('acu-highlight-changed');
        $saveBtn?.removeClass('acu-save-alert');

        // 清理缓存和标记
        dataStore.clearChanges(commitDeletes);

        // 清空暂存数据
        dataStore.stagedData = null;

        // 保存快照
        if (savedData) {
          dataStore.saveSnapshot(savedData);
        }
      }

      // 同步世界书
      await syncWorldbook();

      return true;
    } catch (e) {
      console.error('[ACU] Save failed:', e);
      if (!skipRender) {
        toast.error('保存失败: ' + (e as Error).message);
      }
      return false;
    } finally {
      // 解锁
      setTimeout(() => {
        dataStore.isSaving = false;
        if (!skipRender && $saveBtn?.length) {
          $saveBtn.html(originalIcon || '<i class="fa-solid fa-save"></i>').prop('disabled', false);
        }
      }, 100);
    }
  }

  // ============================================================
  // 快照管理
  // ============================================================

  /**
   * 保存快照
   * @param data 数据
   */
  function saveSnapshot(data: RawDatabaseData): void {
    dataStore.saveSnapshot(data);
  }

  /**
   * 加载快照
   */
  function loadSnapshot(): RawDatabaseData | null {
    return dataStore.loadSnapshot();
  }

  /**
   * 清除快照
   */
  function clearSnapshot(): void {
    dataStore.clearSnapshot();
  }

  // ============================================================
  // 范围清洗功能 (迁移自原 purgeFloorRange)
  // ============================================================

  /**
   * 清除指定楼层范围的数据
   * @param startIdx 起始楼层
   * @param endIdx 结束楼层
   */
  async function purgeFloorRange(startIdx: number, endIdx: number): Promise<void> {
    if (dataStore.isSaving) return;

    // 获取 SillyTavern 核心对象
    let ST = (window as any).SillyTavern || (window.parent ? (window.parent as any).SillyTavern : null);
    if (!ST && (window as any).top && (window as any).top.SillyTavern) {
      ST = (window as any).top.SillyTavern;
    }

    if (!ST || !ST.chat) {
      toast.error('无法连接到 SillyTavern 核心数据');
      return;
    }

    // 验证和修正范围
    const maxIdx = ST.chat.length - 1;
    startIdx = Math.max(0, startIdx);
    endIdx = Math.min(maxIdx, endIdx);

    if (isNaN(startIdx) || isNaN(endIdx) || startIdx > endIdx) {
      toast.warning('无效的楼层范围');
      return;
    }

    // 设置保存锁
    dataStore.isSaving = true;

    try {
      console.log(`[ACU-Purge] 开始强力清洗楼层范围: ${startIdx} - ${endIdx}`);

      let changesCount = 0;

      // 定义所有需要被清除的数据字段
      const keysToDelete = [
        'TavernDB_ACU_Data',
        'TavernDB_ACU_SummaryData',
        'TavernDB_ACU_IndependentData',
        'TavernDB_ACU_Identity',
        'TavernDB_ACU_IsolatedData',
        'TavernDB_ACU_ModifiedKeys',
        'TavernDB_ACU_UpdateGroupKeys',
      ];

      // 遍历并执行强力删除
      for (let i = startIdx; i <= endIdx; i++) {
        const msg = ST.chat[i];
        if (!msg) continue;

        let messageModified = false;
        for (const key of keysToDelete) {
          if (Object.prototype.hasOwnProperty.call(msg, key)) {
            delete msg[key];
            messageModified = true;
          }
        }

        if (messageModified) {
          changesCount++;
        }
      }

      // 如果有变动，则保存并刷新
      if (changesCount > 0) {
        // 持久化保存删除操作
        if (ST.saveChat) {
          await ST.saveChat();
        }

        // 同步世界书
        await syncWorldbook();

        // 重新获取最新的 merge 数据作为新快照
        // 这样下次 diff 对比时基准是清除后的真实状态
        const latestData = getTableData();
        if (latestData) {
          dataStore.saveSnapshot(latestData);
        } else {
          dataStore.clearSnapshot();
        }
        dataStore.clearChanges(true);

        toast.success(`已强力清除 ${changesCount} 个楼层的数据`);
      } else {
        toast.info('指定范围内没有可清除的数据');
      }
    } catch (e) {
      console.error('[ACU] Purge Error:', e);
      toast.error('清除失败: ' + (e as Error).message);
    } finally {
      dataStore.isSaving = false;
    }
  }

  // ============================================================
  // 按表格和范围精确清除数据
  // ============================================================

  /**
   * 按表格和楼层范围精确清除数据
   * 只删除指定表格在指定楼层范围内的数据，不影响其他表格
   * @param sheetKeys 要清除的表格 key 列表 (如 ['sheet_0', 'sheet_2'])
   * @param startIdx 起始楼层 (chat 数组索引)
   * @param endIdx 结束楼层 (chat 数组索引)
   * @returns 是否有变动及变动的楼层数
   */
  async function purgeTableDataByRange(
    sheetKeys: string[],
    startIdx: number,
    endIdx: number,
  ): Promise<{ changed: boolean; changedCount: number }> {
    // 参数验证
    const keys = Array.isArray(sheetKeys)
      ? [...new Set(sheetKeys.filter(k => typeof k === 'string' && k.startsWith('sheet_')))]
      : [];

    if (keys.length === 0) {
      return { changed: false, changedCount: 0 };
    }

    // 获取 SillyTavern 核心对象
    let ST = (window as any).SillyTavern || (window.parent ? (window.parent as any).SillyTavern : null);
    if (!ST && (window as any).top && (window as any).top.SillyTavern) {
      ST = (window as any).top.SillyTavern;
    }

    if (!ST?.chat || ST.chat.length === 0) {
      toast.error('无法连接到 SillyTavern 核心数据');
      return { changed: false, changedCount: 0 };
    }

    // 验证和修正范围
    const maxIdx = ST.chat.length - 1;
    startIdx = Math.max(0, startIdx);
    endIdx = Math.min(maxIdx, endIdx);

    if (isNaN(startIdx) || isNaN(endIdx) || startIdx > endIdx) {
      toast.warning('无效的楼层范围');
      return { changed: false, changedCount: 0 };
    }

    // 设置保存锁
    if (dataStore.isSaving) {
      toast.warning('保存操作进行中，请稍后再试');
      return { changed: false, changedCount: 0 };
    }
    dataStore.isSaving = true;

    // 辅助函数：从数组中移除指定 key
    const removeKeyFromArray = (arr: string[], key: string): { arr: string[]; changed: boolean } => {
      if (!Array.isArray(arr) || arr.length === 0) return { arr, changed: false };
      const next = arr.filter(x => x !== key);
      return { arr: next, changed: next.length !== arr.length };
    };

    try {
      console.info(`[ACU-AdvancedPurge] 开始清除表格 [${keys.join(', ')}] 在楼层 ${startIdx}-${endIdx} 的数据`);

      let changedAny = false;
      let changedCount = 0;

      // 遍历指定楼层范围
      for (let i = startIdx; i <= endIdx; i++) {
        const msg = ST.chat[i];
        if (!msg || msg.is_user) continue;

        let msgChanged = false;

        // 处理 TavernDB_ACU_IsolatedData (10.3+ 版本)
        if (msg.TavernDB_ACU_IsolatedData && typeof msg.TavernDB_ACU_IsolatedData === 'object') {
          // 对该消息内所有标签槽执行删除
          Object.keys(msg.TavernDB_ACU_IsolatedData).forEach(tagKey => {
            const tagData = msg.TavernDB_ACU_IsolatedData[tagKey];
            if (!tagData || typeof tagData !== 'object') return;

            // 删除 independentData 中的表格数据
            if (tagData.independentData && typeof tagData.independentData === 'object') {
              keys.forEach(k => {
                if (tagData.independentData[k]) {
                  delete tagData.independentData[k];
                  msgChanged = true;
                }
              });
            }

            // 从 modifiedKeys 中移除
            if (Array.isArray(tagData.modifiedKeys)) {
              keys.forEach(k => {
                const r = removeKeyFromArray(tagData.modifiedKeys, k);
                if (r.changed) {
                  tagData.modifiedKeys = r.arr;
                  msgChanged = true;
                }
              });
            }

            // 从 updateGroupKeys 中移除
            if (Array.isArray(tagData.updateGroupKeys)) {
              keys.forEach(k => {
                const r = removeKeyFromArray(tagData.updateGroupKeys, k);
                if (r.changed) {
                  tagData.updateGroupKeys = r.arr;
                  msgChanged = true;
                }
              });
            }

            // 检查并清理空结构：如果 independentData 变空，删除整个标签槽
            if (
              tagData.independentData &&
              Object.keys(tagData.independentData).length === 0 &&
              (!tagData.modifiedKeys || tagData.modifiedKeys.length === 0) &&
              (!tagData.updateGroupKeys || tagData.updateGroupKeys.length === 0)
            ) {
              delete msg.TavernDB_ACU_IsolatedData[tagKey];
              msgChanged = true;
            }
          });

          // 如果所有标签槽都被删除，删除整个 IsolatedData 字段
          if (Object.keys(msg.TavernDB_ACU_IsolatedData).length === 0) {
            delete msg.TavernDB_ACU_IsolatedData;
            msgChanged = true;
          }
        }

        // 处理旧版本数据结构
        if (msg.TavernDB_ACU_IndependentData && typeof msg.TavernDB_ACU_IndependentData === 'object') {
          keys.forEach(k => {
            if (msg.TavernDB_ACU_IndependentData[k]) {
              delete msg.TavernDB_ACU_IndependentData[k];
              msgChanged = true;
            }
          });
        }

        if (Array.isArray(msg.TavernDB_ACU_ModifiedKeys)) {
          keys.forEach(k => {
            const r = removeKeyFromArray(msg.TavernDB_ACU_ModifiedKeys, k);
            if (r.changed) {
              msg.TavernDB_ACU_ModifiedKeys = r.arr;
              msgChanged = true;
            }
          });
        }

        if (Array.isArray(msg.TavernDB_ACU_UpdateGroupKeys)) {
          keys.forEach(k => {
            const r = removeKeyFromArray(msg.TavernDB_ACU_UpdateGroupKeys, k);
            if (r.changed) {
              msg.TavernDB_ACU_UpdateGroupKeys = r.arr;
              msgChanged = true;
            }
          });
        }

        if (msg.TavernDB_ACU_Data && typeof msg.TavernDB_ACU_Data === 'object') {
          keys.forEach(k => {
            if (msg.TavernDB_ACU_Data[k]) {
              delete msg.TavernDB_ACU_Data[k];
              msgChanged = true;
            }
          });
        }

        if (msg.TavernDB_ACU_SummaryData && typeof msg.TavernDB_ACU_SummaryData === 'object') {
          keys.forEach(k => {
            if (msg.TavernDB_ACU_SummaryData[k]) {
              delete msg.TavernDB_ACU_SummaryData[k];
              msgChanged = true;
            }
          });
        }

        if (msgChanged) {
          changedAny = true;
          changedCount++;
        }
      }

      // 如果有变动，保存并刷新
      if (changedAny) {
        if (ST.saveChat) {
          await ST.saveChat();
        }

        // 同步世界书
        await syncWorldbook();

        // 重新获取最新的 merge 数据作为新快照
        // 这样下次 diff 对比时基准是清除后的真实状态
        const latestData = getTableData();
        if (latestData) {
          dataStore.saveSnapshot(latestData);
        } else {
          dataStore.clearSnapshot();
        }
        dataStore.clearChanges(true);

        console.info(`[ACU-AdvancedPurge] 清除完成，影响 ${changedCount} 个楼层`);
      }

      return { changed: changedAny, changedCount };
    } catch (e) {
      console.error('[ACU-AdvancedPurge] 清除失败:', e);
      throw e;
    } finally {
      dataStore.isSaving = false;
    }
  }

  // ============================================================
  // 自动保存 (防抖)
  // ============================================================

  /** 自动保存 WatchStop 句柄 */
  let autoSaveStop: WatchStopHandle | null = null;

  /**
   * 设置自动保存
   * @param delay 防抖延迟时间 (毫秒), 默认 5000ms
   */
  function setupAutoSave(delay = 5000): void {
    // 如果已经设置过，先停止
    if (autoSaveStop) {
      autoSaveStop();
      autoSaveStop = null;
    }

    // 使用 VueUse 的 watchDebounced 监听表格数据变化
    // watchDebounced 直接返回 WatchStopHandle
    autoSaveStop = watchDebounced(
      () => dataStore.tables,
      async () => {
        // 检查是否有未保存的变更且开启了自动保存
        if (dataStore.hasChanges && configStore.config.autoSave) {
          try {
            console.info('[ACU] 自动保存触发...');
            await dataStore.saveToDatabase();
            console.info('[ACU] 自动保存完成');
          } catch (error) {
            console.error('[ACU] 自动保存失败:', error);
          }
        }
      },
      { debounce: delay, deep: true },
    );

    console.info(`[ACU] 自动保存已启用，防抖延迟: ${delay}ms`);
  }

  /**
   * 停止自动保存
   */
  function stopAutoSave(): void {
    if (autoSaveStop) {
      autoSaveStop();
      autoSaveStop = null;
      console.info('[ACU] 自动保存已停止');
    }
  }

  // ============================================================
  // 兼容旧版本数据迁移
  // ============================================================

  /**
   * 检测并记录旧版本数据
   * 用于向后兼容性检查
   */
  function migrateLegacyData(): void {
    console.info('[ACU] 检查旧版本数据...');

    let legacyDataFound = false;

    LEGACY_KEYS.forEach(key => {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          console.info(`[ACU] 发现旧版本数据: ${key}`);
          legacyDataFound = true;

          // 尝试解析并记录数据类型
          try {
            const parsed = JSON.parse(value);
            const dataType = Array.isArray(parsed) ? 'array' : typeof parsed;
            console.info(`[ACU]   - 数据类型: ${dataType}`);
          } catch {
            console.info(`[ACU]   - 数据类型: string`);
          }
        }
      } catch (e) {
        console.warn(`[ACU] 读取 ${key} 失败:`, e);
      }
    });

    // 检查 V5 设置
    try {
      const v5Settings = localStorage.getItem(STORAGE_KEY_V5_SETTINGS);
      if (v5Settings) {
        console.info('[ACU] 发现 V5 隔离设置数据');
        legacyDataFound = true;
      }
    } catch {
      // ignore
    }

    if (!legacyDataFound) {
      console.info('[ACU] 未发现旧版本数据');
    }
  }

  // ============================================================
  // 初始化函数
  // ============================================================

  /**
   * 初始化数据持久化
   * 包含: 旧数据迁移检查、加载数据、设置自动保存
   */
  async function initDataPersistence(): Promise<void> {
    console.info('[ACU] 初始化数据持久化...');

    // 1. 检查旧版本数据
    migrateLegacyData();

    // 2. 从数据库加载数据
    await dataStore.loadFromDatabase();

    // 3. 设置自动保存 (如果配置启用)
    if (configStore.config.autoSave) {
      setupAutoSave(configStore.config.autoSaveDelay || 5000);
    }

    console.info('[ACU] 数据持久化初始化完成');
  }

  // ============================================================
  // 返回公开 API
  // ============================================================

  return {
    // 主保存功能
    saveToDatabase,
    syncWorldbook,

    // 快照管理
    saveSnapshot,
    loadSnapshot,
    clearSnapshot,

    // 范围清洗
    purgeFloorRange,
    purgeTableDataByRange,

    // 自动保存
    setupAutoSave,
    stopAutoSave,

    // 兼容层
    migrateLegacyData,

    // 初始化
    initDataPersistence,

    // 工具函数
    getTableData,

    // Store 引用 (便于外部访问)
    dataStore,
  };
}
