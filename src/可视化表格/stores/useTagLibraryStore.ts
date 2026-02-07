/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 标签库状态管理 Store
 * 管理全局标签库（分类和标签）
 * 使用 ConfigManager 统一管理配置
 *
 * 注意：使用 ref + watch 模式而非 computed getter/setter
 * 这样可以确保直接修改对象属性时也能触发保存
 */

import { klona } from 'klona';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { getACUConfigManager } from '../composables/useACUConfigManager';
import type {
  GlobalTagLibrary,
  ImportOptions,
  ImportResult,
  InteractiveTag,
  TagCategory,
  TagLibraryExport,
  TagManagerMode,
} from '../types';

/** 空的标签库默认值 */
const DEFAULT_LIBRARY: GlobalTagLibrary = {
  categories: [
    { id: 'cat_general', path: '通用', icon: 'fas fa-cog', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'cat_location', path: '地点', icon: 'fas fa-map-marker-alt', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'cat_character', path: '人物', icon: 'fas fa-user', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'cat_char_social', path: '人物/社交', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'cat_char_observe', path: '人物/观察', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'cat_char_conflict', path: '人物/冲突', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'cat_item', path: '物品', icon: 'fas fa-box-open', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'cat_quest', path: '任务', icon: 'fas fa-scroll', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'cat_action', path: '动作', icon: 'fas fa-running', createdAt: '2024-01-01T00:00:00.000Z' },
  ],
  tags: [
    // 通用
    {
      id: 'tag_gen_prevent',
      label: '防转述',
      categoryId: 'cat_general',
      promptTemplate: '禁止在正文中复述用户输入。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_gen_speak',
      label: '抢话',
      categoryId: 'cat_general',
      promptTemplate: '{{user}}在正文中必须有2句以上新对白。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_gen_detail',
      label: '细写',
      categoryId: 'cat_general',
      promptTemplate: '放慢节奏，禁止更换当前叙事中心与切场景。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_gen_pov',
      label: '切视角',
      categoryId: 'cat_general',
      promptTemplate: '以{{rowTitle}}的视角来描写接下来的场景。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },

    // 地点
    {
      id: 'tag_loc_go',
      label: '前往',
      categoryId: 'cat_location',
      promptTemplate: '动身前往{{rowTitle}}。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_loc_wander',
      label: '闲逛',
      categoryId: 'cat_location',
      promptTemplate: '在{{rowTitle}}四处闲逛。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_loc_search',
      label: '搜查',
      categoryId: 'cat_location',
      promptTemplate: '仔细搜查{{rowTitle}}。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_loc_sneak',
      label: '潜入',
      categoryId: 'cat_location',
      promptTemplate: '悄悄潜入{{rowTitle}}。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },

    // 人物/社交
    {
      id: 'tag_char_talk',
      label: '搭话',
      categoryId: 'cat_char_social',
      promptTemplate: '主动向{{rowTitle}}搭话。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_char_ask',
      label: '询问',
      categoryId: 'cat_char_social',
      promptTemplate: '向{{rowTitle}}询问...',
      allowPreEdit: true,
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_char_req',
      label: '请求',
      categoryId: 'cat_char_social',
      promptTemplate: '向{{rowTitle}}请求...',
      allowPreEdit: true,
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_char_invite',
      label: '邀请',
      categoryId: 'cat_char_social',
      promptTemplate: '邀请{{rowTitle}}同行。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_char_thx',
      label: '感谢',
      categoryId: 'cat_char_social',
      promptTemplate: '向{{rowTitle}}表示感谢。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_char_sry',
      label: '道歉',
      categoryId: 'cat_char_social',
      promptTemplate: '向{{rowTitle}}道歉。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },

    // 人物/观察
    {
      id: 'tag_char_gaze',
      label: '注视',
      categoryId: 'cat_char_observe',
      promptTemplate: '默默注视着{{rowTitle}}。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_char_track',
      label: '跟踪',
      categoryId: 'cat_char_observe',
      promptTemplate: '悄悄跟踪{{rowTitle}}。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_char_listen',
      label: '偷听',
      categoryId: 'cat_char_observe',
      promptTemplate: '偷听{{rowTitle}}的谈话。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },

    // 人物/冲突
    {
      id: 'tag_char_ques',
      label: '质问',
      categoryId: 'cat_char_conflict',
      promptTemplate: '质问{{rowTitle}}关于',
      allowPreEdit: true,
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_char_threat',
      label: '威胁',
      categoryId: 'cat_char_conflict',
      promptTemplate: '威胁{{rowTitle}}。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_char_atk',
      label: '攻击',
      categoryId: 'cat_char_conflict',
      promptTemplate: '对{{rowTitle}}发起攻击。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_char_flee',
      label: '逃离追击',
      categoryId: 'cat_char_conflict',
      promptTemplate: '试图逃离{{rowTitle}}的追击。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },

    // 物品
    {
      id: 'tag_item_use',
      label: '使用',
      categoryId: 'cat_item',
      promptTemplate: '使用{{rowTitle}}。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_item_check',
      label: '检查',
      categoryId: 'cat_item',
      promptTemplate: '仔细检查{{rowTitle}}，试图发现更多信息。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_item_gift',
      label: '赠送',
      categoryId: 'cat_item',
      promptTemplate: '把{{rowTitle}}送给',
      allowPreEdit: true,
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_item_show',
      label: '展示',
      categoryId: 'cat_item',
      promptTemplate: '向 展示{{rowTitle}}。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },

    // 任务
    {
      id: 'tag_quest_advance',
      label: '推进',
      categoryId: 'cat_quest',
      promptTemplate: '自然推进剧情，加入可以推进{{rowTitle}}进度的要素/桥段。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_quest_clue',
      label: '追踪线索',
      categoryId: 'cat_quest',
      promptTemplate: '追踪关于{{rowTitle}}的新线索。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_quest_help',
      label: '求助',
      categoryId: 'cat_quest',
      promptTemplate: '为解决{{rowTitle}}寻求 帮助。',
      allowPreEdit: true,
      createdAt: '2024-01-01T00:00:00.000Z',
    },

    // 动作
    {
      id: 'tag_act_hide',
      label: '躲藏',
      categoryId: 'cat_action',
      promptTemplate: '<user>找地方躲起来。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_act_rest',
      label: '休息',
      categoryId: 'cat_action',
      promptTemplate: '<user>决定找个地方休息一下。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_act_silent',
      label: '沉默',
      categoryId: 'cat_action',
      promptTemplate: '<user>陷入沉默',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'tag_act_daze',
      label: '走神',
      categoryId: 'cat_action',
      promptTemplate: '<user>走神发呆了一会儿。',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ],
};

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const useTagLibraryStore = defineStore('acu-tag-library', () => {
  // ============================================================
  // 使用 ConfigManager 统一管理配置
  // ============================================================
  const configManager = getACUConfigManager();

  // ============================================================
  // 使用 ref + watch 模式确保响应式正确工作
  // ============================================================

  /** 获取初始标签库数据 */
  function getInitialLibrary(): GlobalTagLibrary {
    const stored = configManager.config.tagLibrary;
    if (!stored || (!stored.categories?.length && !stored.tags?.length)) {
      return klona(DEFAULT_LIBRARY);
    }
    return klona(stored) as GlobalTagLibrary;
  }

  /** 全局标签库 - 使用 ref 实现响应式 */
  const library = ref<GlobalTagLibrary>(getInitialLibrary());

  /** 当前选中的分类 ID（''表示全部，'uncategorized'表示未分类） */
  const activeCategoryId = ref<string>('');

  /** 搜索关键词 */
  const searchKeyword = ref<string>('');

  /** 是否已加载 (ConfigManager 在初始化时已加载) */
  const isLoaded = computed(() => configManager.isLoaded.value);

  // 监听标签库变化，自动保存
  let isTagLibraryInitializing = true;
  watch(
    library,
    newValue => {
      if (isTagLibraryInitializing) return;
      configManager.config.tagLibrary = klona(newValue);
      configManager.saveConfig();
    },
    { deep: true },
  );

  // 初始化完成后允许保存
  setTimeout(() => {
    isTagLibraryInitializing = false;
  }, 100);

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
  // 持久化 - 使用 ConfigManager
  // ============================================================

  /**
   * 加载标签库 - ConfigManager 已在初始化时加载
   */
  async function loadLibrary(): Promise<void> {
    const stored = configManager.config.tagLibrary;
    if (!stored || (!stored.categories?.length && !stored.tags?.length)) {
      // 首次使用，初始化默认标签库
      configManager.config.tagLibrary = klona(DEFAULT_LIBRARY);
      configManager.saveConfig();
      console.info('[ACU TagLibrary] 首次使用，加载默认标签库');
    } else {
      console.info('[ACU TagLibrary] 已加载标签库:', {
        categories: stored.categories?.length || 0,
        tags: stored.tags?.length || 0,
      });
    }
  }

  /**
   * 保存标签库 - 使用 ConfigManager
   */
  async function saveLibrary(): Promise<void> {
    configManager.saveConfig();
    console.info('[ACU TagLibrary] 已保存标签库');
  }

  // ============================================================
  // 分类操作
  // ============================================================

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
    saveLibrary();
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

    console.info(
      '[ACU TagLibrary] 已删除分类及其内容:',
      category.path,
      '(子分类数:',
      categoryIdsToDelete.size - 1,
      ')',
    );
    saveLibrary();
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
      saveLibrary();
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

    // 按分类筛选
    if (activeCategoryId.value === 'uncategorized') {
      // 未分类：categoryId 为空或不存在的分类
      result = result.filter(tag => {
        if (!tag.categoryId) return true;
        return !library.value.categories.find(c => c.id === tag.categoryId);
      });
    } else if (activeCategoryId.value) {
      // 特定分类：匹配该分类及其所有子分类
      const currentCategory = getCategoryById(activeCategoryId.value);

      if (currentCategory) {
        const validCategoryIds = new Set<string>([currentCategory.id]);
        const pathPrefix = currentCategory.path + '/';

        // 查找所有子分类
        library.value.categories.forEach(cat => {
          if (cat.path.startsWith(pathPrefix)) {
            validCategoryIds.add(cat.id);
          }
        });

        result = result.filter(tag => validCategoryIds.has(tag.categoryId));
      } else {
        // 分类不存在（可能被删除了），显示空
        result = [];
      }
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
    saveLibrary();
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
    saveLibrary();
    return newTag;
  }

  /**
   * 删除标签
   * @param tagId 标签 ID
   */
  function deleteTag(tagId: string): void {
    library.value.tags = library.value.tags.filter(t => t.id !== tagId);
    saveLibrary();
  }

  /**
   * 批量删除标签
   * @param tagIds 标签 ID 列表
   */
  function deleteTags(tagIds: string[]): void {
    const idsSet = new Set(tagIds);
    library.value.tags = library.value.tags.filter(t => !idsSet.has(t.id));
    saveLibrary();
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
      saveLibrary();
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
    saveLibrary();
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
  function exportLibrary(scope: 'all' | 'category' | 'selected', categoryId?: string): TagLibraryExport {
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
        const existingTag = library.value.tags.find(t => t.label === importTag.label && t.categoryId === categoryId);

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
   * 选择分类
   * @param categoryId 分类 ID（''表示全部，'uncategorized'表示未分类）
   */
  function selectCategory(categoryId: string): void {
    activeCategoryId.value = categoryId;
  }

  /**
   * 重置分类选择
   */
  function resetSelection(): void {
    activeCategoryId.value = '';
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
    saveLibrary();
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
    activeCategoryId,
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
    addCategory,
    deleteCategory,
    updateCategory,
    getCategoryById,
    getCategoryByPath,
    getChildCategories,
    getCategoryTagCount,

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
    selectCategory,
    resetSelection,

    // 统计
    totalTags,
    totalCategories,
    uncategorizedCount,
  };
});
