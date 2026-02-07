/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 仪表盘配置状态管理 Store
 * 配置存储在 extensionSettings 中（通过 ConfigManager）
 */

import { klona } from 'klona';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { getACUConfigManager } from '../composables/useACUConfigManager';
import { detectWordPoolTables } from '../composables/useWordPool';
import type { DashboardConfig, DashboardWidgetConfig, WidgetActionId } from '../types';
import { TABLE_KEYWORD_RULES, WIDGET_TEMPLATES } from '../types';
import { getTableData, processJsonData } from '../utils';

/** 默认仪表盘配置 */
export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  widgets: [],
  layout: 'grid',
  columns: 2,
  showStats: true,
  hasInitializedDefaults: false, // 标记是否已完成首次默认组件初始化
};

/** 生成唯一 ID */
function generateId(): string {
  return `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const useDashboardStore = defineStore('acu-dashboard', () => {
  // ============================================================
  // ConfigManager 实例
  // ============================================================
  const configManager = getACUConfigManager();

  // ============================================================
  // 状态 - 使用 ref + watch 模式确保响应式正确工作
  //
  // 【重要】使用 ref 而非 computed getter/setter
  // computed getter 每次返回新对象，导致 Vue 无法追踪变化
  // ============================================================

  /** 是否已初始化 */
  const isInitialized = ref(false);

  /** 仪表盘配置 - 使用 ref 实现响应式 */
  const config = ref<DashboardConfig>({ ...DEFAULT_DASHBOARD_CONFIG });

  /** 从 ConfigManager 加载配置 */
  function loadConfigFromManager() {
    const stored = configManager.config.dashboard as DashboardConfig | undefined;
    // 只有当 stored 存在且包含 widgets 数组时才认为是有效配置
    // 否则可能是 ConfigManager 尚未加载完成，或者确实是首次使用
    if (stored && Array.isArray(stored.widgets)) {
      config.value = klona({
        ...DEFAULT_DASHBOARD_CONFIG,
        ...stored,
      });
      console.info('[DashboardStore] 配置已加载，widgets 数量:', config.value.widgets.length);
    } else {
      // 如果 ConfigManager 中的配置为空，不要急着覆盖为默认值
      // 可能是 ConfigManager 还没加载完
      // 但如果是首次初始化，ensureDefaultWidgets 会处理
      console.info('[DashboardStore] 未从 ConfigManager 读取到有效配置，保持当前状态');
    }
  }

  // 监听配置变化，自动保存
  // 默认设为 true，只有在明确加载完成后才设为 false
  let isDashboardConfigInitializing = true;
  watch(
    config,
    newValue => {
      if (isDashboardConfigInitializing) return;
      configManager.config.dashboard = klona(newValue);
      configManager.saveConfig();
    },
    { deep: true },
  );

  // ============================================================
  // Getters
  // ============================================================

  /** 启用的看板列表（按 order 排序） */
  const enabledWidgets = computed(() => {
    const widgets = config.value?.widgets;
    if (!Array.isArray(widgets)) return [];
    return widgets.filter(w => w.enabled).sort((a, b) => a.order - b.order);
  });

  /** 所有看板列表（按 order 排序） */
  const allWidgets = computed(() => {
    const widgets = config.value?.widgets;
    if (!Array.isArray(widgets)) return [];
    return [...widgets].sort((a, b) => a.order - b.order);
  });

  /** 是否显示统计卡片 */
  const showStats = computed(() => config.value.showStats);

  /** 网格列数 */
  const columns = computed(() => config.value.columns);

  /** 布局模式 */
  const layout = computed(() => config.value.layout);

  // ============================================================
  // Actions - 配置读写
  // ============================================================

  /**
   * 保存配置到 extensionSettings（通过 ConfigManager）
   */
  async function saveConfig(): Promise<void> {
    try {
      configManager.config.dashboard = klona(config.value);
      await configManager.saveConfig();
      console.log('[ACU Dashboard] 配置保存成功');
    } catch (error) {
      console.error('[ACU Dashboard] 配置保存失败:', error);
    }
  }

  /**
   * 更新配置并自动保存
   */
  function updateConfig(updates: Partial<DashboardConfig>): void {
    config.value = { ...config.value, ...updates };
    // 由于 watch 会自动保存，这里不需要手动调用 saveConfig
  }

  /**
   * 加载配置（从 ConfigManager，已在 index.ts 中同步加载）
   * 如果配置为空，自动添加默认组件
   */
  async function loadConfig(): Promise<void> {
    try {
      // 从 ConfigManager 加载配置
      loadConfigFromManager();

      // 只有在成功加载配置后，才允许自动保存
      // 延迟一点时间，确保状态稳定
      setTimeout(() => {
        isDashboardConfigInitializing = false;
      }, 500);

      const loadedExistingConfig = config.value.widgets.length > 0;

      // 确保默认组件存在
      await ensureDefaultWidgets(loadedExistingConfig);

      // 尝试为现有的空配置组件应用默认标签
      applyDefaultsToEmptyWidgets();

      isInitialized.value = true;
      console.log('[ACU Dashboard] 配置加载成功:', config.value);
    } catch (error) {
      console.warn('[ACU Dashboard] 加载配置失败:', error);
      isInitialized.value = true;
      // 即使失败，也要允许后续操作
      isDashboardConfigInitializing = false;
    }
  }

  /**
   * 清理无效的表格组件
   * 当表格在数据库中不再存在时，移除对应的仪表盘组件
   * @param existingTableIds 当前存在的所有表格 ID 列表
   */
  function cleanupInvalidWidgets(existingTableIds: string[]): void {
    const validIdsSet = new Set(existingTableIds);
    let hasChanges = false;

    const widgets = [...config.value.widgets];

    // 倒序遍历以便安全删除
    for (let i = widgets.length - 1; i >= 0; i--) {
      const widget = widgets[i];

      // 只检查表格类型的组件
      if (widget.type === 'table' && widget.tableId) {
        // 如果表格 ID 不在现有 ID 列表中，则移除
        if (!validIdsSet.has(widget.tableId)) {
          console.log(`[ACU Dashboard] 移除无效组件: ${widget.title} (Table ID: ${widget.tableId} 不存在)`);
          widgets.splice(i, 1);
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      // 重新排序
      widgets.forEach((w, index) => {
        w.order = index;
      });
      config.value = { ...config.value, widgets };
      // watch 会自动保存
    }
  }

  /**
   * 为现有的、未配置标签的组件应用默认标签配置
   * 仅当组件没有任何标签配置（displayedTagIds 和 displayedCategoryIds 都为空）时才应用
   */
  function applyDefaultsToEmptyWidgets(): void {
    let hasChanges = false;
    const widgets = [...config.value.widgets];

    widgets.forEach(widget => {
      // 只处理表格类型的组件
      if (widget.type !== 'table') return;

      // 检查是否已有配置
      const hasTags = widget.widgetTagConfig?.displayedTagIds?.length > 0;
      const hasCategories = widget.widgetTagConfig?.displayedCategoryIds?.length > 0;

      // 如果已有配置，跳过（保护用户自定义设置）
      if (hasTags || hasCategories) return;

      // 尝试匹配模板
      let template = undefined;
      const searchText = widget.title || widget.tableId || '';

      // 1. 尝试通过 ID 精确匹配模板 key (如 'task', 'item')
      // 但通常 widget.id 是生成的，所以这里主要靠关键词匹配

      // 2. 通过关键词匹配模板
      for (const [key, keywords] of Object.entries(TABLE_KEYWORD_RULES)) {
        if (keywords.some(k => searchText.toLowerCase().includes(k.toLowerCase()))) {
          template = WIDGET_TEMPLATES[key];
          break;
        }
      }

      // 如果找到模板且模板有标签配置
      if (template?.widgetTagConfig) {
        // 初始化 widgetTagConfig (如果不存在)
        if (!widget.widgetTagConfig) {
          widget.widgetTagConfig = { displayedTagIds: [], displayedCategoryIds: [] };
        }

        // 应用模板配置
        widget.widgetTagConfig = klona(template.widgetTagConfig);
        console.log(`[ACU Dashboard] 已自动为组件 "${widget.title}" 应用默认标签配置`);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      config.value = { ...config.value, widgets };
      // watch 会自动保存
    }
  }

  /**
   * 确保默认组件存在 (只在首次初始化时执行)
   *
   * 【重要】此函数只在 hasInitializedDefaults 为 false 时添加默认组件。
   * 一旦用户删除了某个组件，不会再被自动添加回来。
   *
   * 添加顺序：表格更新状态 → 随机词表（如检测到）→ 人物/NPC表 → 任务表 → 物品表
   *
   * @param allowSave 是否允许保存（防止热重载时误覆盖）
   */
  async function ensureDefaultWidgets(allowSave = true): Promise<void> {
    // 【关键修复】如果已经完成过首次初始化，直接返回，不再自动添加任何组件
    if (config.value.hasInitializedDefaults) {
      console.log('[ACU Dashboard] 已完成首次初始化，跳过默认组件添加');
      return;
    }

    let hasChanges = false;

    // 1. 检查并添加"表格更新状态"特殊组件
    if (!config.value.widgets.some(w => w.type === 'updateStatus')) {
      addSpecialWidget('updateStatus', false);
      hasChanges = true;
    }

    // 2. 检测并添加随机词表组件
    const randomTables = detectWordPoolTables();
    if (randomTables.length > 0) {
      if (!config.value.widgets.some(w => w.type === 'randomWordPool')) {
        addSpecialWidget('randomWordPool', false);
        hasChanges = true;
        console.log(`[ACU Dashboard] 检测到 ${randomTables.length} 个随机表，已自动添加随机词表组件`);
      }
    }

    // 3. 获取当前数据库的所有表格
    const rawData = getTableData();
    if (!rawData) {
      // 如果没有数据，且有变更且允许保存，则保存
      if (hasChanges && allowSave) {
        const current = config.value;
        configManager.config.dashboard = { ...current, hasInitializedDefaults: true };
        saveConfig();
      }
      return;
    }

    const tables = processJsonData(rawData);
    if (!tables) {
      if (hasChanges && allowSave) {
        const current = config.value;
        configManager.config.dashboard = { ...current, hasInitializedDefaults: true };
        saveConfig();
      }
      return;
    }

    // 定义匹配规则：关键词 → 模板类型
    const matchRules = [
      { keywords: TABLE_KEYWORD_RULES.task || [], templateKey: 'task' },
      { keywords: TABLE_KEYWORD_RULES.item || [], templateKey: 'item' },
      { keywords: TABLE_KEYWORD_RULES.global || [], templateKey: 'global' },
      { keywords: ['交互', '互动'], templateKey: 'interaction' },
    ];

    // 4. 遍历表格，按规则匹配并添加
    for (const [tableName, tableInfo] of Object.entries(tables)) {
      const tableId = tableInfo.key;
      const lowerName = tableName.toLowerCase();

      for (const rule of matchRules) {
        if (rule.keywords.some(k => lowerName.includes(k.toLowerCase()))) {
          // 检查是否已添加（避免重复）
          if (!config.value.widgets.some(w => w.tableId === tableId)) {
            addWidget(tableId, tableName, rule.templateKey, false);
            console.log(`[ACU Dashboard] 自动添加表格: ${tableName} (模板: ${rule.templateKey})`);
            hasChanges = true;
          }
          break; // 每个表只匹配一个规则
        }
      }
    }

    // 【关键】无论是否有变更，都标记为已初始化
    // 这样后续脚本重新挂载时就不会再自动添加组件了
    config.value = { ...config.value, hasInitializedDefaults: true };

    if (hasChanges && allowSave) {
      // watch 会自动保存
      console.log('[ACU Dashboard] 默认组件已更新（首次初始化）');
    } else if (allowSave) {
      // 即使没有添加新组件，也要保存 hasInitializedDefaults 标记
      console.log('[ACU Dashboard] 首次初始化完成，已保存初始化标记');
    }
  }

  // ============================================================
  // Actions - 看板管理
  // ============================================================

  /**
   * 添加看板
   * @param tableId 表格 ID
   * @param tableName 表格名称（可选，用于显示标题）
   * @param templateKey 模板 key (可选)
   * @param autoSave 是否自动保存 (默认 true)
   */
  function addWidget(
    tableId: string,
    tableName?: string,
    templateKey?: string,
    autoSave = true,
  ): DashboardWidgetConfig {
    // 查找匹配的模板
    let template = templateKey ? WIDGET_TEMPLATES[templateKey] : undefined;

    // 如果没有指定模板，尝试通过表格名称自动匹配
    const searchText = tableName || tableId;
    if (!template) {
      for (const [key, keywords] of Object.entries(TABLE_KEYWORD_RULES)) {
        if (keywords.some(k => searchText.toLowerCase().includes(k.toLowerCase()))) {
          template = WIDGET_TEMPLATES[key];
          break;
        }
      }
    }

    // 确定默认 actions
    let defaultActions = template?.actions || ['goToTable'];

    // 如果表名含"人物"或"npc"(不区分大小写)，确保包含 relationshipGraph
    const lowerSearchText = searchText.toLowerCase();
    if (lowerSearchText.includes('人物') || lowerSearchText.includes('npc')) {
      if (!defaultActions.includes('relationshipGraph')) {
        defaultActions = [...defaultActions, 'relationshipGraph'];
      }
    }

    // 确定默认样式
    let displayStyle = template?.displayStyle || 'list';
    if (
      !template &&
      (tableName?.includes('交互') || tableName?.includes('互动') || tableId === 'sheet_Interaction_CN')
    ) {
      displayStyle = 'interaction';
    }

    const newWidget: DashboardWidgetConfig = {
      id: generateId(),
      type: 'table',
      tableId,
      // 优先级：模板标题 > 表格名称 > 表格ID
      title: template?.title || tableName || tableId,
      icon: template?.icon || 'fa-table',
      displayColumns: template?.displayColumns || [],
      maxRows: template?.maxRows || 8,
      actions: defaultActions,
      order: config.value.widgets.length,
      enabled: true,
      colSpan: template?.colSpan || 1,
      displayStyle,
      // 复制模板中的标签配置
      widgetTagConfig: template?.widgetTagConfig ? klona(template.widgetTagConfig) : undefined,
    };

    const widgets = [...config.value.widgets, newWidget];
    config.value = { ...config.value, widgets };
    // watch 会自动保存，如果 autoSave 为 false，需要临时阻止
    if (!autoSave) {
      isDashboardConfigInitializing = true;
      setTimeout(() => {
        isDashboardConfigInitializing = false;
      }, 50);
    }
    return newWidget;
  }

  /**
   * 移除看板
   * @param widgetId 看板 ID
   */
  function removeWidget(widgetId: string): void {
    const widgets = [...config.value.widgets];
    const index = widgets.findIndex(w => w.id === widgetId);
    if (index !== -1) {
      widgets.splice(index, 1);
      // 重新排序
      widgets.forEach((w, i) => {
        w.order = i;
      });
      config.value = { ...config.value, widgets };
      // watch 会自动保存
    }
  }

  /**
   * 更新看板配置
   * @param widgetId 看板 ID
   * @param updates 更新内容
   */
  function updateWidget(widgetId: string, updates: Partial<DashboardWidgetConfig>): void {
    const widgets = [...config.value.widgets];
    const widget = widgets.find(w => w.id === widgetId);
    if (widget) {
      Object.assign(widget, updates);
      config.value = { ...config.value, widgets };
      // watch 会自动保存
    }
  }

  /**
   * 切换看板启用状态
   * @param widgetId 看板 ID
   */
  function toggleWidget(widgetId: string): void {
    const widgets = [...config.value.widgets];
    const widget = widgets.find(w => w.id === widgetId);
    if (widget) {
      widget.enabled = !widget.enabled;
      config.value = { ...config.value, widgets };
      // watch 会自动保存
    }
  }

  /**
   * 移动看板位置
   * @param widgetId 看板 ID
   * @param newOrder 新位置
   */
  function moveWidget(widgetId: string, newOrder: number): void {
    const widgets = [...config.value.widgets];
    const currentIndex = widgets.findIndex(w => w.id === widgetId);
    if (currentIndex === -1) return;

    const [widget] = widgets.splice(currentIndex, 1);
    widgets.splice(newOrder, 0, widget);

    // 更新所有 order
    widgets.forEach((w, i) => {
      w.order = i;
    });

    config.value = { ...config.value, widgets };
    // watch 会自动保存
  }

  /**
   * 设置看板快捷按钮
   * @param widgetId 看板 ID
   * @param actions 快捷按钮列表
   */
  function setWidgetActions(widgetId: string, actions: WidgetActionId[]): void {
    updateWidget(widgetId, { actions });
  }

  /**
   * 重置为默认配置
   */
  function resetConfig(): void {
    config.value = { ...DEFAULT_DASHBOARD_CONFIG };
    // watch 会自动保存
  }

  /**
   * 根据表格 ID 查找看板
   * @param tableId 表格 ID
   */
  function findWidgetByTableId(tableId: string): DashboardWidgetConfig | undefined {
    return config.value.widgets.find(w => w.tableId === tableId);
  }

  /**
   * 检查表格是否已添加为看板
   * @param tableId 表格 ID
   */
  function hasWidget(tableId: string): boolean {
    return config.value.widgets.some(w => w.tableId === tableId);
  }

  /** 特殊组件类型 */
  type SpecialWidgetType = 'updateStatus' | 'optionsPanel' | 'randomWordPool';

  /**
   * 检测并添加随机词表组件
   * 如果检测到随机表（表名含"随机"、"Random"等关键词），自动添加组件
   */
  function detectAndAddRandomWordWidget(): void {
    const randomTables = detectWordPoolTables();
    if (randomTables.length > 0) {
      // 检查是否已存在 randomWordPool 类型的组件
      const hasRandomWordWidget = config.value.widgets.some(w => w.type === 'randomWordPool');
      if (!hasRandomWordWidget) {
        addSpecialWidget('randomWordPool');
        console.log(`[ACU Dashboard] 检测到 ${randomTables.length} 个随机表，已自动添加随机词表组件`);
      }
    }
  }

  /**
   * 检查是否已添加特殊组件
   * @param widgetType 特殊组件类型
   */
  function hasSpecialWidget(widgetType: SpecialWidgetType): boolean {
    return config.value.widgets.some(w => w.type === widgetType);
  }

  /**
   * 添加特殊组件
   * @param widgetType 特殊组件类型
   * @param autoSave 是否自动保存 (默认 true)
   */
  function addSpecialWidget(widgetType: SpecialWidgetType, autoSave = true): DashboardWidgetConfig {
    const specialConfigs: Record<SpecialWidgetType, Partial<DashboardWidgetConfig>> = {
      updateStatus: {
        type: 'updateStatus',
        title: '表格状态',
        icon: 'fa-sync-alt',
        colSpan: 2,
        actions: ['nativeEdit'],
      },
      optionsPanel: {
        type: 'optionsPanel',
        title: '选项聚合面板',
        icon: 'fa-list-check',
        colSpan: 2,
      },
      randomWordPool: {
        type: 'randomWordPool',
        title: '随机词表',
        icon: 'fa-dice',
        colSpan: 1,
        actions: ['settings'],
      },
    };

    const specialConfig = specialConfigs[widgetType];

    const newWidget: DashboardWidgetConfig = {
      id: `special_${widgetType}_${Date.now()}`,
      type: widgetType,
      title: specialConfig.title || widgetType,
      icon: specialConfig.icon || 'fa-cog',
      displayColumns: [],
      maxRows: 10,
      actions: specialConfig.actions || [], // 使用 specialConfig 中定义的 actions
      order: config.value.widgets.length,
      enabled: true,
      colSpan: specialConfig.colSpan || 2,
      displayStyle: 'list',
    };

    const widgets = [...config.value.widgets, newWidget];
    config.value = { ...config.value, widgets };
    // watch 会自动保存，如果 autoSave 为 false，需要临时阻止
    if (!autoSave) {
      isDashboardConfigInitializing = true;
      setTimeout(() => {
        isDashboardConfigInitializing = false;
      }, 50);
    }
    return newWidget;
  }

  /**
   * 移除特殊组件
   * @param widgetType 特殊组件类型
   */
  function removeSpecialWidget(widgetType: SpecialWidgetType): void {
    const widgets = [...config.value.widgets];
    const index = widgets.findIndex(w => w.type === widgetType);
    if (index !== -1) {
      widgets.splice(index, 1);
      // 重新排序
      widgets.forEach((w, i) => {
        w.order = i;
      });
      config.value = { ...config.value, widgets };
      // watch 会自动保存
    }
  }

  /**
   * 根据 ID 获取看板配置
   * @param widgetId 看板 ID
   */
  function getWidgetById(widgetId: string): DashboardWidgetConfig | undefined {
    return config.value.widgets.find(w => w.id === widgetId);
  }

  return {
    // 状态
    config,
    isInitialized,

    // Getters
    enabledWidgets,
    allWidgets,
    showStats,
    columns,
    layout,

    // Actions
    loadConfig,
    saveConfig,
    updateConfig,
    addWidget,
    removeWidget,
    updateWidget,
    toggleWidget,
    moveWidget,
    setWidgetActions,
    resetConfig,
    findWidgetByTableId,
    hasWidget,
    hasSpecialWidget,
    addSpecialWidget,
    removeSpecialWidget,
    getWidgetById,
    ensureDefaultWidgets,
    cleanupInvalidWidgets,
    applyDefaultsToEmptyWidgets,
  };
});
