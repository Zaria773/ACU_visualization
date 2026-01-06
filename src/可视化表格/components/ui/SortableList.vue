<template>
  <div class="acu-sortable-list">
    <div
      v-for="(item, index) in items"
      :key="item.id"
      class="acu-sortable-item"
      :class="{ selected: selectedId === item.id }"
      @click="emit('select', item)"
    >
      <!-- 移动按钮 -->
      <div class="acu-sort-controls">
        <button class="acu-sort-btn" :disabled="index === 0" title="上移" @click.stop="moveUp(index)">
          <i class="fas fa-chevron-up"></i>
        </button>
        <button class="acu-sort-btn" :disabled="index === items.length - 1" title="下移" @click.stop="moveDown(index)">
          <i class="fas fa-chevron-down"></i>
        </button>
      </div>

      <!-- 项目内容 -->
      <div class="acu-item-content">
        <i v-if="item.icon" :class="['fas', item.icon]"></i>
        <span>{{ item.name || item.label }}</span>
      </div>

      <!-- 删除按钮 -->
      <button v-if="showRemove" class="acu-remove-btn" title="移除" @click.stop="remove(index)">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- 空状态 -->
    <div v-if="items.length === 0" class="acu-sortable-empty">
      <slot name="empty">
        <span>暂无项目</span>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SortableList - 可排序列表组件
 *
 * 功能说明:
 * - 使用上下移动按钮进行排序，避免拖拽交互的 Bug
 * - 支持选中状态显示
 * - 支持移除项目
 * - 支持空状态插槽
 *
 * 用于:
 * - 表格展示顺序配置
 * - 导航栏按钮排序配置
 */

/** 可排序项目类型 */
export interface SortableItem {
  /** 项目唯一标识 */
  id: string;
  /** 项目名称 */
  name?: string;
  /** 项目标签 (备选名称) */
  label?: string;
  /** 项目图标 (FontAwesome class) */
  icon?: string;
}

interface Props {
  /** 项目列表 */
  items: SortableItem[];
  /** 当前选中的项目 ID */
  selectedId?: string;
  /** 是否显示移除按钮 */
  showRemove?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  selectedId: '',
  showRemove: true,
});

const emit = defineEmits<{
  /** 重新排序后触发 */
  reorder: [items: SortableItem[]];
  /** 移除项目时触发 */
  remove: [item: SortableItem];
  /** 选中项目时触发 */
  select: [item: SortableItem];
}>();

/**
 * 上移项目
 * @param index 当前项目索引
 */
const moveUp = (index: number) => {
  if (index === 0) return;
  const newItems = [...props.items];
  [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
  emit('reorder', newItems);
};

/**
 * 下移项目
 * @param index 当前项目索引
 */
const moveDown = (index: number) => {
  if (index === props.items.length - 1) return;
  const newItems = [...props.items];
  [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
  emit('reorder', newItems);
};

/**
 * 移除项目
 * @param index 项目索引
 */
const remove = (index: number) => {
  emit('remove', props.items[index]);
};
</script>

<style scoped lang="scss">
/* 样式已迁移到 styles/components/sortable-list.scss */
</style>
