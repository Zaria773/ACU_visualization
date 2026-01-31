<template>
  <div v-if="visible" class="acu-modal-container" @click.self="handleClose">
    <div class="acu-modal acu-history-modal" :class="{ 'acu-mobile-edit-mode': isEditMode }">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <!-- 移动端拖动把手 -->
        <div class="acu-drag-handle acu-mobile-only"></div>

        <span class="acu-modal-title">
          <i class="fas fa-history"></i>
          历史记录 - {{ displayTitle }}
        </span>
        <!-- PC端在头部显示完成按钮 -->
        <button class="acu-close-pill acu-pc-only" @click="handleClose">完成</button>
      </div>

      <!-- PC 端布局：左右分栏（使用 CSS 媒体查询控制显示） -->
      <div class="acu-history-layout acu-pc-layout">
        <!-- 左侧：历史记录列表 -->
        <div class="acu-history-sidebar" :style="{ width: `${cardWidth + 64}px` }">
          <div v-if="isLoading" class="acu-loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <span>加载历史记录...</span>
          </div>
          <div v-else-if="snapshots.length === 0" class="acu-empty-hint">
            <i class="fas fa-history"></i>
            <span>暂无历史记录</span>
          </div>
          <div v-else class="acu-history-list">
            <details
              v-for="(snapshot, index) in snapshots"
              :key="snapshot.id || snapshot.timestamp"
              :open="index === 0"
              class="acu-history-item"
              @toggle="handleSnapshotToggle(snapshot, $event)"
            >
              <summary class="acu-history-summary">
                <span class="acu-history-badge" :class="snapshot.source">
                  {{ snapshot.source === 'manual' ? '手动' : 'AI' }}
                </span>
                <span class="acu-history-title"> #{{ index + 1 }} {{ getSnapshotDisplayTitle(snapshot) }} </span>
                <span class="acu-history-time">{{ formatRelativeTime(snapshot.timestamp) }}</span>
              </summary>
              <div class="acu-history-card-wrapper">
                <DataCard
                  :data="snapshotToTableRowLocal(snapshot)"
                  :table-name="tableName"
                  :table-id="tableId"
                  view-mode="list"
                  :show-header="false"
                  :show-index="false"
                  :show-history-button="false"
                  :title-col-index="computedTitleColIndex"
                  :custom-highlights="isEditMode ? getSnapshotDiff(snapshot) : undefined"
                  :allow-edit="false"
                  @cell-click="(rowIndex: number, colIndex: number) => handleHistoryCellClick(snapshot, colIndex)"
                />
              </div>
            </details>
          </div>
        </div>

        <!-- 右侧：当前卡片 + 操作区 -->
        <div class="acu-history-main" :style="{ width: `${cardWidth + 64}px` }">
          <div class="acu-current-card-label">
            <i class="fas fa-file-alt"></i>
            当前版本
            <span v-if="tempChanges.size > 0" class="acu-changes-count"> (已修改 {{ tempChanges.size }} 处) </span>
          </div>
          <div class="acu-current-card">
            <DataCard
              :key="`current-pc-${changedColsKey}`"
              :data="currentRowDataWithChanges"
              :table-name="tableName"
              :table-id="tableId"
              view-mode="list"
              :show-header="true"
              :show-index="true"
              :show-history-button="false"
              :title-col-index="computedTitleColIndex"
              :custom-highlights="changedCols"
            />
          </div>

          <!-- 操作按钮 -->
          <div class="acu-history-actions">
            <button v-if="!isEditMode" class="acu-modal-btn primary acu-btn-start-edit" @click="startEdit">
              <i class="fas fa-edit"></i> 启动编辑
            </button>
            <template v-else>
              <button class="acu-modal-btn primary" :disabled="!selectedSnapshot" @click="applyWholeCard">
                <i class="fas fa-layer-group"></i> 整卡覆盖
              </button>
              <button class="acu-modal-btn secondary" :disabled="undoStack.length === 0" @click="undo">
                <i class="fas fa-undo"></i> 撤销
              </button>
              <button class="acu-modal-btn secondary" @click="exitEdit"><i class="fas fa-times"></i> 退出编辑</button>
            </template>
          </div>

          <!-- 提示信息 -->
          <div class="acu-config-hint">
            <i class="fas fa-info-circle"></i>
            <span v-if="!isEditMode">点击"启动编辑"开始修改</span>
            <span v-else>点击左侧历史卡片的单元格进行覆盖</span>
          </div>
        </div>
      </div>

      <!-- 移动端布局：全屏分区（使用 CSS 媒体查询控制显示） -->
      <div class="acu-history-layout acu-mobile-layout" :class="{ 'acu-mobile-edit-mode': isEditMode }">
        <!-- 非编辑模式：只显示历史列表 -->
        <template v-if="!isEditMode">
          <div class="acu-history-mobile-list">
            <div v-if="isLoading" class="acu-loading-state">
              <i class="fas fa-spinner fa-spin"></i>
              <span>加载历史记录...</span>
            </div>
            <div v-else-if="snapshots.length === 0" class="acu-empty-hint">
              <i class="fas fa-history"></i>
              <span>暂无历史记录</span>
            </div>
            <div v-else class="acu-history-list">
              <details
                v-for="(snapshot, index) in snapshots"
                :key="snapshot.id || snapshot.timestamp"
                :open="index === 0"
                class="acu-history-item"
                @toggle="handleSnapshotToggle(snapshot, $event)"
              >
                <summary class="acu-history-summary">
                  <span class="acu-history-badge" :class="snapshot.source">
                    {{ snapshot.source === 'manual' ? '手动' : 'AI' }}
                  </span>
                  <span class="acu-history-title"> #{{ index + 1 }} {{ getSnapshotDisplayTitle(snapshot) }} </span>
                  <span class="acu-history-time">{{ formatRelativeTime(snapshot.timestamp) }}</span>
                </summary>
                <div class="acu-history-card-wrapper">
                  <DataCard
                    :data="snapshotToTableRowLocal(snapshot)"
                    :table-name="tableName"
                    :table-id="tableId"
                    view-mode="list"
                    :show-header="false"
                    :show-index="false"
                    :show-history-button="false"
                    :title-col-index="computedTitleColIndex"
                    :allow-edit="false"
                  />
                </div>
              </details>
            </div>
          </div>

          <!-- 非编辑模式底部按钮 -->
          <div class="acu-mobile-actions">
            <button
              class="acu-btn-preview"
              @touchstart.prevent="handlePreviewStart"
              @touchend.prevent="handlePreviewEnd"
              @mousedown="handlePreviewStart"
              @mouseup="handlePreviewEnd"
              @mouseleave="handlePreviewEnd"
            >
              <i class="fas fa-eye"></i> 预览最新
            </button>
            <button class="acu-btn-primary" @click="startEdit"><i class="fas fa-edit"></i> 启动编辑</button>
            <button class="acu-btn-done" @click="handleClose"><i class="fas fa-check"></i> 完成</button>
          </div>
        </template>

        <!-- 编辑模式：上下分屏 -->
        <template v-else>
          <!-- 上半部分：历史记录滚动区 -->
          <div class="acu-mobile-history-section">
            <div class="acu-section-label"><i class="fas fa-history"></i> 历史记录（点击单元格覆盖）</div>
            <div class="acu-history-scroll">
              <div v-if="snapshots.length === 0" class="acu-empty-hint">
                <i class="fas fa-history"></i>
                <span>暂无历史记录</span>
              </div>
              <div v-else class="acu-history-list">
                <details
                  v-for="(snapshot, index) in snapshots"
                  :key="snapshot.id || snapshot.timestamp"
                  :open="index === 0"
                  class="acu-history-item"
                  @toggle="handleSnapshotToggle(snapshot, $event)"
                >
                  <summary class="acu-history-summary">
                    <span class="acu-history-badge" :class="snapshot.source">
                      {{ snapshot.source === 'manual' ? '手动' : 'AI' }}
                    </span>
                    <span class="acu-history-title"> #{{ index + 1 }} {{ getSnapshotDisplayTitle(snapshot) }} </span>
                    <span class="acu-history-time">{{ formatRelativeTime(snapshot.timestamp) }}</span>
                  </summary>
                  <div class="acu-history-card-wrapper">
                    <DataCard
                      :data="snapshotToTableRowLocal(snapshot)"
                      :table-name="tableName"
                      :table-id="tableId"
                      view-mode="list"
                      :show-header="false"
                      :show-index="false"
                      :show-history-button="false"
                      :title-col-index="computedTitleColIndex"
                      :custom-highlights="getSnapshotDiff(snapshot)"
                      :allow-edit="false"
                      @cell-click="(rowIndex: number, colIndex: number) => handleHistoryCellClick(snapshot, colIndex)"
                    />
                  </div>
                </details>
              </div>
            </div>
          </div>

          <!-- 下半部分：当前版本滚动区 -->
          <div class="acu-mobile-current-section">
            <div class="acu-section-label">
              <i class="fas fa-file-alt"></i> 当前版本
              <span v-if="tempChanges.size > 0" class="acu-changes-count">(已修改 {{ tempChanges.size }} 处)</span>
            </div>
            <div class="acu-current-scroll">
              <DataCard
                :key="`current-mobile-${changedColsKey}`"
                :data="currentRowDataWithChanges"
                :table-name="tableName"
                :table-id="tableId"
                view-mode="list"
                :show-header="true"
                :show-index="true"
                :show-history-button="false"
                :title-col-index="computedTitleColIndex"
                :custom-highlights="changedCols"
              />
            </div>
          </div>

          <!-- 编辑模式底部按钮 -->
          <div class="acu-mobile-actions">
            <button :disabled="undoStack.length === 0" @click="undo"><i class="fas fa-undo"></i> 撤销</button>
            <button class="acu-btn-primary" :disabled="!selectedSnapshot" @click="applyWholeCard">
              <i class="fas fa-layer-group"></i> 整卡覆盖
            </button>
            <button @click="exitEdit"><i class="fas fa-times"></i> 退出编辑</button>
            <button class="acu-btn-done" @click="handleClose"><i class="fas fa-check"></i> 完成</button>
          </div>
        </template>

        <!-- 预览悬浮层 -->
        <Transition name="preview-fade">
          <div v-if="isPreviewing" class="acu-preview-overlay">
            <DataCard
              :data="currentRowDataWithChanges"
              :table-name="tableName"
              :table-id="tableId"
              view-mode="list"
              :show-header="true"
              :show-index="true"
              :show-history-button="false"
              :title-col-index="computedTitleColIndex"
            />
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * HistoryDialog - 历史记录弹窗
 *
 * 功能：
 * - 显示行的历史快照列表（最多5条）
 * - 支持左右对比（PC端）或上下分屏（移动端）
 * - 启动编辑模式后，点击历史单元格可覆盖当前值
 * - 支持整卡覆盖和撤销操作
 * - 移动端支持按住预览当前版本
 * - 特殊标题提取规则：总结/大纲表使用索引/编号/代码列
 * - 只有在"完成"时才保存历史记录，避免产生垃圾数据
 */

import { computed, ref, watch } from 'vue';
import { useIsMobile, useRowHistory, type RowSnapshot } from '../../../composables';
import { useConfigStore } from '../../../stores/useConfigStore';
import { useDataStore } from '../../../stores/useDataStore';
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
  /** 标题列索引（可选，若不传则自动计算） */
  titleColIndex?: number;
  /** 表头列表（用于特殊标题提取） */
  headers?: string[];
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  currentRowData: null,
  titleColIndex: -1, // -1 表示自动计算
  headers: () => [],
});

const emit = defineEmits<{
  'update:visible': [value: boolean];
  close: [];
  apply: [changes: Map<number, string>];
}>();

const configStore = useConfigStore();
const dataStore = useDataStore();
const { getSnapshots, snapshotToTableRow, tableRowToCells, formatRelativeTime, getDiff, getCurrentChatId } =
  useRowHistory();
const { isMobile } = useIsMobile();

// ============================================================
// 状态
// ============================================================

/** 历史快照列表 */
const snapshots = ref<RowSnapshot[]>([]);
/** 加载中 */
const isLoading = ref(false);
/** 是否进入编辑模式 */
const isEditMode = ref(false);
/** 临时修改的单元格 (colIndex -> value) */
const tempChanges = ref<Map<number, string>>(new Map());
/** 撤销栈 */
const undoStack = ref<Array<Map<number, string>>>([]);
/** 当前选中的快照（用于整卡覆盖） */
const selectedSnapshot = ref<RowSnapshot | null>(null);
/** 移动端：是否正在预览 */
const isPreviewing = ref(false);
/** 记录打开弹窗时的表格和行信息，用于防止数据窜卡 */
const openedTableName = ref('');
const openedRowIndex = ref(-1);

// ============================================================
// 计算属性
// ============================================================

/** 卡片宽度（用户设置） */
const cardWidth = computed(() => configStore.config.cardWidth || 280);

/**
 * 计算标题列索引
 * 对于 '总结' 或 '大纲' 类型的表，查找 '索引'/'编号'/'代码' 列
 * 否则使用默认值 1（跳过第一个 null 列）
 */
const computedTitleColIndex = computed(() => {
  // 如果外部传入了有效值，使用外部值
  if (props.titleColIndex >= 0) {
    return props.titleColIndex;
  }

  // 检查是否是 '总结' 或 '大纲' 表
  if (props.tableName.includes('总结') || props.tableName.includes('大纲')) {
    // 从表头查找包含 '索引'/'编号'/'代码' 的列
    if (props.headers.length > 0) {
      const idx = props.headers.findIndex(h => h && (h.includes('索引') || h.includes('编号') || h.includes('代码')));
      if (idx > 0) {
        return idx;
      }
    }
    // 从当前行数据的 cells 中查找
    if (props.currentRowData) {
      const idx = props.currentRowData.cells.findIndex(
        cell => cell.key && (cell.key.includes('索引') || cell.key.includes('编号') || cell.key.includes('代码')),
      );
      if (idx > 0) {
        return idx;
      }
    }
  }
  // 默认返回 1（跳过第一个 null 列）
  return 1;
});

/** 显示标题（表名 + 行标题） */
const displayTitle = computed(() => {
  const titleValue = getTitleValue(props.currentRowData);
  if (titleValue) {
    return `${props.tableName} - ${titleValue}`;
  }
  return props.tableName;
});

/** 已修改的列索引集合（用于高亮） */
const changedCols = computed(() => {
  return new Set(tempChanges.value.keys());
});

/** 用于强制 DataCard 重新渲染的 key */
const changedColsKey = computed(() => {
  return [...tempChanges.value.entries()].map(([k, v]) => `${k}:${v.substring(0, 10)}`).join(',');
});

/** 应用临时修改后的当前行数据 */
const currentRowDataWithChanges = computed((): TableRow => {
  if (!props.currentRowData) {
    return { index: 0, key: '', cells: [] };
  }

  if (tempChanges.value.size === 0) {
    return props.currentRowData;
  }

  return {
    index: props.currentRowData.index,
    key: props.currentRowData.key,
    cells: props.currentRowData.cells.map((cell, colIndex) => {
      if (tempChanges.value.has(colIndex)) {
        return {
          ...cell,
          value: tempChanges.value.get(colIndex)!,
        };
      }
      return cell;
    }),
  };
});

// ============================================================
// 方法
// ============================================================

/**
 * 获取行的标题值
 */
function getTitleValue(row: TableRow | null): string {
  if (!row) return '';
  const titleIdx = computedTitleColIndex.value;
  if (titleIdx >= 0 && row.cells.length > titleIdx) {
    const value = row.cells[titleIdx]?.value;
    return value !== undefined ? String(value) : '';
  }
  return '';
}

/**
 * 获取快照的显示标题
 */
function getSnapshotDisplayTitle(snapshot: RowSnapshot): string {
  const titleIdx = computedTitleColIndex.value;
  if (titleIdx >= 0 && snapshot.cells[titleIdx]) {
    return snapshot.cells[titleIdx];
  }
  return '';
}

/**
 * 将快照转换为 TableRow
 */
function snapshotToTableRowLocal(snapshot: RowSnapshot): TableRow {
  if (!props.currentRowData) {
    return { index: 0, key: '', cells: [] };
  }
  return snapshotToTableRow(snapshot, props.currentRowData);
}

/**
 * 获取快照与当前数据的差异（用于高亮显示不同的单元格）
 */
function getSnapshotDiff(snapshot: RowSnapshot): Set<number> {
  const currentCells = tableRowToCells(currentRowDataWithChanges.value);
  return getDiff(snapshot, currentCells);
}

/**
 * 处理快照展开/折叠
 */
function handleSnapshotToggle(snapshot: RowSnapshot, event: Event) {
  const details = event.target as HTMLDetailsElement;
  if (details.open && isEditMode.value) {
    selectedSnapshot.value = snapshot;
  }
}

/**
 * 启动编辑模式
 */
function startEdit() {
  isEditMode.value = true;
  tempChanges.value = new Map();
  undoStack.value = [];
  selectedSnapshot.value = snapshots.value.length > 0 ? snapshots.value[0] : null;
}

/**
 * 退出编辑模式
 */
function exitEdit() {
  isEditMode.value = false;
  tempChanges.value = new Map();
  undoStack.value = [];
  selectedSnapshot.value = null;
}

/**
 * 点击历史卡片的单元格
 */
function handleHistoryCellClick(snapshot: RowSnapshot, colIndex: number) {
  if (!isEditMode.value) return;

  // 更新选中的快照
  selectedSnapshot.value = snapshot;

  // 保存当前状态到撤销栈
  undoStack.value.push(new Map(tempChanges.value));

  // 获取快照中该列的值
  const value = snapshot.cells[colIndex];
  if (value !== undefined) {
    // 使用新 Map 替换以确保 Vue 响应式更新
    const newChanges = new Map(tempChanges.value);
    newChanges.set(colIndex, value);
    tempChanges.value = newChanges;
  }
}

/**
 * 整卡覆盖
 */
function applyWholeCard() {
  if (!selectedSnapshot.value) return;

  // 保存当前状态到撤销栈
  undoStack.value.push(new Map(tempChanges.value));

  // 应用整个快照的所有单元格
  const newChanges = new Map<number, string>();
  for (const [key, value] of Object.entries(selectedSnapshot.value.cells)) {
    newChanges.set(Number(key), value);
  }
  tempChanges.value = newChanges;
}

/**
 * 撤销
 */
function undo() {
  if (undoStack.value.length === 0) return;
  // 使用新 Map 替换以确保 Vue 响应式更新
  tempChanges.value = new Map(undoStack.value.pop()!);
}

/**
 * 移动端预览开始
 */
function handlePreviewStart() {
  isPreviewing.value = true;
}

/**
 * 移动端预览结束
 */
function handlePreviewEnd() {
  isPreviewing.value = false;
}

/**
 * 关闭弹窗
 * 如果有临时修改，先应用到 dataStore
 * 注意：历史记录只在这里保存一次，避免产生垃圾数据
 */
function handleClose() {
  // 应用所有临时修改
  if (tempChanges.value.size > 0) {
    emit('apply', new Map(tempChanges.value));
  }
  emit('update:visible', false);
  emit('close');
}

/**
 * 重置所有状态
 */
function resetState() {
  snapshots.value = [];
  isEditMode.value = false;
  tempChanges.value = new Map();
  undoStack.value = [];
  selectedSnapshot.value = null;
  isPreviewing.value = false;
}

/**
 * 加载历史快照
 */
async function loadSnapshots() {
  isLoading.value = true;
  try {
    console.info('[HistoryDialog] 加载历史快照, 参数:', {
      tableName: props.tableName,
      tableId: props.tableId,
      rowIndex: props.rowIndex,
    });
    snapshots.value = await getSnapshots(props.tableName, props.rowIndex);
    console.info('[HistoryDialog] 加载到快照数量:', snapshots.value.length);
    if (snapshots.value.length > 0) {
      console.info('[HistoryDialog] 快照示例:', snapshots.value[0]);
    }
  } catch (e) {
    console.error('[HistoryDialog] 加载历史快照失败:', e);
    snapshots.value = [];
  } finally {
    isLoading.value = false;
  }
}

// ============================================================
// 生命周期
// ============================================================

// 监听 visible 变化来加载数据
watch(
  () => props.visible,
  newVisible => {
    if (newVisible) {
      console.info('[HistoryDialog] visible 变为 true，开始加载数据');
      // 记录打开时的表格和行信息
      openedTableName.value = props.tableName;
      openedRowIndex.value = props.rowIndex;
      // 重置状态并加载
      resetState();
      loadSnapshots();
    } else {
      // 关闭时重置状态
      resetState();
    }
  },
  { immediate: true },
);

// 监听 props 变化（同一个弹窗切换不同行时）
watch(
  () => [props.tableName, props.rowIndex],
  ([newTableName, newRowIndex]) => {
    if (props.visible) {
      // 检查是否切换了表格或行
      if (newTableName !== openedTableName.value || newRowIndex !== openedRowIndex.value) {
        console.info('[HistoryDialog] 行参数变化，重新加载数据');
        // 更新记录
        openedTableName.value = newTableName as string;
        openedRowIndex.value = newRowIndex as number;
        // 重置状态并加载
        resetState();
        loadSnapshots();
      }
    }
  },
);
</script>
