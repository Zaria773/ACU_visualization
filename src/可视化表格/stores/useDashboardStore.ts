/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 仪表盘配置状态管理 Store
 * 配置存储在酒馆全局变量中（跨聊天/角色卡共享）
 */

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
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
  configVersion: 0, // 配置版本号，用于防止旧配置覆盖新配置
};

/** localStorage 备份键名 */
const STORAGE_KEY_DASHBOARD = 'acu_dashboard_config_backup';

/** 重试配置 */
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 500, // ms
};

/** 延迟函数 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 生成唯一 ID */
function generateId(): string {
  return `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const useDashboardStore = defineStore('acu-dashboard', () => {
  // ============================================================
  // 状态
  // ============================================================

  /** 仪表盘配置 */
  const config = ref<DashboardConfig>({ ...DEFAULT_DASHBOARD_CONFIG });

  /** 是否已初始化 */
  const isInitialized = ref(false);

  /** 加载时的版本号，用于检测配置是否被其他实例修改 */
  const loadedVersion = ref<number>(0);

  // ============================================================
  // Getters
  // ============================================================

  /** 启用的看板列表（按 order 排序） */
  const enabledWidgets = computed(() => config.value.widgets.filter(w => w.enabled).sort((a, b) => a.order - b.order));

  /** 所有看板列表（按 order 排序） */
  const allWidgets = computed(() => [...config.value.widgets].sort((a, b) => a.order - b.order));

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
   * 从 localStorage 加载备份配置
   */
  function loadFromLocalStorage(): DashboardConfig | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DASHBOARD);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.widgets)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[ACU Dashboard] localStorage 备份解析失败:', e);
    }
    return null;
  }

  /**
   * 保存配置到 localStorage 备份
   */
  function saveToLocalStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY_DASHBOARD, JSON.stringify(config.value));
    } catch (e) {
      console.warn('[ACU Dashboard] localStorage 备份保存失败:', e);
    }
  }

  /**
   * 尝试从酒馆全局变量加载配置（带重试）
   * @returns 配置对象或 null
   */
  async function tryLoadFromGlobalWithRetry(): Promise<DashboardConfig | null> {
    for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const vars = getVariables({ type: 'global' });
        if (vars && vars.acu_dashboard_config && Array.isArray(vars.acu_dashboard_config.widgets)) {
          console.log(`[ACU Dashboard] 第 ${attempt} 次尝试成功从酒馆变量加载配置`);
          return vars.acu_dashboard_config;
        }

        // API 返回了但没有配置，可能是首次使用，不需要重试
        if (vars !== null && vars !== undefined) {
          console.log(`[ACU Dashboard] 第 ${attempt} 次尝试：API 可用但无配置`);
          return null;
        }
      } catch (e) {
        console.warn(`[ACU Dashboard] 第 ${attempt} 次尝试失败:`, e);
      }

      // 如果不是最后一次尝试，等待后重试
      if (attempt < RETRY_CONFIG.maxRetries) {
        console.log(`[ACU Dashboard] 等待 ${RETRY_CONFIG.retryDelay}ms 后重试...`);
        await delay(RETRY_CONFIG.retryDelay);
      }
    }

    console.warn(`[ACU Dashboard] ${RETRY_CONFIG.maxRetries} 次尝试后仍无法从酒馆变量加载`);
    return null;
  }

  /**
   * 从酒馆全局变量加载配置
   * 全局变量跨聊天/角色卡共享
   * 如果配置为空，自动添加默认组件
   *
   * 加载优先级：
   * 1. 酒馆全局变量（主存储，跨设备共享）- 带重试机制
   * 2. localStorage 备份（热重载时快速恢复）
   * 3. 默认配置（首次使用）
   */
  async function loadConfig(): Promise<void> {
    try {
      // 标记是否成功加载了已有配置
      let loadedExistingConfig = false;
      let loadedFromGlobal = false;

      // 1. 首先尝试从酒馆全局变量加载（带重试）
      const globalConfig = await tryLoadFromGlobalWithRetry();

      if (globalConfig) {
        // 主存储：酒馆全局变量
        config.value = {
          ...DEFAULT_DASHBOARD_CONFIG,
          ...globalConfig,
        };
        loadedExistingConfig = true;
        loadedFromGlobal = true;
        // 【关键】记住加载时的版本号
        loadedVersion.value = config.value.configVersion || 0;
        console.log(
          '[ACU Dashboard] 成功从酒馆变量加载配置，widgets 数量:',
          config.value.widgets.length,
          '版本:',
          loadedVersion.value,
        );

        // 同步更新 localStorage 备份
        saveToLocalStorage();
      } else {
        // 2. 备份存储：localStorage
        const backup = loadFromLocalStorage();
        if (backup) {
          config.value = {
            ...DEFAULT_DASHBOARD_CONFIG,
            ...backup,
          };
          loadedExistingConfig = true;
          console.log('[ACU Dashboard] 从 localStorage 备份恢复配置，widgets 数量:', config.value.widgets.length);

          // 尝试同步到酒馆变量（如果 API 可用）
          try {
            saveConfig();
          } catch (e) {
            console.warn('[ACU Dashboard] 同步到酒馆变量失败（非阻塞）:', e);
          }
        } else {
          console.log('[ACU Dashboard] 未找到任何已有配置，使用默认配置');
        }
      }

      // 只有在成功加载了配置，或者确认是首次使用时，才补充默认组件
      // 这样可以避免热重载时因 API 未准备好而误覆盖用户配置
      await ensureDefaultWidgets(loadedExistingConfig);

      // 临时迁移：将 NPC/人物/角色 类表格强制转换为 list 样式 (普通表格)
      // 修复旧配置中这些表格仍显示为 grid 的问题
      const npcKeywords = ['人物', 'npc', 'NPC', '角色', '关系', '好感', '重要人物'];
      const globalKeywords = TABLE_KEYWORD_RULES.global || [];
      let hasMigration = false;

      config.value.widgets.forEach(w => {
        const name = w.title || w.tableId || '';

        // 迁移 NPC 表格
        if (w.displayStyle === 'grid' && w.type === 'table') {
          if (npcKeywords.some(k => name.includes(k))) {
            console.log(`[ACU Dashboard] 迁移表格样式为普通列表: ${name}`);
            w.displayStyle = 'list';
            w.displayColumns = []; // 重置显示列，使用默认
            hasMigration = true;
          }
        }

        // 迁移全局状态表格
        if (w.type === 'table' && w.displayStyle !== 'global') {
          if (globalKeywords.some(k => name.toLowerCase().includes(k.toLowerCase()))) {
            console.log(`[ACU Dashboard] 迁移表格样式为全局状态视图: ${name}`);
            w.displayStyle = 'global';
            w.displayColumns = []; // 重置显示列
            w.maxRows = 1; // 全局表通常只有一行
            w.colSpan = 2; // 全宽显示
            hasMigration = true;
          }
        }
      });

      // 临时强制迁移: 检查是否所有匹配 globalKeywords 的组件都已设置为 global 样式
      // 这是为了应对 TABLE_KEYWORD_RULES 初始化延迟的可能问题
      if (!hasMigration) {
        config.value.widgets.forEach(w => {
          if (w.type === 'table' && w.displayStyle !== 'global') {
            const name = w.title || w.tableId || '';
            const keywords = ['全局', '状态', 'Global', 'Status', 'Environment', '环境'];
            if (keywords.some(k => name.toLowerCase().includes(k.toLowerCase()))) {
              console.log(`[ACU Dashboard] 强制迁移表格样式为全局状态视图 (Backup): ${name}`);
              w.displayStyle = 'global';
              w.maxRows = 1;
              w.colSpan = 2;
              hasMigration = true;
            }
          }
        });
      }

      if (hasMigration) {
        saveConfig();
      }

      isInitialized.value = true;
      console.log('[ACU Dashboard] 配置加载成功 (全局变量):', config.value);
    } catch (error) {
      console.warn('[ACU Dashboard] 加载配置失败，使用默认配置:', error);
      config.value = { ...DEFAULT_DASHBOARD_CONFIG };
      isInitialized.value = true;
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

    // 倒序遍历以便安全删除
    for (let i = config.value.widgets.length - 1; i >= 0; i--) {
      const widget = config.value.widgets[i];

      // 只检查表格类型的组件
      if (widget.type === 'table' && widget.tableId) {
        // 如果表格 ID 不在现有 ID 列表中，则移除
        if (!validIdsSet.has(widget.tableId)) {
          console.log(`[ACU Dashboard] 移除无效组件: ${widget.title} (Table ID: ${widget.tableId} 不存在)`);
          config.value.widgets.splice(i, 1);
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      // 重新排序
      config.value.widgets.forEach((w, index) => {
        w.order = index;
      });
      saveConfig();
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
        config.value.hasInitializedDefaults = true; // 标记已初始化
        saveConfig();
      }
      return;
    }

    const tables = processJsonData(rawData);
    if (!tables) {
      if (hasChanges && allowSave) {
        config.value.hasInitializedDefaults = true; // 标记已初始化
        saveConfig();
      }
      return;
    }

    // 定义匹配规则：关键词 → 模板类型
    const matchRules = [
      { keywords: ['任务', 'task', 'Task', 'quest', 'Quest', '日程'], templateKey: 'task' },
      { keywords: ['物品', '道具', 'item', 'Item', '背包', '库存', '装备'], templateKey: 'item' },
      { keywords: ['全局', 'Global'], templateKey: 'global' },
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
    config.value.hasInitializedDefaults = true;

    if (hasChanges && allowSave) {
      saveConfig();
      console.log('[ACU Dashboard] 默认组件已更新（首次初始化）');
    } else if (allowSave) {
      // 即使没有添加新组件，也要保存 hasInitializedDefaults 标记
      saveConfig();
      console.log('[ACU Dashboard] 首次初始化完成，已保存初始化标记');
    }
  }

  /**
   * 保存配置到酒馆全局变量和 localStorage 备份
   * 全局变量跨聊天/角色卡共享
   * localStorage 作为热重载时的快速恢复备份
   *
   * 【重要】使用版本号防止旧配置覆盖新配置（竞态条件保护）
   * - 保存前检查当前存储的版本号
   * - 只有当存储版本 <= 加载时的版本时才允许保存
   * - 保存时递增版本号
   */
  async function saveConfig(): Promise<void> {
    // 尝试保存到酒馆全局变量（主存储）
    try {
      const currentVars = getVariables({ type: 'global' }) || {};

      // 【关键】检查版本号，防止旧实例覆盖新配置
      const existingConfig = currentVars.acu_dashboard_config;
      const existingVersion = existingConfig?.configVersion || 0;

      // 如果存储的版本号比我们加载时的版本号更新，说明有其他实例修改了配置
      if (existingVersion > loadedVersion.value) {
        console.warn(
          `[ACU Dashboard] 检测到更新的配置 (存储版本=${existingVersion}, 加载版本=${loadedVersion.value})，取消保存`,
        );
        // 从酒馆变量重新加载最新配置
        config.value = {
          ...DEFAULT_DASHBOARD_CONFIG,
          ...existingConfig,
        };
        loadedVersion.value = existingVersion;
        return;
      }

      // 递增版本号
      config.value.configVersion = existingVersion + 1;
      loadedVersion.value = config.value.configVersion;

      replaceVariables(
        {
          ...currentVars,
          acu_dashboard_config: config.value,
        },
        { type: 'global' },
      );

      // 同步更新 localStorage 备份
      saveToLocalStorage();

      console.log('[ACU Dashboard] 配置保存成功 (版本:', config.value.configVersion, ')');
    } catch (error) {
      console.warn('[ACU Dashboard] 保存到酒馆变量失败，尝试保存到 localStorage:', error);
      saveToLocalStorage();
    }
  }

  /**
   * 更新配置并自动保存
   */
  function updateConfig(updates: Partial<DashboardConfig>): void {
    config.value = { ...config.value, ...updates };
    saveConfig();
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
    };

    config.value.widgets.push(newWidget);
    if (autoSave) saveConfig();
    return newWidget;
  }

  /**
   * 移除看板
   * @param widgetId 看板 ID
   */
  function removeWidget(widgetId: string): void {
    const index = config.value.widgets.findIndex(w => w.id === widgetId);
    if (index !== -1) {
      config.value.widgets.splice(index, 1);
      // 重新排序
      config.value.widgets.forEach((w, i) => {
        w.order = i;
      });
      saveConfig();
    }
  }

  /**
   * 更新看板配置
   * @param widgetId 看板 ID
   * @param updates 更新内容
   */
  function updateWidget(widgetId: string, updates: Partial<DashboardWidgetConfig>): void {
    const widget = config.value.widgets.find(w => w.id === widgetId);
    if (widget) {
      Object.assign(widget, updates);
      saveConfig();
    }
  }

  /**
   * 切换看板启用状态
   * @param widgetId 看板 ID
   */
  function toggleWidget(widgetId: string): void {
    const widget = config.value.widgets.find(w => w.id === widgetId);
    if (widget) {
      widget.enabled = !widget.enabled;
      saveConfig();
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

    config.value.widgets = widgets;
    saveConfig();
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
    saveConfig();
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

    config.value.widgets.push(newWidget);
    if (autoSave) saveConfig();
    return newWidget;
  }

  /**
   * 移除特殊组件
   * @param widgetType 特殊组件类型
   */
  function removeSpecialWidget(widgetType: SpecialWidgetType): void {
    const index = config.value.widgets.findIndex(w => w.type === widgetType);
    if (index !== -1) {
      config.value.widgets.splice(index, 1);
      // 重新排序
      config.value.widgets.forEach((w, i) => {
        w.order = i;
      });
      saveConfig();
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
  };
});
