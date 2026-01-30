<template>
  <div class="acu-embedded-options">
    <!-- 空状态 -->
    <div v-if="optionTables.length === 0" class="acu-empty-hint">
      <i class="fas fa-inbox"></i>
      未找到名称包含"选项"的表格
    </div>

    <!-- 选项表格列表 -->
    <div v-else class="acu-embedded-options-list">
      <div v-for="table in optionTables" :key="table.id" class="acu-embedded-option-group">
        <!-- 选项行列表 -->
        <div class="acu-embedded-option-rows">
          <div
            v-for="(optionItem, optIdx) in getOptionItems(table)"
            :key="optIdx"
            class="acu-embedded-option-row"
            title="点击追加"
            @click.stop="handleOptionClick(optionItem.text)"
          >
            <!-- 标签区域 (Tag 在上) -->
            <div v-if="optionItem.tags.length > 0" class="acu-embedded-option-tags">
              <span v-for="(tag, tagIdx) in optionItem.tags" :key="tagIdx" class="acu-badge acu-option-tag">
                {{ tag }}
              </span>
            </div>
            <!-- 选项文本 (内容在下) -->
            <div class="acu-embedded-option-text">{{ optionItem.text }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 嵌入式选项聚合面板组件
 * 用于在仪表盘中展示所有选项表格
 */

import { computed } from 'vue';
import { useCoreActions } from '../../composables/useCoreActions';
import type { ProcessedTable } from '../../types';

// ============================================================
// Props
// ============================================================

interface Props {
  /** 所有表格数据 */
  tables: ProcessedTable[];
}

const props = defineProps<Props>();

// ============================================================
// Composables
// ============================================================

const { setInput } = useCoreActions();

// ============================================================
// Computed
// ============================================================

/** 所有名称包含"选项"的表格 */
const optionTables = computed(() => {
  return props.tables.filter(t => t.name.includes('选项') || t.name.toLowerCase().includes('option'));
});

// ============================================================
// 方法
// ============================================================

interface OptionItem {
  tags: string[];
  text: string;
}

/**
 * 解析表格中的选项项
 * 支持两种格式：
 * 1. 单行格式：每列是一个选项
 * 2. 多列格式：最后一列是选项文本，其他列作为标签
 */
function getOptionItems(table: ProcessedTable): OptionItem[] {
  if (!table || !table.rows) return [];

  return table.rows.map(row => {
    const cells = row.cells;
    if (cells.length === 0) {
      return { tags: [], text: '' };
    } else if (cells.length === 1) {
      // 单列：直接作为选项文本
      return { tags: [], text: String(cells[0].value) };
    } else {
      // 多列：最后一列是选项文本，其他列作为标签
      // 过滤掉空值
      const validCells = cells.filter(c => String(c.value).trim() !== '');

      if (validCells.length === 0) {
        return { tags: [], text: '' };
      } else if (validCells.length === 1) {
        return { tags: [], text: String(validCells[0].value) };
      }

      const tags = validCells
        .slice(0, -1)
        .map(c => String(c.value));
      const text = String(validCells[validCells.length - 1].value);
      return { tags, text };
    }
  });
}

/**
 * 点击选项时追加到输入框
 */
function handleOptionClick(text: string): void {
  if (text.trim()) {
    setInput(text.trim());
  }
}
</script>
