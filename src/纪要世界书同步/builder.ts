import type {
  BuildEntriesInput,
  BuildEntriesResult,
  BuildEntriesSummary,
  BuiltDepthPlan,
  BuiltEntryPosition,
  BuiltWorldbookEntry,
  ColumnVisibility,
  InjectionPositionMode,
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
 * 计算 depth 结构（所有条目统一 at_depth + system）：
 * - depth：表头（蓝灯）+ 包裹上（蓝灯，order = 表头 + 1）
 * - depth - 1：概览/纪要（绿灯）
 * - depth - 2：包裹下（蓝灯）
 */
function buildDepthPlan(depth: number): BuiltDepthPlan {
  return {
    base_depth: depth,
    wrapper_top_depth: depth,
    content_depth: depth - 1,
    wrapper_bottom_depth: depth - 2,
    placement_position: 'at_depth_as_system',
    placement_order: 0,
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

/**
 * 获取列的默认可见性：
 * - 纪要列默认仅在纪要条目中显示
 * - 概览列默认仅在概览条目中显示
 * - 其他列默认在两种条目中都显示
 */
function getDefaultColumnVisibility(key: string): ColumnVisibility {
  if (key === '纪要') return 'detail_only';
  if (key === '概览') return 'summary_only';
  return 'both';
}

/**
 * 判断列在指定条目类型中是否可见
 */
function isColumnVisibleForKind(visibility: ColumnVisibility, kind: 'summary' | 'detail'): boolean {
  if (visibility === 'both') return true;
  if (visibility === 'none') return false;
  if (kind === 'summary') return visibility === 'summary_only';
  return visibility === 'detail_only';
}

function buildPipeRowContent(
  row: UnifiedEventRow,
  kind: 'summary' | 'detail',
  columnVisibility: Record<string, ColumnVisibility>,
): string {
  const cells: string[] = [];

  for (const field of row.orderedFields) {
    const key = normalizeText(field.key);
    if (!key) continue;

    // 根据列可见性设置决定是否包含该列
    const visibility = columnVisibility[key] ?? getDefaultColumnVisibility(key);
    if (!isColumnVisibleForKind(visibility, kind)) continue;

    if (key === '纪要') {
      cells.push(escapePipe(normalizeText(row.detail)));
      continue;
    }

    if (key === '概览') {
      cells.push(escapePipe(normalizeText(row.summary)));
      continue;
    }

    cells.push(escapePipe(normalizeText(field.value)));
  }

  return `| ${cells.join(' | ')} |`;
}

function buildPosition(positionMode: InjectionPositionMode, depth: number, order: number): BuiltEntryPosition {
  if (positionMode === 'before_character_definition') {
    return { type: 'before_character_definition', order };
  }
  if (positionMode === 'after_character_definition') {
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
 * 构建表头条目（蓝灯）：
 * - 根据列可见性生成 markdown 表头
 * - 与包裹上同深度，order 在包裹上之前
 */
function buildHeaderEntry(
  positionMode: InjectionPositionMode,
  depthPlan: BuiltDepthPlan,
  tableName: string,
  relevantHeaders: string[],
  columnVisibility: Record<string, ColumnVisibility>,
): BuiltWorldbookEntry {
  // 表头完全按纪要条目的列来：只保留对纪要条目可见的列（both / detail_only）
  const visibleHeaders = relevantHeaders.filter(h => {
    const vis = columnVisibility[h] ?? getDefaultColumnVisibility(h);
    return isColumnVisibleForKind(vis, 'detail');
  });

  const headerLine = `| ${visibleHeaders.join(' | ')} |`;
  const separatorLine = `|${visibleHeaders.map(() => '---').join('|')}|`;
  const content = `# ${tableName}\n\n${headerLine}\n${separatorLine}`;

  return {
    kind: 'header',
    name: '纪要同步_表头',
    enabled: true,
    strategy: {
      type: 'constant',
      keys: [],
      keys_secondary: { logic: 'and_any', keys: [] },
      scan_depth: 'same_as_global',
    },
    position: buildPosition(positionMode, depthPlan.wrapper_top_depth, 1),
    content,
    source: {
      code: null,
      serial: null,
      rowIndex: null,
      tableId: null,
      tableName: null,
    },
  };
}

function buildWrapperTopEntry(
  positionMode: InjectionPositionMode,
  depthPlan: BuiltDepthPlan,
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
    position: buildPosition(positionMode, depthPlan.wrapper_top_depth, 0),
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

function buildWrapperBottomEntry(
  positionMode: InjectionPositionMode,
  depthPlan: BuiltDepthPlan,
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
    position: buildPosition(positionMode, depthPlan.wrapper_bottom_depth, 0),
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
  positionMode: InjectionPositionMode,
  row: UnifiedEventRow,
  order: number,
  depthPlan: BuiltDepthPlan,
  columnVisibility: Record<string, ColumnVisibility>,
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
    position: buildPosition(positionMode, depthPlan.content_depth, order),
    content: buildPipeRowContent(row, 'summary', columnVisibility),
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
 * 构建概览条目（绿灯，不触发模式）：
 * - 主关键字："永远不会触发！！"（保证永远不会被触发）
 * - 仍然注入到世界书中，但不会消耗 token
 */
function buildSummaryEntryNoTrigger(
  positionMode: InjectionPositionMode,
  row: UnifiedEventRow,
  order: number,
  depthPlan: BuiltDepthPlan,
  columnVisibility: Record<string, ColumnVisibility>,
): BuiltWorldbookEntry {
  return {
    kind: 'summary',
    name: `纪要同步_概览_${row.serial}`,
    enabled: true,
    strategy: {
      type: 'selective',
      keys: ['永远不会触发！！'],
      keys_secondary: {
        logic: 'and_any',
        keys: [],
      },
      scan_depth: 'same_as_global',
    },
    position: buildPosition(positionMode, depthPlan.content_depth, order),
    content: buildPipeRowContent(row, 'summary', columnVisibility),
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
  positionMode: InjectionPositionMode,
  row: UnifiedEventRow,
  order: number,
  depthPlan: BuiltDepthPlan,
  columnVisibility: Record<string, ColumnVisibility>,
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
    position: buildPosition(positionMode, depthPlan.content_depth, order),
    content: buildPipeRowContent(row, 'detail', columnVisibility),
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
  const depthPlan = buildDepthPlan(input.depth);

  const { order_map, used_fallback_by_row_order } = buildOrderMap(rows);
  const orderByCode = new Map(order_map.map(item => [item.code, item.order]));

  const entries: BuiltWorldbookEntry[] = [];
  const columnVisibility = input.column_visibility;
  const positionMode = input.position;

  // 表头（蓝灯）— 与包裹上同深度，order = 0
  entries.push(buildHeaderEntry(positionMode, depthPlan, input.table_name, input.relevant_headers, columnVisibility));

  // 包裹上（蓝灯）— 与表头同深度，order = 1
  entries.push(buildWrapperTopEntry(positionMode, depthPlan, input.wrapper_text_top));

  // 每行生成：概览（绿灯）+ 纪要（绿灯）
  // 0tk 模式下仅生成纪要条目
  // 0tk 注入但不触发模式下，概览条目仍注入但关键词改为永远不会触发
  for (const row of rows) {
    const order = orderByCode.get(row.code) ?? row.serial;
    if (input.zero_tk_inject_no_trigger) {
      entries.push(buildSummaryEntryNoTrigger(positionMode, row, order, depthPlan, columnVisibility));
    } else if (!input.zero_tk_mode_enabled) {
      entries.push(buildSummaryEntry(positionMode, row, order, depthPlan, columnVisibility));
    }
    entries.push(buildDetailEntry(positionMode, row, order, depthPlan, columnVisibility));
  }

  // 包裹下（蓝灯）
  entries.push(buildWrapperBottomEntry(positionMode, depthPlan, input.wrapper_text_bottom));

  const summary: BuildEntriesSummary = {
    total_rows: rows.length,
    parsed_order_rows: order_map.length,
    used_fallback_by_row_order,
    counts: {
      wrapper_top: 1,
      header: 1,
      summary: input.zero_tk_mode_enabled && !input.zero_tk_inject_no_trigger ? 0 : rows.length,
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
