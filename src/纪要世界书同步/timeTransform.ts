/**
 * 纪要世界书同步脚本：时间变换模块
 *
 * 功能：
 * - 格式模板分词与解析
 * - 从时间字符串中提取结构化时间（现代/古代/混合）
 * - 计算相对时间描述（"去年6月"、"昨天午时二刻" 等）
 * - 批量替换纪要行中的时间列值
 */

import type { UnifiedEventRow } from './types';

// ============================================================
// 类型定义
// ============================================================

/** 时间组件枚举 */
export type TimeComponent =
  'year' | 'month' | 'weekday' | 'day' | 'hour' | 'minute' | 'second' | 'cn_month' | 'cn_day' | 'shichen' | 'ke';

/** 模板分段 */
export type TemplateSegment = { type: 'token'; component: TimeComponent } | { type: 'literal'; text: string };

/** 解析后的结构化时间 */
export interface ParsedTime {
  // ── 通用（统一数值，供计算用） ──
  year: number | null;
  month: number | null; // 1-12，从 {M} 或 {CM} 写入
  day: number | null; // 1-31，从 {D} 或 {CD} 写入
  hour: number | null; // 0-23，从 {H} 或 {T} 写入
  minute: number | null; // 0-59，从 {m} 或 {K} 写入
  second: number | null;

  // ── 现代扩展 ──
  weekday: number | null; // 1-7
  weekday_prefix: string | null; // "周" | "星期" | "礼拜"

  // ── 古代扩展 ──
  cn_month_text: string | null; // 原始中文月份文本: "正"/"三"/"腊" 等
  cn_day_text: string | null; // 原始中文日期文本: "初三"/"十五"/"二十一" 等
  shichen: number | null; // 0-11
  shichen_name: string | null; // "子"/"丑"/..."亥"
  ke: number | null; // 1-3
}

/** 时间提取结果 */
export interface TimeExtractionResult {
  parsed: ParsedTime;
  /** 模板匹配到的位置之后的剩余原始文本 */
  remainder: string;
  /** 模板中最后一个 token 之后被消费的字面量文本（如 "{Y}纪元" 中的 "纪元"） */
  trailing_literal: string;
  /** 是否至少解析出了一个时间组件 */
  has_any: boolean;
}

// ============================================================
// 常量：映射表
// ============================================================

/** 中文数字 -> 阿拉伯数字 (1-10) */
const CN_NUM_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

/** 阿拉伯数字 (1-10) -> 中文数字 */
const ARABIC_TO_CN: Record<number, string> = {
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
  7: '七',
  8: '八',
  9: '九',
  10: '十',
};

/** 星期中文数字 -> weekday (日/天=7) */
const WEEKDAY_CN_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
};

/** 中文月份文本 -> 月份数值 */
const CN_MONTH_MAP: Record<string, number> = {
  正: 1,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  十二: 12,
  腊: 12,
};

/** 十二时辰名 -> 序号 (0-11) */
const SHICHEN_MAP: Record<string, number> = {
  子: 0,
  丑: 1,
  寅: 2,
  卯: 3,
  辰: 4,
  巳: 5,
  午: 6,
  未: 7,
  申: 8,
  酉: 9,
  戌: 10,
  亥: 11,
};

/** 时辰序号 -> 等效24小时制中点 */
const SHICHEN_TO_HOUR: Record<number, number> = {
  0: 0,
  1: 2,
  2: 4,
  3: 6,
  4: 8,
  5: 10,
  6: 12,
  7: 14,
  8: 16,
  9: 18,
  10: 20,
  11: 22,
};

/** 时辰序号 -> 时辰名（保留供后续扩展使用） */

const _SHICHEN_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// ============================================================
// Token 定义（含中文别名）
// ============================================================

interface TokenDef {
  /** 模板中的写法（如 "Y", "CM"） */
  key: string;
  /** 中文别名（如 "年", "华月"） */
  alias: string;
  /** 对应的 TimeComponent */
  component: TimeComponent;
}

/** 所有支持的 Token，按 key 长度降序排列（保证最长匹配优先） */
const TOKEN_DEFS: TokenDef[] = [
  { key: 'CM', alias: '华月', component: 'cn_month' },
  { key: 'CD', alias: '华日', component: 'cn_day' },
  { key: 'Y', alias: '年', component: 'year' },
  { key: 'M', alias: '月', component: 'month' },
  { key: 'W', alias: '周', component: 'weekday' },
  { key: 'D', alias: '日', component: 'day' },
  { key: 'H', alias: '时', component: 'hour' },
  { key: 'm', alias: '分', component: 'minute' },
  { key: 's', alias: '秒', component: 'second' },
  { key: 'T', alias: '辰', component: 'shichen' },
  { key: 'K', alias: '刻', component: 'ke' },
];

// ============================================================
// 模板分词
// ============================================================

/**
 * 将格式模板字符串解析为 TemplateSegment 序列。
 *
 * 示例: "{Y}/{M}/{D} {H}:{m}" -> [Token:year, Lit:"/", Token:month, ...]
 */
export function parseTimeTemplate(template: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let pos = 0;
  let literalBuf = '';

  const flushLiteral = (): void => {
    if (literalBuf.length > 0) {
      segments.push({ type: 'literal', text: literalBuf });
      literalBuf = '';
    }
  };

  while (pos < template.length) {
    if (template[pos] === '{') {
      // 尝试匹配 Token
      const rest = template.slice(pos + 1);
      let matched = false;

      for (const def of TOKEN_DEFS) {
        // 匹配 {key} 或 {alias}
        for (const candidate of [def.key, def.alias]) {
          if (rest.startsWith(candidate + '}')) {
            flushLiteral();
            segments.push({ type: 'token', component: def.component });
            pos += 1 + candidate.length + 1; // { + candidate + }
            matched = true;
            break;
          }
        }
        if (matched) break;
      }

      if (!matched) {
        // 不是合法 Token，当作字面量
        literalBuf += template[pos];
        pos += 1;
      }
    } else {
      literalBuf += template[pos];
      pos += 1;
    }
  }

  flushLiteral();
  return segments;
}

// ============================================================
// 时间值提取：各 Token 的匹配器
// ============================================================

interface TokenMatchResult {
  /** 消费的字符数 */
  consumed: number;
  /** 写入 ParsedTime 的回调 */
  apply: (parsed: ParsedTime) => void;
}

/** 匹配阿拉伯数字 */
function matchDigits(input: string, pos: number): { value: number; consumed: number } | null {
  const rest = input.slice(pos);
  const m = rest.match(/^\d+/);
  if (!m) return null;
  return { value: parseInt(m[0], 10), consumed: m[0].length };
}

/**
 * 解析中文数字字符串为阿拉伯数字。
 * 支持范围：一(1) ~ 九百九十九(999)，覆盖古代年号常见年份。
 *
 * 支持的格式：
 * - 个位：一~九
 * - 十位：十、十一~十九、二十~九十九
 * - 百位：一百~九百九十九（含"百零X"格式）
 *
 * @returns 解析出的数值，或 null（无法解析）
 */
function parseCnNumber(text: string): { value: number; consumed: number } | null {
  if (!text) return null;

  let pos = 0;
  let result = 0;

  // 尝试解析百位：X百
  const baiChar = text[pos];
  if (baiChar && CN_NUM_MAP[baiChar] !== undefined && text[pos + 1] === '百') {
    result += CN_NUM_MAP[baiChar] * 100;
    pos += 2;

    // 百后面可能跟"零X"（如"三百零五"）
    if (text[pos] === '零' && text[pos + 1] && CN_NUM_MAP[text[pos + 1]] !== undefined) {
      result += CN_NUM_MAP[text[pos + 1]];
      pos += 2;
      return { value: result, consumed: pos };
    }
  }

  // 尝试解析十位
  const restAfterBai = text.slice(pos);

  // "X十Y" 或 "X十" 或 "十Y" 或 "十"
  if (restAfterBai[0] && CN_NUM_MAP[restAfterBai[0]] !== undefined && restAfterBai[1] === '十') {
    // "X十..." 格式
    result += CN_NUM_MAP[restAfterBai[0]] * 10;
    pos += 2;
    // 可选个位
    if (text[pos] && CN_NUM_MAP[text[pos]] !== undefined) {
      result += CN_NUM_MAP[text[pos]];
      pos += 1;
    }
    return result > 0 ? { value: result, consumed: pos } : null;
  }

  if (restAfterBai[0] === '十') {
    // "十..." 格式（省略十位前的"一"）
    result += 10;
    pos += 1;
    // 可选个位
    if (text[pos] && CN_NUM_MAP[text[pos]] !== undefined) {
      result += CN_NUM_MAP[text[pos]];
      pos += 1;
    }
    return { value: result, consumed: pos };
  }

  // 纯个位（或百位后无十位直接结束）
  if (restAfterBai[0] && CN_NUM_MAP[restAfterBai[0]] !== undefined) {
    // 只有在还没有百位的情况下才匹配纯个位
    // 如果已有百位（如"三百"），则不再追加个位（"三百五"应该走十位逻辑）
    if (result === 0) {
      result += CN_NUM_MAP[restAfterBai[0]];
      pos += 1;
      return { value: result, consumed: pos };
    }
  }

  // 如果只解析到了百位（如"三百"），也返回
  return result > 0 ? { value: result, consumed: pos } : null;
}

/**
 * 匹配中文数字年份。
 * 先尝试匹配中文数字，如果成功则返回结果。
 */
function matchCnYear(input: string, pos: number): TokenMatchResult | null {
  const rest = input.slice(pos);
  const cnResult = parseCnNumber(rest);
  if (!cnResult) return null;
  return {
    consumed: cnResult.consumed,
    apply: p => {
      p.year = cnResult.value;
    },
  };
}

/** 星期匹配 */
function matchWeekday(input: string, pos: number): TokenMatchResult | null {
  const rest = input.slice(pos);
  const m = rest.match(/^(周|星期|礼拜)([一二三四五六日天])/);
  if (!m) return null;
  const prefix = m[1];
  const dayChar = m[2];
  const weekday = WEEKDAY_CN_MAP[dayChar];
  if (weekday === undefined) return null;
  return {
    consumed: m[0].length,
    apply: parsed => {
      parsed.weekday = weekday;
      parsed.weekday_prefix = prefix;
    },
  };
}

/** 中文月份匹配 */
function matchCnMonth(input: string, pos: number): TokenMatchResult | null {
  const rest = input.slice(pos);
  // 按长度降序尝试匹配，优先"十二"、"十一"
  const candidates = ['十二', '十一', '正', '腊', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  for (const candidate of candidates) {
    if (rest.startsWith(candidate)) {
      const monthValue = CN_MONTH_MAP[candidate];
      if (monthValue === undefined) continue;
      // "月" 字在模板中作为字面量出现，不在此处消费
      return {
        consumed: candidate.length,
        apply: parsed => {
          parsed.month = monthValue;
          parsed.cn_month_text = candidate;
        },
      };
    }
  }
  return null;
}

/** 中文日期匹配 */
function matchCnDay(input: string, pos: number): TokenMatchResult | null {
  const rest = input.slice(pos);
  // 按优先级匹配
  // 1. 初X（初一~初十）
  const chuMatch = rest.match(/^初([一二三四五六七八九十])/);
  if (chuMatch) {
    const dayValue = CN_NUM_MAP[chuMatch[1]];
    if (dayValue !== undefined) {
      return {
        consumed: chuMatch[0].length,
        apply: parsed => {
          parsed.day = dayValue;
          parsed.cn_day_text = chuMatch[0];
        },
      };
    }
  }

  // 2. 三十
  if (rest.startsWith('三十')) {
    // 检查不是 "三十一" 等（但三十一不存在于古代日期）
    return {
      consumed: 2,
      apply: parsed => {
        parsed.day = 30;
        parsed.cn_day_text = '三十';
      },
    };
  }

  // 3. 二十X（二十, 二十一~二十九）
  const ershiMatch = rest.match(/^二十([一二三四五六七八九])?/);
  if (ershiMatch) {
    const suffix = ershiMatch[1];
    const dayValue = suffix ? 20 + CN_NUM_MAP[suffix] : 20;
    return {
      consumed: ershiMatch[0].length,
      apply: parsed => {
        parsed.day = dayValue;
        parsed.cn_day_text = ershiMatch[0];
      },
    };
  }

  // 4. 十X（十, 十一~十九）—— 注意单独的"十"表示10日
  const shiMatch = rest.match(/^十([一二三四五六七八九])?/);
  if (shiMatch) {
    const suffix = shiMatch[1];
    const dayValue = suffix ? 10 + CN_NUM_MAP[suffix] : 10;
    return {
      consumed: shiMatch[0].length,
      apply: parsed => {
        parsed.day = dayValue;
        parsed.cn_day_text = shiMatch[0];
      },
    };
  }

  return null;
}

/** 时辰匹配 */
function matchShichen(input: string, pos: number): TokenMatchResult | null {
  const rest = input.slice(pos);
  const m = rest.match(/^(子|丑|寅|卯|辰|巳|午|未|申|酉|戌|亥)时?/);
  if (!m) return null;
  const name = m[1];
  const shichen = SHICHEN_MAP[name];
  if (shichen === undefined) return null;
  return {
    consumed: m[0].length,
    apply: parsed => {
      parsed.shichen = shichen;
      parsed.shichen_name = name;
      parsed.hour = SHICHEN_TO_HOUR[shichen];
    },
  };
}

/** 刻匹配 */
function matchKe(input: string, pos: number): TokenMatchResult | null {
  const rest = input.slice(pos);
  const m = rest.match(/^([一二三])刻/);
  if (!m) return null;
  const keValue = CN_NUM_MAP[m[1]];
  if (keValue === undefined || keValue < 1 || keValue > 3) return null;
  return {
    consumed: m[0].length,
    apply: parsed => {
      parsed.ke = keValue;
      parsed.minute = keValue * 15;
    },
  };
}

/**
 * 根据 Token component 类型调用对应匹配器
 */
function matchToken(component: TimeComponent, input: string, pos: number): TokenMatchResult | null {
  switch (component) {
    case 'year': {
      // 优先匹配阿拉伯数字（现代格式更常见）
      const r = matchDigits(input, pos);
      if (r) {
        return {
          consumed: r.consumed,
          apply: p => {
            p.year = r.value;
          },
        };
      }
      // 回退到中文数字（古代年号格式）
      return matchCnYear(input, pos);
    }
    case 'month': {
      const r = matchDigits(input, pos);
      if (!r) return null;
      return {
        consumed: r.consumed,
        apply: p => {
          p.month = r.value;
        },
      };
    }
    case 'day': {
      const r = matchDigits(input, pos);
      if (!r) return null;
      return {
        consumed: r.consumed,
        apply: p => {
          p.day = r.value;
        },
      };
    }
    case 'hour': {
      const r = matchDigits(input, pos);
      if (!r) return null;
      return {
        consumed: r.consumed,
        apply: p => {
          p.hour = r.value;
        },
      };
    }
    case 'minute': {
      const r = matchDigits(input, pos);
      if (!r) return null;
      return {
        consumed: r.consumed,
        apply: p => {
          p.minute = r.value;
        },
      };
    }
    case 'second': {
      const r = matchDigits(input, pos);
      if (!r) return null;
      return {
        consumed: r.consumed,
        apply: p => {
          p.second = r.value;
        },
      };
    }
    case 'weekday':
      return matchWeekday(input, pos);
    case 'cn_month':
      return matchCnMonth(input, pos);
    case 'cn_day':
      return matchCnDay(input, pos);
    case 'shichen':
      return matchShichen(input, pos);
    case 'ke':
      return matchKe(input, pos);
    default:
      return null;
  }
}

// ============================================================
// 时间提取
// ============================================================

/** 创建空的 ParsedTime */
function emptyParsedTime(): ParsedTime {
  return {
    year: null,
    month: null,
    day: null,
    hour: null,
    minute: null,
    second: null,
    weekday: null,
    weekday_prefix: null,
    cn_month_text: null,
    cn_day_text: null,
    shichen: null,
    shichen_name: null,
    ke: null,
  };
}

/**
 * 用模板 segments 从输入字符串中提取结构化时间。
 *
 * 从左到右逐段匹配：
 * - Token 段调用对应匹配器
 * - Literal 段精确匹配字面文本
 * - 任一段失败则停止，剩余输入归入 remainder
 *
 * 额外追踪"尾部字面量"：最后一个 token 之后被模板消费的字面量文本，
 * 用于后续判断是否需要保留有意义的后缀（如"纪元"）。
 */
export function extractTime(segments: TemplateSegment[], input: string): TimeExtractionResult {
  const parsed = emptyParsedTime();
  let pos = 0;
  let hasAny = false;
  /** 最后一个 token 之后累积的已消费字面量文本 */
  let trailingLiteralBuf = '';

  for (const segment of segments) {
    if (pos >= input.length) break;

    if (segment.type === 'literal') {
      // 精确匹配字面量
      const text = segment.text;
      if (input.startsWith(text, pos)) {
        pos += text.length;
        // 累积 token 后的字面量（每次匹配到新 token 时重置）
        trailingLiteralBuf += text;
      } else {
        // 字面量不匹配，停止
        break;
      }
    } else {
      // Token 匹配
      const result = matchToken(segment.component, input, pos);
      if (!result) {
        // Token 不匹配，停止
        break;
      }
      result.apply(parsed);
      pos += result.consumed;
      hasAny = true;
      // 新 token 匹配成功，之前累积的字面量不再是"尾部"
      trailingLiteralBuf = '';
    }
  }

  // 剩余文本 trim
  const remainder = input.slice(pos).trim();

  return {
    parsed,
    remainder,
    trailing_literal: trailingLiteralBuf,
    has_any: hasAny,
  };
}

// ============================================================
// 相对时间计算
// ============================================================

/**
 * 将阿拉伯数字月份格式化为输出文本。
 * 如果事件有 cn_month_text，使用中文风格；否则用数字。
 */
function formatMonth(monthValue: number, event: ParsedTime): string {
  if (event.cn_month_text !== null) {
    // 使用原始中文月份文本
    return `${event.cn_month_text}月`;
  }
  return `${monthValue}月`;
}

/**
 * 将阿拉伯数字日期格式化为输出文本。
 * 如果事件有 cn_day_text，使用中文风格；否则用数字。
 */
function formatDay(dayValue: number, event: ParsedTime): string {
  if (event.cn_day_text !== null) {
    return event.cn_day_text;
  }
  return `${dayValue}日`;
}

/**
 * 格式化时间部分（时:分 或 时辰+刻）。
 * 根据事件中解析到的 token 类型决定输出风格。
 */
function formatTimePart(event: ParsedTime): string {
  // 古代风格：时辰 + 可选刻
  if (event.shichen_name !== null) {
    let result = `${event.shichen_name}时`;
    if (event.ke !== null) {
      result += `${ARABIC_TO_CN[event.ke]}刻`;
    }
    return result;
  }

  // 现代风格：HH:mm
  if (event.hour !== null) {
    const hh = String(event.hour).padStart(2, '0');
    if (event.minute !== null) {
      const mm = String(event.minute).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    return `${hh}时`;
  }

  return '';
}

/**
 * 拼接最终输出：主体 + 时间部分 + 剩余文本。
 * 各部分之间用空格分隔，最终 trim。
 */
function joinParts(...parts: string[]): string {
  return parts
    .filter(p => p.length > 0)
    .join(' ')
    .trim();
}

/**
 * 判断尾部字面量是否纯粹由时间单位/分隔符组成（应丢弃），
 * 还是包含有意义的上下文（应保留）。
 *
 * 纯时间单位字符：年月日时分秒 以及常见分隔符 / - : . 空格
 * 示例：
 * - "年" → 纯时间单位 → 丢弃
 * - "月" → 纯时间单位 → 丢弃
 * - "纪元" → "纪" 非时间单位 → 保留
 */
const PURE_TIME_UNIT_PATTERN = /^[年月日时分秒/\-:.\s]+$/;

function isTrailingLiteralMeaningful(text: string): boolean {
  if (!text) return false;
  return !PURE_TIME_UNIT_PATTERN.test(text);
}

/**
 * 计算相对时间描述文本。
 *
 * @param current 当前时间（从全局数据表解析）
 * @param event 事件时间（从纪要行解析）
 * @param remainder 模板匹配后的剩余文本（如"上午"）
 * @param trailingLiteral 模板中最后一个 token 之后被消费的字面量（如 "{Y}纪元" 中的 "纪元"）
 * @returns 相对时间描述文本
 */
export function computeRelativeTimeText(
  current: ParsedTime,
  event: ParsedTime,
  remainder: string,
  trailingLiteral: string = '',
): string {
  // 如果尾部字面量包含有意义的上下文（如"纪元"），将其还原到 remainder 中
  // 纯时间单位后缀（如"年""月""日"）则丢弃，由 stripRedundantLeadingUnit 处理已有重复
  if (isTrailingLiteralMeaningful(trailingLiteral)) {
    remainder = (trailingLiteral + remainder).trim();
  }

  // 如果缺少关键时间组件，无法计算，返回原样提示
  if (current.year === null || current.month === null || current.day === null) {
    // 当前时间不完整，尝试用已有部分计算
    // 但至少需要月份才有意义
    if (current.month === null) {
      return joinParts(formatFallback(event), remainder);
    }
  }

  if (event.year === null && event.month === null && event.day === null) {
    // 事件时间完全为空，原样返回
    return remainder;
  }

  // ── 年份差 ──
  const yearDiff = computeYearDiff(current, event);

  if (yearDiff !== null && yearDiff !== 0) {
    return formatYearDiff(yearDiff, event, remainder);
  }

  // ── 同年或无年份信息，比较月份 ──
  const monthDiff = computeMonthDiff(current, event);

  if (monthDiff !== null && monthDiff !== 0) {
    return formatMonthDiff(monthDiff, event, remainder);
  }

  // ── 同月或无月份信息，比较日期 ──
  const dayDiff = computeDayDiff(current, event);

  if (dayDiff !== null) {
    return formatDayDiff(dayDiff, event, remainder);
  }

  // 无法计算差值，输出回退
  return joinParts(formatFallback(event), remainder);
}

/** 计算年份差（current - event，正值=过去，负值=未来） */
function computeYearDiff(current: ParsedTime, event: ParsedTime): number | null {
  if (current.year === null || event.year === null) return null;
  return current.year - event.year;
}

/** 计算月份差（current - event） */
function computeMonthDiff(current: ParsedTime, event: ParsedTime): number | null {
  if (current.month === null || event.month === null) return null;
  return current.month - event.month;
}

/** 计算日期差（current - event） */
function computeDayDiff(current: ParsedTime, event: ParsedTime): number | null {
  if (current.day === null || event.day === null) return null;
  return current.day - event.day;
}

/**
 * 清理 remainder 开头与相对时间描述词重复的时间单位后缀。
 *
 * 例如：
 * - 相对时间 "前年"，remainder "年夏" → 清理为 "夏"（避免 "前年年夏"）
 * - 相对时间 "去年"，remainder "年6月" → 清理为 "6月"
 * - 相对时间 "上个月"，remainder "月初三" → 清理为 "初三"
 */
function stripRedundantLeadingUnit(remainder: string, redundantPrefixes: string[]): string {
  for (const prefix of redundantPrefixes) {
    if (remainder.startsWith(prefix)) {
      return remainder.slice(prefix.length);
    }
  }
  return remainder;
}

/** 年份差格式化 */
function formatYearDiff(yearDiff: number, event: ParsedTime, remainder: string): string {
  const monthPart = event.month !== null ? formatMonth(event.month, event) : '';

  let yearPart: string;
  if (yearDiff >= 3) {
    yearPart = `${yearDiff}年前`;
  } else if (yearDiff === 2) {
    yearPart = '前年';
  } else if (yearDiff === 1) {
    yearPart = '去年';
  } else if (yearDiff === -1) {
    yearPart = '明年';
  } else if (yearDiff === -2) {
    yearPart = '后年';
  } else {
    yearPart = `${Math.abs(yearDiff)}年后`;
  }

  // 清理 remainder 开头与 "年" 相关的冗余单位（避免 "前年年夏" 等问题）
  const cleanedRemainder = stripRedundantLeadingUnit(remainder, ['年']);

  return joinParts(yearPart + monthPart, cleanedRemainder);
}

/** 月份差格式化 */
function formatMonthDiff(monthDiff: number, event: ParsedTime, remainder: string): string {
  const dayPart = event.day !== null ? formatDay(event.day, event) : '';

  let monthPart: string;
  if (monthDiff >= 2) {
    monthPart = formatMonth(event.month!, event);
  } else if (monthDiff === 1) {
    monthPart = '上个月';
  } else if (monthDiff === -1) {
    monthPart = '下个月';
  } else {
    monthPart = formatMonth(event.month!, event);
  }

  // 清理 remainder 开头与 "月" 相关的冗余单位
  const cleanedRemainder = stripRedundantLeadingUnit(remainder, ['月']);

  return joinParts(monthPart + dayPart, cleanedRemainder);
}

/** 日期差格式化 */
function formatDayDiff(dayDiff: number, event: ParsedTime, remainder: string): string {
  const timePart = formatTimePart(event);
  const absDiff = Math.abs(dayDiff);

  // 清理 remainder 开头与 "天"/"日" 相关的冗余单位
  const cleanedRemainder = stripRedundantLeadingUnit(remainder, ['天', '日']);

  // 同一天
  if (dayDiff === 0) {
    return joinParts('今天' + timePart, cleanedRemainder);
  }

  // 昨天/前天
  if (dayDiff === 1) {
    return joinParts('昨天' + timePart, cleanedRemainder);
  }
  if (dayDiff === 2) {
    return joinParts('前天' + timePart, cleanedRemainder);
  }

  // 明天/后天
  if (dayDiff === -1) {
    return joinParts('明天' + timePart, cleanedRemainder);
  }
  if (dayDiff === -2) {
    return joinParts('后天' + timePart, cleanedRemainder);
  }

  // 3-7天：如果有星期信息，用"上/下 + prefix + 中文数字"
  if (dayDiff >= 3 && dayDiff <= 7 && event.weekday !== null && event.weekday_prefix !== null) {
    const cnDay = ARABIC_TO_CN[event.weekday] ?? (event.weekday === 7 ? '日' : String(event.weekday));
    return joinParts(`上${event.weekday_prefix}${cnDay}`, cleanedRemainder);
  }
  if (dayDiff >= -7 && dayDiff <= -3 && event.weekday !== null && event.weekday_prefix !== null) {
    const cnDay = ARABIC_TO_CN[event.weekday] ?? (event.weekday === 7 ? '日' : String(event.weekday));
    return joinParts(`下${event.weekday_prefix}${cnDay}`, cleanedRemainder);
  }

  // 超过7天或无星期信息
  if (dayDiff > 0) {
    return joinParts(`${absDiff}天前`, cleanedRemainder);
  }
  return joinParts(`${absDiff}天后`, cleanedRemainder);
}

/** 回退格式化：当无法计算相对时间时，尽量输出原始信息 */
function formatFallback(event: ParsedTime): string {
  const parts: string[] = [];
  if (event.month !== null) parts.push(formatMonth(event.month, event));
  if (event.day !== null) parts.push(formatDay(event.day, event));
  const timePart = formatTimePart(event);
  if (timePart) parts.push(timePart);
  return parts.join('');
}

// ============================================================
// 时间跨度分隔符检测
// ============================================================

/**
 * 时间跨度分隔符模式：匹配 "->", "→", "~", "～", "—", "──" 等常见分隔符，
 * 前后可有空格。
 */
const TIME_RANGE_SEPARATOR_PATTERN = /^(\s*(?:->|→|~|～|—|──|－)\s*)/;

/**
 * 尝试从 remainder 中检测时间跨度分隔符。
 *
 * 如果 remainder 以分隔符开头（或 remainder 中的非时间前缀 + 分隔符），
 * 则返回分隔符信息；否则返回 null。
 *
 * @param remainder extractTime 返回的剩余文本（已 trim）
 * @returns 分隔符匹配结果，或 null
 */
function detectTimeRangeSeparator(remainder: string): {
  /** 分隔符前的文本（如 "傍晚"） */
  prefix: string;
  /** 分隔符本身（如 " -> "） */
  separator: string;
  /** 分隔符后的文本（如 "1988/07/17 凌晨"） */
  afterSeparator: string;
} | null {
  // 直接以分隔符开头
  const directMatch = remainder.match(TIME_RANGE_SEPARATOR_PATTERN);
  if (directMatch) {
    return {
      prefix: '',
      separator: directMatch[1],
      afterSeparator: remainder.slice(directMatch[0].length),
    };
  }

  // 分隔符可能在非时间前缀之后（如 "傍晚 -> 1988/07/17 凌晨"）
  // 搜索 remainder 中第一个分隔符的位置
  const searchPattern = /(\s*(?:->|→|~|～|—|──|－)\s*)/;
  const searchMatch = remainder.match(searchPattern);
  if (searchMatch && searchMatch.index !== undefined) {
    const prefix = remainder.slice(0, searchMatch.index);
    const separator = searchMatch[1];
    const afterSeparator = remainder.slice(searchMatch.index + searchMatch[0].length);
    // 只有当分隔符后面还有内容时才认为是时间跨度
    if (afterSeparator.trim().length > 0) {
      return { prefix, separator, afterSeparator };
    }
  }

  return null;
}

// ============================================================
// 批量行变换
// ============================================================

/**
 * 批量对纪要行执行时间变换。
 * 原地修改 orderedFields 中匹配 summaryTimeColumn 的列值。
 *
 * 支持时间跨度格式（如 "1988/07/16 傍晚 -> 1988/07/17 凌晨"）：
 * 当检测到 remainder 中包含时间跨度分隔符时，会对分隔符后的部分
 * 也进行时间提取和相对时间计算，最终拼接两段相对时间。
 */
export function applyTimeTransformToRows(
  rows: UnifiedEventRow[],
  config: {
    template: TemplateSegment[];
    currentTime: ParsedTime;
    summaryTimeColumn: string;
  },
): void {
  const { template, currentTime, summaryTimeColumn } = config;

  for (const row of rows) {
    for (const field of row.orderedFields) {
      if (field.key !== summaryTimeColumn) continue;

      const originalValue = field.value.trim();
      if (!originalValue) continue;

      const extraction = extractTime(template, originalValue);
      if (!extraction.has_any) continue;

      // 合并 remainder：将 trailing_literal（如果有意义）还原到 remainder 前面
      // 这里先拿到完整的 remainder 用于分隔符检测
      const fullRemainder = extraction.remainder;

      // 检测时间跨度分隔符
      const rangeInfo = detectTimeRangeSeparator(fullRemainder);

      if (rangeInfo) {
        // ── 时间跨度模式 ──
        // 第一段时间的 remainder 是分隔符前的文本（如 "傍晚"）
        const firstRemainder = rangeInfo.prefix.trim();
        const firstRelative = computeRelativeTimeText(
          currentTime,
          extraction.parsed,
          firstRemainder,
          extraction.trailing_literal,
        );

        // 对分隔符后的文本进行第二次时间提取
        const secondInput = rangeInfo.afterSeparator.trim();
        const secondExtraction = extractTime(template, secondInput);

        if (secondExtraction.has_any) {
          const secondRelative = computeRelativeTimeText(
            currentTime,
            secondExtraction.parsed,
            secondExtraction.remainder,
            secondExtraction.trailing_literal,
          );

          // 使用原始分隔符拼接两段相对时间
          const separator = rangeInfo.separator.trim();
          field.value = `${firstRelative} ${separator} ${secondRelative}`;
        } else {
          // 第二段无法解析为时间，保留原始分隔符后文本
          const separator = rangeInfo.separator.trim();
          field.value = `${firstRelative} ${separator} ${secondInput}`;
        }
      } else {
        // ── 单一时间模式（原有逻辑） ──
        const relativeText = computeRelativeTimeText(
          currentTime,
          extraction.parsed,
          extraction.remainder,
          extraction.trailing_literal,
        );
        field.value = relativeText;
      }
    }
  }
}
