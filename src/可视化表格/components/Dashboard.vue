<template>
  <div class="acu-dashboard">
    <!-- 仪表盘网格 -->
    <div class="acu-dashboard-grid">
      <!-- 主角信息卡片 -->
      <div v-if="mainCharacter" class="acu-dashboard-card acu-card-primary">
        <div class="acu-card-header">
          <i class="fas fa-user"></i>
          <span>主角</span>
          <button class="acu-btn acu-btn-link" @click="navigateToTable('主角')">
            <i class="fas fa-external-link-alt"></i>
          </button>
        </div>
        <div class="acu-card-body">
          <DataCard
            :data="mainCharacter"
            table-id="主角"
            table-name="主角"
            view-mode="list"
            :show-index="false"
            :show-header="false"
            @cell-click="(rowIndex, colIndex) => handleCellClick('主角', rowIndex, colIndex)"
          />
        </div>
      </div>

      <!-- NPC 快捷面板 -->
      <div v-if="npcList.length > 0" class="acu-dashboard-card">
        <div class="acu-card-header">
          <i class="fas fa-users"></i>
          <span>NPC</span>
          <Badge :value="`${npcList.length}`" type="number" />
          <button class="acu-btn acu-btn-link" @click="navigateToTable('NPC')">
            <i class="fas fa-external-link-alt"></i>
          </button>
        </div>
        <div class="acu-card-body acu-scroll">
          <div v-for="npc in displayedNpcs" :key="npc.index" class="acu-mini-card" @click="handleNpcClick(npc)">
            <span class="acu-mini-name">{{ getNpcName(npc) }}</span>
            <Badge :value="getNpcStatus(npc)" />
          </div>
          <button
            v-if="npcList.length > maxDisplayItems"
            class="acu-btn acu-btn-link acu-show-more"
            @click="navigateToTable('NPC')"
          >
            查看全部 ({{ npcList.length }})
          </button>
        </div>
      </div>

      <!-- 任务面板 -->
      <div v-if="taskList.length > 0" class="acu-dashboard-card">
        <div class="acu-card-header">
          <i class="fas fa-tasks"></i>
          <span>任务</span>
          <Badge :value="`${taskList.length}`" type="number" />
          <button class="acu-btn acu-btn-link" @click="navigateToTable(taskTableName)">
            <i class="fas fa-external-link-alt"></i>
          </button>
        </div>
        <div class="acu-card-body acu-scroll">
          <div v-for="task in displayedTasks" :key="task.index" class="acu-task-item" @click="handleTaskClick(task)">
            <span class="acu-task-name">{{ getTaskName(task) }}</span>
            <Badge :value="getTaskType(task)" />
          </div>
          <button
            v-if="taskList.length > maxTaskItems"
            class="acu-btn acu-btn-link acu-show-more"
            @click="navigateToTable(taskTableName)"
          >
            查看全部 ({{ taskList.length }})
          </button>
        </div>
      </div>

      <!-- 物品/道具面板 -->
      <div v-if="itemList.length > 0" class="acu-dashboard-card">
        <div class="acu-card-header">
          <i class="fas fa-box-open"></i>
          <span>物品</span>
          <Badge :value="`${itemList.length}`" type="number" />
          <button class="acu-btn acu-btn-link" @click="navigateToTable(itemTableName)">
            <i class="fas fa-external-link-alt"></i>
          </button>
        </div>
        <div class="acu-card-body acu-scroll">
          <div class="acu-items-grid">
            <div
              v-for="item in displayedItems"
              :key="item.index"
              class="acu-item-chip"
              :title="getItemDesc(item)"
              @click="handleItemClick(item)"
            >
              {{ getItemName(item) }}
              <span v-if="getItemCount(item)" class="acu-item-count"> ×{{ getItemCount(item) }} </span>
            </div>
          </div>
          <button
            v-if="itemList.length > maxItemChips"
            class="acu-btn acu-btn-link acu-show-more"
            @click="navigateToTable(itemTableName)"
          >
            查看全部 ({{ itemList.length }})
          </button>
        </div>
      </div>

      <!-- 统计概览 -->
      <div class="acu-dashboard-card acu-card-stats">
        <div class="acu-card-header">
          <i class="fas fa-chart-bar"></i>
          <span>数据统计</span>
        </div>
        <div class="acu-card-body">
          <div class="acu-stats-grid">
            <div class="acu-stat-item">
              <span class="acu-stat-value">{{ totalTables }}</span>
              <span class="acu-stat-label">表格</span>
            </div>
            <div class="acu-stat-item">
              <span class="acu-stat-value">{{ totalRows }}</span>
              <span class="acu-stat-label">记录</span>
            </div>
            <div class="acu-stat-item" :class="{ 'acu-stat-highlight': changedCount > 0 }">
              <span class="acu-stat-value">{{ changedCount }}</span>
              <span class="acu-stat-label">变更</span>
            </div>
            <div class="acu-stat-item" :class="{ 'acu-stat-danger': pendingDeleteCount > 0 }">
              <span class="acu-stat-value">{{ pendingDeleteCount }}</span>
              <span class="acu-stat-label">待删除</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 快捷表格入口 -->
      <div v-if="otherTables.length > 0" class="acu-dashboard-card acu-card-quick-access">
        <div class="acu-card-header">
          <i class="fas fa-th"></i>
          <span>快捷访问</span>
        </div>
        <div class="acu-card-body">
          <div class="acu-quick-grid">
            <button
              v-for="table in otherTables"
              :key="table.id"
              class="acu-quick-btn"
              @click="navigateToTable(table.id)"
            >
              <i :class="getTableIcon(table.id)"></i>
              <span>{{ table.name }}</span>
              <Badge v-if="table.count > 0" :value="`${table.count}`" type="number" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Dashboard 仪表盘视图组件
 *
 * 聚合展示多个关键表格的摘要信息：
 * - 主角信息
 * - NPC 列表
 * - 任务列表
 * - 物品/道具
 * - 数据统计
 * - 快捷表格入口
 */

import { computed, ref } from 'vue';
import { useDataStore } from '../stores/useDataStore';
import type { ProcessedTable, TableRow } from '../types';
import Badge from './Badge.vue';
import DataCard from './DataCard.vue';

interface Props {
  /** 所有表格数据 */
  tables: ProcessedTable[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 刷新事件 */
  refresh: [];
  /** 导航到表格事件 */
  navigate: [tableId: string];
  /** 单元格点击事件 */
  cellClick: [tableId: string, rowIndex: number, colIndex: number];
  /** 行点击事件（用于快速预览等） */
  rowClick: [tableId: string, row: TableRow];
}>();

// ============================================================
// 状态
// ============================================================

const dataStore = useDataStore();
const isRefreshing = ref(false);

// 显示数量限制
const maxDisplayItems = 5;
const maxTaskItems = 3;
const maxItemChips = 12;

// ============================================================
// 计算属性 - 表格数据获取
// ============================================================

/** 根据表格名称获取表格数据 */
function getTableByName(name: string): ProcessedTable | undefined {
  return props.tables.find(t => t.name === name || t.id === name);
}

/** 根据关键词模糊匹配表格 */
function getTableByKeyword(...keywords: string[]): ProcessedTable | undefined {
  return props.tables.find(t => keywords.some(k => t.name.includes(k) || t.id.includes(k)));
}

/** 主角数据 */
const mainCharacterTable = computed(() => getTableByKeyword('主角', '玩家', 'Player', 'protagonist'));
const mainCharacter = computed(() => mainCharacterTable.value?.rows[0] || null);

/** NPC 列表 */
const npcTable = computed(() => getTableByKeyword('NPC', 'npc', '角色'));
const npcList = computed(() => npcTable.value?.rows || []);
const displayedNpcs = computed(() => npcList.value.slice(0, maxDisplayItems));

/** 任务列表 */
const taskTable = computed(() => getTableByKeyword('任务', 'Task', 'Quest', 'quest'));
const taskTableName = computed(() => taskTable.value?.name || '任务');
const taskList = computed(() => taskTable.value?.rows || []);
const displayedTasks = computed(() => taskList.value.slice(0, maxTaskItems));

/** 物品列表 */
const itemTable = computed(() => getTableByKeyword('物品', '道具', 'Item', 'item', '背包', '库存'));
const itemTableName = computed(() => itemTable.value?.name || '物品');
const itemList = computed(() => itemTable.value?.rows || []);
const displayedItems = computed(() => itemList.value.slice(0, maxItemChips));

/** 其他表格（排除已展示的） */
const otherTables = computed(() => {
  const excludeIds = new Set(
    [mainCharacterTable.value?.id, npcTable.value?.id, taskTable.value?.id, itemTable.value?.id].filter(Boolean),
  );

  return props.tables
    .filter(t => !excludeIds.has(t.id))
    .map(t => ({
      id: t.id,
      name: t.name,
      count: t.rows.length,
    }))
    .slice(0, 8); // 最多显示 8 个快捷入口
});

// ============================================================
// 计算属性 - 统计数据
// ============================================================

/** 总表格数 */
const totalTables = computed(() => props.tables.length);

/** 总行数 */
const totalRows = computed(() => props.tables.reduce((sum, table) => sum + table.rows.length, 0));

/** 变更数 */
const changedCount = computed(() => dataStore.diffMap.size);

/** 待删除数 */
const pendingDeleteCount = computed(() => dataStore.pendingDeletes.size);

// ============================================================
// 辅助方法 - 数据提取
// ============================================================

/** 获取 NPC 名称 */
function getNpcName(npc: TableRow): string {
  const nameCell = npc.cells.find(c => ['名称', '姓名', 'name', 'Name', '角色名'].includes(c.key));
  return String(nameCell?.value || `NPC #${npc.index + 1}`);
}

/** 获取 NPC 状态 */
function getNpcStatus(npc: TableRow): string {
  const statusCell = npc.cells.find(c => ['状态', '好感度', 'status', 'Status', '关系'].includes(c.key));
  return String(statusCell?.value || '-');
}

/** 获取任务名称 */
function getTaskName(task: TableRow): string {
  const nameCell = task.cells.find(c => ['名称', '任务名', 'name', 'Name', '标题'].includes(c.key));
  return String(nameCell?.value || `任务 #${task.index + 1}`);
}

/** 获取任务类型 */
function getTaskType(task: TableRow): string {
  const typeCell = task.cells.find(c => ['类型', 'type', 'Type', '分类'].includes(c.key));
  return String(typeCell?.value || '主线');
}

/** 获取物品名称 */
function getItemName(item: TableRow): string {
  const nameCell = item.cells.find(c => ['名称', '物品名', 'name', 'Name', '道具名'].includes(c.key));
  return String(nameCell?.value || `物品 #${item.index + 1}`);
}

/** 获取物品数量 */
function getItemCount(item: TableRow): string {
  const countCell = item.cells.find(c => ['数量', 'count', 'Count', '个数', 'amount'].includes(c.key));
  const value = countCell?.value;
  if (value && Number(value) > 1) {
    return String(value);
  }
  return '';
}

/** 获取物品描述 */
function getItemDesc(item: TableRow): string {
  const descCell = item.cells.find(c => ['描述', '说明', 'desc', 'description', 'Description'].includes(c.key));
  return String(descCell?.value || '');
}

/** 获取表格图标 */
function getTableIcon(tableId: string): string {
  const id = tableId.toLowerCase();
  if (id.includes('技能') || id.includes('skill')) return 'fas fa-magic';
  if (id.includes('装备') || id.includes('equip')) return 'fas fa-shield-alt';
  if (id.includes('状态') || id.includes('status')) return 'fas fa-heart';
  if (id.includes('事件') || id.includes('event')) return 'fas fa-calendar-alt';
  if (id.includes('日志') || id.includes('log')) return 'fas fa-scroll';
  if (id.includes('地点') || id.includes('location')) return 'fas fa-map-marker-alt';
  if (id.includes('关系') || id.includes('relation')) return 'fas fa-link';
  if (id.includes('设置') || id.includes('setting')) return 'fas fa-cog';
  return 'fas fa-table';
}

// ============================================================
// 事件处理
// ============================================================

/** 刷新 */
async function handleRefresh() {
  isRefreshing.value = true;
  emit('refresh');
  // 模拟刷新动画
  setTimeout(() => {
    isRefreshing.value = false;
  }, 1000);
}

/** 导航到表格 */
function navigateToTable(tableId: string) {
  emit('navigate', tableId);
}

/** 单元格点击 */
function handleCellClick(tableId: string, rowIndex: number, colIndex: number) {
  emit('cellClick', tableId, rowIndex, colIndex);
}

/** NPC 点击 */
function handleNpcClick(npc: TableRow) {
  if (npcTable.value) {
    emit('rowClick', npcTable.value.id, npc);
  }
}

/** 任务点击 */
function handleTaskClick(task: TableRow) {
  if (taskTable.value) {
    emit('rowClick', taskTable.value.id, task);
  }
}

/** 物品点击 */
function handleItemClick(item: TableRow) {
  if (itemTable.value) {
    emit('rowClick', itemTable.value.id, item);
  }
}
</script>
