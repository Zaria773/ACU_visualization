/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 仪表盘配置状态管理 Store
 * 配置存储在酒馆聊天变量中（绑定当前角色卡的聊天）
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
};

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
   * 从酒馆聊天变量加载配置
   * 聊天变量绑定在当前角色卡的聊天文件上
   * 如果配置为空，自动添加默认组件
   */
  async function loadConfig(): Promise<void> {
    try {
      const vars = getVariables({ type: 'chat' });
      if (vars && vars.acu_dashboard_config) {
        config.value = {
          ...DEFAULT_DASHBOARD_CONFIG,
          ...vars.acu_dashboard_config,
        };
      }

      // 无论是否为空，都尝试确保默认组件存在（处理数据延迟加载）
      await ensureDefaultWidgets();

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
      console.log('[ACU Dashboard] 配置加载成功 (聊天变量):', config.value);
    } catch (error) {
      console.warn('[ACU Dashboard] 加载配置失败，使用默认配置:', error);
      config.value = { ...DEFAULT_DASHBOARD_CONFIG };
      isInitialized.value = true;
    }
  }

  /**
   * 确保默认组件存在 (幂等操作)
   * 可以在数据加载后重复调用，补充缺失的组件
   * 添加顺序：表格更新状态 → 随机词表（如检测到）→ 人物/NPC表 → 任务表 → 物品表
   */
  async function ensureDefaultWidgets(): Promise<void> {
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
      // 如果没有数据，且有变更，则保存
      if (hasChanges) saveConfig();
      return;
    }

    const tables = processJsonData(rawData);
    if (!tables) {
      if (hasChanges) saveConfig();
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

    if (hasChanges) {
      saveConfig();
      console.log('[ACU Dashboard] 默认组件已更新');
    }
  }

  /**
   * 保存配置到酒馆聊天变量
   * 聊天变量绑定在当前角色卡的聊天文件上
   */
  async function saveConfig(): Promise<void> {
    try {
      const currentVars = getVariables({ type: 'chat' }) || {};
      replaceVariables(
        {
          ...currentVars,
          acu_dashboard_config: config.value,
        },
        { type: 'chat' },
      );
      console.log('[ACU Dashboard] 配置保存成功 (聊天变量)');
    } catch (error) {
      console.error('[ACU Dashboard] 保存配置失败:', error);
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
      actions: [],
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
  };
});
