<!-- TagManagerDialog.vue - 标签管理器主容器 -->
<template>
  <div v-if="visible" class="acu-modal-container acu-center-modal" @click.self="handleClose">
    <div
      class="acu-modal acu-tag-manager-modal"
      :style="{ paddingBottom: `${configStore.config.mobileSafeAreaBottom ?? 0}px` }"
    >
      <!-- 头部 -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">
          <i class="fas fa-tags"></i>
          标签管理器
        </span>
        <button class="acu-close-pill" @click.stop="handleClose">完成</button>
      </div>

      <!-- 内容 -->
      <div class="acu-modal-body acu-tag-manager-body">
        <!-- 已展示区（顶部） -->
        <div class="acu-displayed-area">
          <span class="acu-displayed-label">已展示：</span>
          <template v-if="displayedItems.length > 0">
            <span
              v-for="item in displayedItems"
              :key="item.id"
              class="acu-displayed-tag"
              @click.stop="removeDisplayedItem(item)"
            >
              <span v-if="item.icon" class="acu-tag-icon">
                <i v-if="isFontAwesome(item.icon)" :class="item.icon"></i>
                <span v-else>{{ item.icon }}</span>
              </span>
              {{ item.label }}
              <i class="fas fa-times acu-remove-icon"></i>
            </span>
          </template>
          <span v-else class="acu-empty-hint">点击下方标签或分类添加到展示区</span>
        </div>

        <!-- 搜索栏 -->
        <div class="acu-tag-search">
          <i class="fas fa-search"></i>
          <input v-model="searchKeyword" type="text" placeholder="搜索标签..." @input="handleSearch" />
          <button v-if="searchKeyword" class="acu-clear-search" @click.stop="clearSearch">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- 工具栏 -->
        <div class="acu-tag-toolbar">
          <!-- 模式按钮 -->
          <button
            class="acu-mode-btn"
            :class="{ active: currentMode === 'add' }"
            title="展示模式：点击标签/分类添加到展示区"
            @click.stop="toggleMode('add')"
          >
            <i class="fas fa-eye"></i>
            <span class="btn-label">展示</span>
          </button>
          <button class="acu-mode-btn" title="新建标签" @click.stop="handleCreateTag">
            <i class="fas fa-plus"></i>
            <span class="btn-label">新建</span>
          </button>
          <button
            class="acu-mode-btn"
            :class="{ active: currentMode === 'delete' }"
            title="删除模式：点击标签/分类立即删除"
            @click.stop="toggleMode('delete')"
          >
            <i class="fas fa-trash"></i>
            <span class="btn-label">删除</span>
          </button>
          <button
            class="acu-mode-btn"
            :class="{ active: currentMode === 'migrate' }"
            title="迁移模式：选中标签后点击目标分类迁入"
            @click.stop="toggleMode('migrate')"
          >
            <i class="fas fa-arrows-alt"></i>
            <span class="btn-label">迁移</span>
          </button>
          <button class="acu-mode-btn" title="导入标签库" @click.stop="handleImport">
            <i class="fas fa-file-import"></i>
            <span class="btn-label">导入</span>
          </button>
          <button
            class="acu-mode-btn"
            :class="{ active: currentMode === 'export' }"
            title="导出模式：选择要导出的标签"
            @click.stop="toggleMode('export')"
          >
            <i class="fas fa-file-export"></i>
            <span class="btn-label">导出</span>
          </button>

          <!-- 迁移/导出模式额外按钮 -->
          <div v-if="currentMode === 'migrate' || currentMode === 'export'" class="mode-actions">
            <button class="acu-mode-btn" @click.stop="toggleSelectAllCurrent">
              <i class="fas fa-check-double"></i>
              {{ isAllCurrentSelected ? '取消全选' : '全选当前' }}
            </button>

            <template v-if="currentMode === 'export'">
              <button class="acu-mode-btn" @click.stop="exportAll">
                <i class="fas fa-download"></i>
                全部导出
              </button>
              <button class="acu-mode-btn" :disabled="selectedTagIds.size === 0" @click.stop="exportSelected">
                <i class="fas fa-check"></i>
                导出选中 ({{ selectedTagIds.size }})
              </button>
            </template>
          </div>
        </div>

        <!-- 双栏布局 -->
        <div class="acu-tag-manager">
          <!-- 左侧：目录树 -->
          <TagCategoryTree
            :mode="currentMode"
            @category-click="handleCategoryClick"
            @add-category="handleAddCategory"
            @migrate-to-category="handleMigrateToCategory"
            @delete-category="handleDeleteCategory"
          />

          <!-- 右侧：标签网格 -->
          <TagBadgeGrid
            :mode="currentMode"
            :displayed-tag-ids="localDisplayedTagIdSet"
            @tag-click="handleTagClick"
            @create-tag="handleCreateTag"
            @delete-tag="handleDeleteTag"
            @add-tag="handleAddTag"
          />
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <TagEditDialog
      v-model:visible="showEditDialog"
      :tag="editingTag"
      :default-category-id="defaultCategoryId"
      @saved="handleTagSaved"
      @close="handleEditDialogClose"
    />

    <!-- 导入弹窗 -->
    <TagImportDialog v-if="showImportDialog" v-model:visible="showImportDialog" @imported="handleImported" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useConfigStore } from '../../../stores/useConfigStore';
import { useTagLibraryStore } from '../../../stores/useTagLibraryStore';
import type { InteractiveTag, TagCategory, TagManagerMode } from '../../../types';
import TagBadgeGrid from './TagBadgeGrid.vue';
import TagCategoryTree from './TagCategoryTree.vue';
import TagEditDialog from './TagEditDialog.vue';
import TagImportDialog from './TagImportDialog.vue';

// Props
interface Props {
  visible: boolean;
  /** 组件的已展示标签 ID 列表 */
  displayedTagIds: string[];
  /** 组件的已展示分类 ID 列表 */
  displayedCategoryIds?: string[];
}
const props = withDefaults(defineProps<Props>(), {
  displayedCategoryIds: () => [],
});

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'save', displayedTagIds: string[], displayedCategoryIds: string[]): void;
  (e: 'close'): void;
}>();

// Store
const tagStore = useTagLibraryStore();
const configStore = useConfigStore();

// 本地状态
const searchKeyword = ref('');
const showEditDialog = ref(false);
const showImportDialog = ref(false);
const editingTag = ref<InteractiveTag | null>(null);
const defaultCategoryId = ref('');

// 本地副本 - 用于在弹窗内管理展示区，关闭时保存
const localDisplayedTagIds = ref<string[]>([]);
const localDisplayedCategoryIds = ref<string[]>([]);

// 计算属性
const currentMode = computed(() => tagStore.currentMode);
const selectedTagIds = computed(() => tagStore.selectedTagIds);
const filteredTags = computed(() => tagStore.filteredTags);
const isAllCurrentSelected = computed(() => {
  if (filteredTags.value.length === 0) return false;
  return filteredTags.value.every(tag => selectedTagIds.value.has(tag.id));
});

/** 已展示的项目（标签 + 分类） */
interface DisplayedItem {
  id: string;
  type: 'tag' | 'category';
  label: string;
  icon?: string;
}

const displayedItems = computed<DisplayedItem[]>(() => {
  const items: DisplayedItem[] = [];

  // 添加分类（使用本地副本）
  localDisplayedCategoryIds.value.forEach(catId => {
    const category = tagStore.getCategoryById(catId);
    if (category) {
      items.push({
        id: catId,
        type: 'category',
        label: category.path,
        icon: category.icon,
      });
    }
  });

  // 添加标签（使用本地副本）
  localDisplayedTagIds.value.forEach(tagId => {
    const tag = tagStore.getTagById(tagId);
    if (tag) {
      items.push({
        id: tagId,
        type: 'tag',
        label: tag.label,
      });
    }
  });

  return items;
});

/** 已展示的标签 ID Set（用于传给 TagBadgeGrid） */
const localDisplayedTagIdSet = computed(() => localDisplayedTagIds.value);

// 生命周期
onMounted(async () => {
  await tagStore.loadLibrary();
});

// 方法
function handleClose() {
  // 退出时重置模式并保存
  tagStore.setMode('normal');
  // emit save 事件，将本地副本传回父组件
  emit('save', [...localDisplayedTagIds.value], [...localDisplayedCategoryIds.value]);
  emit('update:visible', false);
  emit('close');
}

function toggleMode(mode: TagManagerMode) {
  if (currentMode.value === mode) {
    // 再次点击同一模式，切换回普通模式
    tagStore.setMode('normal');
    showModeToast('已退出' + getModeLabel(mode) + '模式');
  } else {
    tagStore.setMode(mode);
    showModeToast(getModeLabel(mode) + '模式已启用');
  }
}

function getModeLabel(mode: TagManagerMode): string {
  const labels: Record<TagManagerMode, string> = {
    normal: '普通',
    create: '新建',
    add: '展示',
    delete: '删除',
    migrate: '迁移',
    export: '导出',
  };
  return labels[mode] || mode;
}

function showModeToast(message: string) {
  if (typeof toastr !== 'undefined') {
    toastr.info(message, '', { timeOut: 2000 });
  }
}

function handleSearch() {
  tagStore.searchKeyword = searchKeyword.value;
}

function clearSearch() {
  searchKeyword.value = '';
  tagStore.searchKeyword = '';
}

// 分类点击
function handleCategoryClick(category: TagCategory | null) {
  if (currentMode.value === 'add' && category) {
    // 添加模式：添加分类到展示区
    addDisplayedCategory(category.id);
  }
}

// 迁移到分类
function handleMigrateToCategory(categoryId: string) {
  const selectedCatIds = tagStore.selectedCategoryIds;
  const selectedTagCount = selectedTagIds.value.size;
  const selectedCatCount = selectedCatIds.size;

  if (selectedTagCount === 0 && selectedCatCount === 0) {
    showModeToast('请先选中要迁移的标签或分类');
    return;
  }

  // 'root' 表示迁移到根级
  if (categoryId === 'root') {
    // 迁移分类到根级（变成一级分类）
    tagStore.migrateSelectedItems('');
  } else {
    // 迁移标签和分类到指定分类
    tagStore.migrateSelectedItems(categoryId);
  }

  const messages: string[] = [];
  if (selectedTagCount > 0) {
    messages.push(`${selectedTagCount} 个标签`);
  }
  if (selectedCatCount > 0) {
    messages.push(`${selectedCatCount} 个分类`);
  }
  const target = categoryId === 'root' ? '根目录' : '目标分类';
  showModeToast('已迁移 ' + messages.join(' 和 ') + ' 到' + target);
  tagStore.setMode('normal');
}

// 删除分类
function handleDeleteCategory(categoryId: string) {
  // 'root' 表示清空所有
  if (categoryId === 'root') {
    if (confirm('确定要清空所有标签和分类吗？此操作不可撤销！')) {
      tagStore.clearAll();
      // 同时清空本地展示区
      localDisplayedTagIds.value = [];
      localDisplayedCategoryIds.value = [];
      showModeToast('已清空所有标签和分类');
    }
    return;
  }

  const category = tagStore.getCategoryById(categoryId);
  if (category) {
    tagStore.deleteCategory(categoryId);
    showModeToast('已删除分类：' + category.path);
    // 同时从展示区移除
    removeDisplayedCategoryById(categoryId);
  }
}

// 标签点击
function handleTagClick(tag: InteractiveTag) {
  if (currentMode.value === 'add') {
    // 添加模式：添加标签到展示区
    handleAddTag(tag.id);
  } else if (currentMode.value === 'normal' || currentMode.value === 'create') {
    // 普通/新建模式：编辑标签
    editingTag.value = tag;
    showEditDialog.value = true;
  }
}

// 新建标签
function handleCreateTag() {
  editingTag.value = null;
  // 使用当前选中的分类作为默认分类
  const selectedCat = tagStore.selectedLevel1;
  if (selectedCat && selectedCat !== '全部' && selectedCat !== '未分类') {
    const cat = tagStore.getCategoryByPath(selectedCat);
    defaultCategoryId.value = cat?.id || '';
  } else {
    defaultCategoryId.value = '';
  }
  showEditDialog.value = true;
}

// 删除标签
function handleDeleteTag(tagId: string) {
  const tag = tagStore.getTagById(tagId);
  if (tag) {
    tagStore.deleteTag(tagId);
    showModeToast('已删除标签：' + tag.label);
    // 同时从展示区移除
    removeDisplayedTagById(tagId);
  }
}

// 添加标签到展示区（使用本地副本）
function handleAddTag(tagId: string) {
  if (!localDisplayedTagIds.value.includes(tagId)) {
    localDisplayedTagIds.value = [...localDisplayedTagIds.value, tagId];
    const tag = tagStore.getTagById(tagId);
    if (tag) {
      showModeToast('已添加：' + tag.label);
    }
  } else {
    showModeToast('该标签已在展示区');
  }
}

// 添加分类到展示区（从 TagCategoryTree 的 addCategory 事件）
function handleAddCategory(categoryId: string) {
  // 'root' 表示添加根目录（特殊处理）
  if (categoryId === 'root') {
    // 根目录添加到展示区用特殊标记
    if (!localDisplayedCategoryIds.value.includes('root')) {
      localDisplayedCategoryIds.value = [...localDisplayedCategoryIds.value, 'root'];
      showModeToast('已添加：根目录');
    } else {
      showModeToast('根目录已在展示区');
    }
    return;
  }
  addDisplayedCategory(categoryId);
}

// 添加分类到展示区（使用本地副本）
function addDisplayedCategory(categoryId: string) {
  if (!localDisplayedCategoryIds.value.includes(categoryId)) {
    localDisplayedCategoryIds.value = [...localDisplayedCategoryIds.value, categoryId];
    const cat = tagStore.getCategoryById(categoryId);
    if (cat) {
      showModeToast('已添加分类：' + cat.path);
    }
  } else {
    showModeToast('该分类已在展示区');
  }
}

// 从展示区移除项目（使用本地副本）
function removeDisplayedItem(item: DisplayedItem) {
  if (item.type === 'tag') {
    removeDisplayedTagById(item.id);
  } else {
    removeDisplayedCategoryById(item.id);
  }
}

function removeDisplayedTagById(tagId: string) {
  localDisplayedTagIds.value = localDisplayedTagIds.value.filter(id => id !== tagId);
}

function removeDisplayedCategoryById(categoryId: string) {
  localDisplayedCategoryIds.value = localDisplayedCategoryIds.value.filter(id => id !== categoryId);
}

// 标签保存回调
function handleTagSaved(tag: InteractiveTag) {
  showModeToast('已保存：' + tag.label);
}

function handleEditDialogClose() {
  editingTag.value = null;
}

// 导入
function handleImport() {
  showImportDialog.value = true;
}

function handleImported(result: { addedTags: number; addedCategories: number }) {
  showModeToast(`已导入 ${result.addedCategories} 个分类，${result.addedTags} 个标签`);
}

// 全选当前显示的标签
function toggleSelectAllCurrent() {
  if (isAllCurrentSelected.value) {
    // 取消全选当前显示的
    filteredTags.value.forEach(tag => {
      if (selectedTagIds.value.has(tag.id)) {
        tagStore.toggleTagSelection(tag.id);
      }
    });
  } else {
    // 全选当前显示的
    filteredTags.value.forEach(tag => {
      if (!selectedTagIds.value.has(tag.id)) {
        tagStore.toggleTagSelection(tag.id);
      }
    });
  }
}

function isFontAwesome(icon: string): boolean {
  return icon.startsWith('fa') || icon.includes(' fa-');
}

// 导出
function exportAll() {
  const data = tagStore.exportLibrary('all');
  downloadJson(data, 'tag-library-all.json');
  tagStore.setMode('normal');
}

function exportSelected() {
  const data = tagStore.exportLibrary('selected');
  downloadJson(data, 'tag-library-selected.json');
  tagStore.setMode('normal');
}

function downloadJson(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showModeToast('导出成功');
}

// 监听 visible 变化，初始化本地副本
watch(
  () => props.visible,
  visible => {
    if (visible) {
      // 打开时重置状态并复制 props 到本地副本
      tagStore.setMode('normal');
      tagStore.resetSelection();
      searchKeyword.value = '';
      // 复制 props 到本地副本
      localDisplayedTagIds.value = [...props.displayedTagIds];
      localDisplayedCategoryIds.value = [...props.displayedCategoryIds];
    }
  },
);
</script>
