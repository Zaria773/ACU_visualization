/**
 * 表格完整性检测 Composable
 * 用于检测 AI 填表后总结表/大纲表的完整性
 *
 * 检测条件：
 * - 只在 AI 填表产生新增行时检测（基于 aiDiffMap）
 * - 刷新/保存后警告消失（因为 aiDiffMap 会被清空）
 *
 *  检测内容：
 * 1. AI 新增行的编码索引是否与快照最后一条连续
 * 2. AI 新增行是否有空列
 */

import { computed, ref } from 'vue';
import type { RawDatabaseData } from '../types';

// ============================================================
// 类型定义
// ============================================================

/** 完整性问题类型 */
export type IntegrityIssueType =
  | 'empty_cell' // 空单元格（AI新增行有空列）
  | 'index_gap'; // 编码索引断裂（AI新增行与快照不连续）

/** 单个问题详情 */
export interface IntegrityIssue {
  /** 表格ID（sheet_x 格式） */
  sheetId: string;
  /** 表格名称（如"总结表"） */
  tableName: string;
  /** 问题行索引（0-based，不含表头） */
  rowIndex: number;
  /** 问题列索引 */
  colIndex: number;
  /** 问题类型 */
  issueType: IntegrityIssueType;
  /** 问题描述 */
  description: string;
  /** 当前值 */
  currentValue?: string;
  /** 期望值（用于断裂检测） */
  expectedValue?: string;
}

/** 表格检测结果 */
export interface TableCheckResult {
  /** 表格ID（sheet_x 格式） */
  sheetId: string;
  /** 表格名称 */
  tableName: string;
  /** 是否有问题 */
  hasIssues: boolean;
  /** 问题列表 */
  issues: IntegrityIssue[];
}

/** 完整性检测配置 */
export interface IntegrityCheckConfig {
  /** 编码索引列名（默认"编码索引"） */
  indexColumnName: string;
  /** 是否检测空值 */
  checkEmptyCell: boolean;
  /** 是否检测断裂 */
  checkIndexGap: boolean;
}

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_CONFIG: IntegrityCheckConfig = {
  indexColumnName: '编码索引',
  checkEmptyCell: true,
  checkIndexGap: true,
};

// ============================================================
// 工具函数
// ============================================================

/**
 * 判断表格是否是总结表或大纲表
 * @param tableName 表格名称
 */
export function isSummaryOrOutlineTable(tableName: string): boolean {
  if (!tableName || typeof tableName !== 'string') return false;
  const name = tableName.toLowerCase();
  return name.includes('总结') || name.includes('大纲') || name.includes('summary') || name.includes('outline');
}

/**
 * 从单元格值中提取数字
 * 支持格式：AM1, AM2, 1, 2, 等
 * @param value 单元格值
 */
function extractNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;

  const str = String(value).trim();
  if (str === '') return null;

  // 尝试提取数字部分
  const match = str.match(/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }

  return null;
}

/**
 * 从 aiDiffMap key 中提取表格名
 * key 格式: "表格名-row-行号" 或 "表格名-行号-列号"
 */
function extractTableNameFromKey(key: string): string | null {
  // 尝试匹配 "表格名-row-数字" 格式
  const rowMatch = key.match(/^(.+)-row-\d+$/);
  if (rowMatch) return rowMatch[1];

  // 尝试匹配 "表格名-数字-数字" 格式（单元格）
  const cellMatch = key.match(/^(.+)-\d+-\d+$/);
  if (cellMatch) return cellMatch[1];

  return null;
}

/**
 * 从 aiDiffMap key 中提取行号
 */
function extractRowIndexFromKey(key: string): number | null {
  // 尝试匹配 "表格名-row-数字" 格式
  const rowMatch = key.match(/-row-(\d+)$/);
  if (rowMatch) return parseInt(rowMatch[1], 10);

  // 尝试匹配 "表格名-数字-数字" 格式（单元格），取第一个数字作为行号
  const cellMatch = key.match(/-(\d+)-\d+$/);
  if (cellMatch) return parseInt(cellMatch[1], 10);

  return null;
}

/**
 * 检测 AI 填表后表格的完整性
 * 只检测 AI 真正新增的行（当前行数 > 快照行数时多出来的行）
 * 不检测修改的现有行
 *
 * @param sheetId 表格ID
 * @param sheet 当前表格数据
 * @param snapshotSheet 快照表格数据（AI填表前）
 * @param aiChangedRows AI 变更的行索引集合（用于判断哪些新增行是AI填的）
 * @param config 检测配置
 */
function checkTableIntegrity(
  sheetId: string,
  sheet: { name?: string; content?: (string | number)[][] },
  snapshotSheet: { name?: string; content?: (string | number)[][] } | null,
  aiChangedRows: Set<number>,
  config: IntegrityCheckConfig,
): TableCheckResult {
  const tableName = sheet.name || sheetId;
  const issues: IntegrityIssue[] = [];

  // 如果不是总结表/大纲表，跳过检测
  if (!isSummaryOrOutlineTable(tableName)) {
    return { sheetId, tableName, hasIssues: false, issues: [] };
  }

  // 检查内容是否存在
  if (!sheet.content || !Array.isArray(sheet.content) || sheet.content.length < 2) {
    return { sheetId, tableName, hasIssues: false, issues: [] };
  }

  // 获取快照行数（含表头）
  const snapshotRowCount = snapshotSheet?.content?.length || 1;
  const currentRowCount = sheet.content.length;

  // 核心判断：只有当前行数 > 快照行数时，才有真正的新增行
  if (currentRowCount <= snapshotRowCount) {
    // 没有新增行，只是修改了现有行，不需要检测
    return { sheetId, tableName, hasIssues: false, issues: [] };
  }

  // 计算新增行的范围（content 数组索引，包含表头）
  // 新增行从 snapshotRowCount 开始（快照最后一行的下一行）
  const newRowStartContentIndex = snapshotRowCount;
  const newRowEndContentIndex = currentRowCount - 1;

  console.info(
    `[ACU IntegrityCheck] 表格 "${tableName}" 检测到新增行: ` +
      `快照${snapshotRowCount - 1}行 → 当前${currentRowCount - 1}行, ` +
      `新增行范围: 第${newRowStartContentIndex}~${newRowEndContentIndex}行(content索引)`,
  );

  const headers = sheet.content[0];
  const indexColIdx = headers.findIndex(h => String(h).trim() === config.indexColumnName);

  // 如果没有编码索引列，跳过检测
  if (indexColIdx === -1) {
    console.info(`[ACU IntegrityCheck] 表格 "${tableName}" 没有编码索引列，跳过检测`);
    return { sheetId, tableName, hasIssues: false, issues: [] };
  }

  // 获取快照最后一条的编码索引（AI填表前的最后一条）
  let lastSnapshotIndex: number | null = null;
  if (snapshotSheet?.content && snapshotSheet.content.length > 1) {
    const snapshotLastRow = snapshotSheet.content[snapshotSheet.content.length - 1];
    lastSnapshotIndex = extractNumber(snapshotLastRow[indexColIdx]);
  }

  // 只检测新增行范围内的行
  for (let contentRowIndex = newRowStartContentIndex; contentRowIndex <= newRowEndContentIndex; contentRowIndex++) {
    const row = sheet.content[contentRowIndex];
    const rowIndex = contentRowIndex - 1; // 转换为数据行索引（不含表头）

    // 可选：检查这行是否确实是 AI 变更的（如果 aiChangedRows 没有包含这行，可能是手动添加的）
    // 但通常新增行都是 AI 填的，这里先不做额外过滤

    // 检测 1: 检查 AI 新增行是否有空列
    if (config.checkEmptyCell) {
      for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        const cellValue = row[colIdx];
        const strValue = cellValue !== undefined && cellValue !== null ? String(cellValue).trim() : '';

        if (strValue === '') {
          issues.push({
            sheetId,
            tableName,
            rowIndex,
            colIndex: colIdx,
            issueType: 'empty_cell',
            description: `AI新增的第 ${contentRowIndex} 行，"${headers[colIdx]}" 列为空`,
            currentValue: '',
          });
        }
      }
    }

    // 检测 2: 检查编码索引连续性
    if (config.checkIndexGap) {
      const currentIndex = extractNumber(row[indexColIdx]);

      if (contentRowIndex === newRowStartContentIndex && lastSnapshotIndex !== null && currentIndex !== null) {
        // 第一个新增行，与快照最后一条比较
        if (currentIndex !== lastSnapshotIndex + 1) {
          issues.push({
            sheetId,
            tableName,
            rowIndex,
            colIndex: indexColIdx,
            issueType: 'index_gap',
            description: `AI新增行索引从 ${lastSnapshotIndex} 跳到 ${currentIndex}`,
            currentValue: String(row[indexColIdx] ?? ''),
            expectedValue: String(lastSnapshotIndex + 1),
          });
        }
      } else if (contentRowIndex > newRowStartContentIndex) {
        // 后续新增行，与前一个新增行比较
        const prevContentRowIndex = contentRowIndex - 1;
        const prevRow = sheet.content[prevContentRowIndex];
        const prevIndex = extractNumber(prevRow[indexColIdx]);

        if (prevIndex !== null && currentIndex !== null && currentIndex !== prevIndex + 1) {
          issues.push({
            sheetId,
            tableName,
            rowIndex,
            colIndex: indexColIdx,
            issueType: 'index_gap',
            description: `AI新增行之间索引从 ${prevIndex} 跳到 ${currentIndex}`,
            currentValue: String(row[indexColIdx] ?? ''),
            expectedValue: String(prevIndex + 1),
          });
        }
      }
    }
  }

  return {
    sheetId,
    tableName,
    hasIssues: issues.length > 0,
    issues,
  };
}

// ============================================================
// Composable
// ============================================================

/**
 * 表格完整性检测 Composable
 * @param config 检测配置（可选）
 */
export function useTableIntegrityCheck(config: Partial<IntegrityCheckConfig> = {}) {
  const mergedConfig: IntegrityCheckConfig = { ...DEFAULT_CONFIG, ...config };

  /** 检测结果映射：tableName -> 问题列表 */
  const issuesByTable = ref<Map<string, IntegrityIssue[]>>(new Map());

  /** 所有问题列表 */
  const allIssues = computed(() => {
    const result: IntegrityIssue[] = [];
    issuesByTable.value.forEach(issues => {
      result.push(...issues);
    });
    return result;
  });

  /** 是否有问题 */
  const hasIssues = computed(() => allIssues.value.length > 0);

  /** 有问题的表格名称列表 */
  const problematicTables = computed(() => {
    const tables: string[] = [];
    issuesByTable.value.forEach((issues, tableName) => {
      if (issues.length > 0) {
        tables.push(tableName);
      }
    });
    return tables;
  });

  /** 问题数量统计 */
  const issueStats = computed(() => {
    let emptyCount = 0;
    let gapCount = 0;

    allIssues.value.forEach(issue => {
      if (issue.issueType === 'empty_cell') emptyCount++;
      if (issue.issueType === 'index_gap') gapCount++;
    });

    return {
      total: allIssues.value.length,
      emptyCell: emptyCount,
      indexGap: gapCount,
    };
  });

  /**
   * 执行完整性检测（新版：基于 aiDiffMap）
   * 只检测 AI 填表新增的行，刷新/保存后警告消失
   *
   * @param data 当前数据
   * @param snapshot 快照数据（AI填表前）
   * @param aiDiffMap AI 变更映射
   */
  function checkIntegrity(
    data: RawDatabaseData | null,
    snapshot?: RawDatabaseData | null,
    aiDiffMap?: Set<string>,
  ): void {
    const newIssuesMap = new Map<string, IntegrityIssue[]>();

    // 如果没有 AI 变更，清除所有警告
    if (!data || !aiDiffMap || aiDiffMap.size === 0) {
      issuesByTable.value = newIssuesMap;
      return;
    }

    // 从 aiDiffMap 中解析出每个表格的 AI 变更行
    const tableAiRows = new Map<string, Set<number>>();
    for (const key of aiDiffMap) {
      const tableName = extractTableNameFromKey(key);
      const rowIndex = extractRowIndexFromKey(key);

      if (tableName && rowIndex !== null) {
        if (!tableAiRows.has(tableName)) {
          tableAiRows.set(tableName, new Set());
        }
        tableAiRows.get(tableName)!.add(rowIndex);
      }
    }

    // 检测每个有 AI 变更的表格
    for (const sheetId in data) {
      // 跳过非表格数据
      if (sheetId === 'mate' || sheetId === 'updated' || sheetId === 'created' || sheetId.startsWith('_')) {
        continue;
      }

      const sheet = data[sheetId];
      if (!sheet || !sheet.name) continue;

      const tableName = sheet.name;
      const aiChangedRows = tableAiRows.get(tableName);

      // 如果这个表格没有 AI 变更，跳过
      if (!aiChangedRows || aiChangedRows.size === 0) {
        continue;
      }

      // 获取快照中对应的表格
      let snapshotSheet: { name?: string; content?: (string | number)[][] } | null = null;
      if (snapshot) {
        for (const snapSheetId in snapshot) {
          if (snapshot[snapSheetId]?.name === tableName) {
            snapshotSheet = snapshot[snapSheetId];
            break;
          }
        }
      }

      const result = checkTableIntegrity(sheetId, sheet, snapshotSheet, aiChangedRows, mergedConfig);

      if (result.hasIssues) {
        newIssuesMap.set(result.tableName, result.issues);
        console.warn(`[ACU IntegrityCheck] 表格 "${result.tableName}" 发现 ${result.issues.length} 个问题`);
      }
    }

    issuesByTable.value = newIssuesMap;

    if (hasIssues.value) {
      console.warn(`[ACU IntegrityCheck] 共发现 ${allIssues.value.length} 个完整性问题`);
    } else {
      console.info('[ACU IntegrityCheck] AI填表完整性检测通过');
    }
  }

  /**
   * 检查特定表格是否有问题
   * @param tableName 表格名称
   */
  function hasTableIssues(tableName: string): boolean {
    const issues = issuesByTable.value.get(tableName);
    return issues ? issues.length > 0 : false;
  }

  /**
   * 获取特定表格的问题列表
   * @param tableName 表格名称
   */
  function getTableIssues(tableName: string): IntegrityIssue[] {
    return issuesByTable.value.get(tableName) || [];
  }

  /**
   * 清除所有问题记录
   */
  function clearIssues(): void {
    issuesByTable.value = new Map();
  }

  /**
   * 生成问题摘要文本
   */
  function getSummaryText(): string {
    if (!hasIssues.value) return '所有表格完整性检测通过';

    const stats = issueStats.value;
    const parts: string[] = [];

    if (stats.emptyCell > 0) {
      parts.push(`${stats.emptyCell} 个空值`);
    }
    if (stats.indexGap > 0) {
      parts.push(`${stats.indexGap} 个索引断裂`);
    }

    return `发现 ${parts.join('、')}，共 ${stats.total} 个问题`;
  }

  return {
    // 状态
    issuesByTable,
    allIssues,
    hasIssues,
    problematicTables,
    issueStats,

    // 方法
    checkIntegrity,
    hasTableIssues,
    getTableIssues,
    clearIssues,
    getSummaryText,

    // 工具函数
    isSummaryOrOutlineTable,
  };
}

// ============================================================
// 导出工具函数供外部使用
// ============================================================

export { checkTableIntegrity, extractNumber };
