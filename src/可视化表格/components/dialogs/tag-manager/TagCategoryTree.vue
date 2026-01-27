<!-- TagCategoryTree.vue - 左侧目录树组件 -->
<template>
  <div ref="treeContainer" class="acu-tag-tree" @scroll="handleScroll">
    <!-- 根目录（原"全部"） -->
    <div
      class="acu-tag-tree-item acu-root-item"
      :class="{
        active: selectedLevel1 === '全部' || selectedLevel1 === '',
        'migrate-target': mode === 'migrate',
      }"
      @click="handleRootClick"
    >
      <span class="acu-tree-icon">
        <i v-if="isFontAwesome(rootIcon)" :class="rootIcon"></i>
        <span v-else>{{ rootIcon }}</span>
      </span>
      <span class="acu-tree-label">根目录</span>
      <span class="acu-tree-count">({{ totalTags }})</span>

      <!-- 添加模式：添加按钮 -->
      <button
        v-if="mode === 'add'"
        class="acu-add-btn"
        title="添加根目录到展示区"
        @click.stop="emit('addCategory', 'root')"
      >
        <i class="fas fa-plus"></i>
      </button>

      <!-- 迁移模式：迁入按钮（将分类迁移到根级=变成一级分类） -->
      <button
        v-if="mode === 'migrate' && selectionType === 'category'"
        class="acu-migrate-btn"
        title="迁入到根目录（变成一级分类）"
        @click.stop="handleMigrateToCategory('root')"
      >
        <i class="fas fa-sign-in-alt"></i>
      </button>

      <!-- 删除模式：清空按钮 -->
      <button
        v-if="mode === 'delete'"
        class="acu-delete-btn"
        title="清空所有标签和分类"
        @click.stop="emit('deleteCategory', 'root')"
      >
        <i class="fas fa-times"></i>
      </button>

      <!-- 编辑图标按钮（普通模式） -->
      <button
        v-if="mode === 'normal'"
        class="acu-edit-icon-btn"
        title="修改图标"
        @click.stop="showRootIconInput = !showRootIconInput"
      >
        <i class="fas fa-palette"></i>
      </button>
    </div>

    <!-- 根目录图标编辑器 -->
    <div v-if="showRootIconInput" class="acu-root-icon-editor">
      <input
        v-model="newRootIcon"
        type="text"
        class="acu-icon-input"
        placeholder="输入emoji"
        maxlength="2"
        @keyup.enter="saveRootIcon"
      />
      <button class="acu-btn-small" @click.stop="saveRootIcon">
        <i class="fas fa-check"></i>
      </button>
      <button class="acu-btn-small" @click.stop="showRootIconInput = false">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- 未分类 -->
    <div
      class="acu-tag-tree-item"
      :class="{
        active: selectedLevel1 === '未分类',
        'migrate-target': mode === 'migrate' && selectionType === 'tag',
      }"
      @click="handleLevel1Click('未分类')"
    >
      <span class="acu-tree-icon">📦</span>
      <span class="acu-tree-label">未分类</span>
      <span class="acu-tree-count">({{ uncategorizedCount }})</span>
      <!-- 迁移模式：迁入按钮 -->
      <button
        v-if="mode === 'migrate' && selectionType === 'tag'"
        class="acu-migrate-btn"
        title="迁入此分类"
        @click.stop="handleMigrateToCategory('')"
      >
        <i class="fas fa-sign-in-alt"></i>
      </button>
    </div>

    <!-- 分隔线 -->
    <div v-if="customCategories.length > 0" class="acu-tree-divider"></div>

    <!-- 自定义分类 -->
    <template v-for="cat in customCategories" :key="cat.id">
      <div
        class="acu-tag-tree-item"
        :data-category-id="cat.id"
        :class="{
          active: selectedCategoryId === cat.id || selectedLevel1 === cat.level1,
          expanded: expandedCategories.has(cat.id),
          sticky: stickyCategory === cat.id,
          selected: selectedCategoryIds.has(cat.id),
          'migrate-target': mode === 'migrate',
        }"
        @click="handleCategoryClick(cat)"
      >
        <!-- 展开/折叠按钮 -->
        <span
          v-if="cat.hasChildren"
          class="acu-tree-toggle"
          @click.stop="toggleExpand(cat.id)"
        >
          {{ expandedCategories.has(cat.id) ? '▼' : '▶' }}
        </span>
        <span v-else class="acu-tree-toggle-placeholder"></span>

        <!-- 图标 -->
        <span v-if="cat.icon" class="acu-tree-icon">
          <i v-if="isFontAwesome(cat.icon)" :class="cat.icon"></i>
          <span v-else>{{ cat.icon }}</span>
        </span>

        <!-- 名称 -->
        <span class="acu-tree-label">{{ cat.name }}</span>

        <!-- 计数 -->
        <span class="acu-tree-count">({{ cat.tagCount }})</span>

        <!-- 添加模式：添加按钮（常驻） -->
        <button
          v-if="mode === 'add'"
          class="acu-add-btn"
          title="添加到展示区"
          @click.stop="handleAddCategory(cat.id)"
        >
          <i class="fas fa-plus"></i>
        </button>

        <!-- 迁移模式：选中按钮 + 迁入按钮 -->
        <template v-if="mode === 'migrate'">
          <button
            class="acu-select-btn"
            :class="{ active: selectedCategoryIds.has(cat.id) }"
            title="选中此分类"
            @click.stop="toggleCategorySelection(cat.id)"
          >
            <i :class="selectedCategoryIds.has(cat.id) ? 'fas fa-check-square' : 'far fa-square'"></i>
          </button>
          <button
            class="acu-migrate-btn"
            title="迁入到此分类"
            @click.stop="handleMigrateToCategory(cat.id)"
          >
            <i class="fas fa-sign-in-alt"></i>
          </button>
        </template>

        <!-- 删除模式：删除按钮 -->
        <button
          v-if="mode === 'delete'"
          class="acu-delete-btn"
          title="删除分类"
          @click.stop="handleDeleteCategory(cat.id)"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>
    </template>

    <!-- 空状态 -->
    <div v-if="customCategories.length === 0" class="acu-tree-empty">
      <i class="fas fa-folder-open"></i>
      <span>暂无自定义分类</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useTagLibraryStore } from '../../../stores/useTagLibraryStore';
import { useUIStore } from '../../../stores/useUIStore';
import type { TagCategory, TagManagerMode } from '../../../types';

// Props
interface Props {
  mode: TagManagerMode;
}
const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: 'categoryClick', category: TagCategory | null): void;
  (e: 'addCategory', categoryId: string): void;
  (e: 'migrateToCategory', categoryId: string): void;
  (e: 'deleteCategory', categoryId: string): void;
}>();

// Store
const tagStore = useTagLibraryStore();
const uiStore = useUIStore();

// 本地状态
const treeContainer = ref<HTMLElement | null>(null);
const expandedCategories = ref<Set<string>>(new Set());
const stickyCategory = ref<string | null>(null);
const showRootIconInput = ref(false);
const newRootIcon = ref('');

// 根目录图标（从 localStorage 读取）
const ROOT_ICON_KEY = 'acu_tag_library_root_icon';
const rootIcon = ref(localStorage.getItem(ROOT_ICON_KEY) || '📂');

// 计算属性
const selectedLevel1 = computed(() => tagStore.selectedLevel1);
const selectedCategoryId = computed(() => {
  // 根据选中的一级和二级分类，找到对应的分类 ID
  if (!tagStore.selectedLevel1 || tagStore.selectedLevel1 === '全部' || tagStore.selectedLevel1 === '未分类') {
    return null;
  }
  const path = tagStore.selectedLevel2
    ? `${tagStore.selectedLevel1}/${tagStore.selectedLevel2}`
    : tagStore.selectedLevel1;
  return tagStore.getCategoryByPath(path)?.id || null;
});
const totalTags = computed(() => tagStore.totalTags);
const uncategorizedCount = computed(() => tagStore.uncategorizedCount);
const selectedCategoryIds = computed(() => tagStore.selectedCategoryIds);
const selectionType = computed(() => tagStore.selectionType);

/** 处理后的分类列表（树形结构扁平化） */
interface FlatCategory {
  id: string;
  name: string;
  level1: string;
  path: string;
  icon?: string;
  depth: number;
  hasChildren: boolean;
  tagCount: number;
  parentId?: string;
}

const customCategories = computed<FlatCategory[]>(() => {
  const result: FlatCategory[] = [];
  const categories = tagStore.library.categories;

  // 构建路径树
  const pathMap = new Map<string, TagCategory>();
  categories.forEach(cat => {
    pathMap.set(cat.path, cat);
  });

  // 找出所有一级分类（真实存在的，不包含 / 的路径）
  const level1Categories = categories.filter(c => !c.path.includes('/'));
  const sortedLevel1 = level1Categories.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));

  // 递归构建树
  function addCategoryAndChildren(path: string, depth: number, parentId?: string) {
    const cat = pathMap.get(path);
    if (!cat) return;

    // 找子分类
    const children = categories.filter(c => {
      if (!c.path.startsWith(path + '/')) return false;
      const rest = c.path.slice(path.length + 1);
      return !rest.includes('/');
    });

    const parts = path.split('/');
    result.push({
      id: cat.id,
      name: parts[parts.length - 1],
      level1: parts[0],
      path: cat.path,
      icon: cat.icon,
      depth,
      hasChildren: children.length > 0,
      tagCount: tagStore.getCategoryTagCount(cat.id),
      parentId,
    });

    // 如果展开，添加子分类
    if (expandedCategories.value.has(cat.id)) {
      children
        .sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
        .forEach(child => {
          addCategoryAndChildren(child.path, depth + 1, cat.id);
        });
    }
  }

  // 遍历真实存在的一级分类
  sortedLevel1.forEach(cat => {
    addCategoryAndChildren(cat.path, 0);
  });

  return result;
});

// 方法
function isFontAwesome(icon: string): boolean {
  return icon.startsWith('fa') || icon.includes(' fa-');
}

function saveRootIcon() {
  if (newRootIcon.value) {
    rootIcon.value = newRootIcon.value;
    localStorage.setItem(ROOT_ICON_KEY, newRootIcon.value);
    newRootIcon.value = '';
    showRootIconInput.value = false;
  }
}

function handleRootClick() {
  // 根目录点击：显示全部标签
  tagStore.selectLevel1('');
  emit('categoryClick', null);
}

function openRootIconSelect() {
  uiStore.openIconSelectDialog(
    { currentIcon: rootIcon.value },
    {
      onSelect: (icon) => {
        rootIcon.value = icon;
        localStorage.setItem(ROOT_ICON_KEY, icon);
      },
    }
  );
}

function handleLevel1Click(name: string) {
  if (props.mode === 'add') {
    // 添加模式：点击分类添加到展示区
    if (name !== '全部' && name !== '未分类') {
      // 找到对应的分类
      const cat = tagStore.library.categories.find(c => c.path === name);
      if (cat) {
        emit('categoryClick', cat);
      }
    }
  } else {
    tagStore.selectLevel1(name === '全部' ? '' : name);
    emit('categoryClick', null);
  }
}

function handleCategoryClick(cat: FlatCategory) {
  if (props.mode === 'migrate' && tagStore.selectionType === 'category') {
    // 迁移模式且选中的是分类：切换选中状态
    tagStore.toggleCategorySelection(cat.id);
    return;
  }

  if (props.mode === 'add') {
    // 添加模式：点击分类行只选中分类以筛选标签，不触发添加
    // 添加功能通过专门的+按钮触发
    tagStore.selectLevel1(cat.level1);
    if (cat.depth > 0) {
      tagStore.selectLevel2(cat.name);
    } else {
      tagStore.selectLevel2('');
    }
    return;
  }

  // 普通模式
  const isAlreadySelected = selectedCategoryId.value === cat.id;

  // 选中分类
  tagStore.selectLevel1(cat.level1);
  if (cat.depth > 0) {
    tagStore.selectLevel2(cat.name);
  } else {
    tagStore.selectLevel2('');
  }

  // 展开/折叠逻辑
  if (cat.hasChildren) {
    let changed = false;
    if (!expandedCategories.value.has(cat.id)) {
      // 未展开 -> 展开
      expandedCategories.value.add(cat.id);
      changed = true;
    } else if (isAlreadySelected) {
      // 已展开且已选中 -> 折叠
      expandedCategories.value.delete(cat.id);
      changed = true;
    }

    // 触发响应式更新
    if (changed) {
      expandedCategories.value = new Set(expandedCategories.value);
    }
  }

  emit('categoryClick', tagStore.getCategoryById(cat.id) || null);
}

function toggleExpand(categoryId: string) {
  if (expandedCategories.value.has(categoryId)) {
    expandedCategories.value.delete(categoryId);
  } else {
    expandedCategories.value.add(categoryId);
  }
  // 触发响应式更新
  expandedCategories.value = new Set(expandedCategories.value);
}

function handleAddCategory(categoryId: string) {
  emit('addCategory', categoryId);
}

function toggleCategorySelection(categoryId: string) {
  tagStore.toggleCategorySelection(categoryId);
}

function handleMigrateToCategory(categoryId: string) {
  emit('migrateToCategory', categoryId);
}

function handleDeleteCategory(categoryId: string) {
  emit('deleteCategory', categoryId);
}

function handleScroll(e: Event) {
  // 吸顶效果逻辑
  const container = e.target as HTMLElement;
  // 获取所有分类项（不仅是展开的）
  const items = container.querySelectorAll('.acu-tag-tree-item');
  const containerTop = container.getBoundingClientRect().top;

  let lastItemAboveTop: HTMLElement | null = null;

  // 找到最后一个已经滚过顶部的项
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as HTMLElement;
    const rect = item.getBoundingClientRect();
    // 使用 +10 作为缓冲，与原逻辑保持一致
    if (rect.top < containerTop + 10) {
      lastItemAboveTop = item;
    } else {
      // 因为是按顺序排列的，一旦找到一个在下面的，后面的肯定也在下面
      break;
    }
  }

  if (!lastItemAboveTop) {
    stickyCategory.value = null;
    return;
  }

  const catId = lastItemAboveTop.dataset.categoryId;
  if (!catId) {
    // 可能是根目录、未分类或分隔线，不吸顶
    stickyCategory.value = null;
    return;
  }

  // 查找对应的分类数据
  const category = customCategories.value.find(c => c.id === catId);
  if (!category) {
    stickyCategory.value = null;
    return;
  }

  // 逻辑：
  // 1. 如果是已展开的父分类，吸顶
  // 2. 如果是子分类，其父分类吸顶
  // 3. 如果是未展开的分类，不吸顶（清空之前的吸顶）

  if (category.hasChildren && expandedCategories.value.has(category.id)) {
    stickyCategory.value = category.id;
  } else if (category.parentId) {
    // 是子分类，检查父分类是否展开（理论上能看到子分类，父分类肯定是展开的）
    if (expandedCategories.value.has(category.parentId)) {
      stickyCategory.value = category.parentId;
    } else {
      stickyCategory.value = null;
    }
  } else {
    // 未展开的一级分类
    stickyCategory.value = null;
  }
}

// 监听模式变化，清空选中状态
watch(
  () => props.mode,
  newMode => {
    if (newMode !== 'migrate') {
      tagStore.clearSelection();
    }
  },
);
</script>
