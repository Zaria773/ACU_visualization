import type { PartialDeep } from 'type-fest';
import {
  buildManagedComment,
  buildManagedEntryName,
  getCommentRuleSummary,
  getManagedCommentPrefix,
  isManagedComment,
  isManagedTaggedText,
} from './comment';
import { SCRIPT_LOG_PREFIX } from './constants';
import type {
  BuildEntriesResult,
  BuiltWorldbookEntry,
  InjectionTargetMode,
  ManagedWorldbookSyncSummary,
  PrimaryWorldbookResolveResult,
} from './types';

/**
 * 扩展世界书条目类型：
 * - 运行时里常见 comment 字段，但基础类型定义未声明
 * - 这里做最小扩展，确保“按 comment 识别/清理”可实现
 */
type WorldbookEntryWithComment = WorldbookEntry & {
  comment?: string;
};

/**
 * 从条目对象中安全读取 comment。
 */
function readEntryComment(entry: WorldbookEntry): string | null {
  const raw = (entry as Record<string, unknown>).comment;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function readEntryName(entry: WorldbookEntry): string | null {
  const raw = (entry as Record<string, unknown>).name;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function isManagedEntry(entry: WorldbookEntry): boolean {
  const comment = readEntryComment(entry);
  if (isManagedComment(comment)) return true;

  // comment 缺失或被污染时，回退到 name 检测，避免“检测 0 条”
  const name = readEntryName(entry);
  return isManagedTaggedText(name);
}

function formatEntryDebugLabel(entry: WorldbookEntry): string {
  const comment = readEntryComment(entry) ?? '∅';
  const name = readEntryName(entry) ?? '∅';
  return `comment=${JSON.stringify(comment)}, name=${JSON.stringify(name)}`;
}

function collectUnmanagedSamples(entries: WorldbookEntry[], limit = 3): string[] {
  const samples: string[] = [];
  for (const entry of entries) {
    if (isManagedEntry(entry)) continue;
    samples.push(formatEntryDebugLabel(entry));
    if (samples.length >= limit) break;
  }
  return samples;
}

/** 托管条目 UID 起始值，避免与用户手动创建的条目冲突 */
const MANAGED_UID_BASE = 6000;

/**
 * 将内部条目结构转换为世界书可写结构。
 * - 保持字段最小稳定集
 * - 补全 probability / recursion / effect
 * - 分配从 MANAGED_UID_BASE 开始的稳定 uid
 */
function mapBuiltEntryToWritable(entry: BuiltWorldbookEntry, index: number): PartialDeep<WorldbookEntry> {
  const comment = buildManagedComment(entry.kind, entry.source.serial);

  const base: PartialDeep<WorldbookEntry> = {
    uid: MANAGED_UID_BASE + index,
    name: buildManagedEntryName(entry.kind, entry.source.serial),
    enabled: entry.enabled,
    strategy: entry.strategy,
    position: entry.position,
    content: entry.content,
    probability: 100,
    recursion: {
      prevent_incoming: true,
      prevent_outgoing: true,
      delay_until: null,
    },
    effect: {
      sticky: null,
      cooldown: null,
      delay: null,
    },
  };

  // comment 为运行时兼容字段，类型中未声明，这里通过局部断言写入
  return {
    ...(base as Record<string, unknown>),
    comment,
  } as PartialDeep<WorldbookEntry>;
}

/**
 * 获取当前角色卡绑定的主世界书名称。
 * - 仅使用角色卡 primary
 * - 不重绑，不创建
 */
export function resolvePrimaryCharacterWorldbook(): PrimaryWorldbookResolveResult {
  try {
    const bound = getCharWorldbookNames('current');
    const primary = (bound.primary ?? '').trim();

    if (!primary) {
      const reason = '当前角色卡未绑定主世界书（primary 为空），已停止同步。';
      console.warn(SCRIPT_LOG_PREFIX, reason);
      return { ok: false, reason };
    }

    return {
      ok: true,
      worldbook_name: primary,
    };
  } catch (error) {
    const reason = '获取当前角色卡主世界书失败。';
    console.warn(SCRIPT_LOG_PREFIX, reason, error);
    return { ok: false, reason };
  }
}

function resolveChatBoundWorldbook(): PrimaryWorldbookResolveResult {
  try {
    const chatWorldbook = (getChatWorldbookName('current') ?? '').trim();
    if (!chatWorldbook) {
      return { ok: false, reason: '当前聊天未绑定世界书，无法注入到聊天世界书。' };
    }
    return { ok: true, worldbook_name: chatWorldbook };
  } catch (error) {
    console.warn(SCRIPT_LOG_PREFIX, '获取当前聊天绑定世界书失败。', error);
    return { ok: false, reason: '获取当前聊天绑定世界书失败。' };
  }
}

export function resolveTargetWorldbook(mode: InjectionTargetMode): PrimaryWorldbookResolveResult {
  return mode === 'chat_bound' ? resolveChatBoundWorldbook() : resolvePrimaryCharacterWorldbook();
}

export async function purgeManagedEntriesFromTargetWorldbook(mode: InjectionTargetMode): Promise<{
  worldbook_name: string;
  removed_count: number;
}> {
  const resolved = resolveTargetWorldbook(mode);
  if (!resolved.ok) {
    throw new Error(resolved.reason);
  }

  const worldbookName = resolved.worldbook_name;
  const currentEntries = (await getWorldbook(worldbookName)) as WorldbookEntryWithComment[];

  const managedEntries = currentEntries.filter(isManagedEntry);
  const unmanagedSamples = collectUnmanagedSamples(currentEntries);
  console.info(
    SCRIPT_LOG_PREFIX,
    `清理诊断[旧目标直清] 世界书=${worldbookName}；候选总数=${currentEntries.length}；命中托管=${managedEntries.length}；未命中样本(最多3条)=${unmanagedSamples.length > 0 ? unmanagedSamples.join(' | ') : '无'}`,
  );

  if (managedEntries.length === 0) {
    return {
      worldbook_name: worldbookName,
      removed_count: 0,
    };
  }

  const unmanagedEntries = currentEntries.filter(entry => !isManagedEntry(entry)) as PartialDeep<WorldbookEntry>[];
  await replaceWorldbook(worldbookName, unmanagedEntries);

  return {
    worldbook_name: worldbookName,
    removed_count: managedEntries.length,
  };
}

export async function purgeManagedEntriesFromNonTargetWorldbook(mode: InjectionTargetMode): Promise<{
  worldbook_name: string;
  removed_count: number;
} | null> {
  const oppositeMode: InjectionTargetMode = mode === 'chat_bound' ? 'character_primary' : 'chat_bound';
  const resolved = resolveTargetWorldbook(oppositeMode);
  if (!resolved.ok) {
    return null;
  }

  const worldbookName = resolved.worldbook_name;
  const currentEntries = (await getWorldbook(worldbookName)) as WorldbookEntryWithComment[];
  const managedEntries = currentEntries.filter(isManagedEntry);
  const unmanagedSamples = collectUnmanagedSamples(currentEntries);
  console.info(
    SCRIPT_LOG_PREFIX,
    `清理诊断[非目标清理] 世界书=${worldbookName}；候选总数=${currentEntries.length}；命中托管=${managedEntries.length}；未命中样本(最多3条)=${unmanagedSamples.length > 0 ? unmanagedSamples.join(' | ') : '无'}`,
  );

  if (managedEntries.length === 0) {
    return {
      worldbook_name: worldbookName,
      removed_count: 0,
    };
  }

  const unmanagedEntries = currentEntries.filter(entry => !isManagedEntry(entry)) as PartialDeep<WorldbookEntry>[];
  await replaceWorldbook(worldbookName, unmanagedEntries);

  return {
    worldbook_name: worldbookName,
    removed_count: managedEntries.length,
  };
}

/**
 * 构建可写入世界书的最终条目列表（含 comment 规则）。
 */
export function buildWritableWorldbookEntries(built: BuildEntriesResult): PartialDeep<WorldbookEntry>[] {
  return built.entries.map((entry, index) => mapBuiltEntryToWritable(entry, index));
}

/**
 * 读取主世界书快照（用于安全门下的只读演示日志）。
 */
export async function loadPrimaryWorldbookSnapshot(): Promise<{
  worldbook_name: string;
  entry_count: number;
}> {
  const resolved = resolvePrimaryCharacterWorldbook();
  if (!resolved.ok) {
    throw new Error(resolved.reason);
  }

  const worldbook = await getWorldbook(resolved.worldbook_name);
  return {
    worldbook_name: resolved.worldbook_name,
    entry_count: worldbook.length,
  };
}

function readWritableComment(entry: PartialDeep<WorldbookEntry>): string | null {
  const raw = (entry as Record<string, unknown>).comment;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function buildStableSignature(entry: PartialDeep<WorldbookEntry>): string {
  const asObj = entry as Record<string, unknown>;
  const recursionObj =
    asObj.recursion && typeof asObj.recursion === 'object' ? (asObj.recursion as Record<string, unknown>) : null;

  return JSON.stringify({
    comment: typeof asObj.comment === 'string' ? asObj.comment : null,
    name: typeof asObj.name === 'string' ? asObj.name : null,
    enabled: typeof asObj.enabled === 'boolean' ? asObj.enabled : null,
    content: typeof asObj.content === 'string' ? asObj.content : null,
    probability: typeof asObj.probability === 'number' ? asObj.probability : null,
    strategy: asObj.strategy ?? null,
    position: asObj.position ?? null,
    recursion: recursionObj
      ? {
          prevent_incoming: typeof recursionObj.prevent_incoming === 'boolean' ? recursionObj.prevent_incoming : null,
          prevent_outgoing: typeof recursionObj.prevent_outgoing === 'boolean' ? recursionObj.prevent_outgoing : null,
        }
      : null,
  });
}

function hasDuplicateManagedComments(entries: PartialDeep<WorldbookEntry>[]): boolean {
  const countMap = new Map<string, number>();
  for (const entry of entries) {
    const comment = readWritableComment(entry);
    if (!comment) continue;
    countMap.set(comment, (countMap.get(comment) ?? 0) + 1);
  }
  for (const count of countMap.values()) {
    if (count > 1) return true;
  }
  return false;
}

function areManagedEntriesEquivalent(
  currentManagedEntries: PartialDeep<WorldbookEntry>[],
  targetManagedEntries: PartialDeep<WorldbookEntry>[],
): boolean {
  if (currentManagedEntries.length !== targetManagedEntries.length) return false;

  const currentSignatures = currentManagedEntries.map(buildStableSignature).sort();
  const targetSignatures = targetManagedEntries.map(buildStableSignature).sort();

  for (let i = 0; i < currentSignatures.length; i += 1) {
    if (currentSignatures[i] !== targetSignatures[i]) return false;
  }
  return true;
}

/**
 * 受控替换：
 * 1) 读取主世界书
 * 2) 识别本脚本托管条目
 * 3) 若托管条目与目标完全一致则跳过写入
 * 4) 若重复/不一致则清理后重建
 */
export async function replaceManagedEntriesInTargetWorldbook(
  writableEntries: PartialDeep<WorldbookEntry>[],
  options: {
    target_mode: InjectionTargetMode;
    expected_entry_count: number;
  },
): Promise<ManagedWorldbookSyncSummary> {
  const resolved = resolveTargetWorldbook(options.target_mode);
  if (!resolved.ok) {
    throw new Error(resolved.reason);
  }

  const worldbookName = resolved.worldbook_name;
  const currentEntries = (await getWorldbook(worldbookName)) as WorldbookEntryWithComment[];

  const currentManagedEntries = currentEntries.filter(isManagedEntry) as PartialDeep<WorldbookEntry>[];

  const currentUnmanagedEntries = currentEntries.filter(
    entry => !isManagedEntry(entry),
  ) as PartialDeep<WorldbookEntry>[];

  const hasDuplicate = hasDuplicateManagedComments(currentManagedEntries);
  const isEquivalent = areManagedEntriesEquivalent(currentManagedEntries, writableEntries);
  const expectedByParsedRows = options.expected_entry_count;
  const countMismatch = currentManagedEntries.length !== expectedByParsedRows;
  const unmanagedSamples = collectUnmanagedSamples(currentEntries);

  console.info(
    SCRIPT_LOG_PREFIX,
    [
      `清理诊断[受控替换前] 世界书=${worldbookName}`,
      `候选总数=${currentEntries.length}`,
      `命中托管=${currentManagedEntries.length}`,
      `预期托管=${expectedByParsedRows}`,
      `重复托管=${String(hasDuplicate)}`,
      `数量不一致=${String(countMismatch)}`,
      `内容等价=${String(isEquivalent)}`,
      `未命中样本(最多3条)=${unmanagedSamples.length > 0 ? unmanagedSamples.join(' | ') : '无'}`,
    ].join('；'),
  );

  if (!hasDuplicate && !countMismatch && isEquivalent) {
    return {
      worldbook_name: worldbookName,
      removed_old_entries: 0,
      added_new_entries: 0,
      comment_rule_summary: getCommentRuleSummary(),
      skipped_write: true,
      skip_reason: `托管条目完全一致，跳过写入（prefix=${getManagedCommentPrefix()}）。`,
    };
  }

  const removed = currentManagedEntries.length;
  const nextEntries: PartialDeep<WorldbookEntry>[] = [...currentUnmanagedEntries, ...writableEntries];
  await replaceWorldbook(worldbookName, nextEntries);

  return {
    worldbook_name: worldbookName,
    removed_old_entries: removed,
    added_new_entries: writableEntries.length,
    comment_rule_summary: getCommentRuleSummary(),
    skipped_write: false,
    skip_reason: hasDuplicate
      ? '检测到托管 comment 重复，已清理后重建。'
      : countMismatch
        ? `托管条目数量(${currentManagedEntries.length})与预期不一致（预期=${expectedByParsedRows}），已清理后重建。`
        : '托管条目内容变化，已清理后重建。',
  };
}
