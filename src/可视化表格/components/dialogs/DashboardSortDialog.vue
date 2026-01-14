<template>
  <div class="acu-modal-container" @click.self="emit('close')">
    <div class="acu-modal acu-dashboard-sort-modal">
      <div class="acu-modal-header">
        <span class="acu-modal-title">
          <i class="fas fa-sort"></i>
          调整看板顺序
        </span>
        <button class="acu-close-pill" @click.stop="emit('close')">完成</button>
      </div>

      <div class="acu-modal-body">
        <div class="acu-sort-hint">使用上下箭头调整看板显示顺序</div>

        <SortableList :items="sortableItems" :show-remove="false" @reorder="handleReorder" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDashboardStore } from '../../stores/useDashboardStore';
import type { ProcessedTable } from '../../types';
import type { SortableItem } from '../ui/SortableList.vue';
import SortableList from '../ui/SortableList.vue';

const props = defineProps<{
  tables: ProcessedTable[];
}>();

const emit = defineEmits<{
  close: [];
}>();

const dashboardStore = useDashboardStore();

// 将 widget 转换为 SortableItem
const sortableItems = computed(() => {
  return dashboardStore.enabledWidgets.map(widget => {
    // 尝试从 props.tables 中找到对应的表格名称
    const table = props.tables.find(t => t.id === widget.tableId);
    const tableName = table ? table.name : widget.title || widget.tableId;

    return {
      id: widget.id,
      name: tableName,
      icon: widget.icon,
      // 额外属性，用于 reorder 时还原
      originalOrder: widget.order,
    };
  });
});

// 处理排序变更
function handleReorder(newItems: SortableItem[]) {
  // 根据新顺序更新 store 中的 order
  // 注意：这里我们只重新排序 enabledWidgets，不改变 disabled widgets 的 order
  // 为了简单起见，我们重新计算所有 enabled widgets 的 order

  newItems.forEach((item, index) => {
    dashboardStore.updateWidget(item.id, { order: index });
  });
}
</script>

<style lang="scss">
/* 样式将通过 styles/overlays/dialogs.scss 统一管理，
   或者在此处使用非 scoped 样式但需注意命名空间 */
.acu-dashboard-sort-modal {
  width: 400px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  max-height: 80vh;

  .acu-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--acu-space-md);
  }

  .acu-sort-hint {
    color: var(--acu-text-sub);
    font-size: 0.9em;
    margin-bottom: var(--acu-space-sm);
    text-align: center;
  }
}
</style>
