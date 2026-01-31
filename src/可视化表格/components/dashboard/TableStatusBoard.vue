<template>
  <div class="acu-status-board">
    <!-- 头部 -->
    <div class="acu-status-board-header">
      <span class="acu-status-board-summary">
        共 {{ statusList.length }} 个表格 · AI楼层 {{ currentTotalAiFloors }}
      </span>

      <div class="acu-status-board-actions">
        <!-- 编辑模式工具栏 -->
        <div v-if="isEditing" class="acu-status-toolbar">
          <button class="acu-tool-btn" title="全选" @click.stop="toggleSelectAll">
            <i class="fas fa-check-double"></i>
          </button>
          <button class="acu-tool-btn" :disabled="selectedKeys.size === 0" title="导出" @click.stop="handleExport">
            <i class="fas fa-file-export"></i>
          </button>
          <button class="acu-tool-btn" :disabled="selectedKeys.size === 0" title="删除" @click.stop="handleDelete">
            <i class="fas fa-trash"></i>
          </button>
          <button class="acu-tool-btn" title="添加" @click.stop="showAddDialog = true">
            <i class="fas fa-plus"></i>
          </button>
          <button
            class="acu-tool-btn"
            :disabled="selectedKeys.size === 0"
            title="清除"
            @click.stop="handleOpenPurgeDialog"
          >
            <i class="fas fa-eraser"></i>
          </button>
          <button
            class="acu-tool-btn"
            :disabled="toggleButtonState === 'mixed' || selectedKeys.size === 0"
            :title="toggleButtonState === 'enable' ? '启用' : '禁用'"
            @click.stop="handleToggleEnabled"
          >
            <i :class="['fas', toggleButtonState === 'enable' ? 'fa-play' : 'fa-ban']"></i>
          </button>
        </div>

        <!-- 刷新按钮 -->
        <button class="acu-icon-btn" :disabled="isLoading" title="刷新状态" @click.stop="handleRefresh">
          <i class="fas fa-redo" :class="{ 'acu-animate-spin': isLoading }"></i>
        </button>

        <!-- 编辑/保存按钮 -->
        <button
          class="acu-icon-btn"
          :title="isEditing ? '保存' : '编辑'"
          @click.stop="isEditing ? handleSave() : enterEditMode()"
        >
          <i :class="['fas', isEditing ? 'fa-check' : 'fa-edit']"></i>
        </button>
      </div>
    </div>

    <!-- 添加表格弹窗 -->
    <AddTableDialog v-model:visible="showAddDialog" @confirm="handleAddTables" />

    <!-- 表格 -->
    <div class="acu-status-table-wrapper">
      <table class="acu-status-table">
        <thead>
          <tr>
            <th class="acu-status-col-name">表格名称</th>
            <th class="acu-status-col-freq">更新频率</th>
            <th class="acu-status-col-unrecorded">未记录楼层</th>
            <th class="acu-status-col-last">上次更新</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in sortedStatusList"
            :key="item.sheetKey"
            :class="{
              'acu-row-selected': isEditing && selectedKeys.has(item.sheetKey),
              'acu-highlight-ai': hasTableAiChanges(item.name) && !isEditing,
            }"
            @click.stop="handleRowClick(item)"
          >
            <td class="acu-status-name" :class="{ 'acu-highlight-ai': hasTableAiChanges(item.name) && !isEditing }">
              <span
                :style="{ cursor: isEditing ? 'default' : 'pointer' }"
                @click.stop="isEditing ? null : handleTableClick(item)"
              >
                {{ item.name }}
              </span>
            </td>
            <td class="acu-status-freq">
              <!-- 编辑模式：显示输入框 -->
              <template v-if="isEditing">
                <input
                  type="number"
                  :value="getEditingFrequency(item)"
                  min="-1"
                  class="acu-freq-input"
                  @input="handleFrequencyChange(item.sheetKey, $event)"
                  @click.stop
                />
              </template>
              <!-- 普通模式：显示文本 -->
              <template v-else>
                <span v-if="item.effectiveFrequency === 0" class="acu-status-disabled">禁用</span>
                <span v-else>{{ item.effectiveFrequency }}</span>
                <span v-if="item.updateFrequency === -1" class="acu-status-global-hint">(全局)</span>
              </template>
            </td>
            <td class="acu-status-unrecorded" :class="getUnrecordedClass(item)">
              {{ item.hasHistory ? item.unrecordedFloors : '—' }}
            </td>
            <td class="acu-status-last-update">
              <!-- 显示格式: AI楼层号/实际楼层号 -->
              {{ formatLastUpdate(item) }}
            </td>
          </tr>
          <!-- 空状态 -->
          <tr v-if="statusList.length === 0 && !isLoading">
            <td colspan="4" class="acu-status-empty">
              <i class="fas fa-inbox"></i>
              暂无表格数据
            </td>
          </tr>
          <!-- 加载中 -->
          <tr v-if="isLoading && statusList.length === 0">
            <td colspan="4" class="acu-status-loading">
              <i class="fas fa-spinner fa-spin"></i>
              加载中...
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 表格更新状态看板组件
 * 显示所有表格的更新频率和未记录楼层信息
 */

import { computed, onMounted, ref } from 'vue';
import { useDataPersistence } from '../../composables/useDataPersistence';
import type { TableUpdateStatus } from '../../composables/useTableUpdateStatus';
import { useTableUpdateStatus } from '../../composables/useTableUpdateStatus';
import { toast } from '../../composables/useToast';
import { useDataStore } from '../../stores/useDataStore';
import { useUIStore } from '../../stores/useUIStore';
import { getCore } from '../../utils';
import AddTableDialog from '../dialogs/common/AddTableDialog.vue';

// ============================================================
// Emits
// ============================================================

const emit = defineEmits<{
  /** 点击表格行时触发，可用于跳转到对应表格 */
  tableClick: [sheetKey: string, tableName: string];
}>();

// ============================================================
// Composable
// ============================================================

const dataStore = useDataStore();
const uiStore = useUIStore();
const { statusList, isLoading, currentTotalAiFloors, refresh, formatLastUpdate, getUnrecordedClass } =
  useTableUpdateStatus();
const { purgeTableDataByRange } = useDataPersistence();

// ============================================================
// State
// ============================================================

// 编辑模式开关
const isEditing = ref(false);

// 选中的表格 key 集合
const selectedKeys = ref<Set<string>>(new Set());

// 待保存的频率变更 (sheetKey -> newFrequency)
const pendingFrequencyChanges = ref<Map<string, number>>(new Map());

// 待添加的新表格
const pendingNewTables = ref<any[]>([]);

// 弹窗状态
const showAddDialog = ref(false);

// ============================================================
// Computed
// ============================================================

// 禁用/启用按钮状态
const toggleButtonState = computed(() => {
  if (selectedKeys.value.size === 0) return 'disabled';

  const selectedItems = statusList.value.filter(s => selectedKeys.value.has(s.sheetKey));

  // 检查每个选中项的当前频率（优先使用待保存的变更值）
  const currentFrequencies = selectedItems.map(s => {
    if (pendingFrequencyChanges.value.has(s.sheetKey)) {
      return pendingFrequencyChanges.value.get(s.sheetKey)!;
    }
    return s.effectiveFrequency;
  });

  const allDisabled = currentFrequencies.every(freq => freq === 0);
  const allEnabled = currentFrequencies.every(freq => freq !== 0);

  if (allDisabled) return 'enable'; // 全是禁用 → 显示"启用"按钮
  if (allEnabled) return 'disable'; // 全是启用 → 显示"禁用"按钮
  return 'mixed'; // 混合状态 → 禁止操作
});

// 是否有待保存的变更
const hasPendingChanges = computed(() => {
  return pendingFrequencyChanges.value.size > 0 || pendingNewTables.value.length > 0;
});

// ============================================================
// AI 高亮相关
// ============================================================

/**
 * 检查表格是否有 AI 变更
 * @param tableName 表格名称
 */
function hasTableAiChanges(tableName: string): boolean {
  const aiDiffMap = dataStore.aiDiffMap;
  if (!aiDiffMap || aiDiffMap.size === 0) return false;

  // 遍历 aiDiffMap，检查是否有属于该表格的变更
  // key 格式: "表格名-row-行号" 或 "表格名-行号-列号"
  for (const key of aiDiffMap) {
    if (key.startsWith(`${tableName}-`)) {
      return true;
    }
  }
  return false;
}

/**
 * 排序后的状态列表
 * AI 有变更的表格排在前面
 */
const sortedStatusList = computed(() => {
  return [...statusList.value].sort((a, b) => {
    const aHasAi = hasTableAiChanges(a.name);
    const bHasAi = hasTableAiChanges(b.name);
    if (aHasAi !== bHasAi) return bHasAi ? 1 : -1;
    return a.orderNo - b.orderNo;
  });
});

// ============================================================
// Methods
// ============================================================

/**
 * 进入编辑模式
 */
function enterEditMode() {
  isEditing.value = true;
  // 使用 toastr 提示
  toast.info('可多选操作');
}

/**
 * 退出编辑模式（不保存）
 */
function exitEditMode() {
  isEditing.value = false;
  selectedKeys.value.clear();
  pendingFrequencyChanges.value.clear();
  pendingNewTables.value = [];
}

/**
 * 切换选择状态
 */
function toggleSelect(sheetKey: string) {
  if (selectedKeys.value.has(sheetKey)) {
    selectedKeys.value.delete(sheetKey);
  } else {
    selectedKeys.value.add(sheetKey);
  }
}

/**
 * 全选/取消全选
 */
function toggleSelectAll() {
  if (selectedKeys.value.size === statusList.value.length) {
    selectedKeys.value.clear();
  } else {
    statusList.value.forEach(item => selectedKeys.value.add(item.sheetKey));
  }
}

/**
 * 获取当前编辑中的频率值
 */
function getEditingFrequency(item: TableUpdateStatus): number {
  if (pendingFrequencyChanges.value.has(item.sheetKey)) {
    return pendingFrequencyChanges.value.get(item.sheetKey)!;
  }
  return item.updateFrequency;
}

/**
 * 处理频率变更
 */
function handleFrequencyChange(sheetKey: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const value = parseInt(input.value, 10);
  if (!isNaN(value)) {
    pendingFrequencyChanges.value.set(sheetKey, value);
  }
}

/**
 * 刷新状态
 */
async function handleRefresh() {
  await refresh();
}

// 导出选中的表格模板
function handleExport() {
  if (selectedKeys.value.size === 0) return;

  const api = getCore().getDB();
  if (!api?.getTableTemplate) {
    toast.error('数据库 API 不可用');
    return;
  }

  try {
    const fullTemplate = api.getTableTemplate();
    if (!fullTemplate) {
      toast.error('无法获取当前模板');
      return;
    }

    // 构建只包含选中表格的模板
    const exportTemplate: Record<string, any> = {
      mate: fullTemplate.mate || {
        type: 'chatSheets',
        version: 1,
        updateConfigUiSentinel: -1,
      },
    };

    selectedKeys.value.forEach(sheetKey => {
      if (fullTemplate[sheetKey]) {
        exportTemplate[sheetKey] = fullTemplate[sheetKey];
      }
    });

    // 生成 JSON 并下载
    const jsonStr = JSON.stringify(exportTemplate, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tables_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`已导出 ${selectedKeys.value.size} 个表格`);
  } catch (e) {
    console.error('[ACU] 导出失败:', e);
    toast.error(`导出失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// 删除选中的表格
async function handleDelete() {
  if (selectedKeys.value.size === 0) return;

  // 二次确认
  if (
    !confirm(
      `确定要删除选中的 ${selectedKeys.value.size} 个表格吗？\n\n此操作将：\n1. 从所有聊天记录中清除这些表格的数据\n2. 从模板中移除这些表格的定义\n\n操作不可撤销！`,
    )
  ) {
    return;
  }

  const api = getCore().getDB();
  if (!api?.getTableTemplate || !api?.importTemplateFromData) {
    toast.error('数据库 API 不可用');
    return;
  }

  try {
    // 1. 清除数据
    toast.info('正在清除历史数据...');
    const tablesToDelete = Array.from(selectedKeys.value);
    // 清除所有楼层 (0 到 无穷大)
    const purgeResult = await purgeTableDataByRange(tablesToDelete, 0, 9999999);

    if (purgeResult.changed) {
      toast.success(`已清除 ${purgeResult.changedCount} 层历史数据`);
    }

    // 2. 删除模板定义
    const template = api.getTableTemplate();
    if (!template) {
      toast.error('无法获取当前模板');
      return;
    }

    // 从模板中删除选中的表格
    selectedKeys.value.forEach(sheetKey => {
      delete template[sheetKey];
    });

    // 保存修改后的模板
    const result = await api.importTemplateFromData(template);

    if (result.success) {
      toast.success(`已删除 ${selectedKeys.value.size} 个表格定义`);
      selectedKeys.value.clear();
      await refresh();
    } else {
      toast.error(`删除失败: ${result.message}`);
    }
  } catch (e) {
    console.error('[ACU] 删除表格失败:', e);
    toast.error(`删除失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// 打开高级清除弹窗
function handleOpenPurgeDialog() {
  uiStore.openAdvancedPurgeDialog(
    {
      // 不传初始值，让弹窗自动计算默认范围
      initialStartFloor: undefined,
      initialEndFloor: undefined,
    },
    {
      onConfirm: async () => {
        await refresh();
        selectedKeys.value.clear();
      },
    },
  );
}

// 处理添加表格
function handleAddTables(tables: any[]) {
  pendingNewTables.value.push(...tables);
  toast.success(`已添加 ${tables.length} 个表格到待保存列表`);
}

// 批量启用/禁用
function handleToggleEnabled() {
  if (selectedKeys.value.size === 0) return;

  // 捕获当前操作类型（因为修改后 computed 会变）
  const action = toggleButtonState.value;
  if (action === 'mixed') return;

  const newFreq = action === 'enable' ? -1 : 0;

  // 将所有选中表格的频率设置为新值
  selectedKeys.value.forEach(sheetKey => {
    pendingFrequencyChanges.value.set(sheetKey, newFreq);
  });

  toast.success(action === 'enable' ? '已设置为启用' : '已设置为禁用');
}

// 保存所有变更
async function handleSave() {
  // 如果没有任何变更，直接退出编辑模式
  if (!hasPendingChanges.value && pendingFrequencyChanges.value.size === 0) {
    exitEditMode();
    return;
  }

  const api = getCore().getDB();
  if (!api?.getTableTemplate || !api?.importTemplateFromData) {
    toast.error('数据库 API 不可用');
    return;
  }

  try {
    // 1. 获取当前模板
    const template = api.getTableTemplate();
    if (!template) {
      toast.error('无法获取当前模板');
      return;
    }

    let changeCount = 0;

    // 2. 应用频率变更
    for (const [sheetKey, newFreq] of pendingFrequencyChanges.value) {
      if (template[sheetKey]?.updateConfig) {
        template[sheetKey].updateConfig.updateFrequency = newFreq;
        changeCount++;
      }
    }

    // 3. 添加新表格
    for (const newTable of pendingNewTables.value) {
      const newKey = `sheet_${newTable.uid || Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      template[newKey] = newTable;
      changeCount++;
    }

    // 4. 调用 API 保存
    const result = await api.importTemplateFromData(template);

    if (result.success) {
      toast.success(`保存成功，共 ${changeCount} 项变更`);
      // 清理状态并退出编辑模式
      exitEditMode();
      // 刷新列表
      await refresh();
    } else {
      toast.error(`保存失败: ${result.message}`);
    }
  } catch (e) {
    console.error('[ACU] 保存失败:', e);
    toast.error(`保存失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * 点击表格行
 */
function handleTableClick(item: TableUpdateStatus) {
  emit('tableClick', item.sheetKey, item.name);
}

/**
 * 处理行点击
 */
function handleRowClick(item: TableUpdateStatus) {
  if (isEditing.value) {
    toggleSelect(item.sheetKey);
  } else {
    handleTableClick(item);
  }
}

// ============================================================
// Lifecycle
// ============================================================

onMounted(() => {
  // 初始加载
  refresh();
});
</script>
