import { SCRIPT_LOG_PREFIX } from './constants';
import type {
  AcuCellValue,
  AcuSheetData,
  AcuTableJson,
  SummaryHeaderMap,
  SummarySheetMeta,
  UnifiedEventRow,
  UnifiedRowParseResult,
} from './types';

/**
 * 统一文本化并去空白：
 * - 去前后空白
 * - 去除全角空格
 */
function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u3000/g, ' ')
    .trim();
}

/**
 * 安全获取单元格文本
 */
function getCellText(row: AcuCellValue[], columnIndex: number | null): string {
  if (columnIndex === null) return '';
  if (columnIndex < 0 || columnIndex >= row.length) return '';
  return normalizeText(row[columnIndex]);
}

/**
 * 判断整行是否为空（各单元格 trim 后均为空）
 */
function isEmptyRow(row: AcuCellValue[]): boolean {
  return row.every(cell => normalizeText(cell) === '');
}

/**
 * 校验关键列是否完整
 */
function validateRequiredColumns(headerMap: SummaryHeaderMap): string[] {
  const warnings: string[] = [];
  if (headerMap.detail === null) warnings.push('缺失关键列：纪要');
  if (headerMap.summary === null) warnings.push('缺失关键列：概览');
  if (headerMap.code === null) warnings.push('缺失关键列：编码索引');
  return warnings;
}

function buildOrderedFields(
  row: AcuCellValue[],
  headerMap: SummaryHeaderMap,
): Array<{ key: string; value: string; columnIndex: number }> {
  const fields: Array<{ key: string; value: string; columnIndex: number }> = [];

  for (let columnIndex = 0; columnIndex < headerMap.raw_headers.length; columnIndex += 1) {
    const headerName = normalizeText(headerMap.raw_headers[columnIndex]);
    if (!headerName) continue;
    const value = getCellText(row, columnIndex);
    fields.push({
      key: headerName,
      value,
      columnIndex,
    });
  }

  return fields;
}

/**
 * 从 ACU 原始数据中解析统一行模型
 */
export function parseUnifiedRowsFromSummarySheet(
  data: AcuTableJson,
  sheetMeta: SummarySheetMeta,
): UnifiedRowParseResult {
  const summary = {
    total_data_rows: 0,
    parsed_rows: 0,
    skipped_empty_rows: 0,
    skipped_empty_code_rows: 0,
    skipped_duplicate_code_rows: 0,
    duplicate_codes: [] as string[],
    warnings: [] as string[],
  };

  const rawSheet = data[sheetMeta.table_id];
  if (!rawSheet || typeof rawSheet !== 'object') {
    summary.warnings.push(`目标表不存在：${sheetMeta.table_id}`);
    console.warn(SCRIPT_LOG_PREFIX, '统一行解析失败：目标表不存在。', sheetMeta.table_id);
    return { rows: [], summary };
  }

  const sheet = rawSheet as AcuSheetData;
  const content = Array.isArray(sheet.content) ? sheet.content : [];
  if (content.length === 0) {
    summary.warnings.push(`目标表内容为空：${sheetMeta.table_name}（${sheetMeta.table_id}）`);
    console.warn(SCRIPT_LOG_PREFIX, '统一行解析失败：目标表内容为空。', sheetMeta.table_name, sheetMeta.table_id);
    return { rows: [], summary };
  }

  const requiredWarnings = validateRequiredColumns(sheetMeta.header_map);
  if (requiredWarnings.length > 0) {
    summary.warnings.push(...requiredWarnings);
    console.warn(
      SCRIPT_LOG_PREFIX,
      '统一行解析失败：关键列缺失。',
      requiredWarnings,
      '表：',
      `${sheetMeta.table_name}（${sheetMeta.table_id}）`,
    );
    return { rows: [], summary };
  }

  // 跳过第 0 行表头，只解析数据行
  const dataRows = content.slice(1);
  summary.total_data_rows = dataRows.length;

  const rows: UnifiedEventRow[] = [];
  const seenCodes = new Set<string>();
  const duplicateSet = new Set<string>();

  for (let index = 0; index < dataRows.length; index += 1) {
    const row = Array.isArray(dataRows[index]) ? dataRows[index] : [];

    // 空行过滤
    if (row.length === 0 || isEmptyRow(row)) {
      summary.skipped_empty_rows += 1;
      continue;
    }

    const code = getCellText(row, sheetMeta.header_map.code);

    // 编码为空过滤
    if (!code) {
      summary.skipped_empty_code_rows += 1;
      continue;
    }

    // 重复编码过滤
    if (seenCodes.has(code)) {
      summary.skipped_duplicate_code_rows += 1;
      duplicateSet.add(code);
      continue;
    }
    seenCodes.add(code);

    const unifiedRow: UnifiedEventRow = {
      code,
      detail: getCellText(row, sheetMeta.header_map.detail),
      summary: getCellText(row, sheetMeta.header_map.summary),
      serial: index + 1,
      // +1 是表头行，+1 是转为 1-based 行号
      rowIndex: index + 2,
      tableId: sheetMeta.table_id,
      tableName: sheetMeta.table_name,
      orderedFields: buildOrderedFields(row, sheetMeta.header_map),
    };

    rows.push(unifiedRow);
  }

  summary.parsed_rows = rows.length;
  summary.duplicate_codes = Array.from(duplicateSet).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

  if (summary.duplicate_codes.length > 0) {
    summary.warnings.push(`检测到重复编码并已跳过：${summary.duplicate_codes.join('、')}`);
  }

  console.info(SCRIPT_LOG_PREFIX, '统一行解析完成。', {
    table: `${sheetMeta.table_name}（${sheetMeta.table_id}）`,
    total_data_rows: summary.total_data_rows,
    parsed_rows: summary.parsed_rows,
    skipped_empty_rows: summary.skipped_empty_rows,
    skipped_empty_code_rows: summary.skipped_empty_code_rows,
    skipped_duplicate_code_rows: summary.skipped_duplicate_code_rows,
  });

  return { rows, summary };
}
