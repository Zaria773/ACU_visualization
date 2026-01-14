/**
 * 仪表盘配置状态管理 Store
 * 配置存储在酒馆聊天变量中（绑定当前角色卡的聊天）
 */

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { DashboardConfig, DashboardWidgetConfig, WidgetActionId } from '../types';
import { TABLE_KEYWORD_RULES, WIDGET_TEMPLATES } from '../types';

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
      isInitialized.value = true;
      console.log('[ACU Dashboard] 配置加载成功 (聊天变量):', config.value);
    } catch (error) {
      console.warn('[ACU Dashboard] 加载配置失败，使用默认配置:', error);
      config.value = { ...DEFAULT_DASHBOARD_CONFIG };
      isInitialized.value = true;
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
   * @param templateKey 模板 key (可选)
   */
  function addWidget(tableId: string, templateKey?: string): DashboardWidgetConfig {
    // 查找匹配的模板
    let template = templateKey ? WIDGET_TEMPLATES[templateKey] : undefined;

    // 如果没有指定模板，尝试通过表格名称自动匹配
    if (!template) {
      for (const [key, keywords] of Object.entries(TABLE_KEYWORD_RULES)) {
        if (keywords.some(k => tableId.toLowerCase().includes(k.toLowerCase()))) {
          template = WIDGET_TEMPLATES[key];
          break;
        }
      }
    }

    const newWidget: DashboardWidgetConfig = {
      id: generateId(),
      type: 'table',
      tableId,
      title: template?.title || tableId,
      icon: template?.icon || 'fa-table',
      displayColumns: template?.displayColumns || [],
      maxRows: template?.maxRows || 8,
      actions: template?.actions || ['goToTable'],
      order: config.value.widgets.length,
      enabled: true,
      colSpan: template?.colSpan || 1,
      displayStyle: template?.displayStyle || 'list',
    };

    config.value.widgets.push(newWidget);
    saveConfig();
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
  };
});
