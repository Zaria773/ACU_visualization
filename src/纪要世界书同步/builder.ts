import type {
  BuildEntriesInput,
  BuildEntriesResult,
  BuildEntriesSummary,
  BuiltDepthPlan,
  BuiltEntryPosition,
  BuiltWorldbookEntry,
  EntryPlacementConfig,
  RowOrderInfo,
  UnifiedEventRow,
} from './types';

/**
 * 统一文本清理，避免构建内容时混入两端空白。
 */
function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u3000/g, ' ')
    .trim();
}

/**
 * 计算 depth 四层结构：
 * - depth + 1：包裹上（蓝灯）
 * - depth：数据库表头（本子任务不生成）
 * - depth - 1：概览/纪要（绿灯）
 * - depth - 2：包裹下（蓝灯）
 */
function buildDepthPlan(entryPlacement: EntryPlacementConfig): BuiltDepthPlan {
  const baseDepth = entryPlacement.depth;
  return {
    base_depth: baseDepth,
    wrapper_top_depth: baseDepth + 1,
    content_depth: baseDepth - 1,
    wrapper_bottom_depth: baseDepth - 2,
    placement_position: entryPlacement.position,
    placement_order: entryPlacement.order,
  };
}

/**
 * 尝试将编码索引解析为数字：
 * - 只接受 Number() 可解析且有限值
 */
function tryParseCodeAsNumber(code: string): number | null {
  const normalized = normalizeText(code);
  if (!normalized) return null;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

/**
 * 计算 order：
 * - 若全部编码都可解析为数字：按编码值升序分配，保证“编码越大 order 越大”
 * - 若任意一行无法解析：整体回退为按原始行顺序分配
 */
function buildOrderMap(rows: UnifiedEventRow[]): { order_map: RowOrderInfo[]; used_fallback_by_row_order: boolean } {
  const parsedNumeric = rows.map(row => ({
    row,
    numeric: tryParseCodeAsNumber(row.code),
  }));

  const shouldFallback = parsedNumeric.some(item => item.numeric === null);

  const orderedRows = shouldFallback
    ? [...rows].sort((a, b) => a.rowIndex - b.rowIndex)
    : [...parsedNumeric]
        .sort((a, b) => {
          const numericDiff = (a.numeric as number) - (b.numeric as number);
          if (numericDiff !== 0) return numericDiff;
          return a.row.rowIndex - b.row.rowIndex;
        })
        .map(item => item.row);

  const order_map: RowOrderInfo[] = orderedRows.map((row, index) => ({
    code: row.code,
    rowIndex: row.rowIndex,
    order: index + 1,
  }));

  return {
    order_map,
    used_fallback_by_row_order: shouldFallback,
  };
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function buildPipeRowContent(row: UnifiedEventRow, kind: 'summary' | 'detail'): string {
  const cells: string[] = [];

  for (const field of row.orderedFields) {
    const key = normalizeText(field.key);
    if (!key) continue;

    if (key === '纪要') {
      if (kind === 'summary') continue;
      cells.push(escapePipe(normalizeText(row.detail)));
      continue;
    }

    if (key === '概览') {
      if (kind === 'detail') continue;
      cells.push(escapePipe(normalizeText(row.summary)));
      continue;
    }

    cells.push(escapePipe(normalizeText(field.value)));
  }

  return `| ${cells.join(' | ')} |`;
}

function mapPlacementToPosition(placement: EntryPlacementConfig, depth: number, order: number): BuiltEntryPosition {
  if (placement.position === 'before_character_definition') {
    return { type: 'before_character_definition', order };
  }

  if (placement.position === 'after_character_definition') {
    return { type: 'after_character_definition', order };
  }

  return {
    type: 'at_depth',
    role: 'system',
    depth,
    order,
  };
}

/**
 * 构建包裹上条目（蓝灯）。
 */
function buildWrapperTopEntry(
  depthPlan: BuiltDepthPlan,
  placement: EntryPlacementConfig,
  wrapperTextTop: string,
): BuiltWorldbookEntry {
  return {
    kind: 'wrapper_top',
    name: '纪要同步_包裹上',
    enabled: true,
    strategy: {
      type: 'constant',
      keys: [],
      keys_secondary: { logic: 'and_any', keys: [] },
      scan_depth: 'same_as_global',
    },
    position: mapPlacementToPosition(placement, depthPlan.wrapper_top_depth, placement.order - 2),
    content: normalizeText(wrapperTextTop),
    source: {
      code: null,
      serial: null,
      rowIndex: null,
      tableId: null,
      tableName: null,
    },
  };
}

/**
 * 构建包裹下条目（蓝灯）。
 */
function buildWrapperBottomEntry(
  depthPlan: BuiltDepthPlan,
  placement: EntryPlacementConfig,
  wrapperTextBottom: string,
): BuiltWorldbookEntry {
  return {
    kind: 'wrapper_bottom',
    name: '纪要同步_包裹下',
    enabled: true,
    strategy: {
      type: 'constant',
      keys: [],
      keys_secondary: { logic: 'and_any', keys: [] },
      scan_depth: 'same_as_global',
    },
    position: mapPlacementToPosition(placement, depthPlan.wrapper_bottom_depth, placement.order - 1),
    content: normalizeText(wrapperTextBottom),
    source: {
      code: null,
      serial: null,
      rowIndex: null,
      tableId: null,
      tableName: null,
    },
  };
}

/**
 * 构建概览条目（绿灯）：
 * - 主关键字：/./s（保证可被扫描）
 * - 次关键字：本行编码索引 + not_any（正文出现该编码后，概览失效）
 */
function buildSummaryEntry(
  row: UnifiedEventRow,
  order: number,
  depthPlan: BuiltDepthPlan,
  placement: EntryPlacementConfig,
): BuiltWorldbookEntry {
  return {
    kind: 'summary',
    name: `纪要同步_概览_${row.serial}`,
    enabled: true,
    strategy: {
      type: 'selective',
      keys: [/./s],
      keys_secondary: {
        logic: 'not_any',
        keys: [row.code],
      },
      scan_depth: 'same_as_global',
    },
    position: mapPlacementToPosition(placement, depthPlan.content_depth, placement.order + order),
    content: buildPipeRowContent(row, 'summary'),
    source: {
      code: row.code,
      serial: row.serial,
      rowIndex: row.rowIndex,
      tableId: row.tableId,
      tableName: row.tableName,
    },
  };
}

/**
 * 构建纪要条目（绿灯）：
 * - 主关键字：本行编码索引
 * - 标准 selective 逻辑
 */
function buildDetailEntry(
  row: UnifiedEventRow,
  order: number,
  depthPlan: BuiltDepthPlan,
  placement: EntryPlacementConfig,
): BuiltWorldbookEntry {
  return {
    kind: 'detail',
    name: `纪要同步_纪要_${row.serial}`,
    enabled: true,
    strategy: {
      type: 'selective',
      keys: [row.code],
      keys_secondary: {
        logic: 'and_any',
        keys: [],
      },
      scan_depth: 'same_as_global',
    },
    position: mapPlacementToPosition(placement, depthPlan.content_depth, placement.order + order),
    content: buildPipeRowContent(row, 'detail'),
    source: {
      code: row.code,
      serial: row.serial,
      rowIndex: row.rowIndex,
      tableId: row.tableId,
      tableName: row.tableName,
    },
  };
}

/**
 * 构建世界书条目中间结构（子任务三）：
 * - 只生成构建结果，不执行任何写入动作
 */
export function buildWorldbookEntries(input: BuildEntriesInput): BuildEntriesResult {
  const rows = [...input.rows];
  const depthPlan = buildDepthPlan(input.entry_placement);

  const { order_map, used_fallback_by_row_order } = buildOrderMap(rows);
  const orderByCode = new Map(order_map.map(item => [item.code, item.order]));

  const entries: BuiltWorldbookEntry[] = [];

  // 包裹上（蓝灯）
  entries.push(buildWrapperTopEntry(depthPlan, input.entry_placement, input.wrapper_text_top));

  // 每行生成：概览（绿灯）+ 纪要（绿灯）
  // 0tk 模式下仅生成纪要条目
  for (const row of rows) {
    const order = orderByCode.get(row.code) ?? row.serial;
    if (!input.zero_tk_mode_enabled) {
      entries.push(buildSummaryEntry(row, order, depthPlan, input.entry_placement));
    }
    entries.push(buildDetailEntry(row, order, depthPlan, input.entry_placement));
  }

  // 包裹下（蓝灯）
  entries.push(buildWrapperBottomEntry(depthPlan, input.entry_placement, input.wrapper_text_bottom));

  const summary: BuildEntriesSummary = {
    total_rows: rows.length,
    parsed_order_rows: order_map.length,
    used_fallback_by_row_order,
    counts: {
      wrapper_top: 1,
      summary: input.zero_tk_mode_enabled ? 0 : rows.length,
      detail: rows.length,
      wrapper_bottom: 1,
      total_entries: entries.length,
    },
    depth_plan: depthPlan,
  };

  return {
    entries,
    summary,
    order_map,
  };
}
