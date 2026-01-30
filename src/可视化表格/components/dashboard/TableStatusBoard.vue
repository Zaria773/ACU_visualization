<template>
  <div class="acu-status-board">
    <!-- 头部 -->
    <div class="acu-status-board-header">
      <span class="acu-status-board-summary">
          共 {{ statusList.length }} 个表格 · AI楼层 {{ currentTotalAiFloors }}
      </span>
      <button class="acu-icon-btn" :disabled="isLoading" title="刷新状态" @click.stop="handleRefresh">
        <i class="fas fa-redo" :class="{ 'acu-animate-spin': isLoading }"></i>
      </button>
    </div>

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
            :class="{ 'acu-highlight-ai': hasTableAiChanges(item.name) }"
            @click.stop="handleTableClick(item)"
          >
            <td class="acu-status-name" :class="{ 'acu-highlight-ai': hasTableAiChanges(item.name) }">
              {{ item.name }}
            </td>
            <td class="acu-status-freq">
              <span v-if="item.effectiveFrequency === 0" class="acu-status-disabled">禁用</span>
              <span v-else>{{ item.effectiveFrequency }}</span>
              <span v-if="item.updateFrequency === -1" class="acu-status-global-hint">(全局)</span>
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

import { computed, onMounted } from 'vue';
import type { TableUpdateStatus } from '../../composables/useTableUpdateStatus';
import { useTableUpdateStatus } from '../../composables/useTableUpdateStatus';
import { useDataStore } from '../../stores/useDataStore';

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
const { statusList, isLoading, currentTotalAiFloors, refresh, formatLastUpdate, getUnrecordedClass } =
  useTableUpdateStatus();

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
 * 刷新状态
 */
async function handleRefresh() {
  await refresh();
}

/**
 * 点击表格行
 */
function handleTableClick(item: TableUpdateStatus) {
  emit('tableClick', item.sheetKey, item.name);
}

// ============================================================
// Lifecycle
// ============================================================

onMounted(() => {
  // 初始加载
  refresh();
});
</script>
