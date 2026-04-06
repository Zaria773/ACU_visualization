import { SCRIPT_LOG_PREFIX } from './constants';
import type { BuiltEntryKind } from './types';

type ScriptCommentKindTag = BuiltEntryKind;

let forcedIsolationCode: string | null = null;
let lastIsolationSourceLogSignature: string | null = null;

function logIsolationSourceOnce(signature: string, message: string): void {
  if (lastIsolationSourceLogSignature === signature) return;
  lastIsolationSourceLogSignature = signature;
  console.info(SCRIPT_LOG_PREFIX, message);
}

function decodeSlotKey(slotKey: string): string {
  if (!slotKey || slotKey === '__default__') return 'default';

  let decoded = slotKey;
  // 兼容历史数据里可能出现的双重编码
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded;
}

function getDominantIsolationSlotKeyFromChat(): string | null {
  try {
    // 优先用酒馆助手抽象接口（与前端持久化链路更一致）
    let chat: any[] | null = null;
    if (typeof getChatMessages === 'function') {
      chat = getChatMessages('0-{{lastMessageId}}', { include_swipes: false }) as any[];
    } else {
      const ST = (window.parent as any)?.SillyTavern ?? (window as any)?.SillyTavern;
      chat = ST?.chat as any[];
    }

    if (!Array.isArray(chat) || chat.length === 0) return null;

    const freq = new Map<string, number>();
    const start = Math.max(0, chat.length - 50);

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

      for (const key of Object.keys(isolatedData)) {
        freq.set(key, (freq.get(key) ?? 0) + 1);
      }
    }

    if (freq.size === 0) return null;

    const nonDefault = Array.from(freq.entries())
      .filter(([k]) => k !== '__default__')
      .sort((a, b) => b[1] - a[1]);

    if (nonDefault.length > 0) return nonDefault[0][0];
    return freq.has('__default__') ? '__default__' : null;
  } catch {
    return null;
  }
}

function toIsolationPrefixByCode(code: string): string {
  const normalized = code.trim();
  if (!normalized) return 'ACU-';
  return `ACU-[${normalized}]-`;
}

function getIsolationPrefix(): string {
  // 优先使用外部注入的“最终隔离标识”
  if (forcedIsolationCode !== null) {
    const normalized = forcedIsolationCode.trim();
    if (!normalized) {
      logIsolationSourceOnce(
        'forced-empty',
        '本轮隔离标识来源=bridge.code；bridge.code 为空，按 default 规则命名为 ACU-。',
      );
    } else {
      logIsolationSourceOnce(`forced:${normalized}`, `本轮隔离标识来源=bridge.code；最终隔离标识=${normalized}`);
    }
    return toIsolationPrefixByCode(forcedIsolationCode);
  }

  // 回退：与 ACU 持久化槽位对齐；default 槽位使用无隔离前缀 ACU-
  const dominantSlotKey = getDominantIsolationSlotKeyFromChat();
  if (dominantSlotKey) {
    const decoded = decodeSlotKey(dominantSlotKey);
    if (!decoded || decoded === 'default') {
      logIsolationSourceOnce(
        'local-slot-default',
        '本轮隔离标识来源=local fallback；已回退到本地隔离槽位推断（default）。',
      );
      return 'ACU-';
    }
    logIsolationSourceOnce(
      `local-slot:${decoded}`,
      `本轮隔离标识来源=local fallback；已回退到本地隔离槽位推断（slotKey=${dominantSlotKey}，code=${decoded}）。`,
    );
    return `ACU-[${decoded}]-`;
  }

  logIsolationSourceOnce(
    'local-slot-none',
    '本轮隔离标识来源=local fallback；已回退到本地隔离槽位推断（未命中槽位，使用 ACU-）。',
  );
  return 'ACU-';
}

function toLegacyPrefix(): string {
  return 'ACU-';
}

function toLegacyCorePrefix(): string {
  return 'TavernDB-TH-SummarySync';
}

function matchesManagedTagWithPrefix(comment: string, prefix: string): boolean {
  return (
    comment.startsWith(`${prefix}MemoryStart`) ||
    comment.startsWith(`${prefix}MemoryEnd`) ||
    comment.startsWith(`${prefix}概览-`) ||
    comment.startsWith(`${prefix}纪要-`)
  );
}

function buildManagedTag(kind: ScriptCommentKindTag, serial: number | null): string {
  if (kind === 'wrapper_top') return 'MemoryStart';
  if (kind === 'wrapper_bottom') return 'MemoryEnd';
  if (kind === 'summary') return `概览-${serial ?? 0}`;
  return `纪要-${serial ?? 0}`;
}

function normalizeComment(rawComment: string): string {
  return rawComment.trim();
}

export function setManagedIsolationCodeContext(isolationCode: string | null | undefined): void {
  if (typeof isolationCode !== 'string') {
    forcedIsolationCode = null;
    return;
  }
  forcedIsolationCode = isolationCode.trim();
}

export function clearManagedIsolationCodeContext(): void {
  forcedIsolationCode = null;
  lastIsolationSourceLogSignature = null;
}

export function buildManagedComment(kind: ScriptCommentKindTag, serial: number | null): string {
  return `${getIsolationPrefix()}${buildManagedTag(kind, serial)}`;
}

export function buildManagedEntryName(kind: ScriptCommentKindTag, serial: number | null): string {
  // 统一与 comment 同命名规则，彻底移除旧 name 命名策略
  return buildManagedComment(kind, serial);
}

export function isManagedTaggedText(rawText: string | null | undefined): boolean {
  if (!rawText) return false;
  const normalized = normalizeComment(rawText);
  const currentPrefix = getIsolationPrefix();
  const legacyPrefix = toLegacyPrefix();
  const legacyCorePrefix = toLegacyCorePrefix();

  if (matchesManagedTagWithPrefix(normalized, currentPrefix)) return true;
  if (matchesManagedTagWithPrefix(normalized, legacyPrefix)) return true;

  const dynamicAcuPrefix = normalized.match(/^ACU-\[[^\]]+\]-/)?.[0] ?? null;
  if (dynamicAcuPrefix && matchesManagedTagWithPrefix(normalized, dynamicAcuPrefix)) return true;

  if (normalized.startsWith(legacyCorePrefix)) return true;

  // 历史版本曾只写 name=纪要同步_*
  if (normalized.startsWith('纪要同步_')) return true;

  return false;
}

export function isManagedComment(rawComment: string | null | undefined): boolean {
  return isManagedTaggedText(rawComment);
}

export function getManagedCommentPrefix(): string {
  return getIsolationPrefix();
}

export function getCommentRuleSummary(): string {
  return [
    `核心前缀=${getIsolationPrefix()}`,
    '识别主键=comment',
    '条目类型=MemoryStart/MemoryEnd/概览-序数/纪要-序数',
    '序数来源=数据行号(从1开始)',
  ].join('；');
}
