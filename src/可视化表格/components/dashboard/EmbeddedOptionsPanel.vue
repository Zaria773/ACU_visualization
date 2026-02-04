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
              <span v-for="(tag, tagIdx) in optionItem.tags" :key="tagIdx" class="acu-badge">
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
import { toast } from '../../composables/useToast';
import type { ProcessedTable } from '../../types';
import { isOptionTable, parseOptionItems } from '../../utils/optionParser';

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
  return props.tables.filter(t => isOptionTable(t.name));
});

// ============================================================
// 方法
// ============================================================

/**
 * 获取表格的选项项（使用共享的解析函数）
 */
function getOptionItems(table: ProcessedTable) {
  return parseOptionItems(table);
}

/**
 * 点击选项时追加到输入框
 */
function handleOptionClick(text: string): void {
  if (text.trim()) {
    setInput(text.trim());
    toast.success('已追加到输入框');
  }
}
</script>
