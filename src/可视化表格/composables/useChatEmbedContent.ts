/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * useChatEmbedContent.ts - 聊天区域嵌入内容 Composable
 *
 * 提取自 App.vue,负责"嵌入到聊天区域"那两个 Teleport 内部所需的所有逻辑:
 * - 全局数据看板表(globalStatusTable)
 * - 行动选项交互表 + widget config(embedInteractionTable / embedInteractionWidget)
 * - 嵌入区域是否有可显示内容(hasEmbedOptionsContent)
 *   * 仪表盘里的行动选项是用户主动点开才看得到,即使展示上一楼也无伤大雅;
 *     但聊天区域嵌入是常驻显示,不能在本楼层显示上一楼的旧选项。
 *   * 因此按"本楼层(最新非隐藏 AI 楼层)的 updateGroupKeys 是否包含选项类表"来判断。
 * - 嵌入区域两个 section 的折叠状态(embedGlobalCollapsed / embedOptionsCollapsed)
 *   及其切换函数
 */

import { computed, ref, type Ref } from 'vue';
import { useConfigStore } from '../stores/useConfigStore';
import { useDashboardStore } from '../stores/useDashboardStore';
import type { ProcessedTable } from '../types';

// ============================================================
// 内部工具函数
// ============================================================

/**
 * 倒序遍历 SillyTavern.chat,返回最新一条「非隐藏 AI 楼层」的消息对象 + index。
 * 跳过用户消息 / 系统消息 / 被隐藏(hidden)的消息。
 *
 * @returns 楼层信息 { msg, index };没有找到则返回 null
 */
function findLatestNonHiddenAiFloor(): { msg: any; index: number } | null {
  try {
    const chat = (window.parent as any)?.SillyTavern?.chat || (window as any)?.SillyTavern?.chat || [];
    if (!Array.isArray(chat) || chat.length === 0) return null;
    for (let i = chat.length - 1; i >= 0; i--) {
      const msg = chat[i];
      if (!msg) continue;
      if (msg.is_user) continue;
      if (msg.is_system) continue;
      if (msg.hidden) continue;
      return { msg, index: i };
    }
  } catch (e) {
    console.warn('[ACU][embed] findLatestNonHiddenAiFloor 失败:', e);
  }
  return null;
}

/**
 * 取得某楼层 msg 上记录的 updateGroupKeys 列表(本楼层"动过"的表的 sheetKey)
 *
 * 数据来源(只读 updateGroupKeys,不读 modifiedKeys):
 * - 旧字段(根级):`msg.TavernDB_ACU_UpdateGroupKeys`
 * - 新字段(10.3+,IsolatedData 槽位):`msg.TavernDB_ACU_IsolatedData[槽位].updateGroupKeys`
 *
 * 返回字符串数组(如 `sheet_Interaction_CN`),后续按 sheetKey → name 反查。
 */
function getUpdateGroupKeysAtFloor(msg: any): string[] {
  if (!msg) return [];
  const set = new Set<string>();

  const collect = (arr: any) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((k: any) => {
      if (typeof k === 'string' && k) set.add(k);
    });
  };

  // 1) 根级旧字段
  collect(msg.TavernDB_ACU_UpdateGroupKeys);

  // 2) IsolatedData 槽位新字段
  let isolated = msg.TavernDB_ACU_IsolatedData;
  if (typeof isolated === 'string') {
    try {
      isolated = JSON.parse(isolated);
    } catch {
      isolated = null;
    }
  }
  if (isolated && typeof isolated === 'object') {
    Object.values(isolated).forEach((slot: any) => {
      if (!slot || typeof slot !== 'object') return;
      collect(slot.updateGroupKeys);
    });
  }

  return Array.from(set);
}

/**
 * 判断一个表名(中文 name)是否含「选项 / options」
 *
 * 用户的选项表名各种各样(如「交互选项」、「行动选项」、「options」 等),
 * 只要含"选项"或"options"二字就算选项类表,这与项目其他位置(如
 * useDataPersistence、App.vue 的 hasOptionsTabs)的识别规则一致。
 */
function isOptionsLikeName(name: string): boolean {
  return /选项|options/i.test(String(name || ''));
}

// ============================================================
// 主 Composable
// ============================================================

/**
 * 聊天区域嵌入内容 Composable
 *
 * @param processedTables 处理后的表格数据(响应式)
 * @param optionsTables 已经识别为「选项类」的表(由 App.vue 计算并传入,
 *                      与 MainPanel 内 OptionsAggregatePanel 共享同一份 computed;
 *                      此 composable 内目前主要用 processedTables 做反查,
 *                      optionsTables 留作未来扩展用)
 */
export function useChatEmbedContent(
  processedTables: Ref<ProcessedTable[]>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  // 嵌入区是否显示(关键:按本楼层 updateGroupKeys 判断)
  // ============================================================

  /**
   * 嵌入区"行动选项"是否有可显示内容
   *
   * 判断规则:
   * 1. 找到最新非隐藏 AI 楼层(找不到 → 不显示)
   * 2. 读取该楼层 msg 上保存的 updateGroupKeys(本次更新影响的表 sheetKey 列表)
   * 3. **按表名判断**(而不是按 sheetKey):把每个 sheetKey 反查为 name,
   *    看名字是否含「选项 / options」
   *    - 优先以 key 作为 sheetId 反查 processedTables 找 name
   *    - 反查不到则把 key 本身当作表名使用(兼容 updateGroupKeys 直接存名字的情况)
   * 4. 任意 key 转换后的名字含「选项」即视为有内容 → 显示嵌入
   *
   * 不依赖 modifiedKeys / __messageId,只看 updateGroupKeys。
   */
  const hasEmbedOptionsContent = computed<boolean>(() => {
    const floor = findLatestNonHiddenAiFloor();
    if (!floor) return false;

    const sheetKeys = getUpdateGroupKeysAtFloor(floor.msg);
    if (sheetKeys.length === 0) return false;

    // 用 processedTables 建立 sheetId → name 的映射
    const idToName = new Map<string, string>();
    (processedTables.value || []).forEach(t => {
      if (t && t.id) idToName.set(t.id, t.name || '');
    });

    return sheetKeys.some(key => {
      const name = idToName.get(key) ?? key; // 反查不到就把 key 本身当 name
      return isOptionsLikeName(name);
    });
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

    // 是否显示嵌入(本楼层 updateGroupKeys 判断)
    hasEmbedOptionsContent,
  };
}
