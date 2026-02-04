<template>
  <div class="acu-options-panel">
    <!-- 面板头部 -->
    <div class="acu-panel-header acu-options-header">
      <div class="acu-panel-title acu-options-title">
        <i class="fa-solid fa-list-check"></i>
        选项聚合
      </div>
      <div class="acu-header-actions">
        <span class="acu-options-count">{{ optionTables.length }} 个选项表</span>
        <button class="acu-icon-btn acu-close-btn" title="返回仪表盘" @click.stop="handleBackToDashboard">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>

    <!-- 内容滚动区域 -->
    <div class="acu-panel-content acu-options-content">
      <!-- 空状态 -->
      <div v-if="optionTables.length === 0" class="acu-empty-state">未找到名称包含"选项"的表格</div>

      <!-- 选项表格列表 -->
      <div v-else class="acu-options-list">
        <div v-for="table in optionTables" :key="table.id" class="acu-dash-card">
          <!-- 表格标题 -->
          <div class="acu-dash-title">{{ table.name }}</div>

          <!-- 选项行列表 -->
          <div class="acu-option-rows">
            <template v-for="(optionItem, optIdx) in getOptionItems(table)" :key="optIdx">
              <div
                class="acu-embedded-option-row"
                :title="'点击追加'"
                @click="handleOptionClick(optionItem.text)"
                @mouseover="handleOptionHover($event, true)"
                @mouseout="handleOptionHover($event, false)"
                @mousedown="handleOptionMouseDown($event)"
                @mouseup="handleOptionMouseUp($event)"
              >
                <!-- 标签区域 -->
                <div class="acu-embedded-option-tags">
                  <span v-for="(tag, tagIdx) in optionItem.tags" :key="tagIdx" class="acu-badge">
                    {{ tag }}
                  </span>
                </div>
                <!-- 选项文本 -->
                <div class="acu-embedded-option-text">{{ optionItem.text }}</div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * OptionsPanel 选项聚合面板组件
 *
 * 功能：
 * - 自动检测并聚合所有名称包含"选项"的表格
 * - 支持矩阵模式检测（表头有多个"选项/Option/分支"字段）
 * - 点击选项追加文本到酒馆输入框
 */

import { computed } from 'vue';
import { useCoreActions } from '../composables/useCoreActions';
import { toast } from '../composables/useToast';
import { TAB_DASHBOARD, useUIStore } from '../stores';
import type { ProcessedTable } from '../types';
import { isOptionTable, parseOptionItems, type OptionItem } from '../utils/optionParser';

interface Props {
  /** 所有表格数据 */
  tables: ProcessedTable[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 导航到表格 */
  navigate: [tableId: string];
  /** 选项点击 */
  optionClick: [text: string];
}>();

// ============================================================
// Composables & Stores
// ============================================================

const { setInput } = useCoreActions();
const uiStore = useUIStore();

// ============================================================
// 计算属性
// ============================================================

/** 获取所有包含"选项"的表格 */
const optionTables = computed(() => {
  return props.tables.filter(t => isOptionTable(t.name));
});

// ============================================================
// 选项数据处理 (使用共享的解析函数)
// ============================================================

/**
 * 获取表格的所有选项项
 * 使用共享的 parseOptionItems 函数
 */
function getOptionItems(table: ProcessedTable): OptionItem[] {
  return parseOptionItems(table);
}

// ============================================================
// 事件处理
// ============================================================

/** 选项点击 - 追加到输入框 */
function handleOptionClick(text: string): void {
  setInput(text);
  emit('optionClick', text);

  // Toast 提示
  toast.success('已追加到输入框');
}

/** 选项悬停效果 */
function handleOptionHover(event: MouseEvent, isHover: boolean): void {
  const target = event.currentTarget as HTMLElement;
  if (isHover) {
    target.style.background = 'var(--acu-table-hover)';
    target.style.borderColor = 'var(--acu-title-color)';
  } else {
    target.style.background = 'rgba(255,255,255,0.05)';
    target.style.borderColor = 'var(--acu-border)';
  }
}

/** 选项按下效果 */
function handleOptionMouseDown(event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement;
  target.style.transform = 'translateY(1px)';
}

/** 选项松开效果 */
function handleOptionMouseUp(event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement;
  target.style.transform = 'translateY(0)';
}

/** 返回仪表盘 */
function handleBackToDashboard(): void {
  uiStore.setActiveTab(TAB_DASHBOARD);
}
</script>
