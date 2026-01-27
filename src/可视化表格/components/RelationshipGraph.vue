<template>
  <div class="acu-relationship-graph">
    <!-- 背景层 -->
    <div v-if="backgroundStyle.enabled" class="acu-graph-background" :style="backgroundStyle.style"></div>

    <!-- 图例（顶部） -->
    <div v-if="graphConfigStore.config.showLegend" class="acu-graph-legend">
      <div v-for="item in legend" :key="item.level" class="acu-legend-item">
        <span
          class="dot"
          :class="{ dashed: item.isDashed }"
          :style="{ backgroundColor: item.isDashed ? 'transparent' : item.color, borderColor: item.color }"
        ></span>
        <span class="label">{{ item.emoji }} {{ item.name }}</span>
      </div>
    </div>

    <!-- 图容器（中间） -->
    <div ref="containerRef" class="acu-graph-container"></div>

    <!-- 工具栏（底部） -->
    <div class="acu-graph-toolbar">
      <button class="acu-graph-btn" title="适应视图" @click="fitToView">
        <i class="fas fa-compress-arrows-alt"></i>
      </button>
      <span class="acu-toolbar-divider"></span>
      <button
        class="acu-graph-btn"
        :class="{ active: layoutMode === 'fcose' }"
        title="力导向布局"
        @click="setLayout('fcose')"
      >
        <i class="fas fa-project-diagram"></i>
      </button>
      <button
        class="acu-graph-btn"
        :class="{ active: layoutMode === 'cola' }"
        title="势力分组布局"
        @click="setLayout('cola')"
      >
        <i class="fas fa-object-group"></i>
      </button>
      <button
        class="acu-graph-btn"
        :class="{ active: layoutMode === 'circle' }"
        title="环形布局"
        @click="setLayout('circle')"
      >
        <i class="fas fa-circle-notch"></i>
      </button>
      <button
        class="acu-graph-btn"
        :class="{ active: layoutMode === 'dagre' }"
        title="层级布局"
        @click="setLayout('dagre')"
      >
        <i class="fas fa-sitemap"></i>
      </button>
      <span class="acu-toolbar-divider"></span>
      <button class="acu-graph-btn" title="重置布局" @click="clearSavedPositions">
        <i class="fas fa-undo"></i>
      </button>
      <span class="acu-toolbar-divider"></span>
      <button class="acu-graph-btn" title="图形设置" @click.stop="openGraphSettings">
        <i class="fas fa-cog"></i>
      </button>
      <span class="acu-toolbar-divider"></span>
      <button class="acu-graph-btn" title="返回仪表盘" @click.stop="handleBackToDashboard">
        <i class="fas fa-arrow-left"></i>
      </button>
    </div>

    <!-- 空状态 -->
    <div v-if="!hasData" class="acu-graph-empty">
      <i class="fas fa-project-diagram"></i>
      <p>暂无关系数据</p>
      <p class="hint">请确保存在"关系表"并包含有效数据</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * RelationshipGraph.vue - 人际关系图组件
 *
 * 使用 Cytoscape.js 渲染节点和边，支持：
 * - 三种布局模式（力导向、环形、层级）
 * - 节点拖拽
 * - 缩放和平移
 * - 边的颜色根据关系词自动判断
 */

import { useDebounceFn } from '@vueuse/core';
import type { Core, LayoutOptions } from 'cytoscape';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';
import fcose from 'cytoscape-fcose';
// @ts-expect-error - cytoscape-node-html-label 没有类型定义
import nodeHtmlLabel from 'cytoscape-node-html-label';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useAvatarManager } from '../composables/useAvatarManager';
import { GLOBAL_THEME_BG_KEY, loadBackground, revokeBlobUrl } from '../composables/useBackgroundStorage';
import { TAB_DASHBOARD, useConfigStore, useGraphConfigStore, useThemeStore, useUIStore } from '../stores';
import { DEFAULT_FACTION_STYLE, type FactionColorConfig } from '../stores/useGraphConfigStore';
import type { ProcessedTable } from '../types';
import {
  extractFactionMapping,
  getCore,
  getRelationColor,
  getRelationLegend,
  isEnglishName,
  parseEmbeddedRelationships,
  parseRelationshipTable,
} from '../utils';

// 注册布局扩展
cytoscape.use(fcose); // fcose: 自由模式（边交叉优化好）
cytoscape.use(cola); // cola: 势力容器模式（支持复合节点）

// 注册 node-html-label 扩展（用于 HTML 渲染节点头像）
nodeHtmlLabel(cytoscape);

// Stores
const configStore = useConfigStore();
const uiStore = useUIStore();
const graphConfigStore = useGraphConfigStore();
const themeStore = useThemeStore();

// 头像管理
const avatarManager = useAvatarManager();

/** 头像缓存数据类型 */
interface AvatarCacheData {
  url: string;
  offsetX: number;
  offsetY: number;
  scale: number;
}

/** 头像缓存：nodeName -> { url, offsetX, offsetY, scale } */
const avatarCache = ref<Map<string, AvatarCacheData>>(new Map());

/** 别名映射：别名 -> 主名称 */
const aliasMap = ref<Map<string, string>>(new Map());

/** 当前背景图片的 blob URL（需要在组件卸载时释放） */
const currentBackgroundUrl = ref<string | null>(null);

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  /** 关系表数据 */
  relationshipTable?: ProcessedTable | null;
  /** 人物表列表（主角表 + 重要人物表） */
  characterTables?: ProcessedTable[];
  /** 势力表数据 */
  factionTable?: ProcessedTable | null;
  /** 所有表格（用于势力映射） */
  allTables?: ProcessedTable[];
  /** 是否显示图例 */
  showLegend?: boolean;
  /** 初始布局模式 */
  initialLayout?: 'fcose' | 'cola' | 'circle' | 'dagre';
}

const props = withDefaults(defineProps<Props>(), {
  relationshipTable: null,
  characterTables: () => [],
  factionTable: null,
  allTables: () => [],
  showLegend: true,
  initialLayout: 'fcose',
});

const emit = defineEmits<{
  /** 节点点击事件 */
  (e: 'node-click', data: { id: string; type: string }): void;
  /** 边点击事件 */
  (e: 'edge-click', data: { source: string; target: string; relation: string }): void;
}>();

// ============================================================
// Refs
// ============================================================

const containerRef = ref<HTMLElement | null>(null);
let cy: Core | null = null;

/** 布局类型 */
type LayoutType = 'fcose' | 'cola' | 'circle' | 'dagre';

/** 获取初始布局模式 - 优先使用保存的布局，否则使用 props.initialLayout */
function getInitialLayoutMode(): LayoutType {
  const savedConfig = getGraphConfig();
  return savedConfig.lastLayout || props.initialLayout;
}

/** 当前布局模式 */
const layoutMode = ref<LayoutType>(getInitialLayoutMode());

/** 环形布局的中心节点ID（默认为主角） */
const centerNodeId = ref<string | null>(null);

// ============================================================
// 持久化存储 - 使用聊天变量
// ============================================================

/** 聊天变量中存储关系图配置的 key */
const CHAT_VAR_GRAPH_CONFIG = 'acu_graph_config';

/** 标签配置类型 */
interface LabelConfig {
  displayLabel: string;
  selectedIndices: number[];
}

/** 关系图配置类型 - 支持分布局保存 */
interface GraphConfig {
  /** 按布局类型分别存储位置（新格式） */
  layoutPositions?: {
    [K in LayoutType]?: Record<string, { x: number; y: number }>;
  };
  /** 旧格式：扁平位置存储（仅用于迁移） */
  positions?: Record<string, { x: number; y: number }>;
  /** 标签配置（全局共享） */
  labels?: Record<string, LabelConfig>;
  /** 最后使用的布局模式 */
  lastLayout?: LayoutType;
}

/** 获取关系图配置（自动迁移旧格式） */
function getGraphConfig(): GraphConfig {
  try {
    const chatVars = getVariables({ type: 'chat' });
    const config = (chatVars[CHAT_VAR_GRAPH_CONFIG] as GraphConfig) || {};

    // 迁移旧格式：如果有 positions 但没有 layoutPositions，迁移到 fcose
    if (config.positions && !config.layoutPositions) {
      console.info('[RelationshipGraph] 迁移旧格式位置数据到 fcose');
      config.layoutPositions = {
        fcose: config.positions,
      };
      delete config.positions;
      // 保存迁移后的配置
      saveGraphConfig(config);
    }

    return config;
  } catch (e) {
    console.warn('[RelationshipGraph] 获取聊天变量失败:', e);
    return {};
  }
}

/** 保存关系图配置 */
function saveGraphConfig(config: GraphConfig) {
  try {
    insertOrAssignVariables({ [CHAT_VAR_GRAPH_CONFIG]: config }, { type: 'chat' });
  } catch (e) {
    console.warn('[RelationshipGraph] 保存聊天变量失败:', e);
  }
}

/** 检查当前布局是否有保存的位置数据 */
function hasSavedPositions(layout?: LayoutType): boolean {
  const targetLayout = layout || layoutMode.value;
  const config = getGraphConfig();
  console.info(`[RelationshipGraph] hasSavedPositions(${targetLayout}):`, {
    layoutPositions: config.layoutPositions ? Object.keys(config.layoutPositions) : 'undefined',
    targetLayoutData: config.layoutPositions?.[targetLayout]
      ? Object.keys(config.layoutPositions[targetLayout]).length + ' 个节点'
      : '无',
  });
  const positions = config.layoutPositions?.[targetLayout];
  return !!(positions && Object.keys(positions).length > 0);
}

/** 获取当前布局保存的位置数据 */
function getSavedPositions(layout?: LayoutType): Record<string, { x: number; y: number }> | undefined {
  const targetLayout = layout || layoutMode.value;
  return getGraphConfig().layoutPositions?.[targetLayout];
}

// ============================================================
// CSS 变量读取
// ============================================================

/**
 * 从父窗口读取 CSS 变量的计算值
 * Cytoscape 不支持 CSS 变量语法，需要手动解析
 *
 * 注意：主题 class 在 .acu-wrapper 上，不是在 :root 上
 * 需要从正确的容器读取 CSS 变量
 */
function getCssVar(varName: string, fallback: string): string {
  try {
    const parentDoc = window.parent?.document || document;

    // 首先尝试从 .acu-wrapper（主题容器）读取
    const wrapper = parentDoc.querySelector('.acu-wrapper');
    if (wrapper) {
      const computed = getComputedStyle(wrapper).getPropertyValue(varName).trim();
      if (computed) return computed;
    }

    // 回退到 documentElement
    const rootComputed = getComputedStyle(parentDoc.documentElement).getPropertyValue(varName).trim();
    return rootComputed || fallback;
  } catch {
    return fallback;
  }
}

/** 获取主题相关的颜色和字体 */
function getThemeColors() {
  return {
    textMain: getCssVar('--acu-text-main', '#333333'),
    textSub: getCssVar('--acu-text-sub', '#666666'),
    cardBg: getCssVar('--acu-card-bg', '#ffffff'),
    border: getCssVar('--acu-border', '#e0e0e0'),
    titleColor: getCssVar('--acu-title-color', '#d35400'), // 主题色
    bgPanel: getCssVar('--acu-bg-panel', '#e6e2d3'), // 面板背景色
    btnBg: getCssVar('--acu-btn-bg', '#dcd0c0'), // 按钮背景色 - NPC节点使用
    highlight: getCssVar('--acu-highlight', '#d35400'), // 高亮色 - 主角节点使用
    fontFamily: getCssVar('--acu-font-family', 'Source Han Sans SC, sans-serif'), // 字体
  };
}

/**
 * 预加载 Canvas 字体
 * Cytoscape 使用 Canvas 渲染，需要字体先加载完成才能正确显示
 * 否则 Canvas 会静默回退到默认字体
 */
async function preloadCanvasFont(): Promise<void> {
  const fontFamily = getThemeColors().fontFamily;
  // 从 font-family 字符串中提取第一个字体名称
  const fontName = fontFamily.split(',')[0].trim().replace(/['"]/g, '');

  if (!fontName) return;

  try {
    // 使用 FontFaceSet.load() API 预加载字体
    // 需要指定字体大小才能触发加载
    const parentDoc = window.parent?.document || document;
    await parentDoc.fonts.load(`16px "${fontName}"`);
    console.info('[RelationshipGraph] 字体预加载完成:', fontName);
  } catch (e) {
    console.warn('[RelationshipGraph] 字体预加载失败:', fontName, e);
  }
}

// ============================================================
// 计算属性
// ============================================================

/** 图例数据 */
const legend = computed(() => getRelationLegend());

/** 背景样式配置 */
const backgroundStyle = computed(() => {
  // 检查本地开关 (是否显示背景)
  if (!graphConfigStore.config.showBackground) {
    return { enabled: false, style: {} };
  }

  const bg = themeStore.backgroundConfig;
  // 使用运行时的 currentBackgroundUrl 或 externalUrl
  const imageUrl = currentBackgroundUrl.value || bg.externalUrl || '';

  if (!bg.enabled || !imageUrl) {
    return { enabled: false, style: {} };
  }

  // 使用与 useThemeStore 一致的逻辑：transform 实现位移和缩放
  const scale = (bg.scale || 100) / 100;
  const size = bg.size === 'auto' ? '100%' : bg.size;

  return {
    enabled: true,
    style: {
      backgroundImage: `url(${imageUrl})`,
      backgroundPosition: 'center center', // 固定居中
      backgroundSize: size,
      backgroundRepeat: 'no-repeat',
      // 使用 transform 实现位移和缩放
      transform: `translate(${bg.offsetX || 0}%, ${bg.offsetY || 0}%) scale(${scale})`,
      transformOrigin: 'center center',
      opacity: bg.opacity / 100,
      filter: bg.blur > 0 ? `blur(${bg.blur}px)` : 'none',
      // 确保覆盖整个容器且不阻挡交互
      position: 'absolute' as const,
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      zIndex: '0', // 在父容器背景之上，但在图容器(z-index: 1)之下
      pointerEvents: 'none' as const,
    },
  };
});

/** 获取自定义图例配置（转换为解析器需要的格式） */
const customLegendItems = computed(() => {
  const legendConfig = graphConfigStore.getLegendConfig();
  if (!legendConfig.enabled || !legendConfig.items?.length) {
    return undefined;
  }
  return legendConfig.items.map(item => ({
    label: item.label,
    color: item.color,
    keywords: item.keywords,
  }));
});

/** 解析后的元素数据 */
const parsedData = computed(() => {
  console.info('[RelationshipGraph] 解析数据 - props:', {
    relationshipTable: props.relationshipTable?.name,
    characterTablesCount: props.characterTables?.length,
    characterTablesNames: props.characterTables?.map(t => t.name),
    factionTable: props.factionTable?.name,
    aliasMapSize: aliasMap.value.size,
    customLegendEnabled: !!customLegendItems.value,
  });

  // 优先使用专用关系表，传入别名映射和自定义图例配置
  const result = parseRelationshipTable(
    props.relationshipTable,
    props.characterTables,
    props.factionTable,
    aliasMap.value,
    customLegendItems.value,
  );

  console.info('[RelationshipGraph] 专用关系表解析结果:', {
    nodeCount: result.nodeCount,
    edgeCount: result.edgeCount,
    warnings: result.warnings,
  });

  // 如果没有数据且有角色表，尝试从角色表的内嵌字段解析
  if (result.nodeCount === 0 && props.characterTables && props.characterTables.length > 0) {
    console.info('[RelationshipGraph] 无专用关系表，尝试从角色表内嵌字段解析');
    const embeddedResult = parseEmbeddedRelationships(
      props.characterTables,
      props.factionTable,
      aliasMap.value,
      customLegendItems.value,
    );
    console.info('[RelationshipGraph] 内嵌字段解析结果:', {
      nodeCount: embeddedResult.nodeCount,
      edgeCount: embeddedResult.edgeCount,
      warnings: embeddedResult.warnings,
    });
    return embeddedResult;
  }

  return result;
});

/** 是否有数据 */
const hasData = computed(() => {
  return parsedData.value.nodeCount > 0;
});

/** 当前解析出的势力列表（至少有 1 个节点归属的势力） */
const currentFactions = computed(() => {
  const { factionList, characterToFaction } = extractFactionMapping(props.allTables || [], props.characterTables || []);

  // 只返回至少有 1 个节点归属的势力
  const factionsWithMembers = factionList.filter(faction => {
    for (const [_, factionName] of characterToFaction) {
      if (factionName === faction) return true;
    }
    return false;
  });

  return factionsWithMembers;
});

// ============================================================
// 导航操作
// ============================================================

/** 返回仪表盘 */
function handleBackToDashboard() {
  uiStore.setActiveTab(TAB_DASHBOARD);
}

// ============================================================
// 布局配置
// ============================================================

/**
 * 获取布局配置
 */
function getLayoutConfig(mode: LayoutType): LayoutOptions {
  switch (mode) {
    case 'cola':
      // cola: 势力容器布局（支持复合节点）
      // 改用 fcose 以获得更好的力导向效果，同时支持复合节点
      return {
        name: 'fcose',
        quality: 'proof',
        randomize: false, // 默认不随机，重置时会覆盖为 true
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 30,
        // 节点分离
        nodeSeparation: 75,
        // 边长度
        idealEdgeLength: 100,
        // 边弹性
        edgeElasticity: 0.45,
        // 嵌套因子 (复合节点关键参数)
        nestingFactor: 0.1,
        // 重力
        gravity: 0.25,
        // 迭代次数
        numIter: 2500,
        // 避免重叠
        nodeRepulsion: 4500,
        // 启用平铺操作以更好地处理断开的组件
        tilingPaddingVertical: 10,
        tilingPaddingHorizontal: 10,
      } as LayoutOptions;
    case 'circle':
      // 使用 concentric 布局实现星形效果，支持切换中心节点
      return {
        name: 'concentric',
        concentric: (node: { id: () => string; data: (key: string) => string }) => {
          // 如果指定了中心节点，该节点放中心
          if (centerNodeId.value && node.id() === centerNodeId.value) return 100;
          // 没有指定中心节点时，主角放中心
          if (!centerNodeId.value && node.data('type') === 'protagonist') return 100;
          // 其他角色放外圈
          return 1;
        },
        levelWidth: () => 1, // 每层一圈
        minNodeSpacing: 80,
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 30,
      } as LayoutOptions;
    case 'dagre':
      // dagre 需要额外插件，这里用 breadthfirst 替代
      return {
        name: 'breadthfirst',
        directed: true,
        padding: 30,
        spacingFactor: 1.5,
        animate: true,
        animationDuration: 300,
      };
    case 'fcose':
    default:
      // fcose: 边交叉优化好的力导向布局（自由模式使用）
      return {
        name: 'fcose',
        quality: 'proof', // 最高质量
        randomize: false,
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 30,
        // 节点分离
        nodeSeparation: 100,
        // 边长度
        idealEdgeLength: 120,
        // 边弹性
        edgeElasticity: 0.45,
        // 嵌套因子
        nestingFactor: 0.1,
        // 重力
        gravity: 0.25,
        // 迭代次数
        numIter: 2500,
        // 避免重叠
        nodeRepulsion: 4500,
      } as LayoutOptions;
  }
}

// ============================================================
// Cytoscape 初始化
// ============================================================

/**
 * 初始化 Cytoscape 实例
 */
function initCytoscape() {
  if (!containerRef.value) return;

  // 读取主题颜色（Cytoscape 不支持 CSS 变量）
  const colors = getThemeColors();

  // 检查是否有保存的位置
  const savedPositions = getSavedPositions();
  const savedCount = savedPositions ? Object.keys(savedPositions).length : 0;
  // 使用 nodeCount（直接从解析结果获取），避免依赖 elements.group 属性
  const currentNodeCount = parsedData.value.nodeCount;

  // 只有当保存的节点数量 >= 当前节点数量的 80% 时，才使用保存的位置
  // 这样可以处理少量节点变化的情况，同时避免大量新节点时位置混乱
  const hasPositions = savedCount > 0 && currentNodeCount > 0 && savedCount >= currentNodeCount * 0.8;

  console.info('[RelationshipGraph] 布局检查:', {
    保存的位置数: savedCount,
    当前节点数: currentNodeCount,
    使用保存位置: hasPositions,
  });

  // 将位置和头像数据附加到元素上
  const elementsWithData = parsedData.value.elements.map(el => {
    const nodeId = el.data?.id as string | undefined;
    // 判断是否为节点：节点没有 source 属性，边有 source/target
    const isNode = nodeId && !el.data?.source;

    if (isNode) {
      // 附加头像数据（包括 URL 和裁剪参数）
      const avatarData = avatarCache.value.get(nodeId);

      // 计算位置
      let position = undefined;
      if (hasPositions && savedPositions) {
        if (savedPositions[nodeId]) {
          // 已保存位置的节点：恢复位置
          console.info('[RelationshipGraph] 恢复节点位置:', nodeId, savedPositions[nodeId]);
          position = savedPositions[nodeId];
        } else {
          // 新增节点：随机分配位置，避免重叠在 (0,0)
          position = {
            x: (Math.random() - 0.5) * 200,
            y: (Math.random() - 0.5) * 200,
          };
        }
      }

      // 获取全名用于头像节点下方显示
      const fullName = el.data?.fullName || el.data?.id || '';

      // 获取节点样式覆盖（用于动态大小、形状和边框）
      const override = graphConfigStore.getNodeStyleOverride(nodeId);
      const nodeSize = override?.size ?? graphConfigStore.config.nodeSize;
      const nodeShape = override?.shape ?? 'ellipse';
      const nodeBorderWidth = override?.borderWidth ?? 0;
      // 边框颜色默认使用主题文本颜色
      const defaultBorderColor = getThemeColors().textMain;
      const nodeBorderColor = override?.borderColor ?? defaultBorderColor;

      return {
        ...el,
        data: {
          ...el.data,
          avatarUrl: avatarData?.url || undefined,
          avatarOffsetX: avatarData?.offsetX ?? 50,
          avatarOffsetY: avatarData?.offsetY ?? 50,
          avatarScale: avatarData?.scale ?? 150,
          fullName: fullName, // 确保 fullName 存在
          nodeSize: nodeSize, // 节点大小（用于头像）
          nodeShape: nodeShape, // 节点形状（用于头像圆角）
          nodeBorderWidth: nodeBorderWidth, // 节点边框宽度
          nodeBorderColor: nodeBorderColor, // 节点边框颜色
        },
        ...(position ? { position } : {}),
      };
    }
    return el;
  });

  cy = cytoscape({
    container: containerRef.value,
    elements: elementsWithData,
    style: [
      // 节点基础样式（NPC 节点）- 使用按钮背景色，细边框
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          'text-valign': 'center', // 文字垂直居中
          'text-halign': 'center', // 文字水平居中
          'text-wrap': 'wrap', // 允许换行
          'text-max-width': `${graphConfigStore.config.nodeSize - 4}px`, // 略小于节点宽度，留边距
          'background-color': colors.btnBg, // 按钮背景色
          color: colors.textMain, // 主要文本色
          'font-family': colors.fontFamily, // 使用设置的字体
          // 动态字体大小：完全基于节点大小计算（返回带单位的字符串）
          'font-size': (node: { data: (key: string) => string }) => {
            const label = node.data('label') || '';
            const len = label.length;
            const nodeSize = graphConfigStore.config.nodeSize;
            // 根据字符长度选择系数：单字0.6，双字0.45，三字0.35，四字0.28，五字以上0.22
            let ratio: number;
            if (len <= 1) ratio = 0.6;
            else if (len <= 2) ratio = 0.45;
            else if (len <= 3) ratio = 0.35;
            else if (len <= 4) ratio = 0.28;
            else ratio = 0.22;
            return `${Math.round(nodeSize * ratio)}px`;
          },
          'font-weight': 'bold',
          width: graphConfigStore.config.nodeSize,
          height: graphConfigStore.config.nodeSize,
          'border-width': 1.5, // 细边框
          'border-color': colors.textMain, // 主要文本色边框
        },
      },
      // 主角节点 - 使用高亮色，统一大小
      {
        selector: 'node.protagonist',
        style: {
          'background-color': colors.highlight, // 高亮色
          color: colors.textMain, // 主要文本色
          'border-width': 1.5, // 细边框
          'border-color': colors.textMain, // 主要文本色边框
          // 统一使用基础节点大小 (50x50) 和字体逻辑，不再特殊放大
        },
      },
      // 角色节点 - 使用按钮背景色（已在基础样式中设置）
      {
        selector: 'node.character',
        style: {
          // 继承基础样式
        },
      },
      // 势力节点 - 圆角矩形，使用按钮背景色
      {
        selector: 'node.faction',
        style: {
          'background-color': colors.btnBg,
          color: colors.textMain,
          'border-width': 1.5,
          'border-color': colors.textMain,
          shape: 'round-rectangle',
          width: 70,
          height: 35,
          'font-size': '14px',
        },
      },
      // 未知节点 - 使用按钮背景色
      {
        selector: 'node.unknown',
        style: {
          'background-color': colors.btnBg,
          color: colors.textMain,
          'border-width': 1.5,
          'border-color': colors.textMain,
        },
      },
      // 有头像的节点 - 使用 nodeHtmlLabel 扩展渲染 HTML 头像
      // Cytoscape 节点本身设为透明，只保留交互区域
      // 放在最后以确保覆盖角色类型样式（如主角的样式）
      {
        selector: 'node[avatarUrl]',
        style: {
          // 节点透明，头像由 HTML label 渲染
          'background-color': 'transparent',
          'background-opacity': 0,
          'border-width': 0,
          // 保留节点大小用于交互和布局
          width: graphConfigStore.config.nodeSize,
          height: graphConfigStore.config.nodeSize,
          // 隐藏 Canvas 渲染的标签（由 HTML label 渲染）
          label: '',
        },
      },
      // 边样式 - 实线
      {
        selector: 'edge',
        style: {
          'curve-style': 'bezier',
          'target-arrow-shape': 'triangle',
          'target-arrow-color': 'data(color)',
          'line-color': 'data(color)',
          'line-style': 'solid',
          width: graphConfigStore.config.edgeWidth,
          label: 'data(label)',
          'font-size': `${graphConfigStore.config.relationLabelFontSize}px`,
          'font-family': colors.fontFamily, // 使用设置的字体
          'text-rotation': 'autorotate',
          'text-margin-y': -8,
          color: '#fff', // 白色文字
          'text-background-color': 'data(color)', // 使用边的颜色作为标签背景
          'text-background-opacity': 0.95,
          // padding 约为字体大小的 25%，最小 3px
          'text-background-padding': `${Math.max(3, Math.round(graphConfigStore.config.relationLabelFontSize * 0.25))}px`,
          'text-background-shape': 'roundrectangle', // 圆角矩形背景
          // 边标签无描边
        },
      },
      // 边样式 - 虚线（有备注时）
      {
        selector: 'edge[lineStyle = "dashed"]',
        style: {
          'line-style': 'dashed',
        },
      },
      // 边样式 - 双向箭头
      {
        selector: 'edge[?bidirectional]', // bidirectional = true
        style: {
          'source-arrow-shape': 'triangle', // 源端也加箭头
          'source-arrow-color': 'data(color)',
          'curve-style': 'straight', // 双向边用直线更清晰
        },
      },
      // 选中状态 - 节点
      {
        selector: 'node:selected',
        style: {
          'border-width': 4,
          'border-color': '#FFC107',
          'overlay-opacity': 0.2,
          'overlay-color': '#FFC107',
        },
      },
      // 选中状态 - 边
      {
        selector: 'edge:selected',
        style: {
          width: 4,
          'line-color': '#FFC107',
          'target-arrow-color': '#FFC107',
        },
      },
    ],
    // 如果有保存的位置，使用 preset 布局（保持当前位置）；否则使用默认布局
    layout: hasPositions ? { name: 'preset' } : getLayoutConfig(layoutMode.value),
    // 交互选项
    userZoomingEnabled: true,
    userPanningEnabled: true,
    boxSelectionEnabled: false,
    minZoom: 0.3,
    maxZoom: 3,
  });

  // 绑定事件 - 单击节点
  cy.on('tap', 'node', evt => {
    const node = evt.target;
    const nodeId = node.id();
    const nodeType = node.data('type') || 'unknown';

    // 在环形布局模式下，点击节点切换为中心
    if (layoutMode.value === 'circle') {
      setCenterNode(nodeId);
    }

    emit('node-click', {
      id: nodeId,
      type: nodeType,
    });
  });

  // 双击普通节点 - 打开配置弹窗（使用 id 作为全名，而非 label）
  cy.on('dbltap', 'node:childless', evt => {
    const node = evt.target;
    // 跳过势力容器节点，它们有专门的处理
    if (node.hasClass('faction-container')) return;
    openNodeConfig(node.id(), node.id()); // id 是全名
  });

  // 双击势力容器节点 - 打开势力设置弹窗
  cy.on('dbltap', 'node.faction-container', evt => {
    const node = evt.target;
    const factionId = node.id();
    const factionName = node.data('label') || factionId.replace('faction-container-', '');
    uiStore.openFactionSettingsDialog(factionId, factionName);
  });

  cy.on('tap', 'edge', evt => {
    const edge = evt.target;
    emit('edge-click', {
      source: edge.source().id(),
      target: edge.target().id(),
      relation: edge.data('label') || '',
    });
  });

  // 创建防抖的保存函数 (延迟 1000ms，避免频繁写入)
  const debouncedSaveNodePositions = useDebounceFn(() => {
    saveNodePositions();
  }, 1000);

  // 节点拖拽结束 - 自动保存
  cy.on('dragfree', 'node', () => {
    debouncedSaveNodePositions();
  });

  // 如果使用了 preset 布局，适应视图
  if (hasPositions) {
    cy.fit(undefined, 30);
  }

  // 应用保存的标签配置
  applyLabelConfig();

  // 如果初始布局是 cola（势力分组布局），需要创建势力容器
  if (layoutMode.value === 'cola') {
    console.info('[RelationshipGraph] 初始化时检测到 cola 布局，创建势力容器');
    setupFactionContainers();
    applyAllFactionStyles();
  }

  // 应用所有配置（节点样式、势力容器样式）
  applyAllConfigs();

  // 使用 nodeHtmlLabel 扩展为有头像的节点渲染 HTML 头像
  // 这样可以使用真正的 CSS 渲染，与头像预览完全一致
  (cy as any).nodeHtmlLabel([
    {
      query: 'node[avatarUrl]',
      halign: 'center',
      valign: 'center',
      halignBox: 'center',
      valignBox: 'center',
      tpl: (data: any) => {
        const avatarUrl = data.avatarUrl || '';
        const offsetX = data.avatarOffsetX ?? 50;
        const offsetY = data.avatarOffsetY ?? 50;
        const scale = data.avatarScale ?? 150;
        const fullName = data.fullName || data.id || '';
        // 头像下方人名字体大小受设置影响
        const nameFontSize = graphConfigStore.config.nameLabelFontSize || 14;
        // 头像大小和形状
        const nodeSize = data.nodeSize || graphConfigStore.config.nodeSize || 50;
        const nodeShape = data.nodeShape || 'ellipse';
        // 边框设置 - 默认使用主题文本颜色
        const borderWidth = data.nodeBorderWidth ?? 0;
        const defaultBorderColor = getThemeColors().textMain;
        const borderColor = data.nodeBorderColor ?? defaultBorderColor;

        // 根据形状决定圆角和 clip-path
        let borderRadius: string;
        let clipPath: string = 'none';
        if (nodeShape === 'ellipse') {
          borderRadius = '50%';
        } else if (nodeShape === 'round-rectangle') {
          borderRadius = '12px';
        } else if (nodeShape === 'hexagon') {
          // 六边形使用 clip-path
          borderRadius = '0';
          clipPath = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
        } else {
          borderRadius = '0';
        }

        // 计算实际内容区大小（扣除边框）
        const contentSize = nodeSize - borderWidth * 2;

        // 使用与头像预览完全相同的 CSS，但大小动态，并支持边框和形状
        return `
          <div class="acu-graph-avatar-wrapper">
            <div class="acu-graph-avatar" style="
              width: ${contentSize}px;
              height: ${contentSize}px;
              border-radius: ${borderRadius};
              border: ${borderWidth}px solid ${borderColor};
              background-image: url('${avatarUrl}');
              background-position: ${offsetX}% ${offsetY}%;
              background-size: ${scale}%;
              background-repeat: no-repeat;
              box-sizing: content-box;
              clip-path: ${clipPath};
            "></div>
            <div class="acu-graph-avatar-name" style="font-size: ${nameFontSize}px;">${fullName}</div>
          </div>
        `;
      },
    },
  ]);
}

/**
 * 更新图数据
 */
function updateGraph() {
  if (!cy) return;

  cy.elements().remove();
  cy.add(parsedData.value.elements);
  cy.layout(getLayoutConfig(layoutMode.value)).run();
}

// ============================================================
// 工具栏操作
// ============================================================

/** 放大 */
function zoomIn() {
  if (!cy) return;
  cy.zoom(cy.zoom() * 1.2);
}

/** 缩小 */
function zoomOut() {
  if (!cy) return;
  cy.zoom(cy.zoom() / 1.2);
}

/** 适应视图 */
function fitToView() {
  cy?.fit(undefined, 30);
}

/** 设置环形布局的中心节点并重新运行布局 */
function setCenterNode(nodeId: string) {
  if (!cy) return;

  // 如果点击的是当前中心节点，不做任何操作
  if (centerNodeId.value === nodeId) return;

  console.info(`[RelationshipGraph] 切换环形中心节点: ${centerNodeId.value || '(主角)'} → ${nodeId}`);

  centerNodeId.value = nodeId;

  // 重新运行环形布局（不自动保存，用户需手动点击保存按钮）
  const layout = cy.layout(getLayoutConfig('circle'));
  layout.run();
}

/**
 * 为 cola 布局创建势力容器节点
 * 返回是否成功创建了容器
 */
function setupFactionContainers(): boolean {
  if (!cy) return false;

  const colors = getThemeColors();

  // 获取势力映射
  const { factionList, characterToFaction, factionRelations } = extractFactionMapping(
    props.allTables || [],
    props.characterTables || [],
  );

  if (factionList.length === 0) {
    console.info('[RelationshipGraph] 未找到势力数据，跳过容器创建');
    return false;
  }

  console.info(`[RelationshipGraph] 创建势力容器: ${factionList.length} 个势力`);

  // 1. 移除旧的势力容器节点
  cy.nodes('.faction-container').remove();

  // 2. 隐藏与势力名称同名的节点（避免与容器重复）
  for (const factionName of factionList) {
    const duplicateNode = cy.getElementById(factionName);
    if (duplicateNode && duplicateNode.length > 0 && !duplicateNode.hasClass('faction-container')) {
      duplicateNode.addClass('hidden-in-cola');
      console.info(`[RelationshipGraph] 隐藏与势力同名的节点: "${factionName}"`);
    }
  }

  // 3. 为每个势力创建容器节点（只创建有成员的势力），并获取颜色配置
  for (const factionName of factionList) {
    // 检查是否有成员归属此势力
    let hasMember = false;
    for (const [_, faction] of characterToFaction) {
      if (faction === factionName) {
        hasMember = true;
        break;
      }
    }

    // 如果没有成员，跳过创建容器
    if (!hasMember) {
      console.info(`[RelationshipGraph] 跳过无成员势力: "${factionName}"`);
      continue;
    }

    // 检查是否有配置颜色，如果没有则使用默认灰色样式
    const hasConfiguredColor = graphConfigStore.hasFactionColor(factionName);
    let factionColor;
    if (hasConfiguredColor) {
      factionColor = graphConfigStore.getFactionColor(factionName, factionList);
    } else {
      // 尝试从调色板分配颜色
      const index = factionList.indexOf(factionName);
      if (index >= 0 && index < 8) {
        // 调色板有 8 种颜色
        factionColor = graphConfigStore.getFactionColor(factionName, factionList);
      } else {
        // 超出调色板范围，使用默认灰色样式
        factionColor = DEFAULT_FACTION_STYLE;
      }
    }
    cy.add({
      group: 'nodes',
      data: {
        id: `faction-container-${factionName}`,
        label: factionName,
        type: 'faction-container',
        borderColor: factionColor.border,
        backgroundColor: factionColor.background,
      },
      classes: 'faction-container',
    });
  }

  // 4. 将有势力归属的角色设置 parent
  characterToFaction.forEach((factionName, charName) => {
    const node = cy?.getElementById(charName);
    if (node && node.length > 0) {
      node.move({ parent: `faction-container-${factionName}` });
      console.info(`[RelationshipGraph] 角色 "${charName}" → 势力 "${factionName}"`);
    }
  });

  // 5. 创建势力间关系的边（带双向检测）
  let factionEdgeIndex = 0;
  const processedPairs = new Set<string>();

  for (const rel of factionRelations) {
    const sourceId = `faction-container-${rel.source}`;
    const targetId = `faction-container-${rel.target}`;

    // 生成节点对的唯一键（排序后）
    const pairKey = [rel.source, rel.target].sort().join('<->');
    if (processedPairs.has(pairKey)) {
      continue; // 已作为双向边处理，跳过
    }

    // 确保源和目标容器都存在
    if (cy.getElementById(sourceId).length > 0 && cy.getElementById(targetId).length > 0) {
      // 检查是否存在反向边且关系词相同
      const reverseRel = factionRelations.find(r => r.source === rel.target && r.target === rel.source);
      const isBidirectional = reverseRel && reverseRel.relation === rel.relation;

      if (isBidirectional) {
        processedPairs.add(pairKey);
      }

      const colorResult = getRelationColor(rel.relation);
      cy.add({
        group: 'edges',
        data: {
          id: `faction-edge-${factionEdgeIndex++}`,
          source: sourceId,
          target: targetId,
          label: rel.relation,
          color: colorResult.color,
          level: colorResult.level,
          bidirectional: isBidirectional, // 新增：标记是否为双向边
        },
        classes: 'faction-edge',
      });
      console.info(
        `[RelationshipGraph] 势力边: "${rel.source}" ${isBidirectional ? '↔' : '→'} "${rel.target}" (${rel.relation})`,
      );
    }
  }

  // 6. 添加势力容器样式和隐藏样式（动态添加，使用当前主题颜色和配置）
  cy.style()
    .selector('node.faction-container')
    .style({
      'background-color': 'data(backgroundColor)',
      'background-opacity': 1,
      'border-width': 2,
      'border-style': 'dashed',
      'border-color': 'data(borderColor)',
      shape: 'roundrectangle',
      padding: '20px',
      label: 'data(label)',
      'text-valign': 'top',
      'text-halign': 'center',
      'font-size': `${graphConfigStore.config.factionLabelFontSize}px`,
      'font-family': colors.fontFamily, // 使用设置的字体
      'font-weight': 'bold',
      // 势力标签文字颜色使用边框颜色
      color: 'data(borderColor)',
      // 势力名称标签背景使用容器背景色
      'text-background-color': 'data(backgroundColor)',
      'text-background-opacity': 1,
      // padding 约为字体大小的 40%，最小 4px
      'text-background-padding': `${Math.max(4, Math.round(graphConfigStore.config.factionLabelFontSize * 0.4))}px`,
      'text-background-shape': 'roundrectangle',
      // 势力标签边框使用边框颜色（Cytoscape 不支持 text-border-style，只能用实线）
      'text-border-width': 2,
      'text-border-color': 'data(borderColor)',
      'text-margin-y': -8,
    })
    .selector('edge.faction-edge')
    .style({
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': 'data(color)',
      'line-color': 'data(color)',
      'line-style': 'solid',
      width: 3,
      label: 'data(label)',
      'font-size': `${graphConfigStore.config.relationLabelFontSize}px`,
      'font-family': colors.fontFamily, // 使用设置的字体
      'text-rotation': 'autorotate',
      'text-margin-y': -10,
      color: '#fff',
      'text-background-color': 'data(color)',
      'text-background-opacity': 0.95,
      // padding 约为字体大小的 25%，最小 3px
      'text-background-padding': `${Math.max(3, Math.round(graphConfigStore.config.relationLabelFontSize * 0.25))}px`,
      'text-background-shape': 'roundrectangle',
    })
    .selector('node.hidden-in-cola')
    .style({
      display: 'none',
    })
    .selector('edge.hidden-in-cola')
    .style({
      display: 'none',
    })
    .update();

  // 7. 隐藏与被隐藏节点相连的边
  cy.nodes('.hidden-in-cola').connectedEdges().addClass('hidden-in-cola');

  return true;
}

/**
 * 移除势力容器，恢复节点为独立状态
 */
function removeFactionContainers() {
  if (!cy) return;

  // 1. 将所有子节点移出容器
  cy.nodes().forEach(node => {
    if (node.parent().length > 0 && node.parent().is('.faction-container')) {
      node.move({ parent: null });
    }
  });

  // 2. 恢复被隐藏的节点和边
  cy.elements('.hidden-in-cola').removeClass('hidden-in-cola');

  // 3. 移除势力间的边
  cy.edges('.faction-edge').remove();

  // 4. 移除容器节点
  cy.nodes('.faction-container').remove();

  console.info('[RelationshipGraph] 已移除势力容器');
}

/** 设置布局 - 切换布局模式并加载对应的保存位置或运行布局算法 */
function setLayout(mode: LayoutType) {
  if (!cy) return;

  // 如果是同一个布局，不做任何操作
  if (mode === layoutMode.value) return;

  const previousLayout = layoutMode.value;

  // 注意：切换布局时不自动保存当前位置，只有手动点击保存按钮才会保存
  // 这样可以避免意外覆盖用户之前手动保存的位置

  // 1. 如果从 cola 切换到其他布局，移除势力容器
  if (previousLayout === 'cola' && mode !== 'cola') {
    removeFactionContainers();
  }

  // 2. 切换布局模式
  layoutMode.value = mode;
  console.info(`[RelationshipGraph] 布局切换: ${previousLayout} → ${mode}`);

  // 3. 保存最后使用的布局模式
  const config = getGraphConfig();
  config.lastLayout = mode;
  saveGraphConfig(config);

  // 4. 如果切换到 cola 布局，创建势力容器并应用样式
  if (mode === 'cola') {
    setupFactionContainers();
    // 应用势力容器样式配置
    applyAllFactionStyles();
  }

  // 5. 检查目标布局是否有保存的位置
  const hasPositions = hasSavedPositions(mode);
  console.info(`[RelationshipGraph] 检查 [${mode}] 是否有保存位置: ${hasPositions}`);

  if (hasPositions) {
    // 有保存 → 恢复位置
    console.info(`[RelationshipGraph] 恢复 [${mode}] 保存的位置`);
    restoreNodePositions(mode);
  } else {
    // 无保存 → 运行布局算法（不自动保存，用户需手动保存）
    console.info(`[RelationshipGraph] [${mode}] 无保存位置，运行布局算法`);
    const layout = cy.layout(getLayoutConfig(mode));
    layout.run();
  }
}

/** 刷新数据 */
function refresh() {
  updateGraph();
}

// ============================================================
// 位置持久化
// ============================================================

/** 保存所有节点位置到聊天变量（按当前布局类型分开存储） */
function saveNodePositions(targetLayout?: LayoutType) {
  if (!cy) return;

  const layout = targetLayout || layoutMode.value;
  const positions: Record<string, { x: number; y: number }> = {};
  let allZero = true; // 检测是否所有位置都是 (0, 0)

  cy.nodes().forEach(node => {
    const pos = node.position();
    // 确保位置有效（非 NaN，非无穷大）
    if (pos && isFinite(pos.x) && isFinite(pos.y)) {
      positions[node.id()] = { x: pos.x, y: pos.y };
      // 如果任意一个位置不是 (0, 0)，就不是全零
      if (pos.x !== 0 || pos.y !== 0) {
        allZero = false;
      }
    }
  });

  // 如果所有位置都是 (0, 0)，说明布局还没完成，跳过保存
  if (allZero && Object.keys(positions).length > 0) {
    console.warn('[RelationshipGraph] 跳过保存：所有位置都是 (0, 0)，布局可能未完成');
    return;
  }

  // 打印第一个节点的坐标作为诊断
  const firstNodeId = Object.keys(positions)[0];
  const firstPos = positions[firstNodeId];
  console.info(
    `[RelationshipGraph] 保存节点位置到 [${layout}]:`,
    Object.keys(positions).length,
    `个节点 (首节点 "${firstNodeId}": ${firstPos?.x?.toFixed(0)}, ${firstPos?.y?.toFixed(0)})`,
  );

  const config = getGraphConfig();
  if (!config.layoutPositions) {
    config.layoutPositions = {};
  }
  config.layoutPositions[layout] = positions;
  saveGraphConfig(config);
}

/** 从聊天变量恢复节点位置（按当前布局类型） */
function restoreNodePositions(targetLayout?: LayoutType): boolean {
  if (!cy) return false;

  const layout = targetLayout || layoutMode.value;
  const positions = getSavedPositions(layout);
  if (!positions) return false;

  // 打印保存的第一个节点坐标用于诊断
  const firstNodeId = Object.keys(positions)[0];
  const firstSavedPos = positions[firstNodeId];
  console.info(
    `[RelationshipGraph] 准备恢复 [${layout}] 位置，共 ${Object.keys(positions).length} 个节点 (首节点 "${firstNodeId}": 保存=${firstSavedPos?.x?.toFixed(0)}, ${firstSavedPos?.y?.toFixed(0)})`,
  );

  let hasRestored = false;
  let restoredCount = 0;

  cy.nodes().forEach(node => {
    const nodeId = node.id();
    const savedPos = positions[nodeId];
    if (savedPos) {
      const beforePos = node.position();
      // 详细诊断：打印 savedPos 的实际值
      console.info(
        `[RelationshipGraph] 设置节点 "${nodeId}": 目标=(${savedPos.x?.toFixed?.(0) ?? savedPos.x}, ${savedPos.y?.toFixed?.(0) ?? savedPos.y}), 当前=(${beforePos.x.toFixed(0)}, ${beforePos.y.toFixed(0)})`,
      );
      node.position({ x: savedPos.x, y: savedPos.y });
      const afterPos = node.position();
      console.info(
        `[RelationshipGraph] 节点 "${nodeId}": (${beforePos.x.toFixed(0)}, ${beforePos.y.toFixed(0)}) → (${afterPos.x.toFixed(0)}, ${afterPos.y.toFixed(0)})`,
      );
      hasRestored = true;
      restoredCount++;
    }
  });

  if (hasRestored) {
    console.info(`[RelationshipGraph] 从 [${layout}] 恢复了 ${restoredCount} 个节点位置`);
    cy.fit(undefined, 30);
  }

  return hasRestored;
}

/** 清除当前布局保存的位置并重新运行布局 */
function clearSavedPositions() {
  const config = getGraphConfig();
  if (config.layoutPositions) {
    delete config.layoutPositions[layoutMode.value];
    saveGraphConfig(config);
  }

  // 捕获当前布局类型（避免异步回调时 layoutMode.value 已变化）
  const currentLayout = layoutMode.value;
  console.info(`[RelationshipGraph] 清除 [${currentLayout}] 布局位置，重新运行布局`);

  // 重新运行布局
  const layoutConfig = getLayoutConfig(currentLayout);

  // 如果是 fcose 或 cola (现在也用 fcose) 布局，强制启用随机化以实现全量重绘
  if (currentLayout === 'fcose' || currentLayout === 'cola') {
    (layoutConfig as any).randomize = true;
  }

  const layout = cy?.layout(layoutConfig);
  layout?.one('layoutstop', () => {
    // 布局完成后保存到正确的布局类型
    saveNodePositions(currentLayout);
  });
  layout?.run();
}

// ============================================================
// 单字显示配置（支持多选）
// ============================================================

/** 获取保存的标签配置（从聊天变量） */
function getLabelConfig(): Record<string, LabelConfig> {
  const config = getGraphConfig();
  return config.labels || {};
}

/** 保存标签配置（到聊天变量） */
function saveLabelConfig(labelConfig: Record<string, LabelConfig>) {
  const config = getGraphConfig();
  config.labels = labelConfig;
  saveGraphConfig(config);
}

/**
 * 获取默认选中的索引
 */
function getDefaultIndices(fullName: string): number[] {
  const chars = getDisplayChars(fullName);
  if (isEnglishName(fullName)) {
    // 英文名：默认选中第一个单词
    return [0];
  }
  // 中文名：默认选中最后一个字
  return chars.length > 0 ? [chars.length - 1] : [];
}

/**
 * 获取显示的字符数组
 * - 英文名按单词分割
 * - 中文名按字符分割
 */
function getDisplayChars(fullName: string): string[] {
  if (isEnglishName(fullName)) {
    return fullName.split(' ').filter(Boolean);
  }
  return fullName.split('');
}

/** 应用保存的标签配置到所有节点 */
function applyLabelConfig() {
  if (!cy) return;

  const config = getLabelConfig();

  cy.nodes().forEach(node => {
    const nodeId = node.id();
    const nodeConfig = config[nodeId];
    if (nodeConfig && nodeConfig.displayLabel) {
      // 有配置，使用配置的标签
      node.data('label', nodeConfig.displayLabel);
    } else {
      // 无配置，恢复为全名（node.id() 就是全名）
      node.data('label', nodeId);
    }
  });

  console.info('[RelationshipGraph] 标签配置已应用，共配置:', Object.keys(config).length, '个节点');
}

/** 打开节点配置弹窗 */
function openNodeConfig(nodeId: string, fullName: string) {
  // 获取当前配置
  const config = getLabelConfig();
  const nodeConfig = config[nodeId];
  const currentLabel = nodeConfig?.displayLabel || fullName;
  const selectedIndices = nodeConfig?.selectedIndices || getDefaultIndices(fullName);

  // 使用全局弹窗
  uiStore.openNodeConfigDialog(
    {
      nodeId,
      fullName,
      currentLabel,
      selectedIndices,
    },
    {
      onConfirm: handleNodeConfigConfirm,
      onResetToFullName: handleNodeConfigResetToFullName,
      onStyleUpdate: handleNodeStyleUpdate,
    },
  );
}

/** 处理节点配置确认回调 */
function handleNodeConfigConfirm(nodeId: string, displayLabel: string, selectedIndices: number[]) {
  // 保存配置
  const config = getLabelConfig();
  config[nodeId] = {
    displayLabel,
    selectedIndices,
  };
  saveLabelConfig(config);

  // 更新节点标签
  if (cy) {
    const node = cy.getElementById(nodeId);
    if (node) {
      node.data('label', displayLabel);
    }
  }
}

/** 处理节点配置重置为全名回调 */
function handleNodeConfigResetToFullName(nodeId: string, fullName: string) {
  // 删除配置
  const config = getLabelConfig();
  delete config[nodeId];
  saveLabelConfig(config);

  // 恢复节点标签为全名
  if (cy) {
    const node = cy.getElementById(nodeId);
    if (node) {
      node.data('label', fullName);
    }
  }
}

/** 处理节点样式更新回调 */
function handleNodeStyleUpdate(nodeId: string) {
  if (!cy) return;

  const node = cy.getElementById(nodeId);
  if (!node || node.length === 0) return;

  // 从 store 获取样式覆盖
  const override = graphConfigStore.getNodeStyleOverride(nodeId);
  const defaultSize = graphConfigStore.config.nodeSize || 50;

  // 获取新的节点样式
  const newSize = override?.size ?? defaultSize;
  const newBorderWidth = override?.borderWidth ?? 0;
  const newBorderColor = override?.borderColor ?? 'transparent';
  const newShape = override?.shape ?? 'ellipse';

  // 更新 cytoscape 节点的大小
  node.style({
    width: newSize,
    height: newSize,
  });

  // 更新节点的 data，以便 nodeHtmlLabel 能够使用新的样式
  node.data('nodeSize', newSize);
  node.data('nodeBorderWidth', newBorderWidth);
  node.data('nodeBorderColor', newBorderColor);
  node.data('nodeShape', newShape);

  // 触发 nodeHtmlLabel 重新渲染
  // nodeHtmlLabel 通过监听节点变化来更新，更新 data 后需要触发重绘
  node.trigger('data');

  console.info(
    `[RelationshipGraph] 应用节点样式覆盖: ${nodeId}, size=${newSize}, border=${newBorderWidth}px ${newBorderColor}, shape=${newShape}`,
  );
}

/** 应用所有保存的节点样式覆盖（使用 batch 优化性能） */
function applyAllNodeStyleOverrides() {
  if (!cy) return;

  const nodeOverrides = graphConfigStore.config.nodeOverrides || {};
  const overrideEntries = Object.entries(nodeOverrides);

  if (overrideEntries.length === 0) return;

  // 使用 batch 批量更新，提升性能
  cy.batch(() => {
    for (const [nodeId, override] of overrideEntries) {
      const node = cy!.getElementById(nodeId);
      if (!node || node.length === 0) continue;

      // 更新节点大小
      if (override.size !== undefined) {
        node.style({
          width: override.size,
          height: override.size,
        });
        node.data('nodeSize', override.size);
      }

      // 更新边框和形状（这些是 HTML 头像的属性）
      if (override.borderWidth !== undefined) {
        node.data('nodeBorderWidth', override.borderWidth);
      }
      if (override.borderColor !== undefined) {
        node.data('nodeBorderColor', override.borderColor);
      }
      if (override.shape !== undefined) {
        node.data('nodeShape', override.shape);
      }
    }
  });

  console.info(`[RelationshipGraph] 应用了 ${overrideEntries.length} 个节点样式覆盖`);
}

/**
 * 将标签位置配置转换为 Cytoscape 的 text-valign 值
 */
function labelPositionToTextValign(
  position?: 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none',
): string {
  switch (position) {
    case 'top':
    case 'top-left':
    case 'top-right':
      return 'top';
    case 'bottom':
    case 'bottom-left':
    case 'bottom-right':
      return 'bottom';
    case 'none':
      return 'top'; // 隐藏标签时仍使用 top，通过其他方式隐藏
    default:
      return 'top';
  }
}

/**
 * 将标签位置配置转换为 Cytoscape 的 text-halign 值
 */
function labelPositionToTextHalign(
  position?: 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none',
): string {
  switch (position) {
    case 'top-left':
    case 'bottom-left':
      return 'left';
    case 'top-right':
    case 'bottom-right':
      return 'right';
    case 'top':
    case 'bottom':
    case 'none':
    default:
      return 'center';
  }
}

/**
 * 从 rgba 颜色中提取透明度
 * 如果已经是带透明度的 rgba，返回透明度值
 */
function extractOpacityFromRgba(color: string, defaultOpacity: number = 10): number {
  const match = color.match(/rgba?\s*\([^)]+,\s*([\d.]+)\s*\)/);
  if (match) {
    return Math.round(parseFloat(match[1]) * 100);
  }
  return defaultOpacity;
}

/** 应用所有势力容器样式覆盖（使用 batch 优化性能） */
function applyAllFactionStyles() {
  if (!cy) return;

  const factionContainers = cy.nodes('.faction-container');
  if (factionContainers.length === 0) return;

  const colors = getThemeColors();
  const { factionList } = extractFactionMapping(props.allTables || [], props.characterTables || []);

  // 使用 batch 批量更新，提升性能
  cy.batch(() => {
    factionContainers.forEach(containerNode => {
      const containerId = containerNode.id();
      const factionName = containerId.replace('faction-container-', '');

      // 获取势力配置
      const factionConfig: FactionColorConfig =
        graphConfigStore.getFactionOverride(containerId) || graphConfigStore.getFactionColor(factionName, factionList);

      // 更新节点 data（用于样式中的 data() 引用）
      containerNode.data('borderColor', factionConfig.border);
      containerNode.data('backgroundColor', factionConfig.background);

      // 构建样式对象
      const styleObj: Record<string, string | number> = {};

      // 背景透明度
      const opacity = factionConfig.opacity ?? extractOpacityFromRgba(factionConfig.background, 10);
      styleObj['background-opacity'] = opacity / 100;

      // 标签位置
      const labelPosition = factionConfig.labelPosition ?? 'top';
      if (labelPosition === 'none') {
        // 隐藏标签：设置透明度为 0，不设置空标签（因为空标签可能不生效）
        styleObj['text-opacity'] = 0;
        styleObj['text-background-opacity'] = 0;
      } else {
        // 恢复标签可见性
        styleObj['text-opacity'] = 1;
        styleObj['text-background-opacity'] = 1;
        styleObj['label'] = factionName; // 恢复标签

        styleObj['text-valign'] = labelPositionToTextValign(labelPosition);
        styleObj['text-halign'] = labelPositionToTextHalign(labelPosition);

        // 根据位置设置 margin，使标签贴着容器边框
        // 对于 compound node，需要较大的 margin 值来补偿 padding
        switch (labelPosition) {
          case 'top':
            // 顶部外侧：标签在容器上方
            styleObj['text-margin-y'] = -8;
            styleObj['text-margin-x'] = 0;
            break;
          case 'bottom':
            // 底部外侧：标签在容器下方
            styleObj['text-margin-y'] = 8;
            styleObj['text-margin-x'] = 0;
            break;
          case 'top-left':
            // 内部左上：需要足够的 margin 来抵消容器 padding 并贴边
            styleObj['text-valign'] = 'top';
            styleObj['text-halign'] = 'left';
            styleObj['text-margin-x'] = 25; // padding(20) + 额外间距(5)
            styleObj['text-margin-y'] = 25;
            break;
          case 'top-right':
            // 内部右上
            styleObj['text-valign'] = 'top';
            styleObj['text-halign'] = 'right';
            styleObj['text-margin-x'] = -25;
            styleObj['text-margin-y'] = 25;
            break;
          case 'bottom-left':
            // 内部左下
            styleObj['text-valign'] = 'bottom';
            styleObj['text-halign'] = 'left';
            styleObj['text-margin-x'] = 25;
            styleObj['text-margin-y'] = -25;
            break;
          case 'bottom-right':
            // 内部右下
            styleObj['text-valign'] = 'bottom';
            styleObj['text-halign'] = 'right';
            styleObj['text-margin-x'] = -25;
            styleObj['text-margin-y'] = -25;
            break;
          default:
            styleObj['text-margin-y'] = -8;
            styleObj['text-margin-x'] = 0;
        }
      }

      // 标签字体大小
      if (factionConfig.labelFontSize !== undefined) {
        styleObj['font-size'] = `${factionConfig.labelFontSize}px`;
      }

      // 边框颜色和背景颜色通过 data binding 已经生效
      // 势力标签样式：文字颜色和边框颜色使用边框颜色，背景使用容器背景
      styleObj['text-background-color'] = factionConfig.background;
      // 标签背景透明度也应用势力透明度
      styleObj['text-background-opacity'] = opacity / 100;
      styleObj['color'] = factionConfig.border;
      styleObj['text-border-color'] = factionConfig.border;

      containerNode.style(styleObj);
    });
  });

  console.info(`[RelationshipGraph] 应用了 ${factionContainers.length} 个势力容器样式`);
}

/** 应用所有配置到 Cytoscape（统一入口） */
function applyAllConfigs() {
  if (!cy) return;

  console.info('[RelationshipGraph] 应用所有配置...');

  // 使用 batch 批量更新，提升性能
  cy.batch(() => {
    // 1. 应用节点样式覆盖
    applyAllNodeStyleOverrides();

    // 2. 应用势力容器样式覆盖
    applyAllFactionStyles();
  });

  // 3. 触发样式更新（确保 data binding 生效）
  cy.style().update();

  console.info('[RelationshipGraph] 所有配置应用完成');
}

// ============================================================
// 头像管理
// ============================================================

/** 提取节点列表给头像管理弹窗使用 */
const avatarManagerNodes = computed(() => {
  if (!parsedData.value || !parsedData.value.elements) return [];
  // 从 elements 中筛选节点（排除边）
  return parsedData.value.elements
    .filter(el => !el.data.source && !el.data.target) // 节点没有 source/target
    .map(el => ({
      id: el.data.id as string,
      // name 使用 id（全名），用于文字显示和 NodeLabelDialog
      name: el.data.id as string,
      // label 是当前显示的标签（可能是简称），用于头像圆圈内的显示
      label: (el.data.label as string) || (el.data.id as string),
      type: (el.data.type as string) || 'character',
    }));
});

/** 势力列表（用于头像管理弹窗） */
const factionListForAvatar = computed(() => {
  return currentFactions.value.map((name, index) => ({
    id: `faction_${index}`,
    name,
  }));
});

/** 打开头像管理弹窗 */
function openAvatarManager() {
  // 添加 has-modal 类以提升容器层级，使弹窗覆盖导航栏
  const { $ } = getCore();
  $('.acu-data-display').addClass('has-modal');

  // 使用全局弹窗
  uiStore.openAvatarManagerDialog(
    {
      nodes: avatarManagerNodes.value,
      factions: factionListForAvatar.value,
    },
    {
      onUpdate: handleAvatarUpdate,
      onLabelChange: handleLabelChange,
    },
  );
}

/** 打开关系图设置弹窗 */
function openGraphSettings() {
  // 传递当前的势力列表
  uiStore.openGraphSettingsDialog(currentFactions.value);
}

/** 头像管理弹窗关闭时的清理 - 由 watch 监听 uiStore.avatarManagerDialog.visible 触发 */
watch(
  () => uiStore.avatarManagerDialog.visible,
  newVisible => {
    if (!newVisible) {
      // 弹窗关闭时移除 has-modal 类
      const { $ } = getCore();
      $('.acu-data-display').removeClass('has-modal');
    }
  },
);

/** 实时更新图形样式（不重建图形） */
function updateGraphStyles() {
  if (!cy) return;

  const config = graphConfigStore.config;

  console.info('[RelationshipGraph] 实时更新图形样式');

  // 使用 batch 批量更新全局样式
  cy.batch(() => {
    // 更新全局节点样式
    cy!
      .style()
      .selector('node')
      .style({
        width: config.nodeSize,
        height: config.nodeSize,
        'text-max-width': `${config.nodeSize - 4}px`,
      })
      .selector('node[avatarUrl]')
      .style({
        width: config.nodeSize,
        height: config.nodeSize,
      })
      .selector('edge')
      .style({
        width: config.edgeWidth,
        'font-size': `${config.relationLabelFontSize}px`,
      })
      .selector('node.faction-container')
      .style({
        'font-size': `${config.factionLabelFontSize}px`,
      })
      .selector('edge.faction-edge')
      .style({
        'font-size': `${config.relationLabelFontSize}px`,
      })
      .update();
  });

  // 应用所有个性化配置（节点样式覆盖、势力容器样式覆盖）
  applyAllConfigs();
}

/** 监听图形配置变化，动态更新图形样式 */
watch(
  () => graphConfigStore.config,
  () => {
    updateGraphStyles();
  },
  { deep: true },
);

/** 监听节点样式覆盖变化，自动更新对应节点 */
watch(
  () => graphConfigStore.config.nodeOverrides,
  () => {
    if (cy) {
      applyAllNodeStyleOverrides();
      cy.style().update();
    }
  },
  { deep: true },
);

/** 监听势力颜色配置变化，自动更新势力容器样式 */
watch(
  () => graphConfigStore.config.factionColors,
  () => {
    if (cy) {
      applyAllFactionStyles();
      cy.style().update();
    }
  },
  { deep: true },
);

/** 监听图例配置变化，重新解析边颜色 */
watch(
  () => graphConfigStore.config.legendConfig,
  () => {
    // 图例配置变化时需要重新解析数据（边颜色依赖图例配置）
    // parsedData 是 computed 属性，会自动重新计算
    // 但需要更新 Cytoscape 的元素来应用新颜色
    if (cy && hasData.value) {
      console.info('[RelationshipGraph] 图例配置变化，重新应用边颜色');
      // 批量更新边的颜色
      cy.batch(() => {
        const newElements = parsedData.value.elements;
        const edgeElements = newElements.filter(el => el.data.source && el.data.target);

        for (const edgeData of edgeElements) {
          const edgeId = edgeData.data.id;
          if (!edgeId) continue;

          const edge = cy!.getElementById(edgeId);
          if (edge && edge.length > 0) {
            // 更新边的 data 属性（颜色、级别等）
            edge.data('color', edgeData.data.color);
            edge.data('level', edgeData.data.level);
          }
        }
      });
      cy.style().update();
    }
  },
  { deep: true },
);

/** 监听背景配置变化，重新加载背景图片 */
watch(
  () => [themeStore.backgroundConfig.hasIndexedDBImage, themeStore.backgroundConfig.externalUrl],
  () => {
    loadBackgroundImage();
  },
);

/** 加载别名映射 */
async function loadAliasMap() {
  try {
    const map = await avatarManager.getAliasMap();
    aliasMap.value = map;
    console.info(`[RelationshipGraph] 别名映射加载完成: ${map.size} 个别名`);
  } catch (e) {
    console.warn('[RelationshipGraph] 加载别名映射失败:', e);
  }
}

/** 预加载所有节点的头像（包括裁剪参数） */
async function preloadAvatars() {
  const nodes = parsedData.value.elements.filter(el => !el.data.source && !el.data.target);
  const cache = new Map<string, AvatarCacheData>();

  for (const node of nodes) {
    const nodeName = node.data.id as string;
    if (!nodeName) continue;

    try {
      const url = await avatarManager.getAvatarUrl(nodeName);
      if (url) {
        // 同时获取裁剪参数
        const displayConfig = await avatarManager.getAvatarDisplayConfig(nodeName);
        cache.set(nodeName, {
          url,
          offsetX: displayConfig.offsetX,
          offsetY: displayConfig.offsetY,
          scale: displayConfig.scale,
        });
      }
    } catch (e) {
      console.warn(`[RelationshipGraph] 获取头像失败: ${nodeName}`, e);
    }
  }

  avatarCache.value = cache;
  console.info(`[RelationshipGraph] 头像预加载完成: ${cache.size}/${nodes.length}`);
}

/** 头像更新后刷新图形（重操作，包含头像数据） */
async function handleAvatarUpdate() {
  console.log('[RelationshipGraph] handleAvatarUpdate 被调用');
  // 重新加载别名映射和头像
  await loadAliasMap();
  await preloadAvatars();
  if (cy) {
    // 更新节点的头像数据（包括裁剪参数）
    cy.nodes().forEach(node => {
      const nodeName = node.id();
      const avatarData = avatarCache.value.get(nodeName);
      if (avatarData) {
        node.data('avatarUrl', avatarData.url);
        node.data('avatarOffsetX', avatarData.offsetX);
        node.data('avatarOffsetY', avatarData.offsetY);
        node.data('avatarScale', avatarData.scale);
      } else {
        node.removeData('avatarUrl');
        node.removeData('avatarOffsetX');
        node.removeData('avatarOffsetY');
        node.removeData('avatarScale');
      }
    });

    // 重新应用标签配置（姓名选择）- 仅影响无头像节点的显示
    applyLabelConfig();

    // 强制触发节点重绘
    cy.nodes().trigger('data');

    // 触发样式重新计算
    cy.style().update();
  }
}

/** 标签变更后刷新图形（轻操作，只更新标签） */
function handleLabelChange() {
  console.log('[RelationshipGraph] handleLabelChange 被调用');
  if (cy) {
    // 重新应用标签配置
    applyLabelConfig();

    // 触发样式重新计算
    cy.style().update();
  }
}

// ============================================================
// 生命周期
// ============================================================

/** 是否已初始化 */
const isInitialized = ref(false);

/** 加载背景图片 */
async function loadBackgroundImage(): Promise<void> {
  const config = themeStore.backgroundConfig;

  // 清理旧的 ObjectURL
  if (currentBackgroundUrl.value?.startsWith('blob:')) {
    revokeBlobUrl(currentBackgroundUrl.value);
    currentBackgroundUrl.value = null;
  }

  if (config.externalUrl) {
    // 外部 URL 直接使用
    currentBackgroundUrl.value = config.externalUrl;
  } else if (config.hasIndexedDBImage) {
    // 从 IndexedDB 加载
    try {
      const blobUrl = await loadBackground(GLOBAL_THEME_BG_KEY);
      currentBackgroundUrl.value = blobUrl;
    } catch (e) {
      console.warn('[RelationshipGraph] 加载背景图片失败:', e);
      currentBackgroundUrl.value = null;
    }
  } else {
    currentBackgroundUrl.value = null;
  }
}

onMounted(async () => {
  // 先加载别名映射和背景图片
  await Promise.all([loadAliasMap(), loadBackgroundImage()]);

  // 如果数据已准备好，预加载头像和字体后再初始化
  if (hasData.value) {
    await preloadAvatars();
    await preloadCanvasFont();
    initCytoscape();
    isInitialized.value = true;
  }
});

// 监听数据变化，数据准备好后先预加载头像和字体再初始化
watch(
  hasData,
  async newValue => {
    if (newValue && !isInitialized.value && containerRef.value) {
      console.info('[RelationshipGraph] 数据准备就绪，预加载头像和字体...');
      await preloadAvatars();
      await preloadCanvasFont();
      console.info('[RelationshipGraph] 初始化图形');
      initCytoscape();
      isInitialized.value = true;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  // 注意：离开时不自动保存，只有手动点击保存按钮才保存
  cy?.destroy();
  cy = null;

  // 清理背景图片的 ObjectURL
  if (currentBackgroundUrl.value?.startsWith('blob:')) {
    revokeBlobUrl(currentBackgroundUrl.value);
    currentBackgroundUrl.value = null;
  }
});

// 监听数据变化
watch(
  () => props.relationshipTable,
  () => {
    if (cy) {
      updateGraph();
    }
  },
  { deep: true },
);

// 监听主题变化 - 更新节点颜色
watch(
  () => configStore.config.theme,
  () => {
    if (cy) {
      // 使用 nextTick 或 setTimeout 确保 CSS 变量已更新
      setTimeout(() => {
        updateNodeColors();
      }, 50);
    }
  },
);

// 监听字体变化 - 更新节点和边的字体
watch(
  () => configStore.config.fontFamily,
  async () => {
    if (cy) {
      // 先预加载字体，再更新 Cytoscape 样式
      await preloadCanvasFont();
      updateNodeColors();
    }
  },
);

/**
 * 更新节点颜色和字体（响应主题/字体变化）
 *
 * 注意：Cytoscape 的 cy.style().selector().style().update() 方式
 * 在某些情况下不会覆盖初始化样式中的 font-family。
 * 因此使用直接遍历元素设置样式的方式，确保字体能正确应用。
 */
function updateNodeColors() {
  if (!cy) return;

  const colors = getThemeColors();

  // 使用 batch 批量更新，提升性能
  cy.batch(() => {
    // 更新所有节点的样式
    cy!.nodes().forEach(node => {
      // 基础样式
      const baseStyles: Record<string, string | number> = {
        'font-family': colors.fontFamily,
        color: colors.textMain,
        'border-width': 1.5,
        'border-color': colors.textMain,
      };

      // 根据节点类型设置背景色
      if (node.hasClass('protagonist')) {
        baseStyles['background-color'] = colors.highlight;
      } else if (!node.hasClass('faction-container') && !node.data('avatarUrl')) {
        // 普通节点（非势力容器、非头像节点）
        baseStyles['background-color'] = colors.btnBg;
      }

      // 应用样式
      node.style(baseStyles);
    });

    // 更新所有边的字体
    cy!.edges().forEach(edge => {
      edge.style('font-family', colors.fontFamily);
    });
  });

  // 触发样式更新
  cy.style().update();

  console.info('[RelationshipGraph] 节点颜色和字体已更新');
}

// 暴露方法供外部调用
defineExpose({
  fitToView,
  zoomIn,
  zoomOut,
  setLayout,
  refresh,
  applyAllConfigs,
  applyAllNodeStyleOverrides,
  applyAllFactionStyles,
  openAvatarManager,
});
</script>

<style>
/* 样式通过 useParentStyleInjection 注入到父窗口 */
/* 详见 styles/components/relationship-graph.scss */
</style>
