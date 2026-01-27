<template>
  <Transition name="acu-menu-fade">
    <div
      v-if="visible"
      ref="menuRef"
      class="acu-context-menu"
      :style="menuStyle"
      tabindex="-1"
      @keydown.escape="close"
      @click.stop
      @mousedown.stop
      @touchstart.stop
    >
      <!-- 插入行 -->
      <div class="acu-menu-item" @click.stop="handleInsertRow">
        <i class="fas fa-plus"></i>
        <span>插入行</span>
      </div>

      <!-- 复制内容 -->
      <div class="acu-menu-item" @click.stop="handleCopy">
        <i class="fas fa-copy"></i>
        <span>复制内容</span>
      </div>

      <!-- 分隔线 -->
      <div class="acu-menu-divider"></div>

      <!-- 删除行（未标记删除时显示） -->
      <div v-if="!isDeleting" class="acu-menu-item acu-menu-danger" @click.stop="handleDelete">
        <i class="fas fa-trash"></i>
        <span>删除整行</span>
      </div>

      <!-- 撤销删除（已标记删除时显示） -->
      <div v-else class="acu-menu-item acu-menu-warning" @click.stop="handleUndoDelete">
        <i class="fas fa-undo"></i>
        <span>撤销删除</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * ContextMenu 右键菜单组件
 *
 * 功能：
 * - 点击外部自动关闭
 * - 根据行状态动态显示菜单项（删除/撤销删除互斥）
 * - 支持键盘导航（Escape 关闭）
 * - 定位在鼠标点击位置
 *
 * 菜单项：
 * - 插入行（在当前行后插入）
 * - 复制内容
 * - 删除行 / 撤销删除（互斥显示）
 */

import { useClipboard } from '@vueuse/core';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useDataStore } from '../stores/useDataStore';

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  /** 菜单是否可见 */
  visible: boolean;
  /** 菜单 X 坐标 */
  x: number;
  /** 菜单 Y 坐标 */
  y: number;
  /** 表格 ID (用于事件回传) */
  tableId: string;
  /** 表格名称 (用于生成 rowKey，与 DataCard 保持一致) */
  tableName?: string;
  /** 行索引 */
  rowIndex: number;
  /** 单元格值（用于复制） */
  cellValue?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 更新可见状态 */
  'update:visible': [value: boolean];
  /** 插入行事件 */
  insertRow: [tableId: string, rowIndex: number];
  /** 删除事件 */
  delete: [tableId: string, rowIndex: number];
  /** 撤销删除事件 */
  undoDelete: [tableId: string, rowIndex: number];
  /** 复制成功事件 */
  copied: [];
}>();

// ============================================================
// Refs & Stores
// ============================================================

const menuRef = ref<HTMLElement>();
const dataStore = useDataStore();
const { copy, copied } = useClipboard();

// ============================================================
// Computed
// ============================================================

/** 判断当前行是否待删除 */
const isDeleting = computed(() => {
  // 使用 tableName 生成 rowKey，与 DataCard 保持一致
  // 如果没有 tableName，回退到 tableId
  const keyBase = props.tableName || props.tableId;
  const rowKey = `${keyBase}-row-${props.rowIndex}`;
  return dataStore.pendingDeletes.has(rowKey);
});

/** 菜单定位样式 */
const menuStyle = computed(() => {
  // 获取父窗口视口尺寸（因为脚本运行在 iframe 中，但 UI 渲染在父窗口）
  const menuWidth = 180;
  const menuHeight = 200;
  // 使用父窗口的视口尺寸，因为菜单渲染在父窗口
  const parentWindow = window.parent || window;
  const viewportWidth = parentWindow.innerWidth;
  const viewportHeight = parentWindow.innerHeight;

  let left = props.x;
  let top = props.y;

  // 右边界检测
  if (left + menuWidth > viewportWidth) {
    left = viewportWidth - menuWidth - 10;
  }

  // 下边界检测
  if (top + menuHeight > viewportHeight) {
    top = viewportHeight - menuHeight - 10;
  }

  // 确保不为负数
  left = Math.max(10, left);
  top = Math.max(10, top);

  return {
    left: `${left}px`,
    top: `${top}px`,
  };
});

// ============================================================
// 点击外部关闭逻辑（监听父窗口）
// ============================================================

// 由于 UI 渲染在父窗口，需要手动监听父窗口的点击事件
// VueUse 的 onClickOutside 默认只监听当前 iframe 的 document
let clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
let rightClickHandler: ((e: MouseEvent) => void) | null = null;

onMounted(() => {
  const parentDoc = window.parent?.document || document;

  clickOutsideHandler = (e: MouseEvent) => {
    if (!props.visible || !menuRef.value) return;

    const target = e.target as HTMLElement;

    // 检查是否点击在菜单内部
    if (menuRef.value.contains(target)) return;

    // 点击菜单外部任何位置都关闭菜单
    console.info('[ACU] 点击外部关闭右键菜单');
    close();
  };

  // 右键点击也应该关闭当前菜单（除非在菜单内部右键）
  rightClickHandler = (e: MouseEvent) => {
    if (!props.visible || !menuRef.value) return;

    const target = e.target as HTMLElement;
    if (menuRef.value.contains(target)) return;

    console.info('[ACU] 右键点击外部关闭右键菜单');
    close();
  };

  // 使用 capture 阶段确保能捕获到事件
  parentDoc.addEventListener('click', clickOutsideHandler, true);
  parentDoc.addEventListener('contextmenu', rightClickHandler, true);
  // 移动端支持
  parentDoc.addEventListener('touchstart', clickOutsideHandler as any, true);
});

onUnmounted(() => {
  const parentDoc = window.parent?.document || document;
  if (clickOutsideHandler) {
    parentDoc.removeEventListener('click', clickOutsideHandler, true);
    parentDoc.removeEventListener('touchstart', clickOutsideHandler as any, true);
    clickOutsideHandler = null;
  }
  if (rightClickHandler) {
    parentDoc.removeEventListener('contextmenu', rightClickHandler, true);
    rightClickHandler = null;
  }
});

// ============================================================
// Watchers
// ============================================================

// 显示时自动聚焦以支持键盘事件
watch(
  () => props.visible,
  visible => {
    if (visible) {
      nextTick(() => {
        menuRef.value?.focus();
      });
    }
  },
);

// ============================================================
// Methods
// ============================================================

/** 关闭菜单 */
const close = () => {
  emit('update:visible', false);
};

/** 处理插入行 */
const handleInsertRow = () => {
  emit('insertRow', props.tableId, props.rowIndex);
  close();
};

/** 处理复制 */
const handleCopy = async () => {
  if (props.cellValue) {
    try {
      await copy(props.cellValue);
      emit('copied');
      // 可以通过 toastr 提示复制成功（由父组件处理）
    } catch (e) {
      console.error('[ACU] Copy failed:', e);
    }
  }
  close();
};

/** 处理删除 */
const handleDelete = () => {
  emit('delete', props.tableId, props.rowIndex);
  close();
};

/** 处理撤销删除 */
const handleUndoDelete = () => {
  emit('undoDelete', props.tableId, props.rowIndex);
  close();
};

// ============================================================
// Expose
// ============================================================

defineExpose({
  /** 关闭菜单 */
  close,
  /** 是否已复制 */
  copied,
});
</script>

<!-- 样式已迁移到 styles/overlays/context-menu.scss -->
