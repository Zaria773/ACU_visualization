<template>
  <div
    v-if="visible"
    class="acu-modal-container acu-row-edit-modal-container"
    :class="themeClass"
    @click.self="handleClose"
  >
    <div class="acu-modal acu-row-edit-modal">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <!-- 移动端拖动把手 -->
        <div class="acu-drag-handle acu-mobile-only"></div>

        <span class="acu-modal-title">
          <i class="fas fa-edit"></i>
          编辑 - {{ displayTitle }}
        </span>
        <!-- PC端在头部显示完成按钮 -->
        <button class="acu-close-pill acu-pc-only" @click.stop="handleSave">完成</button>
      </div>

      <!-- 内容区 -->
      <div class="acu-modal-body">
        <div class="acu-row-edit-content">
          <!-- 使用 DataCard 展示和编辑行数据 -->
          <DataCard
            v-if="currentRowData"
            :data="currentRowData"
            :table-name="tableName"
            :table-id="tableId"
            view-mode="list"
            :show-header="true"
            :show-index="true"
            :show-history-button="true"
            :title-col-index="titleColIndex"
            @show-history="handleShowHistory"
          />
        </div>
      </div>

      <!-- 底部留白适配移动端安全区 -->
      <div class="acu-bottom-spacer"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * RowEditDialog - 行编辑弹窗
 *
 * 功能：
 * - 在仪表盘中点击行末编辑按钮后打开
 * - 使用 DataCard 组件展示和编辑行数据
 * - 提供历史记录入口
 * - 复用历史记录弹窗的样式风格
 */

import { computed, watch } from 'vue';
import { useConfigStore } from '../../../stores/useConfigStore';
import type { TableRow } from '../../../types';
import DataCard from '../../DataCard.vue';

interface Props {
  /** 弹窗可见性 */
  visible?: boolean;
  /** 表格名称 */
  tableName: string;
  /** 表格ID */
  tableId: string;
  /** 行索引 */
  rowIndex: number;
  /** 当前行数据 */
  currentRowData: TableRow | null;
  /** 标题列索引 */
  titleColIndex?: number;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  currentRowData: null,
  titleColIndex: 1,
});

// 获取主题配置，确保 Teleport 后仍能继承主题样式
const configStore = useConfigStore();
const themeClass = computed(() => `acu-theme-${configStore.theme}`);

const emit = defineEmits<{
  'update:visible': [value: boolean];
  close: [];
  showHistory: [];
}>();

// ============================================================
// 计算属性
// ============================================================

/** 显示标题 */
const displayTitle = computed(() => {
  if (!props.currentRowData) return props.tableName;

  const titleIdx = props.titleColIndex;
  if (titleIdx >= 0 && props.currentRowData.cells.length > titleIdx) {
    const value = props.currentRowData.cells[titleIdx]?.value;
    if (value) {
      return `${props.tableName} - ${value}`;
    }
  }

  return `${props.tableName} - 第 ${props.rowIndex + 1} 行`;
});

// ============================================================
// 方法
// ============================================================

/** 关闭弹窗 */
function handleClose(): void {
  emit('update:visible', false);
  emit('close');
}

/** 保存并关闭 */
function handleSave(): void {
  // DataCard 内部已处理单元格编辑，这里直接关闭
  handleClose();
}

/** 显示历史记录 */
function handleShowHistory(): void {
  emit('showHistory');
}

// 监听可见性变化
watch(
  () => props.visible,
  newVal => {
    if (!newVal) {
      // 弹窗关闭时的清理工作
    }
  },
);
</script>
