<template>
  <div class="acu-relationship-graph">
    <!-- 图例（顶部） -->
    <div v-if="showLegend" class="acu-graph-legend">
      <div v-for="item in legend" :key="item.level" class="acu-legend-item">
        <span class="dot" :style="{ backgroundColor: item.color }"></span>
        <span class="label">{{ item.emoji }} {{ item.name }}</span>
      </div>
    </div>

    <!-- 图容器（中间） -->
    <div ref="containerRef" class="acu-graph-container"></div>

    <!-- 工具栏（底部） -->
    <div class="acu-graph-toolbar">
      <button class="acu-graph-btn" title="返回仪表盘" @click.stop="handleBackToDashboard">
        <i class="fas fa-arrow-left"></i>
      </button>
      <span class="acu-toolbar-divider"></span>
      <button class="acu-graph-btn" title="放大" @click="zoomIn">
        <i class="fas fa-plus"></i>
      </button>
      <button class="acu-graph-btn" title="缩小" @click="zoomOut">
        <i class="fas fa-minus"></i>
      </button>
      <button class="acu-graph-btn" title="适应视图" @click="fitToView">
        <i class="fas fa-compress-arrows-alt"></i>
      </button>
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
      <button class="acu-graph-btn" title="保存当前布局" @click="saveLayoutManually">
        <i class="fas fa-save"></i>
      </button>
      <button class="acu-graph-btn" title="重置布局" @click="clearSavedPositions">
        <i class="fas fa-undo"></i>
      </button>
      <span class="acu-toolbar-divider"></span>
      <button class="acu-graph-btn" title="头像管理" @click="openAvatarManager">
        <i class="fas fa-user-circle"></i>
      </button>
    </div>

    <!-- 空状态 -->
    <div v-if="!hasData" class="acu-graph-empty">
      <i class="fas fa-project-diagram"></i>
      <p>暂无关系数据</p>
      <p class="hint">请确保存在"关系表"并包含有效数据</p>
    </div>

    <!-- 头像管理弹窗 -->
    <AvatarManagerDialog
      :visible="showAvatarManager"
      :nodes="avatarManagerNodes"
      @close="closeAvatarManager"
      @update="handleAvatarUpdate"
      @label-change="handleLabelChange"
    />

    <!-- 节点配置弹窗 - 选择显示的字符 -->
    <div v-if="showNodeConfig" class="acu-node-config-overlay" @click.self="closeNodeConfig">
      <div class="acu-node-config-panel">
        <div class="acu-node-config-header">
          <span>选择显示的字符</span>
          <button class="acu-close-btn" @click.stop="closeNodeConfig">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="acu-node-config-body">
          <p class="acu-node-fullname">全名：{{ configNodeFullName }}</p>
          <p class="acu-node-hint">点击选择要显示的字符（可多选）</p>
          <div class="acu-char-selector">
            <button
              v-for="(char, index) in getDisplayChars(configNodeFullName)"
              :key="index"
              class="acu-char-btn"
              :class="{ active: configSelectedIndices.has(index) }"
              @click.stop="toggleCharSelection(index)"
            >
              {{ char }}
            </button>
          </div>
          <p class="acu-node-preview">预览：{{ getPreviewLabel() }}</p>
          <div class="acu-node-config-actions">
            <button class="acu-action-btn secondary" @click.stop="resetToFullName">显示全名</button>
            <button class="acu-action-btn primary" @click.stop="applyAndClose">确定</button>
          </div>
        </div>
      </div>
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

import type { Core, LayoutOptions } from 'cytoscape';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
// @ts-expect-error - cytoscape-node-html-label 没有类型定义
import nodeHtmlLabel from 'cytoscape-node-html-label';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useAvatarManager } from '../composables/useAvatarManager';
import { TAB_DASHBOARD, useConfigStore, useUIStore } from '../stores';
import type { ProcessedTable } from '../types';
import { getCore, getRelationLegend, parseEmbeddedRelationships, parseRelationshipTable } from '../utils';
import { AvatarManagerDialog } from './dialogs';

// 注册 fcose 布局扩展
cytoscape.use(fcose);

// 注册 node-html-label 扩展（用于 HTML 渲染节点头像）
nodeHtmlLabel(cytoscape);

// Stores
const configStore = useConfigStore();
const uiStore = useUIStore();

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
  /** 是否显示图例 */
  showLegend?: boolean;
  /** 初始布局模式 */
  initialLayout?: 'fcose' | 'circle' | 'dagre';
}

const props = withDefaults(defineProps<Props>(), {
  relationshipTable: null,
  characterTables: () => [],
  factionTable: null,
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
type LayoutType = 'fcose' | 'circle' | 'dagre';

/** 当前布局模式 */
const layoutMode = ref<LayoutType>(props.initialLayout);

/** 是否显示节点配置弹窗 */
const showNodeConfig = ref(false);

/** 是否显示头像管理弹窗 */
const showAvatarManager = ref(false);
/** 当前配置的节点 ID */
const configNodeId = ref<string | null>(null);
/** 当前配置的节点全名 */
const configNodeFullName = ref('');
/** 当前选择的字符索引集合（多选） */
const configSelectedIndices = ref<Set<number>>(new Set());

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

// ============================================================
// 计算属性
// ============================================================

/** 图例数据 */
const legend = computed(() => getRelationLegend());

/** 解析后的元素数据 */
const parsedData = computed(() => {
  console.info('[RelationshipGraph] 解析数据 - props:', {
    relationshipTable: props.relationshipTable?.name,
    characterTablesCount: props.characterTables?.length,
    characterTablesNames: props.characterTables?.map(t => t.name),
    factionTable: props.factionTable?.name,
    aliasMapSize: aliasMap.value.size,
  });

  // 优先使用专用关系表，传入别名映射
  const result = parseRelationshipTable(
    props.relationshipTable,
    props.characterTables,
    props.factionTable,
    aliasMap.value,
  );

  console.info('[RelationshipGraph] 专用关系表解析结果:', {
    nodeCount: result.nodeCount,
    edgeCount: result.edgeCount,
    warnings: result.warnings,
  });

  // 如果没有数据且有角色表，尝试从角色表的内嵌字段解析
  if (result.nodeCount === 0 && props.characterTables && props.characterTables.length > 0) {
    console.info('[RelationshipGraph] 无专用关系表，尝试从角色表内嵌字段解析');
    const embeddedResult = parseEmbeddedRelationships(props.characterTables, props.factionTable, aliasMap.value);
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
function getLayoutConfig(mode: 'fcose' | 'circle' | 'dagre'): LayoutOptions {
  switch (mode) {
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
      // fcose: cose 的增强版，更智能的布局算法
      return {
        name: 'fcose',
        quality: 'proof', // 'draft' | 'default' | 'proof' - 更高质量需要更多时间
        randomize: true, // 初始位置随机化
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 30,
        // 节点间距相关
        nodeSeparation: 100, // 节点之间的最小距离
        idealEdgeLength: 150, // 边的理想长度
        // 边交叉优化
        edgeElasticity: 0.45, // 边的弹性
        nestingFactor: 0.1, // 嵌套因子
        gravity: 0.25, // 引力（拉向中心）
        gravityRange: 3.8, // 引力范围
        // 迭代相关
        numIter: 2500, // 最大迭代次数
        tile: true, // 分块处理以优化性能
        tilingPaddingVertical: 10,
        tilingPaddingHorizontal: 10,
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

      return {
        ...el,
        data: {
          ...el.data,
          avatarUrl: avatarData?.url || undefined,
          avatarOffsetX: avatarData?.offsetX ?? 50,
          avatarOffsetY: avatarData?.offsetY ?? 50,
          avatarScale: avatarData?.scale ?? 150,
          fullName: fullName, // 确保 fullName 存在
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
          'text-max-width': '46px', // 略小于节点宽度，留边距
          'background-color': colors.btnBg, // 按钮背景色
          color: colors.textMain, // 主要文本色
          // 动态字体大小：根据标签长度自动调整（返回带单位的字符串）
          'font-size': (node: { data: (key: string) => string }) => {
            const label = node.data('label') || '';
            const len = label.length;
            if (len <= 1) return '20px';
            if (len <= 2) return '16px';
            if (len <= 3) return '13px';
            if (len <= 4) return '11px';
            return '10px'; // 5个字及以上
          },
          'font-weight': 'bold',
          width: 50,
          height: 50,
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
          width: 50,
          height: 50,
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
          width: 2.5,
          label: 'data(label)',
          'font-size': '10px',
          'text-rotation': 'autorotate',
          'text-margin-y': -8,
          color: '#fff', // 白色文字
          'text-background-color': 'data(color)', // 使用边的颜色作为标签背景
          'text-background-opacity': 0.95,
          'text-background-padding': '3px',
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

  // 双击节点 - 打开配置弹窗（使用 id 作为全名，而非 label）
  cy.on('dbltap', 'node', evt => {
    const node = evt.target;
    openNodeConfig(node.id(), node.id()); // id 是全名
  });

  cy.on('tap', 'edge', evt => {
    const edge = evt.target;
    emit('edge-click', {
      source: edge.source().id(),
      target: edge.target().id(),
      relation: edge.data('label') || '',
    });
  });

  // 节点拖拽结束 - 不再自动保存，用户需手动点击保存按钮
  // cy.on('dragfree', 'node', () => {
  //   saveNodePositions();
  // });

  // 如果使用了 preset 布局，适应视图
  if (hasPositions) {
    cy.fit(undefined, 30);
  }

  // 应用保存的标签配置
  applyLabelConfig();

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

        // 使用与头像预览完全相同的 CSS
        return `
          <div class="acu-graph-avatar-wrapper">
            <div class="acu-graph-avatar" style="
              background-image: url('${avatarUrl}');
              background-position: ${offsetX}% ${offsetY}%;
              background-size: ${scale}%;
              background-repeat: no-repeat;
            "></div>
            <div class="acu-graph-avatar-name">${fullName}</div>
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

/** 设置布局 - 切换布局模式并加载对应的保存位置或运行布局算法 */
function setLayout(mode: LayoutType) {
  if (!cy) return;

  // 如果是同一个布局，不做任何操作
  if (mode === layoutMode.value) return;

  const previousLayout = layoutMode.value;

  // 注意：切换布局时不自动保存当前位置，只有手动点击保存按钮才会保存
  // 这样可以避免意外覆盖用户之前手动保存的位置

  // 1. 切换布局模式
  layoutMode.value = mode;
  console.info(`[RelationshipGraph] 布局切换: ${previousLayout} → ${mode}`);

  // 2. 检查目标布局是否有保存的位置
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
  const layout = cy?.layout(getLayoutConfig(currentLayout));
  layout?.one('layoutstop', () => {
    // 布局完成后保存到正确的布局类型
    saveNodePositions(currentLayout);
  });
  layout?.run();
}

/** 手动保存布局并提示用户 */
function saveLayoutManually() {
  saveNodePositions();
  // 简单的视觉反馈
  const btn = document.querySelector('.acu-graph-btn[title="保存当前布局"]');
  if (btn) {
    btn.classList.add('saved');
    setTimeout(() => btn.classList.remove('saved'), 1000);
  }
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
 * 检测是否为英文名（包含空格或全英文）
 */
function isEnglishName(name: string): boolean {
  // 包含空格且主要是英文字符
  return /^[A-Za-z\s'-]+$/.test(name) && name.includes(' ');
}

/**
 * 获取默认显示标签
 * - 中文名: 取最后一个字
 * - 英文名: 取第一个单词（名字而非姓氏）
 */
function getDefaultLabel(fullName: string): string {
  if (isEnglishName(fullName)) {
    // 英文名：取第一个单词（名字）
    const firstName = fullName.split(' ')[0];
    return firstName.length > 6 ? firstName.slice(0, 6) : firstName;
  }
  // 中文名：取最后一个字
  return fullName.length > 0 ? fullName[fullName.length - 1] : fullName;
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
  configNodeId.value = nodeId;
  configNodeFullName.value = fullName;

  // 获取当前配置
  const config = getLabelConfig();
  const nodeConfig = config[nodeId];

  if (nodeConfig && nodeConfig.selectedIndices) {
    configSelectedIndices.value = new Set(nodeConfig.selectedIndices);
  } else {
    // 使用默认选中
    configSelectedIndices.value = new Set(getDefaultIndices(fullName));
  }

  showNodeConfig.value = true;
}

/** 切换字符选择（多选） */
function toggleCharSelection(index: number) {
  const newSet = new Set(configSelectedIndices.value);
  if (newSet.has(index)) {
    newSet.delete(index);
  } else {
    newSet.add(index);
  }
  configSelectedIndices.value = newSet;
}

/** 获取预览标签 */
function getPreviewLabel(): string {
  if (!configNodeFullName.value) return '';

  const chars = getDisplayChars(configNodeFullName.value);
  const selectedChars = Array.from(configSelectedIndices.value)
    .sort((a, b) => a - b)
    .map(i => chars[i])
    .filter(Boolean);

  if (selectedChars.length === 0) {
    return getDefaultLabel(configNodeFullName.value);
  }

  // 英文名用空格连接，中文名直接连接
  if (isEnglishName(configNodeFullName.value)) {
    return selectedChars.join(' ');
  }
  return selectedChars.join('');
}

/** 应用选择并关闭 */
function applyAndClose() {
  if (!configNodeId.value || !configNodeFullName.value) {
    closeNodeConfig();
    return;
  }

  const displayLabel = getPreviewLabel();
  const selectedIndices = Array.from(configSelectedIndices.value);

  // 保存配置
  const config = getLabelConfig();
  config[configNodeId.value] = {
    displayLabel,
    selectedIndices,
  };
  saveLabelConfig(config);

  // 更新节点标签
  if (cy) {
    const node = cy.getElementById(configNodeId.value);
    if (node) {
      node.data('label', displayLabel);
    }
  }

  closeNodeConfig();
}

/** 重置为全名显示 */
function resetToFullName() {
  if (!configNodeId.value || !configNodeFullName.value) return;

  // 删除配置
  const config = getLabelConfig();
  delete config[configNodeId.value];
  saveLabelConfig(config);

  // 恢复节点标签为全名
  if (cy) {
    const node = cy.getElementById(configNodeId.value);
    if (node) {
      node.data('label', configNodeFullName.value);
    }
  }

  closeNodeConfig();
}

/** 关闭节点配置弹窗 */
function closeNodeConfig() {
  showNodeConfig.value = false;
  configNodeId.value = null;
  configSelectedIndices.value = new Set();
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

/** 打开头像管理弹窗 */
function openAvatarManager() {
  showAvatarManager.value = true;
  // 添加 has-modal 类以提升容器层级，使弹窗覆盖导航栏
  const { $ } = getCore();
  $('.acu-data-display').addClass('has-modal');
}

/** 关闭头像管理弹窗 */
function closeAvatarManager() {
  showAvatarManager.value = false;
  // 移除 has-modal 类
  const { $ } = getCore();
  $('.acu-data-display').removeClass('has-modal');
}

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

onMounted(async () => {
  // 先加载别名映射
  await loadAliasMap();

  // 如果数据已准备好，预加载头像后再初始化
  if (hasData.value) {
    await preloadAvatars();
    initCytoscape();
    isInitialized.value = true;
  }
});

// 监听数据变化，数据准备好后先预加载头像再初始化
watch(
  hasData,
  async newValue => {
    if (newValue && !isInitialized.value && containerRef.value) {
      console.info('[RelationshipGraph] 数据准备就绪，预加载头像...');
      await preloadAvatars();
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

/**
 * 更新节点颜色（响应主题变化）
 */
function updateNodeColors() {
  if (!cy) return;

  const colors = getThemeColors();

  // 更新节点样式 - 与初始化保持一致
  cy.style()
    .selector('node')
    .style({
      'background-color': colors.btnBg, // 按钮背景色
      color: colors.textMain, // 主要文本色
      'border-width': 1.5, // 细边框
      'border-color': colors.textMain, // 主要文本色边框
    })
    .selector('node.protagonist')
    .style({
      'background-color': colors.highlight, // 高亮色
      color: colors.textMain,
      'border-width': 1.5,
      'border-color': colors.textMain,
    })
    .selector('node.faction')
    .style({
      'background-color': colors.btnBg,
      color: colors.textMain,
      'border-width': 1.5,
      'border-color': colors.textMain,
    })
    .selector('node.unknown')
    .style({
      'background-color': colors.btnBg,
      color: colors.textMain,
      'border-width': 1.5,
      'border-color': colors.textMain,
    })
    .update();
}

// 暴露方法供外部调用
defineExpose({
  fitToView,
  zoomIn,
  zoomOut,
  setLayout,
  refresh,
});
</script>

<style>
/* 样式通过 useParentStyleInjection 注入到父窗口 */
/* 详见 styles/components/relationship-graph.scss */
</style>
