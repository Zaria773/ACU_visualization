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
import { getSummaryWorldbookSourceBridge } from '../shared/summaryWorldbookSourceBridge';
import { useConfigStore } from '../stores/useConfigStore';
import { useDataStore } from '../stores/useDataStore';
import type { RawDatabaseData } from '../types';
import { getCore, getTableData } from '../utils/index';
import {
  buildScheduleSummaryForFloor,
  buildV2FullCheckpointSlot,
  countAiFloorUpToIndex,
  getTagDataFromMessage,
  messageHasAnyTableData,
  messageHasV2FullCheckpoint,
  parseIsolatedDataFromMessage,
  purgeSheetKeysFromTagData,
  safeJsonClone,
  tagDataHasAnyTableData,
} from '../utils/acuV2Storage';
import { checkImportApiAvailable, checkSqliteApiAvailable, detectStorageMode } from '../utils/storageMode';
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

/**
 * 收集当前数据库中的所有表名（优先 sheet.name，回退 sheetId）
 */
function collectAllTableNames(data: RawDatabaseData): string[] {
  const names = new Set<string>();

  Object.keys(data).forEach(sheetId => {
    if (!sheetId.startsWith('sheet_')) return;
    const sheet = data[sheetId];
    if (!sheet) return;
    names.add(String(sheet.name || sheetId));
  });

  return Array.from(names);
}

/**
 * 将表格 ID 列表转换为表名列表（优先 sheet.name，回退 sheetId）
 */
function resolveTableNamesByIds(data: RawDatabaseData, tableIds: string[]): string[] {
  const names = new Set<string>();

  tableIds.forEach(tableId => {
    const sheet = data[tableId];
    if (sheet) {
      names.add(String(sheet.name || tableId));
      return;
    }
    if (tableId.startsWith('sheet_') && data[tableId]) {
      names.add(String(data[tableId].name || tableId));
      return;
    }
    names.add(String(tableId));
  });

  return Array.from(names);
}

/**
 * 从 pendingDeletes 中提取“受影响表名”。
 * pendingDeletes 的键格式：`${tableName}-row-${index}`
 */
function collectTableNamesFromPendingDeletes(pendingDeletes: Set<string>): string[] {
  const names = new Set<string>();
  if (!pendingDeletes || pendingDeletes.size === 0) return [];

  pendingDeletes.forEach(key => {
    if (typeof key !== 'string') return;
    const marker = '-row-';
    const idx = key.lastIndexOf(marker);
    if (idx <= 0) return;
    const tableName = key.slice(0, idx).trim();
    if (!tableName) return;
    names.add(tableName);
  });

  return Array.from(names);
}

/**
 * 在 RawDatabaseData 中按 sheet.name 反查 sheetId 与 sheet 引用
 *
 * 用于 SQLite 模式下从 tableName 解析回 sheetId / headers 等信息。
 *
 * @param data 原始数据库数据
 * @param name 表的中文显示名（即 `sheet.name`）
 * @returns 找到则返回 `{ sheet, tableId }`,否则 `null`
 */
function findSheetByName(data: RawDatabaseData, name: string): { sheet: any; tableId: string } | null {
  for (const id in data) {
    if (data[id]?.name === name) {
      return { sheet: data[id], tableId: id };
    }
  }
  return null;
}

/**
 * 检测“中间插入”是否被 getDetailedChanges 漏检
 *
 * `getDetailedChanges` 用“位置索引比对”判断 insert,如果用户在中间插入新行,
 * snapshot 中同一索引位置仍有内容（原行被挤后),会被识别为“修改”而非“新增”。
 *
 * 此函数对比 current 与 snap 的每张表行数,如果 current 行数 > snap 行数
 * 但 inserts 列表中该表对应的 insert 数量不足以覆盖差额,即认为漏检。
 *
 * @param current 当前完整的表格数据
 * @param snap 上次保存后的快照
 * @param inserts `getDetailedChanges` 返回的 inserts 列表（仅使用 tableName)
 * @returns `true` 表示需要 fallback 到全量导入
 */
function checkInsertMismatch(
  current: RawDatabaseData,
  snap: RawDatabaseData | null,
  inserts: Array<{ tableName: string }>,
): boolean {
  if (!snap) return false;

  const insertCountByTable = new Map<string, number>();
  inserts.forEach(i => {
    insertCountByTable.set(i.tableName, (insertCountByTable.get(i.tableName) || 0) + 1);
  });

  for (const sheetId in current) {
    if (!sheetId.startsWith('sheet_')) continue;
    const cur = current[sheetId];
    const sn = snap[sheetId];
    if (!cur?.content || !sn?.content) continue;
    const tableName = String(cur.name || sheetId);
    const expected = cur.content.length - 1 - (sn.content.length - 1); // 行数差(数据行)
    const detected = insertCountByTable.get(tableName) || 0;
    if (expected > detected) return true;
  }
  return false;
}

/**
 * 保存完成后，向纪要世界书 Source Bridge 记录一次“命中纪要表”的变更
 * 注意：这里只更新前端 bridge 状态，不触发同步侧消费逻辑
 */
function notifySummaryWorldbookBridgeOnSave(savedData: RawDatabaseData, affectedTableNames: string[]): void {
  if (!savedData || !Array.isArray(affectedTableNames) || affectedTableNames.length === 0) return;

  const traceId = `acu-save-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    const bridge = getSummaryWorldbookSourceBridge();
    const summarySheetAffected = bridge.isSummarySheetAffected({
      affectedTableNames,
      databaseJson: savedData,
    });

    console.info(`[ACU-Bridge][诊断][${traceId}] 保存后命中判定`, {
      affectedTableNames,
      summarySheetAffected,
      savedSheetCount: Object.keys(savedData || {}).length,
    });

    if (!summarySheetAffected) {
      console.info(`[ACU-Bridge][诊断][${traceId}] 保存未命中纪要表，跳过 bridge 更新`);
      return;
    }

    bridge.notifySummaryWorldbookSourceUpdated({
      reason: 'frontend_json_saved',
      affectedTableNames,
      summarySheetAffected,
      isolationSlotKey: bridge.getActiveIsolationSlotKey(),
      timestamp: Date.now(),
      // 关键：直接把本次保存后的快照推给 Source Bridge，避免 API 读取延迟导致的旧数据同步
      databaseJson: savedData,
    });

    console.info(`[ACU-Bridge][诊断][${traceId}] 保存命中纪要表，已更新 Source Bridge`);

    // 关键：前端保存命中纪要表后，主动触发纪要同步脚本立即刷新世界书注入
    const host = window.parent || window;

    const hostDiagnostics = {
      window: Boolean((window as unknown as Record<string, unknown>).SummaryWorldbookSyncBridge),
      parent: (() => {
        try {
          return Boolean((window.parent as unknown as Record<string, unknown>)?.SummaryWorldbookSyncBridge);
        } catch {
          return false;
        }
      })(),
      top: (() => {
        try {
          return Boolean((window.top as unknown as Record<string, unknown>)?.SummaryWorldbookSyncBridge);
        } catch {
          return false;
        }
      })(),
      selectedHost: host === window ? 'window' : host === window.parent ? 'parent' : 'other',
    };

    console.info(`[ACU-Bridge][诊断][${traceId}] SyncBridge 宿主可见性`, hostDiagnostics);

    const syncBridge = (host as unknown as Record<string, unknown>).SummaryWorldbookSyncBridge as
      | {
          refreshSummaryWorldbookNow?: (reason: string) => Promise<void>;
          requestSummaryWorldbookRefresh?: (reason: string) => void;
          triggerSummaryWorldbookResyncLikeUiButton?: () => void;
        }
      | undefined;

    console.info(`[ACU-Bridge][诊断][${traceId}] SyncBridge 方法可用性`, {
      hasBridge: Boolean(syncBridge),
      hasUiLikeResync: Boolean(syncBridge?.triggerSummaryWorldbookResyncLikeUiButton),
      hasRefreshNow: Boolean(syncBridge?.refreshSummaryWorldbookNow),
      hasRequestRefresh: Boolean(syncBridge?.requestSummaryWorldbookRefresh),
    });

    // 按实测保留“延迟同入口触发”一轮，避免保存瞬时竞态
    if (syncBridge?.triggerSummaryWorldbookResyncLikeUiButton) {
      window.setTimeout(() => {
        try {
          console.info(
            `[ACU-Bridge][诊断][${traceId}] 准备调用 triggerSummaryWorldbookResyncLikeUiButton（延迟380ms）`,
          );
          syncBridge.triggerSummaryWorldbookResyncLikeUiButton?.();
          console.info(`[ACU-Bridge][诊断][${traceId}] triggerSummaryWorldbookResyncLikeUiButton 调用已发出（延迟）`);
        } catch (error) {
          console.warn(`[ACU-Bridge][诊断][${traceId}] 延迟同入口触发失败：`, error);
        }
      }, 380);
    } else if (syncBridge?.refreshSummaryWorldbookNow) {
      console.info(`[ACU-Bridge][诊断][${traceId}] 准备调用 refreshSummaryWorldbookNow`);
      void syncBridge
        .refreshSummaryWorldbookNow(`ACU 前端保存命中纪要表 [${traceId}]`)
        .then(() => {
          console.info(`[ACU-Bridge][诊断][${traceId}] refreshSummaryWorldbookNow 调用已返回`);
        })
        .catch(error => {
          console.warn(`[ACU-Bridge][诊断][${traceId}] 调用立即刷新失败，回退防抖刷新：`, error);
          if (syncBridge.requestSummaryWorldbookRefresh) {
            console.info(`[ACU-Bridge][诊断][${traceId}] 准备回退调用 requestSummaryWorldbookRefresh`);
            syncBridge.requestSummaryWorldbookRefresh(`ACU 前端保存命中纪要表（回退防抖） [${traceId}]`);
          }
        });
    } else if (syncBridge?.requestSummaryWorldbookRefresh) {
      console.info(`[ACU-Bridge][诊断][${traceId}] 准备调用 requestSummaryWorldbookRefresh`);
      syncBridge.requestSummaryWorldbookRefresh(`ACU 前端保存命中纪要表 [${traceId}]`);
      console.info(`[ACU-Bridge][诊断][${traceId}] requestSummaryWorldbookRefresh 调用已发出`);
    } else {
      console.warn(`[ACU-Bridge][诊断][${traceId}] 未找到 SummaryWorldbookSyncBridge，无法主动触发纪要同步刷新`);
    }
  } catch (error) {
    console.warn(`[ACU-Bridge][诊断][${traceId}] 保存场景 bridge 更新失败:`, error);
  }
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
 * 将隔离标识 code 转换为 IsolatedData 槽位 key
 * 与 v2.5 数据库保持一致：空标识 => "__default__"，非空 => encodeURIComponent(code)
 */
function toIsolationSlotKey(code: string): string {
  const normalized = typeof code === 'string' ? code.trim() : '';
  return normalized ? encodeURIComponent(normalized) : '__default__';
}

/**
 * 统计最近聊天中 IsolatedData 槽位 key 的出现频次
 */
function getRecentSlotKeyFrequency(chat: any[], limit: number = 50): Map<string, number> {
  const freq = new Map<string, number>();
  if (!Array.isArray(chat) || chat.length === 0) return freq;

  const start = Math.max(0, chat.length - limit);
  for (let i = start; i < chat.length; i++) {
    const msg = chat[i];
    if (!msg || msg.is_user) continue;

    let isolatedData = msg.TavernDB_ACU_IsolatedData;
    if (typeof isolatedData === 'string') {
      try {
        isolatedData = JSON.parse(isolatedData);
      } catch {
        isolatedData = null;
      }
    }
    if (!isolatedData || typeof isolatedData !== 'object') continue;

    Object.keys(isolatedData).forEach(k => {
      freq.set(k, (freq.get(k) || 0) + 1);
    });
  }

  return freq;
}

/**
 * 从当前聊天历史中推断“主槽位”
 * 规则：
 * 1. 优先使用最近聊天里出现频率最高的非 __default__ 槽位（包括 '' 空标签）
 * 2. 如果只有 __default__，则返回 __default__
 * 3. 如果聊天里完全没有 ACU 槽位，返回 null
 */
function getDominantSlotKeyFromChat(chat: any[], limit: number = 50): string | null {
  const freq = getRecentSlotKeyFrequency(chat, limit);
  if (freq.size === 0) return null;

  const nonDefault = Array.from(freq.entries())
    .filter(([k]) => k !== '__default__')
    .sort((a, b) => b[1] - a[1]);

  if (nonDefault.length > 0) {
    return nonDefault[0][0];
  }

  return freq.has('__default__') ? '__default__' : null;
}

/**
 * 解析本次写入应使用的槽位 key
 * 新规则：聊天历史优先，配置只在“当前聊天完全没有 ACU 历史”时兜底
 */
function resolveWriteSlotKey(chat: any[], fallbackSlotKey: string): string {
  const dominantSlotKey = getDominantSlotKeyFromChat(chat, 50);

  // 当前聊天已有历史：完全信聊天历史，不再信 profile / globalMeta 推断
  if (dominantSlotKey !== null) {
    return dominantSlotKey;
  }

  // 当前聊天完全无 ACU 历史：才允许使用配置侧兜底
  return fallbackSlotKey;
}

/**
 * 获取当前激活的隔离标签（原始 code）
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
      const settingsKey = findHighestVersionKey(allKeys, /shujuku_v\d+__userscript_settings_v1/i);

      if (settingsKey && userscripts[settingsKey]) {
        const raw = userscripts[settingsKey];
        const settingsContainer = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);

        // 提取版本前缀（如 shujuku_v104）
        const versionPrefix = settingsKey.replace(/__userscript_settings_v1$/i, '');

        // 1) 首选 globalMeta.activeIsolationCode
        const globalMetaKey = `${versionPrefix}_globalMeta_v1`;
        if (settingsContainer[globalMetaKey]) {
          const metaRaw = settingsContainer[globalMetaKey];
          const meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : (metaRaw as Record<string, unknown>);
          const activeCode = String(meta.activeIsolationCode || '').trim();
          if (activeCode) {
            console.info(`[ACU] 使用隔离标签: "${activeCode}" (from extensionSettings.globalMeta)`);
            return activeCode;
          }
        }

        // 2) 不再根据 profile key 盲推激活标签
        // 因为这会被当前浏览器环境污染，导致“别人的聊天记录 + 我的 profile 标签”串台
        const profileSettingsKeys = Object.keys(settingsContainer).filter(
          k => k.startsWith(`${versionPrefix}_profile_v1__`) && k.endsWith('__settings'),
        );
        if (profileSettingsKeys.length > 0) {
          console.warn('[ACU] globalMeta 未提供激活标签；已忽略 profile 推断，后续将由当前聊天历史决定写入槽位');
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
        sendLatestRows: -1,
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


function ensureIsolatedDataObject(message: any): Record<string, any> {
  let isolatedData = message.TavernDB_ACU_IsolatedData;
  if (typeof isolatedData === 'string') {
    try {
      isolatedData = JSON.parse(isolatedData);
    } catch {
      isolatedData = {};
    }
  }
  if (!isolatedData || typeof isolatedData !== 'object' || Array.isArray(isolatedData)) isolatedData = {};
  message.TavernDB_ACU_IsolatedData = isolatedData;
  return isolatedData;
}

function countAiFloorForMessage(ST: any, targetIndex: number): number {
  return countAiFloorUpToIndex(ST?.chat || [], targetIndex);
}

function findNearestAiFloorIndex(chat: any[], targetIndex: number): number {
  if (!Array.isArray(chat) || chat.length === 0) return -1;
  const bounded = Math.max(0, Math.min(chat.length - 1, Math.trunc(Number(targetIndex) || 0)));
  if (chat[bounded] && !chat[bounded].is_user) return bounded;
  for (let i = bounded; i >= 0; i--) {
    if (chat[i] && !chat[i].is_user) return i;
  }
  for (let i = bounded + 1; i < chat.length; i++) {
    if (chat[i] && !chat[i].is_user) return i;
  }
  return -1;
}

function findLatestAiFloorIndex(chat: any[]): number {
  if (!Array.isArray(chat)) return -1;
  for (let i = chat.length - 1; i >= 0; i--) {
    if (chat[i] && !chat[i].is_user) return i;
  }
  return -1;
}

function writeV2FullCheckpointToMessage(
  ST: any,
  targetMsg: any,
  targetMsgIndex: number,
  slotKey: string,
  data: RawDatabaseData,
): string[] {
  const snapshot = klona(data);
  const sheetKeys = Object.keys(snapshot).filter(k => k.startsWith('sheet_'));
  const aiFloor = countAiFloorForMessage(ST, targetMsgIndex);
  const scheduleSummary = buildScheduleSummaryForFloor(snapshot, aiFloor);
  const existingTagData = getTagDataFromMessage(targetMsg, slotKey) || {};
  const isolatedData = ensureIsolatedDataObject(targetMsg);

  isolatedData[slotKey] = {
    ...(existingTagData.summaryVectorIndexState !== undefined
      ? { summaryVectorIndexState: safeJsonClone(existingTagData.summaryVectorIndexState) }
      : {}),
    ...(existingTagData.summaryVectorIndexManifest !== undefined
      ? { summaryVectorIndexManifest: safeJsonClone(existingTagData.summaryVectorIndexManifest) }
      : {}),
    ...buildV2FullCheckpointSlot(snapshot, scheduleSummary, 'manual'),
  };

  delete targetMsg.TavernDB_ACU_IndependentData;
  delete targetMsg.TavernDB_ACU_Data;
  delete targetMsg.TavernDB_ACU_SummaryData;
  delete targetMsg.TavernDB_ACU_ModifiedKeys;
  delete targetMsg.TavernDB_ACU_UpdateGroupKeys;

  return sheetKeys;
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

      // C. 获取写入槽位
      // 新规则：聊天历史优先；只有当前聊天完全没有 ACU 历史时，才用配置兜底
      const isolationCode = getActiveIsolationCode();
      const fallbackSlotKey = toIsolationSlotKey(isolationCode);
      const configKey = resolveWriteSlotKey(ST.chat || [], fallbackSlotKey);

      if (configKey !== fallbackSlotKey) {
        console.warn(
          `[ACU] 全量保存槽位采用聊天历史主槽位: fallback=${fallbackSlotKey}, final=${configKey}, isolationCode="${isolationCode}"`,
        );
      }

      // D. 定位目标楼层并保存
      if (ST && ST.chat && ST.chat.length > 0) {
        let targetMsg: any = null;
        let targetMsgIndex = -1;

        // 策略：指定索引 > 最近的有数据 AI 楼层 > 最新的 AI 楼层
        if (targetIndex >= 0 && targetIndex < ST.chat.length) {
          const aiTargetIndex = findNearestAiFloorIndex(ST.chat, targetIndex);
          if (aiTargetIndex === -1) {
            toast.warning('目标楼层不是 AI 楼层，且未找到可写入的 AI 楼层');
            return finalData;
          }
          if (aiTargetIndex !== targetIndex) {
            toast.warning(`目标楼层不是 AI 楼层，已改写入最近的 AI 楼层 ${aiTargetIndex}`);
          }
          targetMsgIndex = aiTargetIndex;
          targetMsg = ST.chat[targetMsgIndex];
        } else {
          // 1. 优先寻找已经存在 ACU 数据的 AI 消息 (倒序查找)
          for (let i = ST.chat.length - 1; i >= 0; i--) {
            if (messageHasAnyTableData(ST.chat[i])) {
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
          // ★ 兼容：TavernDB_ACU_IsolatedData 可能被序列化成字符串（v2.5 数据库）
          const finalKey = configKey;
          if (targetMsg.TavernDB_ACU_IsolatedData) {
            if (typeof targetMsg.TavernDB_ACU_IsolatedData === 'string') {
              try {
                targetMsg.TavernDB_ACU_IsolatedData = JSON.parse(targetMsg.TavernDB_ACU_IsolatedData);
              } catch {
                targetMsg.TavernDB_ACU_IsolatedData = {};
              }
            }
            if (targetMsg.TavernDB_ACU_IsolatedData && typeof targetMsg.TavernDB_ACU_IsolatedData === 'object') {
              // 不再“沿用第一个已有 key”，必须写入当前激活槽位，避免串标签
            } else {
              targetMsg.TavernDB_ACU_IsolatedData = {};
            }
          } else {
            targetMsg.TavernDB_ACU_IsolatedData = {};
          }

          // V2：另存为/全量覆盖写 full checkpoint，并把 scheduleSummary 设为目标 AI 楼层。
          // 这样数据可被新版检测到，后续未更新楼层也不会被旧 modifiedKeys 语义带偏。
          const sheetsToSave = writeV2FullCheckpointToMessage(ST, targetMsg, targetMsgIndex, finalKey, finalData);

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

            // [双路保存] SQLite 模式下,直接写 chat 字段会绕过 SQLite 内存数据库,
            // 必须额外调用 refreshDataAndWorldbook() 让数据库插件重建 SQLite,
            // 否则下次 AI 自动填表会基于旧 SQLite 数据覆盖用户的修改
            try {
              if (detectStorageMode(finalData) === 'sqlite') {
                const api = getCore().getDB();
                if (api && typeof api.refreshDataAndWorldbook === 'function') {
                  await api.refreshDataAndWorldbook();
                  console.info('[ACU][SQLite] executeFullSave 后 refreshDataAndWorldbook 已调用');
                } else {
                  console.warn('[ACU][SQLite] executeFullSave 后,API 缺少 refreshDataAndWorldbook,SQLite 可能未同步');
                }
              }
            } catch (e) {
              console.warn('[ACU][SQLite] executeFullSave 后 refreshDataAndWorldbook 失败:', e);
            }

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
   * 执行增量保存操作 (分布式)
   * API 不可用时，写最新 AI 楼层 V2 full checkpoint 作为兜底。
   */
  async function executeIncrementalSave(
    dataToUse: RawDatabaseData,
    commitDeletes: boolean,
    modifiedTableIds: string[],
  ): Promise<RawDatabaseData | null> {
    if (modifiedTableIds.length === 0) return null;

    console.info('[ACU] API 不可用，使用 V2 full checkpoint 作为默认保存 fallback，涉及表格:', modifiedTableIds);

    const finalData = klona(dataToUse);
    if (commitDeletes && dataStore.pendingDeletes.size > 0) {
      for (const sheetId of modifiedTableIds) {
        if (sheetId === 'mate') continue;

        const sheet = finalData[sheetId];
        if (!sheet || !sheet.name || !sheet.content) continue;

        const newContent: (string | number)[][] = [sheet.content[0]];
        for (let i = 1; i < sheet.content.length; i++) {
          const realIdx = i - 1;
          if (!dataStore.pendingDeletes.has(`${sheet.name}-row-${realIdx}`)) {
            newContent.push(sheet.content[i]);
          }
        }
        sheet.content = newContent;
      }
    }


    let ST = (window as any).SillyTavern || (window.parent ? (window.parent as any).SillyTavern : null);
    if (!ST && (window as any).top && (window as any).top.SillyTavern) {
      ST = (window as any).top.SillyTavern;
    }

    const latestAiFloor = findLatestAiFloorIndex(ST?.chat || []);
    if (latestAiFloor === -1) {
      throw new Error('无法找到 AI 楼层来保存 V2 checkpoint');
    }

    const saved = await executeFullSave(finalData, false, latestAiFloor);
    return saved || finalData;
  }

  /**
   * 执行 SQLite 模式的精细保存（双路保存方案 — SQLite 路径）
   *
   * 通过 AutoCardUpdaterAPI 的 updateRow / insertRow / deleteRow 逐个提交变更,
   * 最后调用 refreshDataAndWorldbook 强制 SQLite 内存数据库重建,确保前端修改不被
   * AI 自动填表覆盖。
   *
   * 调用前置条件:
   * - 已通过 detectStorageMode() 确认是 sqlite 模式
   * - 已通过 checkSqliteApiAvailable() 确认 API 可用
   * - 调用方负责 isSaving 锁、UI 切换、快照更新等流程,本函数只做"调用 API + 兜底"
   *
   * @param dataToUse 当前完整的表格数据(不会被本函数修改,但会用来兜底拉取列名/sheet 信息)
   * @param commitDeletes 是否提交 pendingDeletes 的删除操作
   * @returns 保存后的最新表格数据(从 getTableData() 拉取);失败时抛出异常,由调用方决定是否回退
   */
  async function executeSqliteSave(
    dataToUse: RawDatabaseData,
    commitDeletes: boolean,
  ): Promise<RawDatabaseData | null> {
    const api = getCore().getDB();
    if (!api) {
      throw new Error('[ACU][SQLite] AutoCardUpdaterAPI 不可用');
    }

    if (typeof api.loadFromChat === 'function') {
      try {
        await api.loadFromChat();
        console.info('[ACU][SQLite] loadFromChat 预热完成');
      } catch (e) {
        console.warn('[ACU][SQLite] loadFromChat 预热失败，将继续尝试精细保存/兜底:', e);
      }
    }

    const changes = dataStore.getDetailedChanges();
    const errors: string[] = [];

    console.info('[ACU][SQLite] 开始执行精细保存', {
      deletes: changes.deletes.length,
      updates: changes.updates.length,
      inserts: changes.inserts.length,
      commitDeletes,
    });

    // ============================================================
    // 1. 删除（按 rowIdx 倒序,按表分组,避免索引前移影响后续删除）
    // ============================================================
    if (commitDeletes && changes.deletes.length > 0) {
      const deletesByTable = new Map<string, typeof changes.deletes>();
      for (const del of changes.deletes) {
        if (!deletesByTable.has(del.tableName)) {
          deletesByTable.set(del.tableName, []);
        }
        deletesByTable.get(del.tableName)!.push(del);
      }

      for (const [, dels] of deletesByTable) {
        // 同一表内按 rowIdx 倒序删除
        const sorted = [...dels].sort((a, b) => b.rowIdx - a.rowIdx);
        for (const del of sorted) {
          try {
            // API 是 1-based: 表头是 row 0,数据从 row 1 开始;rowIdx 是 0-based 数据索引
            const ok = await api.deleteRow(del.tableName, del.rowIdx + 1);
            if (!ok) {
              const msg = `deleteRow [${del.tableName}] row=${del.rowIdx} returned false`;
              console.warn('[ACU][SQLite]', msg);
              errors.push(msg);
            }
          } catch (e: any) {
            const msg = `deleteRow [${del.tableName}] row=${del.rowIdx} threw: ${e?.message ?? e}`;
            console.warn('[ACU][SQLite]', msg);
            errors.push(msg);
          }
        }
      }
    }

    // ============================================================
    // 2. 更新（按 (tableName, rowIdx) 聚合成 updateRow,以中文列名为 key）
    // ============================================================
    const updateGroups = new Map<string, { tableName: string; rowIdx: number; data: Record<string, string> }>();
    for (const upd of changes.updates) {
      const key = `${upd.tableName}@${upd.rowIdx}`;
      if (!updateGroups.has(key)) {
        updateGroups.set(key, { tableName: upd.tableName, rowIdx: upd.rowIdx, data: {} });
      }

      // 列名翻译:从 dataToUse 中按 tableName 找到对应 sheet,取 content[0] 中的中文列名
      const target = findSheetByName(dataToUse, upd.tableName);
      if (!target) {
        const msg = `update: 找不到表 ${upd.tableName}`;
        console.warn('[ACU][SQLite]', msg);
        errors.push(msg);
        continue;
      }
      const headers: any[] = target.sheet?.content?.[0] || [];
      const colName = String(headers[upd.colIdx] ?? '');
      if (!colName) {
        const msg = `update [${upd.tableName}] colIdx=${upd.colIdx} 无中文列名`;
        console.warn('[ACU][SQLite]', msg);
        errors.push(msg);
        continue;
      }
      updateGroups.get(key)!.data[colName] = upd.value;
    }

    for (const grp of updateGroups.values()) {
      try {
        // API 是 1-based: 表头是 row 0,数据从 row 1 开始;rowIdx 是 0-based 数据索引
        const ok = await api.updateRow(grp.tableName, grp.rowIdx + 1, grp.data);
        if (!ok) {
          const msg = `updateRow [${grp.tableName}] row=${grp.rowIdx} returned false`;
          console.warn('[ACU][SQLite]', msg);
          errors.push(msg);
        }
      } catch (e: any) {
        const msg = `updateRow [${grp.tableName}] row=${grp.rowIdx} threw: ${e?.message ?? e}`;
        console.warn('[ACU][SQLite]', msg);
        errors.push(msg);
      }
    }

    // ============================================================
    // 3. 新增（getDetailedChanges 已用中文列名整理好 data)
    // ============================================================
    for (const ins of changes.inserts) {
      try {
        const idx = await api.insertRow(ins.tableName, ins.data);
        if (idx === -1 || idx === false || idx === null || idx === undefined) {
          const msg = `insertRow [${ins.tableName}] returned ${String(idx)}`;
          console.warn('[ACU][SQLite]', msg);
          errors.push(msg);
        } else {
          console.info(`[ACU][SQLite] insertRow [${ins.tableName}] -> 新行索引 ${idx}`);
        }
      } catch (e: any) {
        const msg = `insertRow [${ins.tableName}] threw: ${e?.message ?? e}`;
        console.warn('[ACU][SQLite]', msg);
        errors.push(msg);
      }
    }

    // ============================================================
    // 4. 强制刷新 SQLite + 世界书（关键!避免 AI 填表用旧 SQL 覆盖前端修改）
    // ============================================================
    if (typeof api.refreshDataAndWorldbook === 'function') {
      try {
        await api.refreshDataAndWorldbook();
        console.info('[ACU][SQLite] refreshDataAndWorldbook 完成');
      } catch (e) {
        console.warn('[ACU][SQLite] refreshDataAndWorldbook 失败:', e);
      }
    } else {
      console.warn('[ACU][SQLite] API 缺少 refreshDataAndWorldbook 方法,SQLite 内存数据库可能未同步');
    }

    // ============================================================
    // 5. 中间插入兜底检测
    //    如果 getDetailedChanges 未能把行数增加识别为 insert，说明继续保存会产生歧义。
    //    这里选择中止，而不是全量覆盖 V2 checkpoint/log。
    // ============================================================
    const fallbackNeeded = checkInsertMismatch(dataToUse, dataStore.snapshot, changes.inserts);
    if (fallbackNeeded) {
      const msg = '检测到行数增加但未能生成精细 insert 操作，已中止以避免全量覆盖 V2 checkpoint/log';
      console.warn('[ACU][SQLite]', msg);
      errors.push(msg);
    }

    // ============================================================
    // 6. 错误汇总(不抛异常,让上层根据 errors 决定提示)
    // ============================================================
    if (errors.length > 0) {
      console.warn('[ACU][SQLite] 保存过程中发生错误:', errors);
      throw new Error(`[ACU][SQLite] 精细保存失败: ${errors.join('; ')}`);
    } else {
      console.info('[ACU][SQLite] 精细保存完成,无错误');
    }

    // ============================================================
    // 7. 拉取最新数据(API 已触发刷新,getTableData 拿到合并结果)
    // ============================================================
    return getTableData();
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

      // ★ 检测存储模式（双路保存方案，子任务 4）
      const storageMode = detectStorageMode(dataToUse);
      console.info(`[ACU] 检测到存储模式: ${storageMode}`);

      // 预计算 bridge 所需的受影响表名
      // - 全量保存(另存为)：按“所有表”处理
      // - 增量保存(默认)：按“实际变更表”处理
      // 注：SQLite 路径不依赖 modifiedTableIds 做 API 调用（细粒度变更走 getDetailedChanges），
      //    但 bridge 通知仍需要 affectedTableNamesForBridge，所以这里依旧计算。
      const modifiedTableIds = dataStore.getModifiedTableIds();
      const affectedTableNamesForBridge =
        targetIndex >= 0 ? collectAllTableNames(dataToUse) : resolveTableNamesByIds(dataToUse, modifiedTableIds);

      // 执行保存 (模式分发)
      let savedData: RawDatabaseData | null = null;

      if (checkSqliteApiAvailable() && targetIndex < 0) {
        // ★ 新版默认保存 → 优先走 AutoCardUpdaterAPI 精细调用
        //   API 层会按 shujuku 当前存储协议写入（V2 full checkpoint / operation log），
        //   避免前端直接写 independentData 造成 mixed legacy/V2。
        console.info(`[ACU] 执行 API 精细保存(存储模式: ${storageMode})...`);
        try {
          // 优化：无变更时跳过 SQLite 路径，避免空触发 refreshDataAndWorldbook
          //       (refreshDataAndWorldbook 会触发数据库插件重新合并并注入世界书，代价较高)
          const detailedChanges = dataStore.getDetailedChanges();
          const hasInsertMismatch = checkInsertMismatch(dataToUse, dataStore.snapshot, detailedChanges.inserts);
          const hasAnyChange =
            detailedChanges.deletes.length > 0 ||
            detailedChanges.updates.length > 0 ||
            detailedChanges.inserts.length > 0 ||
            hasInsertMismatch;
          if (!hasAnyChange) {
            console.info('[ACU][SQLite] 无变更，跳过保存');
            savedData = dataToUse;
          } else {
            if (hasInsertMismatch) {
              console.warn('[ACU][SQLite] 检测到行数增加但未生成精细 insert，将中止而不是全量覆盖');
            }
            savedData = await executeSqliteSave(dataToUse, commitDeletes);
          }
        } catch (sqliteErr) {
          console.warn('[ACU] API 精细保存失败，已中止以避免全量覆盖 V2 checkpoint/log:', sqliteErr);
          throw sqliteErr;
        }
      } else if (targetIndex >= 0) {
        // [模式2] 全量覆盖模式 (另存为)
        //         即使是 SQLite 模板，只要走“另存为”也保留原生路径，
        //         因为另存为的语义是“指定楼层全量覆盖”，当前阶段不通过 SQLite API 实现。
        console.info('[ACU] 执行全量保存 (另存为模式)...');
        savedData = await executeFullSave(dataToUse, commitDeletes, targetIndex);
      } else if (checkImportApiAvailable()) {
        console.info(`[ACU] 执行 importTableAsJson 全量导入 fallback(存储模式: ${storageMode})...`);
        const api = getCore().getDB();
        await api.importTableAsJson(JSON.stringify(dataToUse));
        if (typeof api.refreshDataAndWorldbook === 'function') {
          await api.refreshDataAndWorldbook();
        }
        savedData = getTableData() || dataToUse;
      } else {
        // [模式1] 增量更新模式 (默认模式) —— API 完全不可用时写最新 AI 楼层 V2 full checkpoint
        console.info('[ACU] API 不可用，执行 V2 checkpoint fallback 保存...');

        if (modifiedTableIds.length === 0) {
          console.info('[ACU] 无变更，跳过保存');
          savedData = dataToUse;
        } else {
          savedData = await executeIncrementalSave(dataToUse, commitDeletes, modifiedTableIds);
        }
      }

      // 保存成功后，更新纪要世界书 Source Bridge（仅命中纪要表时）
      if (savedData && affectedTableNamesForBridge.length > 0) {
        notifySummaryWorldbookBridgeOnSave(savedData, affectedTableNamesForBridge);
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
      let touchedV2Checkpoint = false;

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

        if (messageHasV2FullCheckpoint(msg)) touchedV2Checkpoint = true;

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
        if (touchedV2Checkpoint) {
          toast.warning('清除范围包含 V2 checkpoint，可能影响数据库恢复链；已刷新数据库状态');
        }

        // 持久化保存删除操作
        if (ST.saveChat) {
          await ST.saveChat();
        }

        // 同步世界书
        await syncWorldbook();

        // 重新获取最新的 merge 数据作为新快照
        // 这样下次 diff 对比时基准是清除后的真实状态
        // (同时复用此调用结果做 SQLite 模式检测,避免重复调用 getTableData)
        const latestData = getTableData();

        // [双路保存] SQLite 模式下,直接 delete msg 字段会绕过 SQLite 内存数据库,
        // 必须额外调用 refreshDataAndWorldbook() 强制 SQLite 重建
        try {
          if (latestData && detectStorageMode(latestData) === 'sqlite') {
            const api = getCore().getDB();
            if (api && typeof api.refreshDataAndWorldbook === 'function') {
              await api.refreshDataAndWorldbook();
              console.info('[ACU][SQLite] purgeFloorRange 后 refreshDataAndWorldbook 已调用');
            }
          }
        } catch (e) {
          console.warn('[ACU][SQLite] purgeFloorRange 后 refreshDataAndWorldbook 失败:', e);
        }

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

        // 处理 TavernDB_ACU_IsolatedData：兼容 V2 storageFrame + legacy-v1 字段
        const isolatedData = parseIsolatedDataFromMessage(msg);
        if (isolatedData) {
          Object.keys(isolatedData).forEach(tagKey => {
            const tagData = isolatedData[tagKey];
            if (!tagData || typeof tagData !== 'object') return;
            if (purgeSheetKeysFromTagData(tagData, keys)) msgChanged = true;
            if (!tagDataHasAnyTableData(tagData)) {
              delete isolatedData[tagKey];
              msgChanged = true;
            }
          });
          if (Object.keys(isolatedData).length === 0) delete msg.TavernDB_ACU_IsolatedData;
          else msg.TavernDB_ACU_IsolatedData = isolatedData;
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
        // (同时复用此调用结果做 SQLite 模式检测,避免重复调用 getTableData)
        const latestData = getTableData();

        // [双路保存] SQLite 模式下,直接 delete msg 字段会绕过 SQLite 内存数据库,
        // 必须额外调用 refreshDataAndWorldbook() 强制 SQLite 重建
        try {
          if (latestData && detectStorageMode(latestData) === 'sqlite') {
            const api = getCore().getDB();
            if (api && typeof api.refreshDataAndWorldbook === 'function') {
              await api.refreshDataAndWorldbook();
              console.info('[ACU][SQLite] purgeTableDataByRange 后 refreshDataAndWorldbook 已调用');
            }
          }
        } catch (e) {
          console.warn('[ACU][SQLite] purgeTableDataByRange 后 refreshDataAndWorldbook 失败:', e);
        }

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
            // [双路保存] 改用本 composable 的 saveToDatabase,享受 SQLite 模式分流
            // skipRender=true:自动保存不弹 toast、不改保存按钮 UI
            // commitDeletes=false:自动保存不提交用户删除,等用户显式点保存才提交
            // targetIndex=-1:默认增量保存模式
            await saveToDatabase(null, true, false, -1);
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
  // 初始化函数
  // ============================================================

  /**
   * 初始化数据持久化
   * 包含: 加载数据、设置自动保存
   */
  async function initDataPersistence(): Promise<void> {
    console.info('[ACU] 初始化数据持久化...');

    // 1. 从数据库加载数据
    await dataStore.loadFromDatabase();

    // 2. 设置自动保存 (如果配置启用)
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

    // SQLite 模式精细保存
    executeSqliteSave,

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

    // 初始化
    initDataPersistence,

    // 工具函数
    getTableData,

    // Store 引用 (便于外部访问)
    dataStore,
  };
}
