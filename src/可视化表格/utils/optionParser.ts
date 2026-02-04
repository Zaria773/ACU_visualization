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
 * 条件：表头有 >= 2 个含"选项/Option/分支"的字段
 */
export function isMatrixMode(table: ProcessedTable): { isMatrix: boolean; optionColIndices: number[] } {
  const headers = table.headers || [];
  const optionColIndices: number[] = [];

  headers.forEach((h, idx) => {
    if (h && /(选项|Option|分支)/i.test(String(h))) {
      optionColIndices.push(idx);
    }
  });

  return {
    isMatrix: optionColIndices.length >= 2,
    optionColIndices,
  };
}

/**
 * 解析表格中的所有选项项
 * 根据矩阵模式/普通模式分别处理
 *
 * 矩阵模式：每行可能有多个选项列，每个选项列单独生成一个选项项
 * 普通模式：每行最后一个有值单元格作为选项文本，其他作为标签
 */
export function parseOptionItems(table: ProcessedTable): OptionItem[] {
  if (!table || !table.rows) return [];

  const items: OptionItem[] = [];
  const { isMatrix, optionColIndices } = isMatrixMode(table);
  const headers = table.headers || [];

  table.rows.forEach(row => {
    const rowData = row.cells.map(c => String(c.value || '').trim());

    if (isMatrix) {
      // 矩阵模式：提取公共标签，每个选项列单独生成一个选项项
      const commonTags: string[] = [];
      rowData.forEach((cellText, idx) => {
        if (!optionColIndices.includes(idx) && cellText) {
          commonTags.push(cellText);
        }
      });

      optionColIndices.forEach(colIdx => {
        const cellText = rowData[colIdx];
        if (cellText) {
          const currentHeaderTag = headers[colIdx] || '';
          const allTags = [...commonTags];
          if (currentHeaderTag) {
            allTags.push(currentHeaderTag);
          }
          items.push({
            text: cellText,
            tags: allTags,
          });
        }
      });
    } else {
      // 普通模式：最后一个有值单元格作为选项文本，其他作为标签
      const validCells = rowData.filter(c => c !== '');
      if (validCells.length === 0) return;

      const targetText = validCells[validCells.length - 1];
      const tags = validCells.slice(0, validCells.length - 1);
      items.push({
        text: targetText,
        tags,
      });
    }
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
