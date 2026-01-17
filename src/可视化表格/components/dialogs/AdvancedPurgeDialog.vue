<template>
  <div v-if="visible" class="acu-modal-container acu-center-modal" @click.self="handleClose">
    <div ref="dialogRef" class="acu-modal acu-advanced-purge-modal">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <button class="acu-modal-back" @click="handleClose">
          <i class="fas fa-arrow-left"></i>
        </button>
        <span class="acu-modal-title">高级清除</span>
        <span></span>
      </div>

      <!-- 内容区 -->
      <div class="acu-modal-body">
        <!-- 楼层范围设置 -->
        <div class="acu-settings-section">
          <div class="acu-settings-title">
            <i class="fas fa-layer-group"></i>
            楼层范围
          </div>
          <div class="acu-settings-group">
            <div class="acu-purge-range-row">
              <input
                ref="startInputRef"
                v-model.number="startFloor"
                type="number"
                class="acu-purge-input"
                placeholder="起始"
                min="0"
                @keydown.enter="focusEndInput"
              />
              <span class="acu-purge-separator">—</span>
              <input
                ref="endInputRef"
                v-model.number="endFloor"
                type="number"
                class="acu-purge-input"
                placeholder="结束"
                min="0"
              />
            </div>
            <div class="acu-purge-range-hint">
              <i class="fas fa-info-circle"></i>
              输入 Chat 索引（从 0 开始）
            </div>
          </div>
        </div>

        <!-- 表格选择 -->
        <div class="acu-settings-section">
          <div class="acu-settings-title">
            <i class="fas fa-table"></i>
            选择要清除的表格
          </div>
          <div class="acu-table-selector acu-table-selector-compact">
            <div class="acu-table-selector-header">
              <button class="acu-quick-select-btn" :class="{ active: isAllSelected }" @click="handleSelectAll">
                <i class="fas fa-check-double"></i>
                全选
              </button>
              <button class="acu-quick-select-btn" @click="handleDeselectAll">
                <i class="fas fa-times"></i>
                清空
              </button>
            </div>
            <div class="acu-table-selector-list">
              <div
                v-for="table in availableTables"
                :key="table.key"
                class="acu-table-selector-item"
                :class="{ 'is-selected': selectedTableKeys.includes(table.key) }"
                @click="toggleTableSelection(table.key)"
              >
                <input
                  type="checkbox"
                  :checked="selectedTableKeys.includes(table.key)"
                  @click.stop
                  @change="toggleTableSelection(table.key)"
                />
                <span class="table-name">{{ table.name }}</span>
              </div>
              <div v-if="availableTables.length === 0" class="acu-table-selector-empty">
                <i class="fas fa-inbox"></i>
                暂无可用表格
              </div>
            </div>
            <div class="acu-table-selector-footer">
              已选择: {{ selectedTableKeys.length }}/{{ availableTables.length }} 个表格
            </div>
          </div>
        </div>

        <!-- 警告提示 -->
        <div class="acu-purge-warning">
          <i class="fas fa-exclamation-triangle"></i>
          <span>此操作将从指定楼层范围内删除选中表格的数据，操作不可撤销！</span>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="acu-modal-footer">
        <button class="acu-modal-btn secondary" @click="handleClose">取消</button>
        <button class="acu-modal-btn danger" :disabled="!canConfirm || isExecuting" @click="handleConfirm">
          <i v-if="isExecuting" class="fas fa-spinner fa-spin"></i>
          <i v-else class="fas fa-trash-alt"></i>
          {{ isExecuting ? '执行中...' : '确认清除' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AdvancedPurgeDialog - 高级清除弹窗
 *
 * 功能说明:
 * - 选择要清除的表格（多选）
 * - 指定楼层范围（起始-结束）
 * - 仅删除指定表格在指定楼层的数据，不删除表格结构
 */

import { onClickOutside } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { useDataPersistence } from '../../composables/useDataPersistence';
import { toast } from '../../composables/useToast';
import { getTableData } from '../../utils';

// ============================================================
// 类型定义
// ============================================================

interface TableInfo {
  key: string;
  name: string;
}

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  visible: boolean;
  initialStartFloor?: number;
  initialEndFloor?: number;
}

const props = withDefaults(defineProps<Props>(), {
  initialStartFloor: undefined,
  initialEndFloor: undefined,
});

const emit = defineEmits<{
  'update:visible': [value: boolean];
  confirm: [result: { changedCount: number; tables: string[] }];
}>();

// ============================================================
// Refs & State
// ============================================================

const dialogRef = ref<HTMLElement>();
const startInputRef = ref<HTMLInputElement>();
const endInputRef = ref<HTMLInputElement>();

const startFloor = ref<number | null>(null);
const endFloor = ref<number | null>(null);
const selectedTableKeys = ref<string[]>([]);
const availableTables = ref<TableInfo[]>([]);
const isExecuting = ref(false);

// ============================================================
// Composables
// ============================================================

const { purgeTableDataByRange } = useDataPersistence();

// ============================================================
// 计算属性
// ============================================================

/** 是否全选了所有表格 */
const isAllSelected = computed(() => {
  if (availableTables.value.length === 0) return false;
  return selectedTableKeys.value.length === availableTables.value.length;
});

/** 是否可以确认 */
const canConfirm = computed(() => {
  if (startFloor.value === null || endFloor.value === null) return false;
  if (isNaN(startFloor.value) || isNaN(endFloor.value)) return false;
  if (startFloor.value < 0 || endFloor.value < 0) return false;
  if (startFloor.value > endFloor.value) return false;
  if (selectedTableKeys.value.length === 0) return false;
  return true;
});

// ============================================================
// 生命周期 & 监听
// ============================================================

// 当弹窗打开时初始化
watch(
  () => props.visible,
  visible => {
    if (visible) {
      // 设置初始楼层范围
      startFloor.value = props.initialStartFloor ?? null;
      endFloor.value = props.initialEndFloor ?? null;
      selectedTableKeys.value = [];
      isExecuting.value = false;

      // 加载可用表格列表
      loadAvailableTables();

      // 注意：移除自动聚焦，避免移动端弹出键盘
    }
  },
);

// 点击外部关闭
onClickOutside(dialogRef, () => {
  if (!isExecuting.value) {
    handleClose();
  }
});

// ============================================================
// 方法
// ============================================================

/** 加载可用表格列表 */
function loadAvailableTables() {
  try {
    const rawData = getTableData();
    if (!rawData) {
      availableTables.value = [];
      return;
    }

    const tables: TableInfo[] = [];
    Object.keys(rawData).forEach(key => {
      if (!key.startsWith('sheet_')) return;
      const sheet = rawData[key];
      if (sheet && typeof sheet === 'object' && sheet.name) {
        tables.push({
          key,
          name: sheet.name as string,
        });
      }
    });

    availableTables.value = tables;
  } catch (e) {
    console.warn('[ACU] 加载表格列表失败:', e);
    availableTables.value = [];
  }
}

/** 切换表格选择 */
function toggleTableSelection(key: string) {
  const idx = selectedTableKeys.value.indexOf(key);
  if (idx === -1) {
    selectedTableKeys.value.push(key);
  } else {
    selectedTableKeys.value.splice(idx, 1);
  }
}

/** 全选 */
function handleSelectAll() {
  selectedTableKeys.value = availableTables.value.map(t => t.key);
}

/** 取消全选 */
function handleDeselectAll() {
  selectedTableKeys.value = [];
}

/** 聚焦到结束楼层输入框 */
function focusEndInput() {
  endInputRef.value?.focus();
}

/** 关闭弹窗 */
function handleClose() {
  emit('update:visible', false);
}

/** 确认清除 */
async function handleConfirm() {
  if (!canConfirm.value || isExecuting.value) return;

  isExecuting.value = true;

  try {
    const result = await purgeTableDataByRange(selectedTableKeys.value, startFloor.value!, endFloor.value!);

    if (result.changed) {
      const tableNames = selectedTableKeys.value
        .map(k => availableTables.value.find(t => t.key === k)?.name || k)
        .join(', ');
      toast.success(`已清除 ${result.changedCount} 层数据 (${tableNames})`);

      emit('confirm', {
        changedCount: result.changedCount,
        tables: selectedTableKeys.value,
      });
      handleClose();
    } else {
      toast.info('未找到需要清除的数据');
    }
  } catch (e) {
    console.error('[ACU] 高级清除失败:', e);
    toast.error('清除失败: ' + (e instanceof Error ? e.message : String(e)));
  } finally {
    isExecuting.value = false;
  }
}
</script>
