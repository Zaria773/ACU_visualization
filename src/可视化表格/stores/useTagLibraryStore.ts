/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 标签库状态管理 Store
 * 管理全局标签库（分类和标签），存储在酒馆全局变量中
 */

import { klona } from 'klona';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type {
  GlobalTagLibrary,
  ImportOptions,
  ImportResult,
  InteractiveTag,
  ParsedCategory,
  TagCategory,
  TagLibraryExport,
  TagManagerMode,
} from '../types';

/** 存储键常量 */
const STORAGE_KEY = 'acu_global_tag_library';

/** 空的标签库默认值 */
const DEFAULT_LIBRARY: GlobalTagLibrary = {
  categories: [],
  tags: [],
};

/** 内置的一级分类（始终显示） */
const BUILTIN_LEVEL1 = [
  { name: '全部', icon: '', hasChildren: false },
  { name: '未分类', icon: '📦', hasChildren: false },
];

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const useTagLibraryStore = defineStore('acu-tag-library', () => {
  // ============================================================
  // 状态
  // ============================================================

  /** 全局标签库 */
  const library = ref<GlobalTagLibrary>({ ...DEFAULT_LIBRARY });

  /** 当前选中的一级分类（空字符串表示"全部"） */
  const selectedLevel1 = ref<string>('');

  /** 当前选中的二级分类（空字符串表示显示该一级下所有） */
  const selectedLevel2 = ref<string>('');

  /** 搜索关键词 */
  const searchKeyword = ref<string>('');

  /** 是否已加载 */
  const isLoaded = ref(false);

  /** 是否正在保存（防抖用） */
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  // ============================================================
  // 模式系统状态（新增）
  // ============================================================

  /** 当前模式 */
  const currentMode = ref<TagManagerMode>('normal');

  /** 迁移/导出模式：选中的标签 ID 集合 */
  const selectedTagIds = ref<Set<string>>(new Set());

  /** 迁移模式：选中的分类 ID 集合 */
  const selectedCategoryIds = ref<Set<string>>(new Set());

  /** 迁移模式：当前选中的是标签还是分类 */
  const selectionType = ref<'tag' | 'category' | null>(null);

  // ============================================================
  // 持久化 - 酒馆全局变量
  // ============================================================

  /**
   * 从全局变量加载标签库
   */
  async function loadLibrary(): Promise<void> {
    try {
      if (typeof getVariables !== 'function') {
        console.warn('[ACU TagLibrary] getVariables 不可用，使用默认配置');
        isLoaded.value = true;
        return;
      }

      const globalVars = getVariables({ type: 'global' });

      if (globalVars && globalVars[STORAGE_KEY]) {
        const storedLibrary = globalVars[STORAGE_KEY] as GlobalTagLibrary;

        // 合并默认值，确保结构完整
        library.value = {
          categories: storedLibrary.categories || [],
          tags: storedLibrary.tags || [],
        };

        console.info('[ACU TagLibrary] 已从全局变量加载标签库:', {
          categories: library.value.categories.length,
          tags: library.value.tags.length,
        });
      } else {
        // 首次加载，尝试从旧的 interactiveTagConfig.tagDefinitions 迁移
        await migrateFromOldConfig();
      }

      isLoaded.value = true;
    } catch (e) {
      console.error('[ACU TagLibrary] 加载标签库失败:', e);
      library.value = { ...DEFAULT_LIBRARY };
      isLoaded.value = true;
    }
  }

  /**
   * 保存标签库到全局变量
   */
  async function saveLibrary(): Promise<void> {
    // 防抖：清除之前的保存计时器
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(() => {
      try {
        if (typeof getVariables !== 'function' || typeof replaceVariables !== 'function') {
          console.warn('[ACU TagLibrary] 脚本变量 API 不可用');
          return;
        }

        const globalVars = getVariables({ type: 'global' }) || {};

        // 使用 klona 去除 proxy 层
        const dataToSave = klona(library.value);

        replaceVariables(
          {
            ...globalVars,
            [STORAGE_KEY]: dataToSave,
          },
          { type: 'global' },
        );

        console.info('[ACU TagLibrary] 已保存标签库到全局变量');
      } catch (e) {
        console.error('[ACU TagLibrary] 保存标签库失败:', e);
      }
    }, 300); // 300ms 防抖
  }

  /**
   * 从旧配置迁移数据
   * 兼容旧版 interactiveTagConfig.tagDefinitions
   */
  async function migrateFromOldConfig(): Promise<void> {
    try {
      // 这里可以添加从旧配置迁移的逻辑
      // 目前暂时跳过，因为旧配置存储在 DashboardWidgetConfig 中
      console.info('[ACU TagLibrary] 首次使用，初始化空标签库');
      library.value = { ...DEFAULT_LIBRARY };
    } catch (e) {
      console.warn('[ACU TagLibrary] 迁移旧配置失败:', e);
    }
  }

  // 监听变化自动保存
  watch(
    library,
    () => {
      if (isLoaded.value) {
        saveLibrary();
      }
    },
    { deep: true },
  );

  // ============================================================
  // 分类操作
  // ============================================================

  /**
   * 解析分类路径
   * @param category 分类对象
   */
  function parseCategoryPath(category: TagCategory): ParsedCategory {
    const parts = category.path.split('/');
    return {
      category,
      level1: parts[0] || '',
      level2: parts[1] || '',
      rest: parts.slice(2).join('/'),
    };
  }

  /**
   * 获取所有一级分类（含内置）
   */
  const level1Categories = computed<Array<{ name: string; icon?: string; hasChildren: boolean }>>(() => {
    // 提取所有一级分类名
    const level1Set = new Map<string, { icon?: string; hasChildren: boolean }>();

    library.value.categories.forEach(cat => {
      const parsed = parseCategoryPath(cat);
      if (parsed.level1) {
        const existing = level1Set.get(parsed.level1);
        const hasChildren = parsed.level2 !== '';

        if (existing) {
          // 如果已存在，更新 hasChildren
          existing.hasChildren = existing.hasChildren || hasChildren;
          // 使用第一个找到的图标
        } else {
          level1Set.set(parsed.level1, {
            icon: cat.icon,
            hasChildren,
          });
        }
      }
    });

    // 构建结果列表
    const customLevel1: Array<{ name: string; icon?: string; hasChildren: boolean }> = [];
    level1Set.forEach((value, name) => {
      customLevel1.push({
        name,
        icon: value.icon,
        hasChildren: value.hasChildren,
      });
    });

    // 按名称排序
    customLevel1.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    // 返回内置 + 自定义
    return [...BUILTIN_LEVEL1, ...customLevel1];
  });

  /**
   * 获取当前一级分类下的二级分类
   */
  const level2Categories = computed<Array<{ name: string; fullPath: string }>>(() => {
    if (!selectedLevel1.value || selectedLevel1.value === '全部' || selectedLevel1.value === '未分类') {
      return [];
    }

    const result: Array<{ name: string; fullPath: string }> = [];
    const seen = new Set<string>();

    library.value.categories.forEach(cat => {
      const parsed = parseCategoryPath(cat);
      if (parsed.level1 === selectedLevel1.value && parsed.level2 && !seen.has(parsed.level2)) {
        seen.add(parsed.level2);
        result.push({
          name: parsed.level2,
          fullPath: `${parsed.level1}/${parsed.level2}`,
        });
      }
    });

    // 按名称排序
    result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    return result;
  });

  /**
   * 添加分类
   * @param path 分类路径（如 "互动/日常"）
   * @param icon 图标（可选，只有一级分类需要）
   *
   * 自动创建缺失的父级分类，确保分类层级完整
   */
  function addCategory(path: string, icon?: string): TagCategory {
    // 自动创建父级分类
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const parentPath = parts.slice(0, i).join('/');
      const existingParent = library.value.categories.find(c => c.path === parentPath);
      if (!existingParent) {
        // 创建父级分类（不带图标）
        const parentCategory: TagCategory = {
          id: generateId('cat'),
          path: parentPath,
          createdAt: new Date().toISOString(),
        };
        library.value.categories.push(parentCategory);
        console.info('[ACU TagLibrary] 自动创建父级分类:', parentPath);
      }
    }

    // 检查目标分类是否已存在
    const existing = library.value.categories.find(c => c.path === path);
    if (existing) {
      // 如果提供了图标，更新图标
      if (icon !== undefined && icon !== existing.icon) {
        existing.icon = icon;
        console.info('[ACU TagLibrary] 更新分类图标:', path);
      }
      return existing;
    }

    // 创建目标分类
    const newCategory: TagCategory = {
      id: generateId('cat'),
      path,
      icon,
      createdAt: new Date().toISOString(),
    };

    library.value.categories.push(newCategory);
    console.info('[ACU TagLibrary] 创建分类:', path);
    // saveLibrary 由 watch 自动触发
    return newCategory;
  }

  /**
   * 删除分类（连同子分类和所有标签一起删除）
   * @param categoryId 分类 ID
   */
  function deleteCategory(categoryId: string): void {
    const category = library.value.categories.find(c => c.id === categoryId);
    if (!category) {
      console.warn('[ACU TagLibrary] 分类不存在:', categoryId);
      return;
    }

    // 获取该分类及其所有子分类的 ID
    const categoryIdsToDelete = new Set<string>();
    library.value.categories.forEach(cat => {
      if (cat.path === category.path || cat.path.startsWith(category.path + '/')) {
        categoryIdsToDelete.add(cat.id);
      }
    });

    // 删除这些分类下的所有标签
    library.value.tags = library.value.tags.filter(tag => !categoryIdsToDelete.has(tag.categoryId));

    // 删除分类及其子分类
    library.value.categories = library.value.categories.filter(c => !categoryIdsToDelete.has(c.id));

    console.info('[ACU TagLibrary] 已删除分类及其内容:', category.path, '(子分类数:', categoryIdsToDelete.size - 1, ')');
    // saveLibrary 由 watch 自动触发
  }

  /**
   * 更新分类
   * @param categoryId 分类 ID
   * @param updates 更新内容
   */
  function updateCategory(categoryId: string, updates: Partial<Pick<TagCategory, 'path' | 'icon'>>): void {
    const category = library.value.categories.find(c => c.id === categoryId);
    if (category) {
      if (updates.path !== undefined) category.path = updates.path;
      if (updates.icon !== undefined) category.icon = updates.icon;
      // saveLibrary 由 watch 自动触发
    }
  }

  /**
   * 根据 ID 获取分类
   * @param categoryId 分类 ID
   */
  function getCategoryById(categoryId: string): TagCategory | undefined {
    return library.value.categories.find(c => c.id === categoryId);
  }

  /**
   * 根据路径获取分类
   * @param path 分类路径
   */
  function getCategoryByPath(path: string): TagCategory | undefined {
    return library.value.categories.find(c => c.path === path);
  }

  // ============================================================
  // 标签操作
  // ============================================================

  /**
   * 获取筛选后的标签列表
   */
  const filteredTags = computed<InteractiveTag[]>(() => {
    let result = [...library.value.tags];

    // 按搜索关键词筛选
    if (searchKeyword.value.trim()) {
      const keyword = searchKeyword.value.toLowerCase();
      result = result.filter(
        tag => tag.label.toLowerCase().includes(keyword) || tag.promptTemplate.toLowerCase().includes(keyword),
      );
    }

    // 按一级分类筛选
    if (selectedLevel1.value === '未分类') {
      // 未分类：categoryId 为空或不存在的分类
      result = result.filter(tag => {
        if (!tag.categoryId) return true;
        return !library.value.categories.find(c => c.id === tag.categoryId);
      });
    } else if (selectedLevel1.value && selectedLevel1.value !== '全部') {
      // 获取该一级分类下的所有分类 ID
      const matchingCategoryIds = new Set<string>();

      library.value.categories.forEach(cat => {
        const parsed = parseCategoryPath(cat);
        if (parsed.level1 === selectedLevel1.value) {
          // 如果选择了二级分类，只匹配该二级
          if (selectedLevel2.value) {
            if (parsed.level2 === selectedLevel2.value) {
              matchingCategoryIds.add(cat.id);
            }
          } else {
            matchingCategoryIds.add(cat.id);
          }
        }
      });

      result = result.filter(tag => matchingCategoryIds.has(tag.categoryId));
    }

    // 按创建时间倒序
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return result;
  });

  /**
   * 添加或更新标签
   * @param tag 标签对象
   */
  function upsertTag(tag: InteractiveTag): void {
    const index = library.value.tags.findIndex(t => t.id === tag.id);
    if (index >= 0) {
      // 更新
      library.value.tags[index] = { ...tag };
    } else {
      // 新增
      library.value.tags.push({
        ...tag,
        createdAt: tag.createdAt || new Date().toISOString(),
      });
    }
    // saveLibrary 由 watch 自动触发
  }

  /**
   * 创建新标签
   * @param label 标签文本
   * @param categoryId 分类 ID（可选）
   * @param promptTemplate 提示词模板（可选）
   */
  function createTag(label: string, categoryId: string = '', promptTemplate: string = ''): InteractiveTag {
    const newTag: InteractiveTag = {
      id: generateId('tag'),
      label,
      categoryId,
      promptTemplate,
      createdAt: new Date().toISOString(),
    };

    library.value.tags.push(newTag);
    // saveLibrary 由 watch 自动触发
    return newTag;
  }

  /**
   * 删除标签
   * @param tagId 标签 ID
   */
  function deleteTag(tagId: string): void {
    library.value.tags = library.value.tags.filter(t => t.id !== tagId);
    // saveLibrary 由 watch 自动触发
  }

  /**
   * 批量删除标签
   * @param tagIds 标签 ID 列表
   */
  function deleteTags(tagIds: string[]): void {
    const idsSet = new Set(tagIds);
    library.value.tags = library.value.tags.filter(t => !idsSet.has(t.id));
    // saveLibrary 由 watch 自动触发
  }

  /**
   * 根据 ID 获取标签
   * @param tagId 标签 ID
   */
  function getTagById(tagId: string): InteractiveTag | undefined {
    return library.value.tags.find(t => t.id === tagId);
  }

  /**
   * 根据分类 ID 获取标签列表
   * @param categoryId 分类 ID
   */
  function getTagsByCategory(categoryId: string): InteractiveTag[] {
    return library.value.tags.filter(t => t.categoryId === categoryId);
  }

  /**
   * 移动标签到新分类
   * @param tagId 标签 ID
   * @param categoryId 新分类 ID
   */
  function moveTagToCategory(tagId: string, categoryId: string): void {
    const tag = library.value.tags.find(t => t.id === tagId);
    if (tag) {
      tag.categoryId = categoryId;
      // saveLibrary 由 watch 自动触发
    }
  }

  /**
   * 批量移动标签到新分类
   * @param tagIds 标签 ID 列表
   * @param categoryId 新分类 ID
   */
  function moveTagsToCategory(tagIds: string[], categoryId: string): void {
    const idsSet = new Set(tagIds);
    library.value.tags.forEach(tag => {
      if (idsSet.has(tag.id)) {
        tag.categoryId = categoryId;
      }
    });
    // saveLibrary 由 watch 自动触发
  }

  // ============================================================
  // 模式系统操作（新增）
  // ============================================================

  /**
   * 切换模式
   * @param mode 目标模式
   */
  function setMode(mode: TagManagerMode): void {
    // 如果切换到非选择模式，清空选中状态
    if (mode !== 'migrate' && mode !== 'export') {
      clearSelection();
    }
    currentMode.value = mode;
  }

  /**
   * 切换标签选中状态（迁移/导出模式用）
   * @param tagId 标签 ID
   */
  function toggleTagSelection(tagId: string): void {
    // 如果之前选的是分类，先清空
    if (selectionType.value === 'category') {
      selectedCategoryIds.value.clear();
    }
    selectionType.value = 'tag';

    if (selectedTagIds.value.has(tagId)) {
      selectedTagIds.value.delete(tagId);
    } else {
      selectedTagIds.value.add(tagId);
    }
    // 触发响应式更新
    selectedTagIds.value = new Set(selectedTagIds.value);
  }

  /**
   * 切换分类选中状态（迁移模式用）
   * @param categoryId 分类 ID
   */
  function toggleCategorySelection(categoryId: string): void {
    // 如果之前选的是标签，先清空
    if (selectionType.value === 'tag') {
      selectedTagIds.value.clear();
    }
    selectionType.value = 'category';

    if (selectedCategoryIds.value.has(categoryId)) {
      selectedCategoryIds.value.delete(categoryId);
    } else {
      selectedCategoryIds.value.add(categoryId);
    }
    // 触发响应式更新
    selectedCategoryIds.value = new Set(selectedCategoryIds.value);
  }

  /**
   * 清空选中状态
   */
  function clearSelection(): void {
    selectedTagIds.value = new Set();
    selectedCategoryIds.value = new Set();
    selectionType.value = null;
  }

  /**
   * 批量迁移选中的标签到目标分类
   * @param targetCategoryId 目标分类 ID
   */
  function migrateSelectedTags(targetCategoryId: string): void {
    if (selectionType.value === 'tag' && selectedTagIds.value.size > 0) {
      moveTagsToCategory(Array.from(selectedTagIds.value), targetCategoryId);
      clearSelection();
    }
  }

  /**
   * 批量迁移选中的分类到目标父分类
   * @param targetParentPath 目标父分类路径
   */
  function migrateSelectedCategories(targetParentPath: string): void {
    if (selectionType.value === 'category' && selectedCategoryIds.value.size > 0) {
      selectedCategoryIds.value.forEach(categoryId => {
        const category = getCategoryById(categoryId);
        if (category) {
          const parts = category.path.split('/');
          const categoryName = parts[parts.length - 1];
          const newPath = targetParentPath ? `${targetParentPath}/${categoryName}` : categoryName;
          updateCategory(categoryId, { path: newPath });
        }
      });
      clearSelection();
    }
  }

  /**
   * 批量迁移选中的项目（标签或分类）到目标分类
   * @param targetCategoryId 目标分类 ID（空字符串表示根级）
   */
  function migrateSelectedItems(targetCategoryId: string): void {
    const targetCategory = targetCategoryId ? getCategoryById(targetCategoryId) : null;
    const targetPath = targetCategory?.path || '';

    if (selectionType.value === 'tag' && selectedTagIds.value.size > 0) {
      // 迁移标签
      moveTagsToCategory(Array.from(selectedTagIds.value), targetCategoryId);
      clearSelection();
    } else if (selectionType.value === 'category' && selectedCategoryIds.value.size > 0) {
      // 迁移分类：更新分类路径，同时更新所有子分类
      selectedCategoryIds.value.forEach(categoryId => {
        const category = getCategoryById(categoryId);
        if (category && categoryId !== targetCategoryId) {
          const oldPath = category.path;
          const parts = oldPath.split('/');
          const categoryName = parts[parts.length - 1];
          const newPath = targetPath ? `${targetPath}/${categoryName}` : categoryName;

          // 更新当前分类
          updateCategory(categoryId, { path: newPath });

          // 同时更新所有子分类的路径
          library.value.categories.forEach(childCat => {
            if (childCat.path.startsWith(oldPath + '/')) {
              // 替换路径前缀：oldPath -> newPath
              const childNewPath = newPath + childCat.path.slice(oldPath.length);
              updateCategory(childCat.id, { path: childNewPath });
            }
          });
        }
      });
      clearSelection();
    }
  }

  // ============================================================
  // 导入导出功能（新增）
  // ============================================================

  /**
   * 导出标签库
   * @param scope 导出范围
   * @param categoryId 分类 ID（scope='category' 时需要）
   */
  function exportLibrary(
    scope: 'all' | 'category' | 'selected',
    categoryId?: string,
  ): TagLibraryExport {
    let categoriesToExport: TagCategory[] = [];
    let tagsToExport: InteractiveTag[] = [];

    if (scope === 'all') {
      categoriesToExport = [...library.value.categories];
      tagsToExport = [...library.value.tags];
    } else if (scope === 'category' && categoryId) {
      // 导出指定分类及其子分类
      const category = getCategoryById(categoryId);
      if (category) {
        categoriesToExport = library.value.categories.filter(
          c => c.path === category.path || c.path.startsWith(category.path + '/'),
        );
        const categoryIds = new Set(categoriesToExport.map(c => c.id));
        tagsToExport = library.value.tags.filter(t => categoryIds.has(t.categoryId));
      }
    } else if (scope === 'selected') {
      // 导出选中的标签（及其分类）
      tagsToExport = library.value.tags.filter(t => selectedTagIds.value.has(t.id));
      const categoryIds = new Set(tagsToExport.map(t => t.categoryId).filter(Boolean));
      categoriesToExport = library.value.categories.filter(c => categoryIds.has(c.id));
    }

    // 构建导出数据
    const exportData: TagLibraryExport = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      categories: categoriesToExport.map(c => ({
        id: c.id,
        path: c.path,
        icon: c.icon,
      })),
      tags: tagsToExport.map(t => {
        const category = getCategoryById(t.categoryId);
        return {
          id: t.id,
          label: t.label,
          category: category?.path || '',
          prompt: t.promptTemplate,
          allowPreEdit: t.allowPreEdit,
        };
      }),
    };

    return exportData;
  }

  /**
   * 导入标签库
   * @param data 导入数据
   * @param options 导入选项
   */
  function importLibrary(data: TagLibraryExport, options: ImportOptions): ImportResult {
    try {
      let addedCategories = 0;
      let addedTags = 0;
      let updatedTags = 0;
      let renamedTags = 0;

      // 创建路径到分类 ID 的映射
      const pathToCategoryId = new Map<string, string>();
      library.value.categories.forEach(c => {
        pathToCategoryId.set(c.path, c.id);
      });

      // 导入分类
      data.categories.forEach(importCat => {
        if (!pathToCategoryId.has(importCat.path)) {
          const newCategory = addCategory(importCat.path, importCat.icon);
          pathToCategoryId.set(importCat.path, newCategory.id);
          addedCategories++;
        }
      });

      // 导入标签
      data.tags.forEach(importTag => {
        const categoryId = pathToCategoryId.get(importTag.category) || '';

        // 检查是否存在同名标签
        const existingTag = library.value.tags.find(
          t => t.label === importTag.label && t.categoryId === categoryId,
        );

        if (existingTag) {
          if (options.conflictStrategy === 'overwrite') {
            // 覆盖模式：更新现有标签
            existingTag.promptTemplate = importTag.prompt;
            existingTag.allowPreEdit = importTag.allowPreEdit;
            updatedTags++;
          } else {
            // 重命名模式：添加序号后缀
            let newLabel = importTag.label;
            let suffix = 1;
            while (library.value.tags.some(t => t.label === newLabel && t.categoryId === categoryId)) {
              newLabel = `${importTag.label}_${suffix}`;
              suffix++;
            }
            createTag(newLabel, categoryId, importTag.prompt);
            // 设置 allowPreEdit
            const newTag = library.value.tags[library.value.tags.length - 1];
            if (newTag && importTag.allowPreEdit) {
              newTag.allowPreEdit = importTag.allowPreEdit;
            }
            renamedTags++;
          }
        } else {
          // 不存在冲突，直接添加
          createTag(importTag.label, categoryId, importTag.prompt);
          const newTag = library.value.tags[library.value.tags.length - 1];
          if (newTag && importTag.allowPreEdit) {
            newTag.allowPreEdit = importTag.allowPreEdit;
          }
          addedTags++;
        }
      });

      return {
        success: true,
        addedCategories,
        addedTags,
        updatedTags,
        renamedTags,
      };
    } catch (e) {
      console.error('[ACU TagLibrary] 导入失败:', e);
      return {
        success: false,
        addedCategories: 0,
        addedTags: 0,
        updatedTags: 0,
        renamedTags: 0,
        error: e instanceof Error ? e.message : '未知错误',
      };
    }
  }

  // ============================================================
  // 分类选择操作
  // ============================================================

  /**
   * 选择一级分类
   * @param name 分类名称
   */
  function selectLevel1(name: string): void {
    selectedLevel1.value = name;
    selectedLevel2.value = ''; // 重置二级选择
  }

  /**
   * 选择二级分类
   * @param name 分类名称
   */
  function selectLevel2(name: string): void {
    selectedLevel2.value = name;
  }

  /**
   * 重置分类选择
   */
  function resetSelection(): void {
    selectedLevel1.value = '';
    selectedLevel2.value = '';
    searchKeyword.value = '';
  }

  // ============================================================
  // 分类辅助方法（新增）
  // ============================================================

  /**
   * 获取分类下的直接子分类
   * @param parentPath 父分类路径（空字符串表示根级）
   */
  function getChildCategories(parentPath: string): TagCategory[] {
    return library.value.categories.filter(cat => {
      if (parentPath === '') {
        // 根级：只返回一级分类
        return !cat.path.includes('/');
      } else {
        // 子级：路径以 parentPath/ 开头，且只有一层
        if (!cat.path.startsWith(parentPath + '/')) return false;
        const rest = cat.path.slice(parentPath.length + 1);
        return !rest.includes('/');
      }
    });
  }

  /**
   * 获取分类的标签数量（含子分类）
   * @param categoryId 分类 ID
   */
  function getCategoryTagCount(categoryId: string): number {
    const category = getCategoryById(categoryId);
    if (!category) return 0;

    // 获取该分类及其所有子分类的 ID
    const categoryIds = new Set<string>();
    library.value.categories.forEach(cat => {
      if (cat.path === category.path || cat.path.startsWith(category.path + '/')) {
        categoryIds.add(cat.id);
      }
    });

    // 统计这些分类下的标签数
    return library.value.tags.filter(tag => categoryIds.has(tag.categoryId)).length;
  }

  /**
   * 获取一级分类下的标签总数
   * @param level1Name 一级分类名称
   */
  function getLevel1TagCount(level1Name: string): number {
    if (level1Name === '全部') {
      return library.value.tags.length;
    }
    if (level1Name === '未分类') {
      return uncategorizedCount.value;
    }

    // 获取该一级分类下所有分类的 ID
    const categoryIds = new Set<string>();
    library.value.categories.forEach(cat => {
      const parsed = parseCategoryPath(cat);
      if (parsed.level1 === level1Name) {
        categoryIds.add(cat.id);
      }
    });

    return library.value.tags.filter(tag => categoryIds.has(tag.categoryId)).length;
  }

  // ============================================================
  // 清空操作
  // ============================================================

  /**
   * 清空所有标签和分类
   */
  function clearAll(): void {
    library.value.tags = [];
    library.value.categories = [];
    console.info('[ACU TagLibrary] 已清空所有标签和分类');
    // saveLibrary 由 watch 自动触发
  }

  // ============================================================
  // 统计信息
  // ============================================================

  /** 总标签数 */
  const totalTags = computed(() => library.value.tags.length);

  /** 总分类数 */
  const totalCategories = computed(() => library.value.categories.length);

  /** 未分类标签数 */
  const uncategorizedCount = computed(() => {
    return library.value.tags.filter(tag => {
      if (!tag.categoryId) return true;
      return !library.value.categories.find(c => c.id === tag.categoryId);
    }).length;
  });

  return {
    // 状态
    library,
    selectedLevel1,
    selectedLevel2,
    searchKeyword,
    isLoaded,

    // 模式系统状态
    currentMode,
    selectedTagIds,
    selectedCategoryIds,
    selectionType,

    // 持久化
    loadLibrary,
    saveLibrary,

    // 分类操作
    parseCategoryPath,
    level1Categories,
    level2Categories,
    addCategory,
    deleteCategory,
    updateCategory,
    getCategoryById,
    getCategoryByPath,
    getChildCategories,
    getCategoryTagCount,
    getLevel1TagCount,

    // 标签操作
    filteredTags,
    upsertTag,
    createTag,
    deleteTag,
    deleteTags,
    getTagById,
    getTagsByCategory,
    moveTagToCategory,
    moveTagsToCategory,

    // 模式系统操作
    setMode,
    toggleTagSelection,
    toggleCategorySelection,
    clearSelection,
    migrateSelectedTags,
    migrateSelectedCategories,
    migrateSelectedItems,

    // 导入导出
    exportLibrary,
    importLibrary,

    // 清空操作
    clearAll,

    // 分类选择
    selectLevel1,
    selectLevel2,
    resetSelection,

    // 统计
    totalTags,
    totalCategories,
    uncategorizedCount,
  };
});
