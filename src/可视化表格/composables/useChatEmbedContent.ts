/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * useChatEmbedContent.ts - 聊天区域嵌入内容 Composable
 *
 * 提取自 App.vue,负责"嵌入到聊天区域"那两个 Teleport 内部所需的所有逻辑:
 * - 全局数据看板表(globalStatusTable)
 * - 行动选项交互表 + widget config(embedInteractionTable / embedInteractionWidget)
 * - 嵌入区域是否有可显示内容(hasEmbedOptionsContent)
 *   * 不再要求最新 AI 楼层的 updateGroupKeys 命中选项表;
 *   * 只要当前交互表有行，或选项聚合面板能解析出实际选项内容，就允许显示;
 *   * 具体挂载楼层由 useChatAreaEmbed 统一定位到最新非隐藏 AI 楼层。
 * - 嵌入区域两个 section 的折叠状态(embedGlobalCollapsed / embedOptionsCollapsed)
 *   及其切换函数
 */

import { computed, ref, type Ref } from 'vue';
import { useConfigStore } from '../stores/useConfigStore';
import { useDashboardStore } from '../stores/useDashboardStore';
import type { ProcessedTable } from '../types';
import { isOptionTable, parseOptionItems } from '../utils/optionParser';

// ============================================================
// 内部工具函数
// ============================================================

/** 判断表格是否有实际可展示的行内容 */
function hasTableRows(table: ProcessedTable | null): boolean {
  return Array.isArray(table?.rows) && table.rows.length > 0;
}

/** 判断选项聚合面板是否能解析出实际选项内容 */
function hasParsedOptionItems(tables: ProcessedTable[]): boolean {
  return (tables || []).some(table => isOptionTable(table.name || '') && parseOptionItems(table).length > 0);
}

// ============================================================
// 主 Composable
// ============================================================

/**
 * 聊天区域嵌入内容 Composable
 *
 * @param processedTables 处理后的表格数据(响应式)
 * @param optionsTables 已经识别为「选项类」的表(由 App.vue 计算并传入,
 *                      用于判断选项聚合面板是否存在实际可展示内容)
 */
export function useChatEmbedContent(
  processedTables: Ref<ProcessedTable[]>,
  optionsTables: Ref<ProcessedTable[]>,
) {
  const configStore = useConfigStore();
  const dashboardStore = useDashboardStore();

  // ============================================================
  // 折叠状态
  // ============================================================

  /** 嵌入区域 - 全局数据看板的折叠状态(独立于面板内的状态) */
  const embedGlobalCollapsed = ref(configStore.config.embedDefaultCollapsed ?? false);

  /** 嵌入区域 - 选项面板的折叠状态 */
  const embedOptionsCollapsed = ref(configStore.config.embedDefaultCollapsed ?? false);

  /** 切换嵌入区域全局数据看板的折叠状态 */
  function toggleEmbedGlobalCollapse(): void {
    embedGlobalCollapsed.value = !embedGlobalCollapsed.value;
  }

  /** 切换嵌入区域选项面板的折叠状态 */
  function toggleEmbedOptionsCollapse(): void {
    embedOptionsCollapsed.value = !embedOptionsCollapsed.value;
  }

  // ============================================================
  // 表格选择
  // ============================================================

  /**
   * 全局数据表(用于嵌入到聊天区域顶部)
   * 匹配名字含「全局/世界/通用/global/world」的表
   */
  const globalStatusTable = computed<ProcessedTable | null>(() => {
    return (
      processedTables.value.find(t => {
        const name = (t.name || '').toLowerCase();
        const id = (t.id || '').toLowerCase();
        return (
          name.includes('全局') ||
          name.includes('世界') ||
          name.includes('通用') ||
          id.includes('global') ||
          id.includes('world')
        );
      }) || null
    );
  });

  /**
   * 嵌入区"行动选项"使用的交互表
   *
   * 优先匹配:
   * 1. 仪表盘里 displayStyle === 'interaction' 的 widget 关联的表
   * 2. 表名含「交互/互动」或 id === 'sheet_Interaction_CN' 或 id 含 'interaction'
   */
  const embedInteractionTable = computed<ProcessedTable | null>(() => {
    // 1. 优先:仪表盘里已配置为 interaction 风格的 widget 对应的表
    const interactionWidget = dashboardStore.config.widgets.find(w => w.displayStyle === 'interaction' && w.tableId);
    if (interactionWidget?.tableId) {
      const t = processedTables.value.find(p => p.id === interactionWidget.tableId);
      if (t) return t;
    }
    // 2. 兜底:按表名匹配
    return (
      processedTables.value.find(t => {
        const lower = (t.name || '').toLowerCase();
        return (
          (t.name || '').includes('交互') ||
          (t.name || '').includes('互动') ||
          t.id === 'sheet_Interaction_CN' ||
          lower.includes('interaction')
        );
      }) || null
    );
  });

  /**
   * 嵌入区"行动选项"用的 widget config
   * 优先复用仪表盘已配置的 widget(保留 displayColumns、actions 等用户自定义);
   * 找不到则合成一个最小可用 config
   */
  const embedInteractionWidget = computed(() => {
    if (!embedInteractionTable.value) return null;
    const found = dashboardStore.config.widgets.find(
      w => w.displayStyle === 'interaction' && w.tableId === embedInteractionTable.value!.id,
    );
    if (found) return found;
    return {
      id: `embed_interaction_${embedInteractionTable.value.id}`,
      type: 'table' as const,
      tableId: embedInteractionTable.value.id,
      title: embedInteractionTable.value.name,
      icon: 'fa-comments',
      displayColumns: [],
      maxRows: 20,
      actions: [],
      order: 0,
      enabled: true,
      colSpan: 2 as const,
      displayStyle: 'interaction' as const,
    };
  });

  // ============================================================
  // 嵌入区是否显示(只按实际内容判断)
  // ============================================================

  /**
   * 嵌入区"行动选项"是否有可显示内容
   *
   * 不再要求最新 AI 楼层的 updateGroupKeys 命中选项表。
   * 只要当前已加载数据里有交互表行，或选项聚合面板能解析出选项内容，
   * ChatEmbedHost 就会把内容 Teleport 到 useChatAreaEmbed 定位的最新 AI 楼层。
   */
  const hasEmbedOptionsContent = computed<boolean>(() => {
    return hasTableRows(embedInteractionTable.value) || hasParsedOptionItems(optionsTables.value || []);
  });

  return {
    // 折叠状态
    embedGlobalCollapsed,
    embedOptionsCollapsed,
    toggleEmbedGlobalCollapse,
    toggleEmbedOptionsCollapse,

    // 表格选择
    globalStatusTable,
    embedInteractionTable,
    embedInteractionWidget,

    // 是否显示嵌入(只要有实际内容就显示)
    hasEmbedOptionsContent,
  };
}
