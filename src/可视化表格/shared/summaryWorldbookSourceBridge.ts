/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import type { RawDatabaseData } from '../types';

export type SummaryWorldbookChangeReason =
  | 'ai_fill_completed'
  | 'frontend_json_saved'
  | 'manual_edit_saved'
  | 'chat_changed'
  | 'character_changed';

export interface SummaryWorldbookChangeMeta {
  reason: SummaryWorldbookChangeReason;
  affectedTableNames: string[];
  summarySheetAffected: boolean;
  isolationSlotKey: string | null;
  timestamp: number;
}

export interface SummaryWorldbookAffectCheckPayload {
  affectedTableNames?: string[];
  databaseJson?: RawDatabaseData | null;
}

export interface SummaryWorldbookSourceBridge {
  getLatestDatabaseJson: () => RawDatabaseData | null;
  getLastDatabaseChangeMeta: () => SummaryWorldbookChangeMeta | null;
  getActiveIsolationSlotKey: () => string | null;
  getActiveIsolationCode: () => string;
  isSummarySheetAffected: (payload?: SummaryWorldbookAffectCheckPayload) => boolean;
  notifySummaryWorldbookSourceUpdated: (meta: SummaryWorldbookChangeMeta) => void;
}

const SUMMARY_WORLDBOOK_SOURCE_BRIDGE_GLOBAL = 'SummaryWorldbookSourceBridge';

let latestDatabaseJson: RawDatabaseData | null = null;
let lastDatabaseChangeMeta: SummaryWorldbookChangeMeta | null = null;
let globalInitialized = false;

/**
 * 从设置键名中提取版本号
 */
function extractVersionNumber(key: string): number {
  const match = key.match(/shujuku_v?(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * 从多个键中选择版本号最高的
 */
function findHighestVersionKey(keys: string[], pattern: RegExp): string | null {
  const matchedKeys = keys.filter(k => pattern.test(k));
  if (matchedKeys.length === 0) return null;
  matchedKeys.sort((a, b) => extractVersionNumber(b) - extractVersionNumber(a));
  return matchedKeys[0];
}

/**
 * 动态查找 ACU 设置键（旧版 localStorage 方式，仅回退用）
 */
function findACUSettingsKey(storage: Storage): string | null {
  const keys = Object.keys(storage);

  const v100Key = keys.find(
    k => k.match(/^shujuku_v\d+_allSettings_v2$/) && parseInt(k.match(/v(\d+)/)?.[1] || '0', 10) >= 100,
  );
  if (v100Key) return v100Key;

  const anyKey = keys.find(k => k.match(/^shujuku_v\d+_allSettings_v2$/));
  if (anyKey) return anyKey;

  return null;
}

/**
 * 将隔离标识 code 转换为 IsolatedData 槽位 key
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
 * 规则与 useDataPersistence 对齐：
 * 1. 优先最近聊天里出现频率最高的非 __default__ 槽位（包括 '' 空标签）
 * 2. 如果只有 __default__，返回 __default__
 * 3. 完全无 ACU 历史，返回 null
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
 * 规则与 useDataPersistence 对齐：聊天历史优先，配置只在“聊天完全无 ACU 历史”时兜底
 */
function resolveWriteSlotKey(chat: any[], fallbackSlotKey: string): string {
  const dominantSlotKey = getDominantSlotKeyFromChat(chat, 50);
  if (dominantSlotKey !== null) return dominantSlotKey;
  return fallbackSlotKey;
}

/**
 * 读取当前激活的隔离标签（原始 code），作为 fallback 来源
 * 逻辑与 useDataPersistence 的同名函数保持一致思路
 */
function readActiveIsolationCodeFallback(): string {
  const w = window.parent || window;

  try {
    const context = (
      w as unknown as {
        SillyTavern?: { getContext?: () => { extensionSettings?: { __userscripts?: Record<string, unknown> } } };
      }
    ).SillyTavern?.getContext?.();
    const userscripts = context?.extensionSettings?.__userscripts;

    if (userscripts) {
      const allKeys = Object.keys(userscripts);
      const settingsKey = findHighestVersionKey(allKeys, /shujuku_v\d+__userscript_settings_v1/i);

      if (settingsKey && userscripts[settingsKey]) {
        const raw = userscripts[settingsKey];
        const settingsContainer = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);

        const versionPrefix = settingsKey.replace(/__userscript_settings_v1$/i, '');
        const globalMetaKey = `${versionPrefix}_globalMeta_v1`;
        if (settingsContainer[globalMetaKey]) {
          const metaRaw = settingsContainer[globalMetaKey];
          const meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : (metaRaw as Record<string, unknown>);
          const activeCode = String(meta.activeIsolationCode || '').trim();
          if (activeCode) return activeCode;
        }
      }
    }

    let storage = window.localStorage;
    let settingsKey = findACUSettingsKey(storage);

    if (!settingsKey && window.parent) {
      try {
        storage = window.parent.localStorage;
        settingsKey = findACUSettingsKey(storage);
      } catch {
        // ignore
      }
    }

    if (settingsKey) {
      const settingsStr = storage.getItem(settingsKey);
      if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        if (settings.dataIsolationEnabled && settings.dataIsolationCode) {
          return String(settings.dataIsolationCode);
        }
      }
    }
  } catch (error) {
    console.warn('[ACU-Bridge] 读取隔离配置失败，回退 default:', error);
  }

  return '';
}

function getCurrentChatMessages(): any[] {
  try {
    const w = window.parent || window;
    const ST =
      (window as any).SillyTavern ||
      (window.parent ? (window.parent as any).SillyTavern : null) ||
      (window.top ? (window.top as any).SillyTavern : null) ||
      (w as any).SillyTavern;
    return Array.isArray(ST?.chat) ? ST.chat : [];
  } catch {
    return [];
  }
}

function resolveActiveIsolationSlotKey(): string {
  const fallbackCode = readActiveIsolationCodeFallback();
  const fallbackSlotKey = toIsolationSlotKey(fallbackCode);
  const chat = getCurrentChatMessages();
  return resolveWriteSlotKey(chat, fallbackSlotKey);
}

function toIsolationCodeBySlotKey(slotKey: string | null): string {
  if (!slotKey || slotKey === '__default__' || slotKey === '') return '';
  try {
    return decodeURIComponent(slotKey);
  } catch {
    return slotKey;
  }
}

function cloneRawDatabaseData(data: RawDatabaseData | null): RawDatabaseData | null {
  if (!data) return null;
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(data);
    }
  } catch {
    // ignore
  }

  try {
    return JSON.parse(JSON.stringify(data)) as RawDatabaseData;
  } catch {
    return data;
  }
}

function collectAcuHostWindows(): Window[] {
  const hosts: Window[] = [];
  const push = (w: Window | null | undefined): void => {
    if (!w) return;
    if (hosts.includes(w)) return;
    hosts.push(w);
  };

  push(window);
  try {
    push(window.parent);
  } catch {
    // ignore
  }
  try {
    push(window.top);
  } catch {
    // ignore
  }

  return hosts;
}

function readCurrentDatabaseJsonFromApi(): RawDatabaseData | null {
  try {
    const hosts = collectAcuHostWindows();

    for (const host of hosts) {
      const api = (host as unknown as { AutoCardUpdaterAPI?: { exportTableAsJson?: () => unknown } })
        .AutoCardUpdaterAPI;
      if (!api || typeof api.exportTableAsJson !== 'function') continue;

      const data = api.exportTableAsJson();
      if (!data || typeof data !== 'object') continue;

      return data as RawDatabaseData;
    }

    return null;
  } catch (error) {
    console.warn('[ACU-Bridge] 读取数据库 JSON 失败:', error);
    return null;
  }
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u3000/g, ' ')
    .trim();
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function findHeaderIndex(normalizedHeaders: string[], target: string): number | null {
  const exactIndex = normalizedHeaders.findIndex(header => header === target);
  if (exactIndex >= 0) return exactIndex;

  const includeIndex = normalizedHeaders.findIndex(header => header.includes(target));
  return includeIndex >= 0 ? includeIndex : null;
}

function isSummaryLikeByName(name: string): boolean {
  const lower = normalizeText(name).toLowerCase();
  return (
    lower.includes('纪要') ||
    lower.includes('概览') ||
    lower.includes('总结') ||
    lower.includes('大纲') ||
    lower.includes('summary') ||
    lower.includes('outline')
  );
}

/**
 * 与同步侧 identifySummarySheet 的硬条件对齐：列头需同时命中 纪要 / 概览 / 编码索引
 */
function isSummarySheetByHeaders(sheet: RawDatabaseData[string] | undefined): boolean {
  if (!sheet || !Array.isArray(sheet.content) || sheet.content.length === 0) return false;

  const headers = Array.isArray(sheet.content[0]) ? sheet.content[0] : [];
  if (!Array.isArray(headers) || headers.length === 0) return false;

  const normalizedHeaders = headers.map(cell => normalizeHeader(cell));
  const detail = findHeaderIndex(normalizedHeaders, '纪要');
  const summary = findHeaderIndex(normalizedHeaders, '概览');
  const code = findHeaderIndex(normalizedHeaders, '编码索引');

  return detail !== null && summary !== null && code !== null;
}

function collectSummarySheetNames(data: RawDatabaseData): Set<string> {
  const names = new Set<string>();

  Object.entries(data).forEach(([sheetId, sheet]) => {
    if (!sheetId.startsWith('sheet_')) return;
    if (!isSummarySheetByHeaders(sheet)) return;

    names.add(sheetId);
    if (sheet?.name) names.add(String(sheet.name));
  });

  return names;
}

function isSummarySheetAffectedInternal(payload?: SummaryWorldbookAffectCheckPayload): boolean {
  const data = payload?.databaseJson ?? latestDatabaseJson;
  const affectedNames = payload?.affectedTableNames ?? [];

  if (data) {
    const summaryNames = collectSummarySheetNames(data);

    // 仅给了数据库：只要存在符合硬条件的纪要表，即视为“可影响纪要同步”
    if (affectedNames.length === 0) {
      return summaryNames.size > 0;
    }

    // 同时给了受影响表：判断是否命中“已识别出的纪要表”
    return affectedNames.some(name => summaryNames.has(name));
  }

  // 无数据库时的保守回退：只看表名关键词，避免误判漏判
  if (affectedNames.length > 0) {
    return affectedNames.some(name => isSummaryLikeByName(name));
  }

  return false;
}

const bridge: SummaryWorldbookSourceBridge = {
  getLatestDatabaseJson: () => {
    const latestFromApi = readCurrentDatabaseJsonFromApi();
    if (latestFromApi) {
      latestDatabaseJson = cloneRawDatabaseData(latestFromApi);
    }

    return cloneRawDatabaseData(latestDatabaseJson);
  },

  getLastDatabaseChangeMeta: () => {
    if (!lastDatabaseChangeMeta) return null;
    return { ...lastDatabaseChangeMeta, affectedTableNames: [...lastDatabaseChangeMeta.affectedTableNames] };
  },

  getActiveIsolationSlotKey: () => {
    try {
      // default 槽位在当前实现中稳定返回 "__default__"（而非 null）
      return resolveActiveIsolationSlotKey();
    } catch (error) {
      console.warn('[ACU-Bridge] 解析 active slot key 失败:', error);
      return '__default__';
    }
  },

  getActiveIsolationCode: () => {
    const slotKey = bridge.getActiveIsolationSlotKey();
    return toIsolationCodeBySlotKey(slotKey);
  },

  isSummarySheetAffected: payload => {
    return isSummarySheetAffectedInternal(payload);
  },

  notifySummaryWorldbookSourceUpdated: meta => {
    latestDatabaseJson = bridge.getLatestDatabaseJson();

    lastDatabaseChangeMeta = {
      reason: meta.reason,
      affectedTableNames: Array.isArray(meta.affectedTableNames) ? [...meta.affectedTableNames] : [],
      summarySheetAffected: Boolean(meta.summarySheetAffected),
      isolationSlotKey: meta.isolationSlotKey ?? bridge.getActiveIsolationSlotKey(),
      timestamp: Number.isFinite(meta.timestamp) ? meta.timestamp : Date.now(),
    };

    console.info('[ACU-Bridge] 已记录纪要世界书源更新元信息:', lastDatabaseChangeMeta);
  },
};

export function getSummaryWorldbookSourceBridge(): SummaryWorldbookSourceBridge {
  return bridge;
}

function collectBridgeHostWindows(): Window[] {
  const hosts: Window[] = [];
  const push = (w: Window | null | undefined): void => {
    if (!w) return;
    if (hosts.includes(w)) return;
    hosts.push(w);
  };

  push(window);
  try {
    push(window.parent);
  } catch {
    // ignore
  }
  try {
    push(window.top);
  } catch {
    // ignore
  }

  return hosts;
}

function exposeBridgeOnHostWindows(value: SummaryWorldbookSourceBridge): number {
  const hosts = collectBridgeHostWindows();
  let exposedCount = 0;
  for (const host of hosts) {
    try {
      (host as unknown as Record<string, unknown>)[SUMMARY_WORLDBOOK_SOURCE_BRIDGE_GLOBAL] = value;
      exposedCount += 1;
    } catch {
      // ignore
    }
  }
  return exposedCount;
}

export function initializeSummaryWorldbookSourceBridgeGlobal(): void {
  if (globalInitialized) return;
  initializeGlobal(SUMMARY_WORLDBOOK_SOURCE_BRIDGE_GLOBAL, bridge);
  const exposedCount = exposeBridgeOnHostWindows(bridge);
  globalInitialized = true;
  console.info(
    `[ACU-Bridge] 全局桥接已初始化: ${SUMMARY_WORLDBOOK_SOURCE_BRIDGE_GLOBAL}；多宿主显式暴露=${exposedCount}`,
  );
}
