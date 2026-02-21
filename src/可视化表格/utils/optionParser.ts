/**
 * 选项解析工具函数
 * 从 OptionsPanel.vue 抽取的通用选项解析逻辑
 * 供 OptionsPanel 和 EmbeddedOptionsPanel 复用
 */

import type { ProcessedTable } from '../types';

export interface OptionItem {
  text: string;
  tags: string[];
}

/**
 * 判断表格是否为矩阵模式
 * 只要是选项表，默认都视为矩阵模式
 * 1. 优先查找含"选项/Option/分支"的列
 * 2. 若无关键词，则默认第一列为标签，其余列均为选项
 */
export function isMatrixMode(table: ProcessedTable): { isMatrix: boolean; optionColIndices: number[] } {
  const headers = table.headers || [];
  const optionColIndices: number[] = [];

  // 1. 尝试通过关键词识别
  headers.forEach((h, idx) => {
    if (h && /(选项|Option|分支)/i.test(String(h))) {
      optionColIndices.push(idx);
    }
  });

  // 2. 兜底策略：如果没找到关键词，默认除了第一列以外的都是选项
  if (optionColIndices.length === 0 && headers.length > 0) {
    if (headers.length === 1) {
      // 只有一列，那它就是选项
      optionColIndices.push(0);
    } else {
      // 多列情况，第0列做标签，1~N列做选项
      for (let i = 1; i < headers.length; i++) {
        optionColIndices.push(i);
      }
    }
  }

  return {
    isMatrix: true, // 强制启用矩阵模式
    optionColIndices,
  };
}

/**
 * 解析表格中的所有选项项
 * 统一使用矩阵模式处理：每行可能有多个选项列，每个选项列单独生成一个选项项
 */
export function parseOptionItems(table: ProcessedTable): OptionItem[] {
  if (!table || !table.rows) return [];

  const items: OptionItem[] = [];
  const { optionColIndices } = isMatrixMode(table);
  const headers = table.headers || [];

  table.rows.forEach(row => {
    const rowData = row.cells.map(c => String(c.value || '').trim());

    // 1. 提取公共标签 (不属于选项列的列)
    const commonTags: string[] = [];
    rowData.forEach((cellText, idx) => {
      if (!optionColIndices.includes(idx) && cellText) {
        commonTags.push(cellText);
      }
    });

    // 2. 遍历选项列生成选项
    optionColIndices.forEach(colIdx => {
      const cellText = rowData[colIdx];
      if (cellText) {
        const currentHeaderTag = headers[colIdx] || '';
        const allTags = [...commonTags];
        // 只有当表头有内容时才作为标签添加
        if (currentHeaderTag) {
          allTags.push(currentHeaderTag);
        }
        items.push({
          text: cellText,
          tags: allTags,
        });
      }
    });
  });

  return items;
}

/**
 * 检查表格是否为选项表格
 * @param tableName 表格名称
 */
export function isOptionTable(tableName: string): boolean {
  return tableName.includes('选项') || tableName.toLowerCase().includes('option');
}
