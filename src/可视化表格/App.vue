<template>
  <div class="acu-app" :class="appClasses">
    <!-- 悬浮球 (面板隐藏时显示) -->
    <!-- :style 绑定在跨 iframe 脚本项目中是可用的（参考 src/手机界面） -->
    <FloatingBall ref="floatingBallRef" :style="{ display: uiStore.isPanelVisible ? 'none' : 'block' }" />

    <!-- 主面板 -->
    <!-- :style 绑定在跨 iframe 脚本项目中是可用的（参考 src/手机界面） -->
    <MainPanel
      ref="mainPanelRef"
      :style="{ display: uiStore.isPanelVisible ? 'flex' : 'none' }"
      :title="panelTitle"
      :theme="configStore.config.theme"
      :layout="configStore.config.layout"
      :is-collapsed="uiStore.isCollapsed"
      :is-pinned="uiStore.isPinned"
      :is-content-hidden="isContentHidden"
      :lock-panel="configStore.config.lockPanel"
      :has-changes="dataStore.hasUnsavedChanges"
      @refresh="handleRefresh"
      @save="handleSave"
      @save-as="showInputFloorDialog = true"
      @manual-update="handleManualUpdate"
      @purge="showPurgeRangeDialog = true"
      @open-native="handleOpenNative"
      @settings="showSettingsDialog = true"
      @toggle-pin="uiStore.togglePin"
      @toggle="handleToggle"
      @close="handlePanelClose"
      @hide-content="handleHideContent"
    >
      <!-- 标签栏插槽 -->
      <template #tabs>
        <TabBar
          :tabs="tabList"
          :active-tab="uiStore.activeTab"
          :show-dashboard="true"
          :has-options-tabs="hasOptionsTabs"
          :is-editing-order="uiStore.isEditingOrder"
          :grid-columns="configStore.gridColumnsCss"
          @tab-change="handleTabChange"
          @order-change="handleTabsReorder"
          @exit-editing="uiStore.setEditingOrder(false)"
        />
      </template>

      <!-- 动作按钮插槽 (使用默认) -->

      <!-- 内容区域 -->
      <template #default>
        <!-- 仪表盘视图 -->
        <Dashboard
          v-if="uiStore.activeTab === TAB_DASHBOARD"
          :tables="processedTables"
          @refresh="handleRefresh"
          @navigate="handleNavigateToTable"
          @cell-click="handleCellClick"
          @row-click="handleRowClick"
        />

        <!-- 选项面板视图 -->
        <OptionsPanel
          v-else-if="uiStore.activeTab === TAB_OPTIONS"
          :tables="optionsTables"
          @cell-click="handleCellClick"
          @toggle-delete="handleToggleDelete"
        />

        <!-- 普通表格视图 -->
        <DataTable
          v-else-if="currentTable"
          :key="uiStore.activeTab"
          :table-id="currentTable.id"
          :table-name="currentTable.name"
          :rows="currentTable.rows"
          :headers="currentTable.headers"
          :search-term="searchTerm"
          @cell-click="handleCellClick"
          @insert-row="handleInsertRow"
          @toggle-delete="handleToggleDelete"
          @context-menu="handleContextMenu"
          @search-change="searchTerm = $event"
          @close="handleTableClose"
          @height-drag-start="handleHeightDragStart"
          @height-reset="handleHeightReset"
        />

        <!-- 无数据状态 -->
        <div v-else class="acu-no-data">
          <i class="fas fa-inbox"></i>
          <p>请选择一个表格</p>
        </div>
      </template>
    </MainPanel>

    <!-- 右键菜单 -->
    <ContextMenu
      v-model:visible="contextMenuState.visible"
      :x="contextMenuState.x"
      :y="contextMenuState.y"
      :table-id="contextMenuState.tableId"
      :table-name="contextMenuState.tableName"
      :row-index="contextMenuState.rowIndex"
      @insert-row="handleContextInsertRow"
      @copy="handleContextCopy"
      @delete="handleContextDelete"
      @undo-delete="handleContextUndoDelete"
    />

    <!-- 设置弹窗 -->
    <SettingsDialog v-model:visible="showSettingsDialog" @save="handleSettingsSave" />

    <!-- 输入楼层弹窗 -->
    <InputFloorDialog
      v-model:visible="showInputFloorDialog"
      :current-floor="currentTargetFloor"
      @confirm="handleSaveToFloor"
    />

    <!-- 清除范围弹窗 -->
    <PurgeRangeDialog v-model:visible="showPurgeRangeDialog" :max-floor="maxFloorIndex" @confirm="handlePurgeRange" />

    <!-- 手动更新配置弹窗 -->
    <ManualUpdateDialog v-model:visible="showManualUpdateDialog" />

    <!-- 全局 Toast 通知 -->
    <Toast :visible="toastState.visible" :message="toastState.message" :type="toastState.type" />
  </div>
</template>

<script setup lang="ts">
/**
 * App.vue - ACU 可视化表格根组件
 *
 * 集成所有子组件，管理全局状态和事件通信
 */

import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';

// 组件导入
import { ContextMenu, Dashboard, DataTable, FloatingBall, MainPanel, OptionsPanel, TabBar, Toast } from './components';
import { InputFloorDialog, ManualUpdateDialog, PurgeRangeDialog, SettingsDialog } from './components/dialogs';

// Store 导入
import { useConfigStore } from './stores/useConfigStore';
import { useDataStore } from './stores/useDataStore';
import { TAB_DASHBOARD, TAB_OPTIONS, useUIStore } from './stores/useUIStore';

// Composables 导入
import { useApiCallbacks } from './composables/useApiCallbacks';
import { useCoreActions } from './composables/useCoreActions';
import { useDataPersistence } from './composables/useDataPersistence';
import { useParentStyleInjection } from './composables/useParentStyleInjection';
import { useToast } from './composables/useToast';
import { useTouchScrollFix } from './composables/useTouchScrollFix';

// 工具函数导入
import { processJsonData } from './utils';

// 类型导入
import type { ProcessedTable, TabItem, TableRow } from './types';

// ============================================================
// Store 实例
// ============================================================

const uiStore = useUIStore();
const dataStore = useDataStore();
const configStore = useConfigStore();

// ============================================================
// Composables
// ============================================================

const { init: initStyles, cleanup: cleanupStyles } = useParentStyleInjection();
const { saveToDatabase, getTableData, purgeFloorRange: executePurgeFloorRange, stopAutoSave } = useDataPersistence();
const { state: toastState } = useToast();

// 触摸滚动修复（横向布局卡片滑动）- 随组件生命周期自动管理
useTouchScrollFix();

// API 回调注册（表格更新、快照管理）- 随组件生命周期自动管理
useApiCallbacks();

// ============================================================
// Refs
// ============================================================

const floatingBallRef = ref<InstanceType<typeof FloatingBall>>();
const mainPanelRef = ref<InstanceType<typeof MainPanel>>();

// ============================================================
// 响应式状态
// ============================================================

/** 搜索关键词 */
const searchTerm = ref('');

/** 内容区域隐藏状态 */
const isContentHidden = ref(false);

/** 弹窗显示状态 */
const showSettingsDialog = ref(false);
const showInputFloorDialog = ref(false);
const showPurgeRangeDialog = ref(false);
const showManualUpdateDialog = ref(false);

/** 右键菜单状态 */
const contextMenuState = reactive({
  visible: false,
  x: 0,
  y: 0,
  tableId: '',
  tableName: '',
  rowIndex: 0,
  isDeleting: false,
});

// ============================================================
// 计算属性
// ============================================================

/** 应用 class */
const appClasses = computed(() => [
  `acu-theme-${configStore.config.theme}`,
  `acu-font-${configStore.config.fontFamily.replace(/\s+/g, '-').toLowerCase()}`,
  {
    'acu-mobile': uiStore.isMobile,
    'acu-layout-horizontal': configStore.config.layout === 'horizontal',
    'acu-layout-vertical': configStore.config.layout === 'vertical',
  },
]);

/** 面板标题 */
const panelTitle = computed(() => {
  if (uiStore.activeTab === TAB_DASHBOARD) return 'ACU 仪表盘';
  if (uiStore.activeTab === TAB_OPTIONS) return 'ACU 选项面板';
  return `ACU - ${uiStore.activeTab || '可视化表格'}`;
});

/** 处理后的表格数据 */
const processedTables = computed<ProcessedTable[]>(() => {
  const staged = dataStore.stagedData;
  if (!staged) return [];

  // 使用 processJsonData 将原始数据转换为表格结构
  // 原始格式: { sheetId: { name: string, content: string[][] } }
  // 转换后格式: { tableName: { key: sheetId, headers: string[], rows: string[][] } }
  const processed = processJsonData(staged);
  if (!processed) return [];

  return Object.entries(processed).map(([tableName, tableData]) => {
    const { key: sheetId, headers, rows: rawRows } = tableData;

    // 将 string[][] 格式的行数据转换为 TableRow[] 格式
    const rows: TableRow[] = rawRows.map((rowData, rowIndex) => {
      // rowData 是 string[] 数组，根据 headers 数组映射为 cells
      const cells = rowData.map((cellValue, colIndex) => ({
        colIndex,
        key: headers[colIndex] || `col_${colIndex}`,
        value: String(cellValue ?? ''),
      }));

      return {
        index: rowIndex,
        key: `${tableName}-row-${rowIndex}`,
        cells,
      };
    });

    return {
      id: sheetId, // 使用原始 sheetId 作为 ID，便于保存时定位
      name: tableName,
      headers: headers.map(h => String(h)), // 确保 headers 是字符串数组
      rows,
    };
  });
});

/** Tab 列表 */
const tabList = computed<TabItem[]>(() => {
  return processedTables.value.map(table => ({
    id: table.id,
    name: table.name,
    icon: getTableIcon(table.name),
  }));
});

/** 是否有选项类表格 */
const hasOptionsTabs = computed(() => {
  return processedTables.value.some(t => t.name.includes('选项') || t.name.toLowerCase().includes('option'));
});

/** 选项类表格 */
const optionsTables = computed(() => {
  return processedTables.value.filter(t => t.name.includes('选项') || t.name.toLowerCase().includes('option'));
});

/** 当前选中的表格 */
const currentTable = computed(() => {
  if (!uiStore.activeTab) return null;
  return processedTables.value.find(t => t.id === uiStore.activeTab) || null;
});

/** 当前目标楼层 */
const currentTargetFloor = computed(() => {
  // 从 dataStore 获取目标楼层信息
  return 0; // 默认值，实际应从 dataStore 获取
});

/** 最大楼层索引 */
const maxFloorIndex = computed(() => {
  // 从聊天记录获取最大楼层
  const chat = (window as any).SillyTavern?.chat;
  return Array.isArray(chat) ? chat.length - 1 : 0;
});

// ============================================================
// 辅助函数
// ============================================================

/** 获取表格图标 */
function getTableIcon(tableName: string): string {
  const name = tableName.toLowerCase();
  if (name.includes('主角') || name.includes('player')) return 'fas fa-user';
  if (name.includes('npc') || name.includes('角色')) return 'fas fa-users';
  if (name.includes('任务') || name.includes('quest')) return 'fas fa-tasks';
  if (name.includes('物品') || name.includes('item')) return 'fas fa-box-open';
  if (name.includes('技能') || name.includes('skill')) return 'fas fa-magic';
  if (name.includes('装备') || name.includes('equip')) return 'fas fa-shield-alt';
  if (name.includes('状态') || name.includes('status')) return 'fas fa-heart';
  if (name.includes('事件') || name.includes('event')) return 'fas fa-calendar-alt';
  if (name.includes('选项') || name.includes('option')) return 'fas fa-sliders-h';
  return 'fas fa-table';
}

// ============================================================
// 事件处理 - 悬浮球
// ============================================================

/** 悬浮球点击 - 显示面板 */
function handleBallClick() {
  uiStore.openPanel();
  isContentHidden.value = false;
  console.info('[ACU] 面板已打开');
}

/** 悬浮球双击 - 切换停靠模式 */
function handleBallDoubleClick() {
  floatingBallRef.value?.setDocked(true);
  console.info('[ACU] 悬浮球已停靠');
}

// ============================================================
// 事件处理 - 面板
// ============================================================

/** 关闭面板 */
function handlePanelClose() {
  uiStore.closePanel();
  console.info('[ACU] 面板已关闭');
}

/** 隐藏内容区 */
function handleHideContent() {
  isContentHidden.value = !isContentHidden.value;
}

/** 收起面板为悬浮球 */
function handleToggle() {
  uiStore.isCollapsed = true;
  console.info('[ACU] 面板已收起为悬浮球');
}

// ============================================================
// 事件处理 - 标签栏
// ============================================================

/** Tab 切换 */
function handleTabChange(tabId: string) {
  uiStore.setActiveTab(tabId);
  searchTerm.value = '';
  console.info(`[ACU] 切换到 Tab: ${tabId}`);

  // 恢复该表的记忆高度（需要等待 DOM 更新）
  nextTick(() => {
    restoreTableHeight(tabId);
  });
}

/**
 * 恢复表格的记忆高度
 * @param tabId Tab ID
 */
function restoreTableHeight(tabId: string) {
  const dataAreaEl = mainPanelRef.value?.getDataAreaElement();
  if (!dataAreaEl) return;

  const savedHeight = uiStore.getTableHeight(tabId);

  if (savedHeight) {
    // 有记忆高度，直接应用
    dataAreaEl.style.height = `${savedHeight}px`;
    console.info(`[ACU] 恢复高度: ${tabId} = ${savedHeight}px`);
  } else {
    // 没有记忆高度，计算自适应高度
    mainPanelRef.value?.resetHeight();
  }
}

/** Tab 排序变更 */
function handleTabsReorder(newOrder: string[]) {
  uiStore.setTableOrder(newOrder);
  console.info('[ACU] Tab 顺序已更新');
}

// ============================================================
// 事件处理 - 导航
// ============================================================

/** 导航到指定表格 */
function handleNavigateToTable(tableId: string) {
  uiStore.setActiveTab(tableId);
  console.info(`[ACU] 导航到表格: ${tableId}`);

  // 恢复该表的记忆高度
  nextTick(() => {
    restoreTableHeight(tableId);
  });
}

/** 关闭当前表格，返回仪表盘 */
function handleTableClose() {
  uiStore.setActiveTab(TAB_DASHBOARD);
  console.info('[ACU] 关闭表格，返回仪表盘');

  // 恢复仪表盘的高度
  nextTick(() => {
    restoreTableHeight(TAB_DASHBOARD);
  });
}

/** 高度拖拽开始 - 调用 MainPanel 的高度拖拽逻辑 */
function handleHeightDragStart(event: PointerEvent, handleEl: HTMLElement) {
  // 获取 MainPanel 暴露的数据区元素
  const dataAreaEl = mainPanelRef.value?.getDataAreaElement();
  if (!dataAreaEl) return;

  // 只响应左键
  if (event.button !== 0) return;

  event.preventDefault();
  event.stopPropagation();

  // 使用传入的 handleEl 捕获指针
  handleEl.setPointerCapture(event.pointerId);

  const startY = event.clientY;
  const startHeight = dataAreaEl.offsetHeight;

  const handlePointerMove = (moveE: PointerEvent) => {
    const dy = startY - moveE.clientY;
    let newHeight = startHeight + dy;

    // 限制高度范围
    const minHeight = 200;
    const parentHeight = window.parent?.innerHeight ?? window.innerHeight;
    const maxHeight = parentHeight * 0.8;
    newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

    dataAreaEl.style.height = `${newHeight}px`;
  };

  const handlePointerUp = (upE: PointerEvent) => {
    handleEl.releasePointerCapture(upE.pointerId);
    handleEl.removeEventListener('pointermove', handlePointerMove);
    handleEl.removeEventListener('pointerup', handlePointerUp);

    // 保存高度到对应表名（关键：每个表独立记忆）
    const currentTabName = uiStore.activeTab;
    if (currentTabName && dataAreaEl) {
      const finalHeight = dataAreaEl.offsetHeight;
      uiStore.setTableHeight(currentTabName, finalHeight);
      console.info(`[ACU] 保存高度: ${currentTabName} = ${finalHeight}px`);
    }
  };

  handleEl.addEventListener('pointermove', handlePointerMove);
  handleEl.addEventListener('pointerup', handlePointerUp);
}

/** 高度重置 - 调用 MainPanel 的重置高度方法 */
function handleHeightReset() {
  // 清除当前表的记忆高度
  const currentTabName = uiStore.activeTab;
  if (currentTabName) {
    uiStore.resetTableHeight(currentTabName);
    console.info(`[ACU] 清除高度记忆: ${currentTabName}`);
  }

  mainPanelRef.value?.resetHeight();
  console.info('[ACU] 高度已重置为自适应');
}

// ============================================================
// 事件处理 - 数据操作
// ============================================================

/** 加载数据 */
async function loadData(): Promise<void> {
  const data = getTableData();
  if (data) {
    dataStore.setStagedData(data);
    dataStore.saveSnapshot(data);
    // 刷新后清除所有高亮标记（手动和AI）
    dataStore.clearChanges(true);
  }
}

/** 刷新数据 */
async function handleRefresh() {
  try {
    await loadData();
    console.info('[ACU] 数据已刷新');
  } catch (error) {
    console.error('[ACU] 刷新失败:', error);
  }
}

/** 保存数据 */
async function handleSave() {
  try {
    const success = await saveToDatabase();
    if (success) {
      console.info('[ACU] 数据已保存');
      // 刷新界面以显示最新数据
      await loadData();
    }
  } catch (error) {
    console.error('[ACU] 保存失败:', error);
  }
}

/** 单元格点击 */
function handleCellClick(tableId: string, rowIndex: number, colIndex: number) {
  console.info(`[ACU] 单元格点击: ${tableId}[${rowIndex}][${colIndex}]`);
}

/** 行点击 */
function handleRowClick(tableId: string, row: TableRow) {
  console.info(`[ACU] 行点击: ${tableId}[${row.index}]`);
}

/** 插入行 */
async function handleInsertRow(tableId: string, afterIndex: number) {
  console.info(`[ACU] 插入行: ${tableId} 在索引 ${afterIndex} 之后`);

  // 查找表格对应的原始 sheetId（tableId 就是 sheetId）
  const table = processedTables.value.find(t => t.id === tableId);
  if (!table) {
    console.warn('[ACU] 未找到表格:', tableId);
    return;
  }

  // 调用核心动作插入行
  const { insertRow } = useCoreActions();
  await insertRow(tableId, afterIndex);

  // 刷新数据以显示新行
  await loadData();
}

/** 切换删除状态 */
function handleToggleDelete(tableId: string, rowIndex: number) {
  // 找到对应的表名（DataCard 使用 tableName 生成 rowKey）
  const table = processedTables.value.find(t => t.id === tableId);
  const tableName = table?.name || tableId;
  const rowKey = `${tableName}-row-${rowIndex}`;
  dataStore.toggleDelete(rowKey);
  console.info(`[ACU] 切换删除状态: ${rowKey}`);
}

// ============================================================
// 事件处理 - 右键菜单
// ============================================================

/** 显示右键菜单 */
function handleContextMenu(event: MouseEvent, tableId: string, rowIndex: number) {
  // 使用表名生成 rowKey（与 DataCard 保持一致）
  const table = processedTables.value.find(t => t.id === tableId);
  const tableName = table?.name || tableId;
  const rowKey = `${tableName}-row-${rowIndex}`;
  contextMenuState.visible = true;
  contextMenuState.x = event.clientX;
  contextMenuState.y = event.clientY;
  contextMenuState.tableId = tableId;
  contextMenuState.tableName = tableName;
  contextMenuState.rowIndex = rowIndex;
  contextMenuState.isDeleting = dataStore.pendingDeletes.has(rowKey);
}

/** 右键菜单 - 插入行 */
function handleContextInsertRow() {
  handleInsertRow(contextMenuState.tableId, contextMenuState.rowIndex);
  contextMenuState.visible = false;
}

/** 右键菜单 - 复制 */
function handleContextCopy() {
  const table = processedTables.value.find(t => t.id === contextMenuState.tableId);
  const row = table?.rows[contextMenuState.rowIndex];
  if (row) {
    const text = row.cells.map(c => `${c.key}: ${c.value}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      console.info('[ACU] 内容已复制');
    });
  }
  contextMenuState.visible = false;
}

/** 右键菜单 - 删除 */
function handleContextDelete() {
  handleToggleDelete(contextMenuState.tableId, contextMenuState.rowIndex);
  contextMenuState.visible = false;
}

/** 右键菜单 - 撤销删除 */
function handleContextUndoDelete() {
  handleToggleDelete(contextMenuState.tableId, contextMenuState.rowIndex);
  contextMenuState.visible = false;
}

// ============================================================
// 事件处理 - 弹窗
// ============================================================

/** 设置保存 */
function handleSettingsSave() {
  console.info('[ACU] 设置已保存');
}

/** 手动更新 - 打开配置弹窗 */
function handleManualUpdate() {
  showManualUpdateDialog.value = true;
}

/** 打开原生编辑器 */
function handleOpenNative() {
  try {
    const w = window.parent || window;
    const api = (w as any).AutoCardUpdaterAPI || (window as any).AutoCardUpdaterAPI;
    if (api && typeof api.openVisualizer === 'function') {
      api.openVisualizer();
      console.info('[ACU] 已打开原生编辑器');
    } else {
      console.warn('[ACU] AutoCardUpdaterAPI.openVisualizer 不可用');
    }
  } catch (error) {
    console.error('[ACU] 打开原生编辑器失败:', error);
  }
}

/** 保存到指定楼层 */
async function handleSaveToFloor(floorIndex: number) {
  try {
    const success = await saveToDatabase(null, false, false, floorIndex);
    if (success) {
      console.info(`[ACU] 数据已保存到第 ${floorIndex} 楼`);
    }
  } catch (error) {
    console.error('[ACU] 保存到指定楼层失败:', error);
  }
}

/** 清除范围 */
async function handlePurgeRange(startFloor: number, endFloor: number) {
  try {
    await executePurgeFloorRange(startFloor, endFloor);
    console.info(`[ACU] 已清除第 ${startFloor} 到 ${endFloor} 楼的数据`);
    // 清除完成后刷新界面以显示最新数据
    await loadData();
  } catch (error) {
    console.error('[ACU] 清除范围失败:', error);
  }
}

// ============================================================
// 生命周期
// ============================================================

onMounted(async () => {
  console.info('[ACU] App 组件已挂载');

  // 初始化样式注入
  initStyles();

  // 检测移动端
  uiStore.setMobile(window.innerWidth <= 768);

  // 监听窗口大小变化
  window.addEventListener('resize', () => {
    uiStore.setMobile(window.innerWidth <= 768);
  });

  // 加载数据
  try {
    await loadData();
    uiStore.setInitialized(true);

    // 设置默认活跃 Tab
    if (!uiStore.activeTab && processedTables.value.length > 0) {
      uiStore.setActiveTab(TAB_DASHBOARD);
    }
  } catch (error) {
    console.error('[ACU] 初始化数据加载失败:', error);
  }
});

onUnmounted(() => {
  console.info('[ACU] App 组件已卸载');

  // 停止自动保存 (防止内存泄露)
  stopAutoSave();

  // 清理样式
  cleanupStyles();
});

// ============================================================
// 点击外部收起面板逻辑
// ============================================================

/**
 * 检查目标元素是否在 ACU 相关元素内
 * @param target 点击目标元素
 * @returns 如果在 ACU 元素内返回 true
 */
function isInsideACU(target: Element): boolean {
  const parentDoc = window.parent?.document || document;

  // 检查是否存在正在编辑的 InlineEditor（核心保护：只要有编辑器存在就不收起面板）
  if (parentDoc.querySelector('.acu-inline-editor')) {
    console.info('[ACU] 检测到 InlineEditor 存在，阻止收起面板');
    return true;
  }

  // 检查是否存在编辑锁定状态的卡片
  if (parentDoc.querySelector('.acu-editing-lock')) {
    console.info('[ACU] 检测到编辑锁定状态，阻止收起面板');
    return true;
  }

  // 检查是否正在编辑中（textarea 或 input 获得焦点）
  const activeElement = parentDoc.activeElement;
  if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
    // 如果活动元素在 ACU 内，认为是 ACU 内的点击
    if (activeElement.closest('.acu-wrapper') || activeElement.closest('.acu-inline-editor')) {
      console.info('[ACU] 检测到 ACU 内的输入框活动，阻止收起面板');
      return true;
    }
  }

  // 检查是否在以下任一元素内
  return !!(
    target.closest('.acu-wrapper') || // 主面板容器
    target.closest('.acu-floating-ball-vue') || // 悬浮球
    target.closest('.acu-context-menu') || // 右键菜单
    target.closest('.acu-modal-overlay') || // 弹窗遮罩层
    target.closest('.acu-modal') || // 弹窗
    target.closest('.acu-dialog') || // 对话框
    target.closest('[class*="acu-settings"]') || // 设置相关
    target.closest('#acu_visualizer_vue-root') || // Vue 根容器
    target.closest('.acu-inline-editor') || // 内联编辑器
    target.closest('.acu-editing-lock') || // 编辑锁定状态的卡片
    target.closest('.acu-edit-textarea') // 编辑文本框
  );
}

// 使用 onClickOutside 监听点击外部事件
// 需要使用父窗口的 document 来监听
onMounted(() => {
  const parentDoc = window.parent?.document || document;

  const handleClickOutside = (event: MouseEvent) => {
    // 只在面板可见且未固定时处理
    if (!uiStore.isPanelVisible || uiStore.isPinned) {
      return;
    }

    const target = event.target as Element;

    // 如果点击在 ACU 相关元素内，不处理
    if (isInsideACU(target)) {
      return;
    }

    // 只有点击在外部时才收起面板
    uiStore.closePanel();
    console.info('[ACU] 点击外部，面板已收起');
  };

  // 在父窗口文档上监听点击事件
  parentDoc.addEventListener('click', handleClickOutside);

  // 清理函数
  onUnmounted(() => {
    parentDoc.removeEventListener('click', handleClickOutside);
  });
});

// ============================================================
// 监听
// ============================================================

// 监听数据变化，自动更新 diffMap
watch(
  () => dataStore.stagedData,
  newData => {
    if (newData) {
      dataStore.generateDiffMap(newData);
    }
  },
  { deep: true },
);
</script>
