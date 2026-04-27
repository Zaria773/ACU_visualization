import { SCRIPT_LOG_PREFIX } from './constants';
import type { TemplateSegment, TimeExtractionResult } from './timeTransform';
import { extractTime } from './timeTransform';
import type {
  AcuApiLike,
  AcuCellValue,
  AcuSheetData,
  AcuTableJson,
  AcuTableReadResult,
  EntryPlacementConfig,
  SummaryHeaderMap,
  SummarySheetIdentifyResult,
  SummarySheetMeta,
  SyncScriptSettings,
} from './types';

interface SummaryWorldbookSourceBridgeLike {
  getLatestDatabaseJson?: () => unknown;
  getActiveIsolationSlotKey?: () => unknown;
  getActiveIsolationCode?: () => unknown;
}

const SUMMARY_WORLDBOOK_SOURCE_BRIDGE_GLOBAL = 'SummaryWorldbookSourceBridge';

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

/**
 * 读取 ACU API（防御性处理）
 * - 兼容 API 被挂在 window / parent / top 的情况
 */
function getAcuApi(): AcuApiLike | null {
  const hosts = collectAcuHostWindows();
  for (const host of hosts) {
    const api = (host as unknown as { AutoCardUpdaterAPI?: unknown }).AutoCardUpdaterAPI;
    if (api && typeof api === 'object') {
      return api as AcuApiLike;
    }
  }
  return null;
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

function getSourceBridgeFromGlobal(): SummaryWorldbookSourceBridgeLike | null {
  const hosts = collectBridgeHostWindows();
  for (const host of hosts) {
    const bridge = (host as unknown as Record<string, unknown>)[SUMMARY_WORLDBOOK_SOURCE_BRIDGE_GLOBAL];
    if (bridge && typeof bridge === 'object') {
      return bridge as SummaryWorldbookSourceBridgeLike;
    }
  }
  return null;
}

function decodeSlotKeyToIsolationCode(slotKey: string): string {
  if (!slotKey || slotKey === '__default__') return '';

  let decoded = slotKey;
  // 兼容历史双重编码
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded.trim();
}

type IsolationCodeResolveResult = {
  code: string;
  source: 'bridge.code' | 'bridge.slotKey' | 'local fallback' | 'api.slotKey';
};

function resolveIsolationCodeFromBridge(bridge: SummaryWorldbookSourceBridgeLike): IsolationCodeResolveResult {
  if (typeof bridge.getActiveIsolationCode === 'function') {
    const rawCode = bridge.getActiveIsolationCode();
    if (typeof rawCode === 'string') {
      return {
        code: rawCode.trim(),
        source: 'bridge.code',
      };
    }
  }

  if (typeof bridge.getActiveIsolationSlotKey === 'function') {
    const rawSlotKey = bridge.getActiveIsolationSlotKey();
    if (typeof rawSlotKey === 'string') {
      return {
        code: decodeSlotKeyToIsolationCode(rawSlotKey),
        source: 'bridge.slotKey',
      };
    }
  }

  return {
    code: '',
    source: 'local fallback',
  };
}

function isAcuTableJsonLike(data: unknown): data is AcuTableJson {
  return Boolean(data) && typeof data === 'object';
}

function getCurrentChatMessagesForIsolation(): any[] {
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

function getRecentSlotKeyFrequency(chat: any[], limit: number = 50): Map<string, number> {
  const freq = new Map<string, number>();
  if (!Array.isArray(chat) || chat.length === 0) return freq;

  const start = Math.max(0, chat.length - limit);
  for (let i = start; i < chat.length; i += 1) {
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
      freq.set(k, (freq.get(k) ?? 0) + 1);
    });
  }

  return freq;
}

function getDominantSlotKeyFromChat(chat: any[]): string | null {
  const freq = getRecentSlotKeyFrequency(chat, 50);
  if (freq.size === 0) return null;

  const nonDefault = Array.from(freq.entries())
    .filter(([k]) => k !== '__default__')
    .sort((a, b) => b[1] - a[1]);

  if (nonDefault.length > 0) return nonDefault[0][0];
  return freq.has('__default__') ? '__default__' : null;
}

function resolveIsolationCodeFromApiFallback(): IsolationCodeResolveResult {
  const chat = getCurrentChatMessagesForIsolation();
  const slotKey = getDominantSlotKeyFromChat(chat);
  if (!slotKey) {
    return {
      code: '',
      source: 'local fallback',
    };
  }

  return {
    code: decodeSlotKeyToIsolationCode(slotKey),
    source: 'api.slotKey',
  };
}

type SourceBridgeWaitResult = {
  bridge: SummaryWorldbookSourceBridgeLike | null;
  unavailable_reason: '未初始化' | '超时' | '等待异常' | '缺少 waitGlobalInitialized' | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

async function waitSourceBridgeBriefly(
  timeoutMs: number = 1600,
  pollIntervalMs: number = 80,
): Promise<SourceBridgeWaitResult> {
  const immediate = getSourceBridgeFromGlobal();
  if (immediate) {
    return {
      bridge: immediate,
      unavailable_reason: null,
    };
  }

  const startedAt = Date.now();
  let waitInitError: unknown = null;
  let waitInitMissing = false;

  // 先触发一次 waitGlobalInitialized（若可用），但不阻塞轮询
  let waitInitPromise: Promise<SummaryWorldbookSourceBridgeLike | null> | null = null;
  if (typeof waitGlobalInitialized === 'function') {
    waitInitPromise = waitGlobalInitialized<SummaryWorldbookSourceBridgeLike>(
      SUMMARY_WORLDBOOK_SOURCE_BRIDGE_GLOBAL,
    ).catch(error => {
      waitInitError = error;
      return null;
    });
  } else {
    waitInitMissing = true;
  }

  while (Date.now() - startedAt < timeoutMs) {
    const fromGlobal = getSourceBridgeFromGlobal();
    if (fromGlobal) {
      return {
        bridge: fromGlobal,
        unavailable_reason: null,
      };
    }

    if (waitInitPromise) {
      const waited = await Promise.race([
        waitInitPromise,
        new Promise<null>(resolve => window.setTimeout(() => resolve(null), Math.min(pollIntervalMs, 60))),
      ]);
      if (waited && typeof waited === 'object') {
        return {
          bridge: waited,
          unavailable_reason: null,
        };
      }
    }

    await sleep(pollIntervalMs);
  }

  const fallbackBridge = getSourceBridgeFromGlobal();
  if (fallbackBridge) {
    return {
      bridge: fallbackBridge,
      unavailable_reason: null,
    };
  }

  if (waitInitError) {
    return {
      bridge: null,
      unavailable_reason: '等待异常',
    };
  }

  if (waitInitMissing) {
    return {
      bridge: null,
      unavailable_reason: '缺少 waitGlobalInitialized',
    };
  }

  return {
    bridge: null,
    unavailable_reason: '超时',
  };
}

/**
 * 统一文本化并去空白：
 * - 去除前后空白
 * - 去除全角空格
 */
function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u3000/g, ' ')
    .trim();
}

/**
 * 列头标准化：
 * - 去前后空白
 * - 去内部空白（便于匹配“编码 索引”）
 */
function normalizeHeader(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, '');
}

/**
 * 获取最优列下标：
 * - 优先精确匹配
 * - 其次包含匹配
 */
function findHeaderIndex(normalizedHeaders: string[], target: string): number | null {
  const exactIndex = normalizedHeaders.findIndex(header => header === target);
  if (exactIndex >= 0) return exactIndex;

  const includeIndex = normalizedHeaders.findIndex(header => header.includes(target));
  return includeIndex >= 0 ? includeIndex : null;
}

/**
 * 构建纪要表头映射
 */
function buildHeaderMap(rawHeaders: AcuCellValue[]): SummaryHeaderMap {
  const raw = rawHeaders.map(cell => normalizeText(cell));
  const normalized = rawHeaders.map(cell => normalizeHeader(cell));

  const detail = findHeaderIndex(normalized, '纪要');
  const summary = findHeaderIndex(normalized, '概览');
  const code = findHeaderIndex(normalized, '编码索引');

  const requiredColumns = [detail, summary, code];

  return {
    raw_headers: raw,
    normalized_headers: normalized,
    detail,
    summary,
    code,
    required_match_count: requiredColumns.filter(column => column !== null).length,
  };
}

function parseEntryPlacement(rawSheet: AcuSheetData): EntryPlacementConfig {
  const rawPosition = ((rawSheet as Record<string, unknown>).exportConfig as Record<string, unknown> | undefined)
    ?.entryPlacement as Record<string, unknown> | undefined;

  const positionRaw = normalizeText(rawPosition?.position);
  const depthRaw = Number(rawPosition?.depth);
  const orderRaw = Number(rawPosition?.order);

  const position: EntryPlacementConfig['position'] =
    positionRaw === 'before_character_definition'
      ? 'before_character_definition'
      : positionRaw === 'after_character_definition'
        ? 'after_character_definition'
        : 'at_depth_as_system';

  return {
    position,
    depth: Number.isFinite(depthRaw) ? depthRaw : 4,
    order: Number.isFinite(orderRaw) ? orderRaw : 0,
  };
}

/**
 * 校验是否为可用 sheet
 */
function isSheetData(value: unknown): value is AcuSheetData {
  if (!value || typeof value !== 'object') return false;
  const sheet = value as AcuSheetData;
  return Array.isArray(sheet.content);
}

/**
 * 计算候选表匹配分：
 * - 必备列优先（固定 +100，理论上候选都具备）
 * - 表头总列数可作为微弱 tie-breaker
 */
function calcMatchScore(headerMap: SummaryHeaderMap): number {
  const requiredPart = headerMap.required_match_count * 100;
  const widthPart = headerMap.raw_headers.length;
  return requiredPart + widthPart;
}

/**
 * 判断“优先名称”是否命中：
 * - 精确命中优先于包含命中
 * - 这里只返回 boolean，具体排序在 compareCandidates 中处理
 */
function isPreferredNameMatched(tableName: string, preferredName: string): boolean {
  const normalizedTableName = normalizeText(tableName);
  const normalizedPreferredName = normalizeText(preferredName);
  if (!normalizedPreferredName) return false;
  if (normalizedTableName === normalizedPreferredName) return true;
  return normalizedTableName.includes(normalizedPreferredName);
}

/**
 * 判断名称是否精确命中优先名
 */
function isPreferredNameExactMatched(tableName: string, preferredName: string): boolean {
  const normalizedTableName = normalizeText(tableName);
  const normalizedPreferredName = normalizeText(preferredName);
  return Boolean(normalizedPreferredName) && normalizedTableName === normalizedPreferredName;
}

/**
 * 候选排序（稳定、可解释）：
 * 1) 优先名称精确命中
 * 2) 优先名称包含命中
 * 3) 匹配分（高到低）
 * 4) 表名（中文自然顺序）
 * 5) 表 ID（字典序）
 */
function compareCandidates(a: SummarySheetMeta, b: SummarySheetMeta, preferredName: string): number {
  const aExact = isPreferredNameExactMatched(a.table_name, preferredName);
  const bExact = isPreferredNameExactMatched(b.table_name, preferredName);
  if (aExact !== bExact) return aExact ? -1 : 1;

  const aPreferred = a.is_preferred_name_match;
  const bPreferred = b.is_preferred_name_match;
  if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;

  if (a.match_score !== b.match_score) return b.match_score - a.match_score;

  const nameCompare = a.table_name.localeCompare(b.table_name, 'zh-Hans-CN');
  if (nameCompare !== 0) return nameCompare;

  return a.table_id.localeCompare(b.table_id, 'zh-Hans-CN');
}

/**
 * 读取 ACU 当前表格 JSON（本子任务的数据源入口）
 */
export function readAcuTableJson(): AcuTableReadResult {
  const api = getAcuApi();
  if (!api) {
    const reason = '未检测到 ACU API（AutoCardUpdaterAPI），无法读取表格数据。';
    console.warn(SCRIPT_LOG_PREFIX, reason);
    return { ok: false, reason };
  }

  if (typeof api.exportTableAsJson !== 'function') {
    const reason = 'ACU API 缺少 exportTableAsJson() 方法，无法读取表格数据。';
    console.warn(SCRIPT_LOG_PREFIX, reason);
    return { ok: false, reason };
  }

  try {
    const data = api.exportTableAsJson();
    if (!data || typeof data !== 'object') {
      const reason = 'ACU exportTableAsJson() 返回空或非对象数据。';
      console.warn(SCRIPT_LOG_PREFIX, reason, data);
      return { ok: false, reason };
    }

    const isolationResolved = resolveIsolationCodeFromApiFallback();
    console.info(SCRIPT_LOG_PREFIX, '本轮数据来源=api.exportTableAsJson');
    console.info(SCRIPT_LOG_PREFIX, `本轮隔离标识来源=${isolationResolved.source}`);
    return {
      ok: true,
      data: data as AcuTableJson,
      source: 'api.exportTableAsJson',
      isolation_code: isolationResolved.code,
    };
  } catch (error) {
    const reason = '调用 ACU exportTableAsJson() 失败。';
    console.warn(SCRIPT_LOG_PREFIX, reason, error);
    return { ok: false, reason };
  }
}

export async function readAcuTableJsonBridgeFirst(): Promise<AcuTableReadResult> {
  const bridgeWait = await waitSourceBridgeBriefly();
  let bridge = bridgeWait.bridge;

  const logBridgeUnavailable = (): void => {
    if (bridgeWait.unavailable_reason === '超时') {
      console.info(SCRIPT_LOG_PREFIX, 'Source Bridge 当前未提供（等待超时），已切换兼容读取路径。');
    } else if (bridgeWait.unavailable_reason === '缺少 waitGlobalInitialized') {
      console.info(SCRIPT_LOG_PREFIX, 'Source Bridge 当前未提供（缺少 waitGlobalInitialized），已切换兼容读取路径。');
    } else if (bridgeWait.unavailable_reason === '等待异常') {
      console.info(SCRIPT_LOG_PREFIX, 'Source Bridge 当前未提供（等待异常），已切换兼容读取路径。');
    } else {
      console.info(SCRIPT_LOG_PREFIX, 'Source Bridge 当前未提供，已切换兼容读取路径。');
    }
  };

  const tryReadBridgeData = (
    currentBridge: SummaryWorldbookSourceBridgeLike,
  ): {
    ok: true;
    data: AcuTableJson;
    isolation_code: string;
    isolation_source: IsolationCodeResolveResult['source'];
  } | null => {
    if (typeof currentBridge.getLatestDatabaseJson !== 'function') return null;
    const bridgeData = currentBridge.getLatestDatabaseJson();
    if (!isAcuTableJsonLike(bridgeData)) return null;
    const isolationResolved = resolveIsolationCodeFromBridge(currentBridge);
    return {
      ok: true,
      data: bridgeData,
      isolation_code: isolationResolved.code,
      isolation_source: isolationResolved.source,
    };
  };

  if (!bridge) {
    logBridgeUnavailable();
    console.info(SCRIPT_LOG_PREFIX, 'Source Bridge 初次不可用，开始短重试（最多 2 次）。');
    for (let retry = 1; retry <= 2; retry += 1) {
      await sleep(180 * retry);
      bridge = getSourceBridgeFromGlobal();
      if (bridge) {
        console.info(SCRIPT_LOG_PREFIX, `Source Bridge 短重试命中：第 ${retry} 次重试获取成功。`);
        break;
      }
      console.info(SCRIPT_LOG_PREFIX, `Source Bridge 短重试未命中：第 ${retry} 次。`);
    }
  }

  if (bridge) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const read = tryReadBridgeData(bridge);
        if (read) {
          console.info(SCRIPT_LOG_PREFIX, '本轮数据来源=bridge.getLatestDatabaseJson');
          console.info(SCRIPT_LOG_PREFIX, `本轮隔离标识来源=${read.isolation_source}`);
          if (read.isolation_source === 'bridge.code') {
            console.info(SCRIPT_LOG_PREFIX, '使用了前端 bridge 的最终隔离标识。');
          }
          return {
            ok: true,
            data: read.data,
            source: 'bridge.getLatestDatabaseJson',
            isolation_code: read.isolation_code,
          };
        }

        if (attempt < 3) {
          console.info(SCRIPT_LOG_PREFIX, `Source Bridge 数据为空/无效，短重试读取第 ${attempt + 1} 次。`);
          await sleep(140 * attempt);
          bridge = getSourceBridgeFromGlobal() ?? bridge;
          continue;
        }

        console.warn(SCRIPT_LOG_PREFIX, 'Source Bridge 可用但返回无效/空 JSON；bridge 不可用原因=返回空数据。');
      } catch (error) {
        if (attempt < 3) {
          console.warn(SCRIPT_LOG_PREFIX, `读取 Source Bridge 数据失败，短重试读取第 ${attempt + 1} 次。`, error);
          await sleep(140 * attempt);
          bridge = getSourceBridgeFromGlobal() ?? bridge;
          continue;
        }

        console.warn(SCRIPT_LOG_PREFIX, '读取 Source Bridge 数据失败；bridge 不可用原因=返回空数据。', error);
      }
    }
  } else {
    console.info(SCRIPT_LOG_PREFIX, 'Source Bridge 短重试结束仍不可用；已走 API 兼容路径。');
  }

  console.info(SCRIPT_LOG_PREFIX, '已回退到旧读取路径 readAcuTableJson()');
  return readAcuTableJson();
}

/**
 * 识别“纪要表”候选并选出最优目标表
 */
export function identifySummarySheet(data: AcuTableJson, settings: SyncScriptSettings): SummarySheetIdentifyResult {
  const candidates: SummarySheetMeta[] = [];
  const warnings: string[] = [];

  const preferredName = normalizeText(settings.preferred_summary_sheet_name);

  for (const [tableId, rawSheet] of Object.entries(data)) {
    if (!tableId.startsWith('sheet_')) continue;
    if (!isSheetData(rawSheet)) continue;

    const content = rawSheet.content ?? [];
    if (!Array.isArray(content) || content.length === 0) continue;

    const headers = Array.isArray(content[0]) ? content[0] : [];
    if (!Array.isArray(headers) || headers.length === 0) continue;

    const tableName = normalizeText(rawSheet.name) || tableId;
    const headerMap = buildHeaderMap(headers);

    const isCandidate = headerMap.detail !== null && headerMap.summary !== null && headerMap.code !== null;

    if (!isCandidate) continue;

    const meta: SummarySheetMeta = {
      table_id: tableId,
      table_name: tableName,
      header_map: headerMap,
      match_score: calcMatchScore(headerMap),
      is_preferred_name_match: isPreferredNameMatched(tableName, preferredName),
      entry_placement: parseEntryPlacement(rawSheet),
    };
    candidates.push(meta);
  }

  if (candidates.length === 0) {
    warnings.push('未找到符合条件的纪要表：需要同时包含列头“纪要 / 概览 / 编码索引”。');
    console.info(SCRIPT_LOG_PREFIX, '纪要表识别结果：未命中候选表。要求列头包含：纪要 / 概览 / 编码索引。');
    return {
      selected: null,
      candidates,
      warnings,
    };
  }

  const sorted = [...candidates].sort((a, b) => compareCandidates(a, b, preferredName));
  const selected = sorted[0];

  if (preferredName && !selected.is_preferred_name_match) {
    warnings.push(`已配置优先名称“${preferredName}”，但未命中；已按候选优先规则选择最佳表。`);
  }

  if (sorted.length > 1) {
    console.info(
      SCRIPT_LOG_PREFIX,
      `纪要表识别存在 ${sorted.length} 个候选，已按稳定规则选择：${selected.table_name}（${selected.table_id}）。`,
    );
  } else {
    console.info(SCRIPT_LOG_PREFIX, `纪要表识别命中：${selected.table_name}（${selected.table_id}）。`);
  }

  return {
    selected,
    candidates: sorted,
    warnings,
  };
}

// ============================================================
// 全局数据表查找与时间列读取
// ============================================================

/**
 * 全局数据表查找结果
 */
export interface GlobalSheetFindResult {
  /** 是否找到 */
  found: boolean;
  /** sheet 数据 */
  sheet: AcuSheetData | null;
  /** 表头列名列表 */
  headers: string[];
  /** sheet ID */
  sheetId: string | null;
}

/**
 * 在 ACU JSON 中查找全局数据表。
 * 按 sheet.name 匹配用户设置的 globalSheetName。
 */
export function findGlobalSheet(data: AcuTableJson, globalSheetName: string): GlobalSheetFindResult {
  const normalizedTarget = normalizeText(globalSheetName);

  for (const [tableId, rawSheet] of Object.entries(data)) {
    if (!tableId.startsWith('sheet_')) continue;
    if (!isSheetData(rawSheet)) continue;

    const sheetName = normalizeText(rawSheet.name);
    if (sheetName !== normalizedTarget) continue;

    const content = rawSheet.content ?? [];
    if (!Array.isArray(content) || content.length === 0) {
      return { found: true, sheet: rawSheet, headers: [], sheetId: tableId };
    }

    const headers = Array.isArray(content[0]) ? content[0].map((cell: AcuCellValue) => normalizeText(cell)) : [];

    return { found: true, sheet: rawSheet, headers, sheetId: tableId };
  }

  return { found: false, sheet: null, headers: [], sheetId: null };
}

/**
 * 从全局数据表中读取当前时间。
 *
 * @param data ACU 导出的完整 JSON
 * @param globalSheetName 全局数据表名称
 * @param globalTimeColumn 时间列名
 * @param template 已解析的格式模板
 * @returns 提取结果，或 null（找不到表/列/数据）
 */
export function readCurrentTimeFromGlobalSheet(
  data: AcuTableJson,
  globalSheetName: string,
  globalTimeColumn: string,
  template: TemplateSegment[],
): TimeExtractionResult | null {
  if (!globalSheetName || !globalTimeColumn) return null;

  const found = findGlobalSheet(data, globalSheetName);
  if (!found.found || !found.sheet) {
    console.warn(SCRIPT_LOG_PREFIX, `全局数据表未找到：${globalSheetName}`);
    return null;
  }

  const content = found.sheet.content ?? [];
  if (content.length < 2) {
    console.warn(SCRIPT_LOG_PREFIX, `全局数据表无数据行：${globalSheetName}`);
    return null;
  }

  // 查找时间列索引
  const columnIndex = found.headers.findIndex(h => h === normalizeText(globalTimeColumn));
  if (columnIndex < 0) {
    console.warn(SCRIPT_LOG_PREFIX, `全局数据表未找到时间列"${globalTimeColumn}"：${globalSheetName}`);
    return null;
  }

  // 读取第一行数据（content[1]）
  const dataRow = Array.isArray(content[1]) ? content[1] : [];
  const cellValue = normalizeText(dataRow[columnIndex]);

  if (!cellValue) {
    console.warn(SCRIPT_LOG_PREFIX, `全局数据表时间列值为空：${globalSheetName}.${globalTimeColumn}`);
    return null;
  }

  const result = extractTime(template, cellValue);
  if (!result.has_any) {
    console.warn(
      SCRIPT_LOG_PREFIX,
      `全局数据表时间列值无法用模板解析：值="${cellValue}"，表=${globalSheetName}，列=${globalTimeColumn}`,
    );
    return null;
  }

  console.info(SCRIPT_LOG_PREFIX, `全局数据表当前时间已读取：${cellValue}（${globalSheetName}.${globalTimeColumn}）`);
  return result;
}
