<!-- CategorySelectPopup.vue - 分类选择弹出层（DashboardWidget 使用） -->
<!-- 交互流程：
  - 用户点击仪表盘组件行末尾的分类按钮
  - 弹出此弹窗，标题为分类名称
  - 有子分类：左右布局（目录树 + 标签区）
  - 无子分类：只显示标签滚动框
  - 点击标签触发 select 事件，由外部处理 allowPreEdit 逻辑
-->
<template>
  <div v-if="visible" class="acu-modal-container acu-center-modal" @click.self="handleClose">
    <div class="acu-modal acu-category-select-modal" :class="{ 'has-subcategories': hasSubCategories }">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">
          <span v-if="category?.icon" class="acu-category-icon">
            <i v-if="isFontAwesome(category.icon)" :class="category.icon"></i>
            <span v-else>{{ category.icon }}</span>
          </span>
          {{ categoryName }}
        </span>
        <button class="acu-close-pill" @click.stop="handleClose">完成</button>
      </div>

      <!-- 内容区 -->
      <div class="acu-modal-body">
        <!-- 有子分类：左右布局 -->
        <div v-if="hasSubCategories" class="acu-category-select-dual">
          <!-- 左侧：子分类目录树 -->
          <div class="acu-category-tree">
            <!-- 全部（显示所有标签） -->
            <div
              class="acu-tree-item"
              :class="{ active: selectedSubCategoryId === null }"
              @click.stop="selectSubCategory(null)"
            >
              <span class="acu-tree-icon">📦</span>
              <span class="acu-tree-label">全部</span>
              <span class="acu-tree-count">{{ allTagsCount }}</span>
            </div>

            <!-- 子分类列表 -->
            <div
              v-for="subCat in subCategories"
              :key="subCat.id"
              class="acu-tree-item"
              :class="{ active: selectedSubCategoryId === subCat.id }"
              @click.stop="selectSubCategory(subCat.id)"
            >
              <span v-if="subCat.icon" class="acu-tree-icon">
                <i v-if="isFontAwesome(subCat.icon)" :class="subCat.icon"></i>
                <span v-else>{{ subCat.icon }}</span>
              </span>
              <span v-else class="acu-tree-icon"><i class="fas fa-folder"></i></span>
              <span class="acu-tree-label">{{ getSubCategoryName(subCat) }}</span>
              <span class="acu-tree-count">{{ getSubCategoryTagCount(subCat.id) }}</span>
            </div>
          </div>

          <!-- 右侧：标签网格 -->
          <div class="acu-category-tags-grid">
            <button
              v-for="tag in displayedTags"
              :key="tag.id"
              class="acu-tag-btn"
              :class="{ 'mode-preview': uiStore.tagPreviewMode }"
              @click.stop="handleTagClick(tag)"
              @mouseenter="handleTagMouseEnter(tag, $event)"
              @mouseleave="handleTagMouseLeave"
              @touchstart.passive="handleTagTouchStart(tag, $event)"
              @touchend="handleTagTouchEnd"
              @touchcancel="handleTagTouchEnd"
            >
              {{ tag.label }}
            </button>

            <!-- 空状态 -->
            <div v-if="displayedTags.length === 0" class="acu-tags-empty">
              <i class="fas fa-tag"></i>
              <span>暂无标签</span>
            </div>
          </div>
        </div>

        <!-- 无子分类：只显示标签滚动框 -->
        <div v-else class="acu-category-tags-only">
          <div class="acu-tags-scroll">
            <button
              v-for="tag in allTags"
              :key="tag.id"
              class="acu-tag-btn"
              :class="{ 'mode-preview': uiStore.tagPreviewMode }"
              @click.stop="handleTagClick(tag)"
              @mouseenter="handleTagMouseEnter(tag, $event)"
              @mouseleave="handleTagMouseLeave"
              @touchstart.passive="handleTagTouchStart(tag, $event)"
              @touchend="handleTagTouchEnd"
              @touchcancel="handleTagTouchEnd"
            >
              {{ tag.label }}
            </button>
          </div>

          <!-- 空状态 -->
          <div v-if="allTags.length === 0" class="acu-tags-empty">
            <i class="fas fa-tag"></i>
            <span>该分类下暂无标签</span>
          </div>
        </div>
      </div>

      <!-- 底部：操作按钮 -->
      <div
        class="acu-modal-footer"
        style="justify-content: space-between; margin-top: 0; padding-top: 12px; border-top: 1px solid var(--acu-border)"
      >
        <button class="acu-modal-btn secondary" @click.stop="handleManageTags">
          <i class="fas fa-tags"></i> 管理标签
        </button>
        <!-- 预览模式按钮（通过 CSS 媒体查询控制，仅移动端显示） -->
        <button
          class="acu-modal-btn secondary acu-mobile-only"
          :class="{ active: uiStore.tagPreviewMode }"
          @click.stop="uiStore.toggleTagPreviewMode()"
        >
          <i class="fas fa-search"></i>
          {{ uiStore.tagPreviewMode ? '退出预览' : '预览模式' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useDashboardStore } from '../../../stores/useDashboardStore';
import { useTagLibraryStore } from '../../../stores/useTagLibraryStore';
import { useUIStore } from '../../../stores/useUIStore';
import type { InteractiveTag, TagCategory } from '../../../types';

// Props
interface Props {
  visible: boolean;
  /** 分类 ID */
  categoryId: string;
  /** 行上下文（用于解析通配符） */
  rowContext?: {
    title: string;
    value: string;
  };
  /** 来源组件 ID (用于管理标签) */
  widgetId?: string;
}
const props = withDefaults(defineProps<Props>(), {
  rowContext: () => ({ title: '', value: '' }),
  widgetId: '',
});

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'select', tag: InteractiveTag, rowContext: { title: string; value: string }): void;
  (e: 'close'): void;
}>();

// Store
const tagStore = useTagLibraryStore();
const uiStore = useUIStore();
const dashboardStore = useDashboardStore();

// 状态
const selectedSubCategoryId = ref<string | null>(null);

// 计算属性
const category = computed<TagCategory | undefined>(() => {
  return tagStore.getCategoryById(props.categoryId);
});

/** 分类名称（取最后一级） */
const categoryName = computed(() => {
  if (!category.value) return '未知分类';
  const parts = category.value.path.split('/');
  return parts[parts.length - 1];
});

/** 获取该分类的直接子分类 */
const subCategories = computed<TagCategory[]>(() => {
  if (!category.value) return [];
  const parentPath = category.value.path;

  // 查找所有直接子分类（路径以 parentPath/ 开头，且只多一层）
  return tagStore.library.categories.filter(cat => {
    if (!cat.path.startsWith(parentPath + '/')) return false;
    // 检查是否是直接子分类（不是更深层级）
    const remainingPath = cat.path.slice(parentPath.length + 1);
    return !remainingPath.includes('/');
  });
});

/** 是否有子分类 */
const hasSubCategories = computed(() => subCategories.value.length > 0);

/** 获取该分类及其所有子分类的所有标签 */
const allTags = computed<InteractiveTag[]>(() => {
  if (!category.value) return [];

  // 获取该分类及其所有子分类的 ID
  const categoryIds = new Set<string>();
  tagStore.library.categories.forEach(cat => {
    if (cat.path === category.value!.path || cat.path.startsWith(category.value!.path + '/')) {
      categoryIds.add(cat.id);
    }
  });

  // 获取这些分类下的所有标签
  return tagStore.library.tags.filter(tag => categoryIds.has(tag.categoryId));
});

/** 所有标签数量 */
const allTagsCount = computed(() => allTags.value.length);

/** 当前显示的标签（根据选中的子分类筛选） */
const displayedTags = computed<InteractiveTag[]>(() => {
  if (selectedSubCategoryId.value === null) {
    // 显示全部
    return allTags.value;
  }

  // 获取选中子分类及其子分类的所有标签
  const selectedCat = tagStore.getCategoryById(selectedSubCategoryId.value);
  if (!selectedCat) return [];

  const categoryIds = new Set<string>();
  tagStore.library.categories.forEach(cat => {
    if (cat.path === selectedCat.path || cat.path.startsWith(selectedCat.path + '/')) {
      categoryIds.add(cat.id);
    }
  });

  return tagStore.library.tags.filter(tag => categoryIds.has(tag.categoryId));
});

/** 获取子分类名称（只取最后一级） */
function getSubCategoryName(subCat: TagCategory): string {
  const parts = subCat.path.split('/');
  return parts[parts.length - 1];
}

/** 获取子分类的标签数量 */
function getSubCategoryTagCount(subCategoryId: string): number {
  const subCat = tagStore.getCategoryById(subCategoryId);
  if (!subCat) return 0;

  const categoryIds = new Set<string>();
  tagStore.library.categories.forEach(cat => {
    if (cat.path === subCat.path || cat.path.startsWith(subCat.path + '/')) {
      categoryIds.add(cat.id);
    }
  });

  return tagStore.library.tags.filter(tag => categoryIds.has(tag.categoryId)).length;
}

/** 选择子分类 */
function selectSubCategory(subCategoryId: string | null): void {
  selectedSubCategoryId.value = subCategoryId;
}

// 方法
function handleClose() {
  emit('update:visible', false);
  emit('close');
}

function handleTagClick(tag: InteractiveTag) {
  // 预览模式下不触发选择
  if (uiStore.tagPreviewMode) return;

  emit('select', tag, props.rowContext);
  // 不自动关闭，允许用户连续点击多个标签
}

// ==================== 预览相关 ====================

/** PC端：鼠标悬浮显示预览 */
function handleTagMouseEnter(tag: InteractiveTag, event: MouseEvent) {
  if (!tag.promptTemplate) return;

  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();

  // 使用视口坐标（position: fixed 相对于视口）
  uiStore.showTagPreviewTooltip(tag.promptTemplate, rect.left + rect.width / 2, rect.top);
}

/** PC端：鼠标离开隐藏预览 */
function handleTagMouseLeave() {
  uiStore.hideTagPreviewTooltip();
}

/** 移动端：触摸开始显示预览（仅在预览模式下） */
function handleTagTouchStart(tag: InteractiveTag, event: TouchEvent) {
  if (!uiStore.tagPreviewMode) return;
  if (!tag.promptTemplate) return;

  const touch = event.touches[0];
  if (!touch) return;

  // 使用触摸点的视口坐标
  uiStore.showTagPreviewTooltip(tag.promptTemplate, touch.clientX, touch.clientY);
}

/** 移动端：触摸结束隐藏预览 */
function handleTagTouchEnd() {
  if (!uiStore.tagPreviewMode) return;
  uiStore.hideTagPreviewTooltip();
}

// 组件卸载时清理
onUnmounted(() => {
  if (uiStore.tagPreviewMode) {
    uiStore.toggleTagPreviewMode();
  }
  uiStore.hideTagPreviewTooltip();
});

function handleManageTags() {
  // 关闭当前弹窗
  handleClose();

  // 获取当前组件的配置
  let displayedTagIds: string[] = [];
  let displayedCategoryIds: string[] = [];

  if (props.widgetId) {
    const widget = dashboardStore.getWidgetById(props.widgetId);
    if (widget && widget.widgetTagConfig) {
      displayedTagIds = widget.widgetTagConfig.displayedTagIds || [];
      displayedCategoryIds = widget.widgetTagConfig.displayedCategoryIds || [];
    }
  }

  // 如果没有配置，或者没有 widgetId，至少把当前分类传进去作为初始展示
  if (displayedCategoryIds.length === 0 && props.categoryId) {
    displayedCategoryIds = [props.categoryId];
  }

  // 打开标签管理器
  uiStore.openTagManagerDialog(
    {
      widgetId: props.widgetId || '',
      displayedTagIds,
      displayedCategoryIds,
    },
    (newTagIds, newCategoryIds) => {
      if (props.widgetId) {
        // 更新组件配置
        const widget = dashboardStore.getWidgetById(props.widgetId);
        if (widget) {
          dashboardStore.updateWidget(props.widgetId, {
            widgetTagConfig: {
              ...widget.widgetTagConfig,
              displayedTagIds: newTagIds,
              displayedCategoryIds: newCategoryIds,
            },
          });
        }
      }
    },
  );
}

// 监听弹窗打开，重置状态
watch(
  () => props.visible,
  visible => {
    if (visible) {
      selectedSubCategoryId.value = null;
    }
  },
);

function isFontAwesome(icon: string): boolean {
  return icon.startsWith('fa') || icon.includes(' fa-');
}
</script>
