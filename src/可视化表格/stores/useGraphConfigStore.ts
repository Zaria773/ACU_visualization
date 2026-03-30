/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 关系图配置 Store
 * 用于管理关系图的显示设置，如节点大小、边宽度、字体大小等
 * 使用 ConfigManager 统一管理配置（按聊天分隔）
 *
 * 注意：使用 ref + watch 模式而非 computed getter/setter
 * 这样可以确保直接修改对象属性时也能触发保存
 */

import { klona } from 'klona';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { getACUConfigManager } from '../composables/useACUConfigManager';

/** 图例项配置 */
export interface LegendItem {
  /** 唯一 ID */
  id: string;
  /** 显示名称，如"友好"、"敌对" */
  label: string;
  /** 边的颜色 */
  color: string;
  /** 可选的 Emoji 标识 */
  emoji?: string;
  /** 匹配关键词 */
  keywords: string[];
}

/** 图例配置 */
export interface LegendConfig {
  /** 是否启用自定义图例 */
  enabled: boolean;
  /** 图例位置 */
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** 图例项列表 */
  items: LegendItem[];
}

/** 节点样式覆盖配置 */
export interface NodeStyleOverride {
  /** 节点大小 */
  size?: number;
  /** 边框颜色 */
  borderColor?: string;
  /** 边框宽度 */
  borderWidth?: number;
  /** 背景颜色 */
  backgroundColor?: string;
  /** 节点形状 */
  shape?: 'ellipse' | 'rectangle' | 'round-rectangle' | 'diamond' | 'hexagon';
}

/** 势力颜色配置 */
export interface FactionColorConfig {
  /** 边框颜色（虚线框） */
  border: string;
  /** 背景颜色 */
  background: string;
  /** 背景透明度 (0-100) */
  opacity?: number;
  /** 标签位置 */
  labelPosition?: 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
  /** 标签字体大小 */
  labelFontSize?: number;
}

/** 势力头像配置 */
export interface FactionAvatarConfig {
  /** 头像 URL */
  url: string;
  /** 水平偏移百分比 (0-100) */
  offsetX?: number;
  /** 垂直偏移百分比 (0-100) */
  offsetY?: number;
  /** 缩放百分比 (100 = 原始大小) */
  scale?: number;
  /** 显示标签（简称） */
  displayLabel?: string;
  /** 标签字符索引 */
  labelIndices?: number[];
  /** 别名列表 */
  aliases?: string[];
}

/** 关系图全局配置 */
export interface GraphConfig {
  /** 节点默认大小 */
  nodeSize: number;
  /** 边默认宽度 */
  edgeWidth: number;
  /** 关系标签字体大小（边上的文字） */
  relationLabelFontSize: number;
  /** 人名标签字体大小（头像下面的名字） */
  nameLabelFontSize: number;
  /** 势力名标签字体大小 */
  factionLabelFontSize: number;
  /** 是否显示图例 */
  showLegend: boolean;
  /** 是否显示背景图片 (即使全局主题已配置背景) */
  showBackground: boolean;
  /** 势力颜色配置：势力名 -> 颜色配置 */
  factionColors: Record<string, FactionColorConfig>;
  /** 势力头像配置：势力名 -> 头像配置 */
  factionAvatars: Record<string, FactionAvatarConfig>;
  /** 节点样式覆盖配置：节点ID -> 样式配置 */
  nodeOverrides: Record<string, NodeStyleOverride>;
  /** 自定义图例配置 */
  legendConfig: LegendConfig;
}

/** 预设势力颜色调色板 */
export const FACTION_COLOR_PALETTE: Array<{ border: string; background: string; opacity: number }> = [
  { border: '#E91E63', background: 'rgba(233, 30, 99, 0.1)', opacity: 10 }, // 粉红
  { border: '#2196F3', background: 'rgba(33, 150, 243, 0.1)', opacity: 10 }, // 蓝
  { border: '#4CAF50', background: 'rgba(76, 175, 80, 0.1)', opacity: 10 }, // 绿
  { border: '#FF9800', background: 'rgba(255, 152, 0, 0.1)', opacity: 10 }, // 橙
  { border: '#9C27B0', background: 'rgba(156, 39, 176, 0.1)', opacity: 10 }, // 紫
  { border: '#00BCD4', background: 'rgba(0, 188, 212, 0.1)', opacity: 10 }, // 青
  { border: '#795548', background: 'rgba(121, 85, 72, 0.1)', opacity: 10 }, // 棕
  { border: '#607D8B', background: 'rgba(96, 125, 139, 0.1)', opacity: 10 }, // 蓝灰
];

/** 默认势力样式（未配置颜色的势力使用） */
export const DEFAULT_FACTION_STYLE: FactionColorConfig = {
  border: '#666666',
  background: 'rgba(128, 128, 128, 0.1)',
  opacity: 10,
};

/** 默认节点样式 */
export const DEFAULT_NODE_STYLE: NodeStyleOverride = {
  size: 60,
  borderColor: '#333333',
  borderWidth: 2,
  backgroundColor: '#dcd0c0',
  shape: 'ellipse',
};

/** 默认图例配置（基于 relationshipColors.ts 中的类型） */
export const DEFAULT_LEGEND_CONFIG: LegendConfig = {
  enabled: false,
  position: 'top-right',
  items: [
    {
      id: 'legend-love',
      label: '恋爱/暧昧',
      color: '#E91E63',
      emoji: '❤️',
      keywords: ['恋', '爱', '暧昧', '情人', '伴侣'],
    },
    {
      id: 'legend-family',
      label: '亲属',
      color: '#2196F3',
      emoji: '💙',
      keywords: ['父', '母', '兄', '弟', '姐', '妹', '亲'],
    },
    {
      id: 'legend-friend',
      label: '友好/同伴',
      color: '#4CAF50',
      emoji: '💚',
      keywords: ['友', '朋', '伙伴', '同伴', '盟'],
    },
    { id: 'legend-neutral', label: '中立/一般', color: '#9E9E9E', emoji: '⚪', keywords: ['同事', '邻居', '认识'] },
    {
      id: 'legend-interest',
      label: '利益关系',
      color: '#FF9800',
      emoji: '🟡',
      keywords: ['合作', '雇佣', '交易', '利用'],
    },
    { id: 'legend-enemy', label: '敌对/仇恨', color: '#F44336', emoji: '🔴', keywords: ['敌', '仇', '对手', '竞争'] },
    { id: 'legend-complex', label: '复杂/未知', color: '#9C27B0', emoji: '🟣', keywords: [] },
  ],
};

/** 默认配置 */
export const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  nodeSize: 50,
  edgeWidth: 2.5,
  relationLabelFontSize: 10,
  nameLabelFontSize: 12,
  factionLabelFontSize: 14,
  showLegend: true,
  showBackground: true,
  factionColors: {},
  factionAvatars: {},
  nodeOverrides: {},
  legendConfig: { ...DEFAULT_LEGEND_CONFIG },
};

export const useGraphConfigStore = defineStore('graphConfig', () => {
  // ============================================================
  // 使用 ConfigManager 统一管理配置（按聊天分隔）
  // ============================================================
  const configManager = getACUConfigManager();

  /**
   * 获取当前聊天 ID（稳定版）
   * 不能直接 computed(() => SillyTavern.getCurrentChatId())，否则聊天切换时不会响应更新。
   */
  const currentChatIdRef = ref<string>('');

  function resolveCurrentChatId(): string {
    try {
      const chatId = SillyTavern?.getCurrentChatId?.();
      if (chatId !== undefined && chatId !== null && String(chatId).trim() !== '') {
        return String(chatId);
      }
    } catch (e) {
      console.warn('[GraphConfigStore] getCurrentChatId 读取失败:', e);
    }
    return '';
  }

  function refreshCurrentChatId(nextChatId?: string): void {
    const normalized =
      nextChatId !== undefined && nextChatId !== null && String(nextChatId).trim() !== ''
        ? String(nextChatId)
        : resolveCurrentChatId();

    if (normalized !== currentChatIdRef.value) {
      currentChatIdRef.value = normalized;
      console.info('[GraphConfigStore] 聊天 ID 已更新:', normalized);
    }
  }

  /** 对外使用的当前聊天 ID */
  const currentChatId = computed(() => currentChatIdRef.value);

  // 初始化时同步一次
  refreshCurrentChatId();

  // 监听聊天切换事件
  if (typeof tavern_events !== 'undefined') {
    eventOn(tavern_events.CHAT_CHANGED, (newChatId: string) => {
      refreshCurrentChatId(newChatId);
    });
  }

  // ============================================================
  // 使用 ref + watch 模式确保响应式正确工作
  // ============================================================

  /** 关系图配置 - 使用 ref 实现响应式 */
  const config = ref<GraphConfig>({ ...DEFAULT_GRAPH_CONFIG });

  /** 从 ConfigManager 加载当前聊天的配置 */
  function loadConfigFromManager() {
    const chatId = currentChatId.value;
    if (!chatId) {
      config.value = { ...DEFAULT_GRAPH_CONFIG };
      return;
    }
    const chatConfig = configManager.getChatConfig(chatId);
    config.value = chatConfig.graphConfig ? klona(chatConfig.graphConfig) : { ...DEFAULT_GRAPH_CONFIG };
    console.info('[GraphConfigStore] 已加载聊天配置:', chatId);
  }

  // 监听聊天 ID 变化，自动加载配置（immediate: true 确保初始化时加载）
  watch(
    currentChatId,
    () => {
      loadConfigFromManager();
    },
    { immediate: true },
  );

  // 监听配置变化，自动保存
  let isGraphConfigInitializing = true;
  watch(
    config,
    newValue => {
      if (isGraphConfigInitializing) return;
      if (!currentChatId.value) return;
      const chatConfig = configManager.getChatConfig(currentChatId.value);
      configManager.setChatConfig(currentChatId.value, {
        ...chatConfig,
        graphConfig: klona(newValue),
      });
    },
    { deep: true },
  );

  // 初始化完成后允许保存
  setTimeout(() => {
    isGraphConfigInitializing = false;
  }, 100);

  /**
   * 初始化当前聊天 ID
   * @deprecated 现在自动获取聊天 ID，此方法保留仅为兼容性
   */
  function initChatId(_chatId: string): void {
    // 现在 currentChatId 是 computed 属性，自动获取
    // 此方法保留仅为向后兼容
    console.info('[GraphConfigStore] initChatId 已弃用，聊天 ID 现在自动获取');
  }

  /**
   * 保存配置
   * 使用 ConfigManager 保存（由于 watch 自动保存，此函数主要用于手动触发）
   */
  function saveConfig(): void {
    if (!currentChatId.value) {
      console.warn('[GraphConfigStore] 无法保存：未设置聊天 ID');
      return;
    }
    const chatConfig = configManager.getChatConfig(currentChatId.value);
    configManager.setChatConfig(currentChatId.value, {
      ...chatConfig,
      graphConfig: klona(config.value),
    });
  }

  /**
   * 重置为默认配置
   */
  function resetToDefault(): void {
    config.value = { ...DEFAULT_GRAPH_CONFIG, factionColors: {} };
  }

  /**
   * 刷新配置
   * 重新从 ConfigManager 加载配置（切换聊天时调用）
   */
  function refresh(): void {
    loadConfigFromManager();
  }

  /**
   * 设置势力颜色
   * @param factionName 势力名称
   * @param colorConfig 颜色配置
   */
  function setFactionColor(factionName: string, colorConfig: FactionColorConfig): void {
    config.value.factionColors = {
      ...config.value.factionColors,
      [factionName]: colorConfig,
    };
  }

  /**
   * 获取势力颜色（如果未配置，自动分配一个）
   * @param factionName 势力名称
   * @param existingFactions 已存在的势力列表（用于分配新颜色）
   * @param useDefault 如果为 true，未配置时返回默认灰色样式；否则从调色板分配
   */
  function getFactionColor(
    factionName: string,
    existingFactions: string[] = [],
    useDefault = false,
  ): FactionColorConfig {
    // 如果已配置，直接返回
    if (config.value.factionColors[factionName]) {
      return config.value.factionColors[factionName];
    }
    // 如果要求使用默认样式
    if (useDefault) {
      return DEFAULT_FACTION_STYLE;
    }
    // 自动分配颜色
    const usedColors = Object.keys(config.value.factionColors).length;
    const colorIndex = (usedColors + existingFactions.indexOf(factionName)) % FACTION_COLOR_PALETTE.length;
    return FACTION_COLOR_PALETTE[Math.max(0, colorIndex)];
  }

  /**
   * 检查势力是否有配置颜色
   * @param factionName 势力名称
   */
  function hasFactionColor(factionName: string): boolean {
    return !!config.value.factionColors[factionName];
  }

  /**
   * 初始化势力颜色（为未配置的势力自动分配颜色）
   * @param factionNames 势力名称列表
   */
  function initFactionColors(factionNames: string[]): void {
    const newColors = { ...config.value.factionColors };
    let colorIndex = Object.keys(newColors).length;

    for (const name of factionNames) {
      if (!newColors[name]) {
        newColors[name] = FACTION_COLOR_PALETTE[colorIndex % FACTION_COLOR_PALETTE.length];
        colorIndex++;
      }
    }

    config.value.factionColors = newColors;
  }

  // ============================================================
  // 势力头像管理
  // ============================================================

  /**
   * 设置势力头像
   * @param factionName 势力名称
   * @param avatarConfig 头像配置
   */
  function setFactionAvatar(factionName: string, avatarConfig: FactionAvatarConfig): void {
    if (!config.value.factionAvatars) {
      config.value.factionAvatars = {};
    }
    config.value.factionAvatars = {
      ...config.value.factionAvatars,
      [factionName]: avatarConfig,
    };
  }

  /**
   * 获取势力头像配置
   * @param factionName 势力名称
   * @returns 头像配置，如果不存在则返回 undefined
   */
  function getFactionAvatar(factionName: string): FactionAvatarConfig | undefined {
    return config.value.factionAvatars?.[factionName];
  }

  /**
   * 删除势力头像
   * @param factionName 势力名称
   */
  function removeFactionAvatar(factionName: string): void {
    if (config.value.factionAvatars?.[factionName]) {
      const newAvatars = { ...config.value.factionAvatars };
      delete newAvatars[factionName];
      config.value.factionAvatars = newAvatars;
    }
  }

  /**
   * 检查势力是否有头像配置
   * @param factionName 势力名称
   */
  function hasFactionAvatar(factionName: string): boolean {
    return !!config.value.factionAvatars?.[factionName];
  }

  /**
   * 获取所有势力头像配置
   * @returns 势力头像配置映射
   */
  function getAllFactionAvatars(): Record<string, FactionAvatarConfig> {
    return config.value.factionAvatars || {};
  }

  // ============================================================
  // 势力样式覆盖（用于单个势力的个性化配置）
  // ============================================================

  /**
   * 设置势力样式覆盖
   * @param factionId 势力ID（容器节点ID）
   * @param override 样式覆盖配置
   */
  function setFactionOverride(factionId: string, override: Partial<FactionColorConfig>): void {
    // 从容器ID中提取势力名称
    const factionName = factionId.replace('faction-container-', '');
    const existing = config.value.factionColors[factionName] || { ...DEFAULT_FACTION_STYLE };
    config.value.factionColors = {
      ...config.value.factionColors,
      [factionName]: {
        ...existing,
        ...override,
      },
    };
  }

  /**
   * 获取势力样式覆盖
   * @param factionId 势力ID（容器节点ID）
   * @returns 样式配置，如果不存在则返回 undefined
   */
  function getFactionOverride(factionId: string): FactionColorConfig | undefined {
    const factionName = factionId.replace('faction-container-', '');
    return config.value.factionColors[factionName];
  }

  /**
   * 移除势力样式覆盖
   * @param factionId 势力ID（容器节点ID）
   */
  function removeFactionOverride(factionId: string): void {
    const factionName = factionId.replace('faction-container-', '');
    if (config.value.factionColors[factionName]) {
      const newColors = { ...config.value.factionColors };
      delete newColors[factionName];
      config.value.factionColors = newColors;
    }
  }

  // ============================================================
  // 节点样式覆盖（用于单个节点的个性化配置）
  // ============================================================

  /**
   * 设置节点样式覆盖
   * @param nodeId 节点ID
   * @param override 样式覆盖配置
   */
  function setNodeStyleOverride(nodeId: string, override: Partial<NodeStyleOverride>): void {
    if (!config.value.nodeOverrides) {
      config.value.nodeOverrides = {};
    }
    const existing = config.value.nodeOverrides[nodeId] || {};
    config.value.nodeOverrides = {
      ...config.value.nodeOverrides,
      [nodeId]: {
        ...existing,
        ...override,
      },
    };
  }

  /**
   * 获取节点样式覆盖
   * @param nodeId 节点ID
   * @returns 样式配置，如果不存在则返回 undefined
   */
  function getNodeStyleOverride(nodeId: string): NodeStyleOverride | undefined {
    return config.value.nodeOverrides?.[nodeId];
  }

  /**
   * 移除节点样式覆盖
   * @param nodeId 节点ID
   */
  function removeNodeStyleOverride(nodeId: string): void {
    if (config.value.nodeOverrides?.[nodeId]) {
      const newOverrides = { ...config.value.nodeOverrides };
      delete newOverrides[nodeId];
      config.value.nodeOverrides = newOverrides;
    }
  }

  /**
   * 检查节点是否有样式覆盖
   * @param nodeId 节点ID
   */
  function hasNodeStyleOverride(nodeId: string): boolean {
    return !!config.value.nodeOverrides?.[nodeId];
  }

  // 注意：watch 已在上方设置，监听 config 变化自动保存

  // ============================================================
  // 图例配置管理
  // ============================================================

  /**
   * 设置图例是否启用
   */
  function setLegendEnabled(enabled: boolean): void {
    if (!config.value.legendConfig) {
      config.value.legendConfig = { ...DEFAULT_LEGEND_CONFIG };
    }
    config.value.legendConfig.enabled = enabled;
  }

  /**
   * 设置图例位置
   */
  function setLegendPosition(position: LegendConfig['position']): void {
    if (!config.value.legendConfig) {
      config.value.legendConfig = { ...DEFAULT_LEGEND_CONFIG };
    }
    config.value.legendConfig.position = position;
  }

  /**
   * 添加图例项
   */
  function addLegendItem(item: Omit<LegendItem, 'id'>): void {
    if (!config.value.legendConfig) {
      config.value.legendConfig = { ...DEFAULT_LEGEND_CONFIG };
    }
    const newItem: LegendItem = {
      ...item,
      id: `legend-${Date.now()}`,
    };
    config.value.legendConfig.items = [...config.value.legendConfig.items, newItem];
  }

  /**
   * 更新图例项
   */
  function updateLegendItem(id: string, updates: Partial<LegendItem>): void {
    if (!config.value.legendConfig?.items) return;
    config.value.legendConfig.items = config.value.legendConfig.items.map(item =>
      item.id === id ? { ...item, ...updates } : item,
    );
  }

  /**
   * 删除图例项
   */
  function removeLegendItem(id: string): void {
    if (!config.value.legendConfig?.items) return;
    config.value.legendConfig.items = config.value.legendConfig.items.filter(item => item.id !== id);
  }

  /**
   * 获取图例配置
   */
  function getLegendConfig(): LegendConfig {
    return config.value.legendConfig || DEFAULT_LEGEND_CONFIG;
  }

  /**
   * 重置图例配置为默认值
   */
  function resetLegendConfig(): void {
    config.value.legendConfig = { ...DEFAULT_LEGEND_CONFIG };
  }

  /**
   * 设置是否显示背景
   */
  function setShowBackground(show: boolean): void {
    config.value.showBackground = show;
    saveConfig();
  }

  /**
   * 根据关系词匹配图例项颜色
   * @param relationWord 关系词
   * @returns 匹配到的颜色，如果未匹配返回 null
   */
  function matchLegendColor(relationWord: string): string | null {
    const legendConfig = config.value.legendConfig;
    if (!legendConfig?.enabled || !legendConfig.items?.length) {
      return null;
    }

    for (const item of legendConfig.items) {
      if (item.keywords.some(kw => relationWord.includes(kw))) {
        return item.color;
      }
    }

    return null;
  }

  return {
    config,
    currentChatId,
    initChatId,
    saveConfig,
    resetToDefault,
    refresh,
    setFactionColor,
    getFactionColor,
    hasFactionColor,
    initFactionColors,
    // 势力头像管理
    setFactionAvatar,
    getFactionAvatar,
    removeFactionAvatar,
    hasFactionAvatar,
    getAllFactionAvatars,
    // 势力样式覆盖
    setFactionOverride,
    getFactionOverride,
    removeFactionOverride,
    // 节点样式覆盖
    setNodeStyleOverride,
    getNodeStyleOverride,
    removeNodeStyleOverride,
    hasNodeStyleOverride,
    // 图例配置管理
    setLegendEnabled,
    setLegendPosition,
    addLegendItem,
    updateLegendItem,
    removeLegendItem,
    getLegendConfig,
    resetLegendConfig,
    matchLegendColor,
    setShowBackground,
  };
});
