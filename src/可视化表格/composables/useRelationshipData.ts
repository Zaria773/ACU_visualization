/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * useRelationshipData.ts - 关系图数据计算 Composable
 *
 * 提取自 App.vue，负责：
 * - 从表格数据中提取关系图相关数据
 * - (Type check test)
 * - 计算关系表、角色表、势力表
 * - 提供 hasRelationshipData 判断
 */

import { computed, type Ref } from 'vue';
import type { ProcessedTable } from '../types';
import { isCharacterTable } from '../utils';

/**
 * 关系图数据计算 Composable
 * @param processedTables 处理后的表格数据（响应式）
 */
export function useRelationshipData(processedTables: Ref<ProcessedTable[]>) {
  /**
   * 获取关系表数据
   * 匹配包含"关系"、"relationship"、"relation"的表
   */
  const relationshipTable = computed<ProcessedTable | null>(() => {
    return (
      processedTables.value.find(t => {
        const name = t.name.toLowerCase();
        const id = t.id.toLowerCase();
        return name.includes('关系') || id.includes('relationship') || id.includes('relation');
      }) || null
    );
  });

  /**
   * 获取角色表列表
   * 使用 isCharacterTable 工具函数判断
   */
  const characterTables = computed<ProcessedTable[]>(() => {
    return processedTables.value.filter(t => isCharacterTable(t.name, t.id));
  });

  /**
   * 获取势力表数据
   * 匹配包含势力相关关键词的表
   */
  const factionTable = computed<ProcessedTable | null>(() => {
    const keywords = ['势力', 'faction', '组织', 'organization', '阵营', '帮派', '宗门', '门派', '派系'];
    return (
      processedTables.value.find(t => {
        const name = t.name.toLowerCase();
        const id = t.id.toLowerCase();
        return keywords.some(kw => name.includes(kw) || id.includes(kw));
      }) || null
    );
  });

  /**
   * 获取势力列表
   * 从角色表中提取有归属的势力
   */
  const factionList = computed<string[]>(() => {
    const factions = new Set<string>();

    // 从角色表中提取势力归属
    for (const table of characterTables.value) {
      // 查找势力/阵营列的索引
      const factionColIndex = table.headers.findIndex(h => {
        const lower = h.toLowerCase();
        return lower.includes('势力') || lower.includes('阵营') || lower.includes('faction');
      });

      if (factionColIndex >= 0) {
        for (const row of table.rows) {
          const cell = row.cells.find(c => c.colIndex === factionColIndex);
          if (cell && cell.value && cell.value.trim()) {
            factions.add(cell.value.trim());
          }
        }
      }
    }

    return Array.from(factions);
  });

  /**
   * 是否有关系图相关数据
   * 用于控制关系图 Tab 的显示
   */
  const hasRelationshipData = computed(() => {
    return characterTables.value.length > 0;
  });

  return {
    /** 关系表数据 */
    relationshipTable,
    /** 角色表列表 */
    characterTables,
    /** 势力表数据 */
    factionTable,
    /** 势力列表（从角色表提取） */
    factionList,
    /** 是否有关系图数据 */
    hasRelationshipData,
  };
}
