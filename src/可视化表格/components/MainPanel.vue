<template>
  <div
    ref="panelRef"
    class="acu-wrapper"
    :class="[
      `acu-theme-${theme}`,
      `acu-layout-${layout}`,
      {
        collapsed: isCollapsed,
        pinned: isPinned,
        'acu-centered-mode': windowConfig.isCentered,
      },
    ]"
  >
    <!-- 1. 数据显示区（放在最前面） -->
    <div
      ref="dataAreaRef"
      class="acu-data-display"
      :class="{
        visible: !isContentHidden,
        'acu-layout-horizontal': layout === 'horizontal',
        'acu-layout-vertical': layout === 'vertical',
      }"
    >
      <!-- 内容区 -->
      <div class="acu-panel-content">
        <slot></slot>
      </div>
    </div>

    <!-- 2. 宽度调节把手 -->
    <!-- 注意：事件绑定在 onMounted 中手动进行，避免跨 iframe 生产构建事件绑定失效 -->
    <div v-if="!lockPanel" ref="resizeHandleRef" class="acu-resize-handle"></div>

    <!-- 3. 导航容器（放在最后，显示在底部） -->
    <!-- 注意：拖拽事件绑定在 onMounted 中手动进行 -->
    <div ref="navContainerRef" class="acu-nav-container" :class="{ 'acu-locked': lockPanel }">
      <!-- Tab 区域 (由 slot 提供，TabBar 自带 .acu-nav-tabs-area) -->
      <slot name="tabs"></slot>

      <!-- 分隔线 -->
      <div class="acu-nav-separator"></div>

      <!-- 动作按钮区（横排） -->
      <div class="acu-nav-actions-area">
        <!-- 常规按钮（始终显示） -->
        <div v-for="btn in visibleButtons" :key="btn.id" class="acu-action-btn-wrapper">
          <button
            class="acu-action-btn"
            :class="getButtonClass(btn.id)"
            :title="getButtonTitle(btn.id)"
            :style="getButtonStyle(btn.id)"
            @click.stop="handleButtonClick(btn.id)"
            @mousedown.stop="startLongPress(btn.id)"
            @mouseup.stop="endLongPress"
            @mouseleave="endLongPress"
            @touchstart.passive.stop="startLongPress(btn.id)"
            @touchend.stop="endLongPress"
          >
            <i :class="['fa-solid', btn.icon]"></i>
            <!-- 附属按钮指示点 -->
            <span v-if="hasSecondary(btn.id)" class="secondary-indicator"></span>
          </button>

          <!-- 长按弹出的附属按钮 -->
          <transition name="popup">
            <button
              v-if="popupButtonId === btn.id && getSecondaryId(btn.id)"
              class="acu-action-btn acu-popup-btn"
              :title="getButtonLabel(getSecondaryId(btn.id)!)"
              @click.stop="handleSecondaryClick(btn.id)"
            >
              <i :class="['fa-solid', getButtonIcon(getSecondaryId(btn.id)!)]"></i>
            </button>
          </transition>
        </div>

        <!-- 更多按钮（仅当有隐藏按钮时显示） -->
        <div v-if="hasHiddenButtons" class="acu-action-btn-wrapper">
          <button
            class="acu-action-btn acu-more-btn"
            :class="{ active: isHiddenPopupVisible }"
            title="更多按钮"
            @click.stop="toggleHiddenPopup"
          >
            <i class="fa-solid fa-chevron-up"></i>
          </button>
        </div>

        <!-- 隐藏按钮浮窗（放在 actions-area 内，贴着 action 按钮显示） -->
        <HiddenButtonsPopup
          :visible="isHiddenPopupVisible"
          :buttons="hiddenButtons"
          :is-pinned="isPinned"
          @close="isHiddenPopupVisible = false"
          @button-click="handleHiddenButtonClick"
        />

        <!-- Tab浮窗（放在 actions-area 内，贴着 action 按钮显示） -->
        <slot name="tabs-popup"></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * MainPanel.vue - 主面板容器组件
 *
 * 布局结构（从上到下）：
 * 1. acu-data-display - 数据显示区
 * 2. acu-resize-handle - 宽度调节把手
 * 3. acu-nav-container - 导航容器
 *    - acu-nav-tabs-area - Tab 区域
 *    - acu-nav-separator - 分隔线
 *    - acu-nav-actions-area - 操作按钮区（横排）
 *
 * 使用 VueUse 增强功能：
 * - useStorage: 持久化窗口配置
 * - useSmartHeight: 智能高度调整（根据面板类型和分页器状态）
 */

import { useEventListener, useStorage } from '@vueuse/core';
import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue';
import type { PanelType } from '../composables';
import { useCellLock, useSmartHeight } from '../composables';
import { NAV_BUTTONS, useConfigStore, useUIStore } from '../stores';
import type { NavButtonConfig, WindowConfig } from '../types';
import HiddenButtonsPopup from './HiddenButtonsPopup.vue';

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  /** 面板标题 */
  title?: string;
  /** 主题 */
  theme?: string;
  /** 布局模式 */
  layout?: 'vertical' | 'horizontal';
  /** 是否折叠 */
  isCollapsed?: boolean;
  /** 是否固定 */
  isPinned?: boolean;
  /** 是否隐藏内容区 */
  isContentHidden?: boolean;
  /** 是否锁定面板位置 */
  lockPanel?: boolean;
  /** 是否有未保存的更改 */
  hasChanges?: boolean;
  /** 面板类型（用于智能高度计算） */
  panelType?: PanelType;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'ACU 可视化表格',
  theme: 'retro',
  layout: 'vertical',
  isCollapsed: false,
  isPinned: false,
  isContentHidden: false,
  lockPanel: false,
  hasChanges: false,
  panelType: 'normal',
});

const emit = defineEmits<{
  /** 刷新数据 */
  refresh: [];
  /** 保存更改 */
  save: [];
  /** 另存为（保存到指定楼层） */
  'save-as': [];
  /** 撤回到上次保存 */
  undo: [];
  /** 手动更新楼层 */
  'manual-update': [];
  /** 清除数据 */
  purge: [];
  /** 打开设置 */
  settings: [];
  /** 打开原生设置入口 */
  'open-native': [];
  /** 切换固定状态 */
  'toggle-pin': [];
  /** 切换面板显示/隐藏 */
  toggle: [];
  /** 关闭面板 */
  close: [];
  /** 隐藏内容区 */
  'hide-content': [];
  /** 高度变化 */
  'height-change': [height: number];
  /** 宽度变化 */
  'width-change': [width: number];
  /** 收纳Tab点击 */
  'collapse-tab': [];
}>();

// ============================================================
// Stores & Composables
// ============================================================

const uiStore = useUIStore();
const cellLock = useCellLock();
const configStore = useConfigStore();

// ============================================================
// 导航按钮逻辑
// ============================================================

/** 默认可见按钮列表 */
const DEFAULT_VISIBLE_BUTTONS = ['save', 'refresh', 'settings', 'pin', 'toggle'];

/** 获取排序后的可见按钮列表 - 使用 buttonsConfig 而非 config */
const visibleButtons = computed(() => {
  // 【修复】使用 buttonsConfig（独立的按钮配置 refs）而非 config（UI 配置）
  const buttonsConfig = configStore.buttonsConfig;
  let order = buttonsConfig.buttonOrder || NAV_BUTTONS.map((b: NavButtonConfig) => b.id);
  // 修复：当 visibleButtons 为空数组或未定义时，使用默认值
  const visibleIds =
    buttonsConfig.visibleButtons?.length > 0
      ? [...buttonsConfig.visibleButtons]
      : [...DEFAULT_VISIBLE_BUTTONS];

  // 收纳Tab模式开启时，根据配置决定是否添加 collapseTab 按钮
  if (configStore.config.collapseTabBar && configStore.config.showCollapseTabButton !== false) {
    if (!visibleIds.includes('collapseTab')) {
      visibleIds.push('collapseTab');
    }
    // 确保 collapseTab 在 order 中（兼容旧配置）
    if (!order.includes('collapseTab')) {
      // 添加到 settings 之前
      const settingsIndex = order.indexOf('settings');
      if (settingsIndex >= 0) {
        order = [...order.slice(0, settingsIndex), 'collapseTab', ...order.slice(settingsIndex)];
      } else {
        order = [...order, 'collapseTab'];
      }
    }
  } else {
    // 收纳Tab模式关闭或不显示按钮时，移除 collapseTab 按钮
    const collapseIndex = visibleIds.indexOf('collapseTab');
    if (collapseIndex > -1) {
      visibleIds.splice(collapseIndex, 1);
    }
  }

  console.info('[ACU MainPanel] 计算可见按钮:', {
    order,
    visibleIds,
    buttonsConfigVisible: buttonsConfig.visibleButtons,
    collapseTabBar: configStore.config.collapseTabBar,
    showCollapseTabButton: configStore.config.showCollapseTabButton,
  });

  return order
    .map((id: string) => NAV_BUTTONS.find((b: NavButtonConfig) => b.id === id))
    .filter((btn: NavButtonConfig | undefined): btn is NavButtonConfig => {
      if (!btn) return false;
      // 检查按钮是否在可见列表中
      return visibleIds.includes(btn.id);
    });
});

/** 获取隐藏的按钮列表 */
const hiddenButtons = computed(() => configStore.hiddenButtons);

/** 是否有隐藏的按钮 */
const hasHiddenButtons = computed(() => configStore.hasHiddenButtons);

/** 隐藏按钮浮窗是否可见 */
const isHiddenPopupVisible = ref(false);

/** 切换隐藏按钮浮窗显示状态 */
const toggleHiddenPopup = () => {
  isHiddenPopupVisible.value = !isHiddenPopupVisible.value;
};

/** 处理隐藏按钮点击 */
const handleHiddenButtonClick = (buttonId: string) => {
  isHiddenPopupVisible.value = false;
  emitButtonAction(buttonId);
};

/** 刷新按钮动画状态 */
const isRefreshing = ref(false);

/** 获取按钮样式类 */
const getButtonClass = (buttonId: string): string[] => {
  const classes: string[] = [];

  // 危险按钮样式（清除范围）
  if (buttonId === 'purge') {
    classes.push('acu-btn-danger');
  }

  // 切换按钮样式（固定面板）
  if (buttonId === 'pin') {
    classes.push('acu-btn-toggle');
    if (props.isPinned) {
      classes.push('active');
    }
  }

  // 保存按钮有更改时的样式
  if (buttonId === 'save' && props.hasChanges) {
    classes.push('has-changes');
  }

  // 刷新按钮旋转动画
  if (buttonId === 'refresh' && isRefreshing.value) {
    classes.push('refreshing');
  }

  return classes;
};

/** 获取按钮内联样式 */
const getButtonStyle = (buttonId: string): Record<string, string> => {
  const styles: Record<string, string> = {};

  // 清除按钮红色
  if (buttonId === 'purge') {
    styles.color = '#e74c3c';
  }

  // 固定按钮激活时的样式
  if (buttonId === 'pin' && props.isPinned) {
    styles.color = 'var(--acu-title-color)';
    styles.borderColor = 'var(--acu-title-color)';
    styles.background = 'var(--acu-btn-hover)';
  }

  return styles;
};

// ============================================================
// 长按检测与弹出按钮（与 ActionBar.vue 保持一致）
// ============================================================

let longPressTimer: ReturnType<typeof setTimeout> | null = null;
const isLongPress = ref(false);
const popupButtonId = ref<string | null>(null);

/**
 * 获取按钮的附属按钮 ID
 * @param buttonId 主按钮 ID
 */
const getSecondaryId = (buttonId: string): string | null => {
  return configStore.getSecondaryButtonId(buttonId);
};

/**
 * 检查按钮是否有附属按钮
 * @param buttonId 按钮 ID
 */
const hasSecondary = (buttonId: string): boolean => {
  return getSecondaryId(buttonId) !== null;
};

/**
 * 获取按钮图标
 * @param buttonId 按钮 ID
 */
const getButtonIcon = (buttonId: string): string => {
  const btn = NAV_BUTTONS.find((b: NavButtonConfig) => b.id === buttonId);
  return btn?.icon || 'fa-circle';
};

/**
 * 获取按钮标签
 * @param buttonId 按钮 ID
 */
const getButtonLabel = (buttonId: string): string => {
  const btn = NAV_BUTTONS.find((b: NavButtonConfig) => b.id === buttonId);
  return btn?.label || buttonId;
};

/**
 * 获取按钮 title（含长按提示）
 * @param buttonId 按钮 ID
 */
const getButtonTitle = (buttonId: string): string => {
  const label = getButtonLabel(buttonId);
  const secondaryId = getSecondaryId(buttonId);
  if (secondaryId) {
    const secondaryLabel = getButtonLabel(secondaryId);
    return `${label} (长按: ${secondaryLabel})`;
  }
  return label;
};

/** 开始长按计时 */
const startLongPress = (buttonId: string) => {
  const secondaryId = getSecondaryId(buttonId);
  console.log(
    '[ACU MainPanel] startLongPress:',
    buttonId,
    'secondaryId:',
    secondaryId,
    'groups:',
    configStore.buttonGroups,
  );

  if (!secondaryId) {
    console.log('[ACU MainPanel] No secondary button for:', buttonId);
    return;
  }

  isLongPress.value = false;
  longPressTimer = setTimeout(() => {
    isLongPress.value = true;
    console.log('[ACU MainPanel] Long press triggered for:', buttonId, 'directExec:', configStore.longPressDirectExec);

    // 根据配置决定是弹出按钮还是直接执行
    if (configStore.longPressDirectExec) {
      // 直接执行附属功能
      console.log('[ACU MainPanel] Direct exec:', secondaryId);
      emitButtonAction(secondaryId);
    } else {
      // 弹出附属按钮
      console.log('[ACU MainPanel] Popup button:', secondaryId);
      popupButtonId.value = buttonId;
      // 3秒后自动隐藏
      setTimeout(() => {
        if (popupButtonId.value === buttonId) {
          popupButtonId.value = null;
        }
      }, 3000);
    }
  }, 600);
};

/** 结束长按计时 */
const endLongPress = () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
};

/**
 * 处理附属按钮点击
 * @param primaryId 主按钮 ID
 */
const handleSecondaryClick = (primaryId: string) => {
  const secondaryId = getSecondaryId(primaryId);
  if (secondaryId) {
    emitButtonAction(secondaryId);
  }
  popupButtonId.value = null;
};

/** 触发按钮动作事件 */
const emitButtonAction = (actionId: string) => {
  switch (actionId) {
    case 'save':
      emit('save');
      break;
    case 'saveAs':
      emit('save-as');
      break;
    case 'undo':
      emit('undo');
      break;
    case 'refresh':
      emit('refresh');
      break;
    case 'manualUpdate':
      emit('manual-update');
      break;
    case 'purge':
      emit('purge');
      break;
    case 'pin':
      emit('toggle-pin');
      break;
    case 'toggle':
      emit('toggle');
      break;
    case 'director':
      uiStore.directorDialog = true;
      break;
    case 'settings':
      emit('settings');
      break;
    case 'openNative':
      emit('open-native');
      break;
    case 'collapseTab':
      emit('collapse-tab');
      break;
    default:
      console.warn(`[MainPanel] 未知的动作 ID: ${actionId}`);
  }
};

/** 处理按钮点击 */
const handleButtonClick = (buttonId: string) => {
  // 如果是长按触发，不执行点击
  if (isLongPress.value) {
    isLongPress.value = false;
    return;
  }

  // 刷新按钮点击时触发旋转动画
  if (buttonId === 'refresh') {
    isRefreshing.value = true;
    // 1秒后停止动画
    setTimeout(() => {
      isRefreshing.value = false;
    }, 1000);
  }

  emitButtonAction(buttonId);
};

// ============================================================
// Refs
// ============================================================

const panelRef = ref<HTMLElement>();
const dataAreaRef = ref<HTMLElement>();
const navContainerRef = ref<HTMLElement>();
const resizeHandleRef = ref<HTMLElement>();

// ============================================================
// 持久化窗口配置
// ============================================================

// ============================================================
// 【关键修复】完全按照 6.4.1.ts renderInterface 的逻辑
// 在 useStorage 之前，先用原生方式检查并修正 localStorage
// 如果没存过位置（第一次打开），或者值无效，强制默认居中
// ============================================================
const WINDOW_CONFIG_KEY = 'acu_win_config';
const DEFAULT_CENTERED_CONFIG: WindowConfig = { width: 400, left: '50%', bottom: '50%', isCentered: true };

// 先读取原始 localStorage 值，并检查是否有效
let preCheckSavedWin: WindowConfig | null = null;
let needResetToCenter = false;
try {
  const rawValue = localStorage.getItem(WINDOW_CONFIG_KEY);
  preCheckSavedWin = rawValue ? JSON.parse(rawValue) : null;
} catch (e) {
  preCheckSavedWin = null;
}

// 【关键】完全按照 6.4.1 的逻辑 + 无效值检测：
// 1. 如果没存过位置（第一次打开），默认居中
if (!preCheckSavedWin) {
  needResetToCenter = true;
  console.info('[ACU MainPanel] 首次加载，设置默认居中配置');
} else if (
  // 2. 如果存过但值无效（bottom 太小导致看不到），也重置为居中
  // 检测：非居中模式下，bottom 值小于 100px 就认为是异常（导航栏在屏幕底部外面）
  !preCheckSavedWin.isCentered &&
  typeof preCheckSavedWin.bottom === 'number' &&
  preCheckSavedWin.bottom < 100
) {
  needResetToCenter = true;
  console.warn('[ACU MainPanel] 检测到无效位置配置 (bottom=' + preCheckSavedWin.bottom + ')，重置为居中');
}

if (needResetToCenter) {
  localStorage.setItem(WINDOW_CONFIG_KEY, JSON.stringify(DEFAULT_CENTERED_CONFIG));
  // 【关键修复】参照 6.4.1：居中模式下不打开任何 tab，只显示光秃秃的导航栏
  // 这样导航栏就不会因为内容区域太大而被推到屏幕外面
  localStorage.removeItem('acu_active_tab');
  console.info('[ACU MainPanel] 居中模式：清除 activeTab，只显示导航栏');
}

const windowConfig = useStorage<WindowConfig>(WINDOW_CONFIG_KEY, DEFAULT_CENTERED_CONFIG);

// ============================================================
// 辅助函数 - 边界检测
// ============================================================

/** 检测是否为移动端/触摸设备 */
function isMobileDevice(): boolean {
  // 检测触摸能力
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  // 检测用户代理
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  // 检测屏幕宽度（小于 768px 视为移动端）
  const isSmallScreen = window.innerWidth < 768;

  return hasTouch && (mobileUA || isSmallScreen);
}

/**
 * 获取移动端安全底部边距
 * 使用用户在设置中配置的安全区大小
 * 返回一个安全边距，防止导航栏被拖到底部危险区域
 */
function getMobileSafeBottomMargin(): number {
  if (!isMobileDevice()) {
    return 0;
  }

  // 使用配置值，默认 50px
  return configStore.config.mobileSafeAreaBottom ?? 50;
}

/** 获取父窗口尺寸 */
function getParentWindowSize() {
  return {
    width: window.parent?.innerWidth ?? window.innerWidth,
    height: window.parent?.innerHeight ?? window.innerHeight,
  };
}

/**
 * 验证并修正面板位置
 * 参考 6.4.1 版本的 renderInterface 逻辑：
 * 1. 如果没有存过位置（第一次打开），默认居中
 * 2. 如果检测到异常位置（如 bottom 值过小），重置为居中模式
 */
function validateAndFixWindowPosition() {
  const config = windowConfig.value;
  const { width: parentWidth, height: parentHeight } = getParentWindowSize();

  console.info('[ACU MainPanel] 验证面板位置:', JSON.stringify(config), 'parentHeight:', parentHeight);

  // 【关键修改】参照 6.4.1：如果没存过位置（第一次打开），默认居中
  if (!config || config.left === undefined || config.bottom === undefined) {
    console.warn('[ACU MainPanel] 配置不完整，重置为居中模式');
    windowConfig.value = {
      width: config?.width || 400,
      left: '50%',
      bottom: '50%',
      isCentered: true,
    };
    return;
  }

  // 居中模式：验证 left 和 bottom 是否为 '50%'
  if (config.isCentered) {
    // 居中模式下，left 和 bottom 应该是 '50%'
    if (config.left !== '50%' || config.bottom !== '50%') {
      console.warn('[ACU MainPanel] 居中模式下位置异常，修正为 50%');
      windowConfig.value = {
        ...config,
        left: '50%',
        bottom: '50%',
      };
    }
    return;
  }

  // 非居中模式：验证位置是否合理
  let needUpdate = false;
  let resetToCenter = false;
  let newLeft = config.left;
  const newBottom = config.bottom;

  const safeBottomMargin = getMobileSafeBottomMargin();
  // 【关键修改】降低阈值要求，主要检测明显异常的情况（面板完全跑到屏幕外）
  const minSafeBottom = Math.max(safeBottomMargin, 50);

  // 验证 bottom 位置
  if (typeof config.bottom === 'number') {
    // 检测异常情况：面板位置过低（太靠近屏幕底部，导航栏不可见）
    if (config.bottom < minSafeBottom) {
      console.warn(`[ACU MainPanel] 底部位置异常 (${config.bottom}px < ${minSafeBottom}px)，重置为居中模式`);
      resetToCenter = true;
    } else if (config.bottom > parentHeight - 50) {
      // 面板位置超出屏幕顶部
      console.warn(`[ACU MainPanel] 顶部位置异常 (${config.bottom}px > ${parentHeight - 50}px)，重置为居中模式`);
      resetToCenter = true;
    }
  } else if (config.bottom !== '50%') {
    // bottom 既不是数字也不是 '50%'（格式无效），重置为居中
    console.warn('[ACU MainPanel] 非居中模式下 bottom 格式无效，重置为居中模式');
    resetToCenter = true;
  }

  // 验证 left 位置
  if (typeof config.left === 'number') {
    const maxLeft = parentWidth - 50;
    if (config.left < -200) {
      newLeft = -200;
      needUpdate = true;
    } else if (config.left > maxLeft) {
      newLeft = Math.max(0, maxLeft);
      needUpdate = true;
    }
  } else if (config.left !== '50%') {
    // left 既不是数字也不是 '50%'（格式无效），重置为居中
    console.warn('[ACU MainPanel] 非居中模式下 left 格式无效，重置为居中模式');
    resetToCenter = true;
  }

  // 如果需要重置为居中模式
  if (resetToCenter) {
    windowConfig.value = {
      width: config.width || 400,
      left: '50%',
      bottom: '50%',
      isCentered: true,
    };
    console.info('[ACU MainPanel] 面板已重置为居中模式');
    return;
  }

  // 仅需要修正边界
  if (needUpdate) {
    console.info('[ACU MainPanel] 面板位置越界，已自动修正');
    windowConfig.value = {
      ...config,
      left: newLeft,
      bottom: newBottom,
    };
  }
}

// ============================================================
// 计算属性
// ============================================================

// ============================================================
// 跨 iframe 生产构建修复：直接 DOM 操作
// 问题：Vue 3 响应式绑定 (:style) 在生产构建 + 跨 iframe 场景下失效
// 解决：使用 watchEffect 直接操作 DOM 元素的 style 属性设置 CSS 变量
// ============================================================

watchEffect(() => {
  if (!panelRef.value) return;

  // 【完全按照 6.4.1】读取配置，如果没有则默认居中
  let savedWin = windowConfig.value;
  if (!savedWin) {
    savedWin = { width: 400, left: '50%', bottom: '50%', isCentered: true };
  }

  const el = panelRef.value;

  // 【完全按照 6.4.1】统一应用位置逻辑
  if (savedWin.width) {
    el.style.setProperty('--acu-win-width', `${savedWin.width}px`);
  }

  if (savedWin.left !== undefined) {
    const leftValue = typeof savedWin.left === 'number' ? `${savedWin.left}px` : savedWin.left;
    el.style.setProperty('--acu-win-left', leftValue);
  }

  if (savedWin.bottom !== undefined) {
    const bottomValue = typeof savedWin.bottom === 'number' ? `${savedWin.bottom}px` : savedWin.bottom;
    el.style.setProperty('--acu-win-bottom', bottomValue);
  }

  // 设置 transform：居中模式使用 top 定位
  if (savedWin.isCentered) {
    // 居中模式：使用 top 定位，CSS 类会处理大部分样式
    // 这里只确保 CSS 变量一致性
    el.style.setProperty('--acu-win-left', '50%');
    el.style.removeProperty('--acu-win-bottom');
    el.style.transform = 'translate(-50%, -50%)';
  } else {
    // 非居中模式：使用 bottom 定位
    el.style.transform = 'none';
  }
});

// ============================================================
// 拖拽移动面板（使用 jQuery $('body').on() 绑定到父窗口）
// 参考：src/手机界面/index.vue 的成功实现
// 关键：脚本项目中 $ 已指向 window.parent.$，所以 $('body') 会选中父窗口的 body
// ============================================================

/**
 * 面板拖拽处理器
 * 使用 jQuery 绑定事件到父窗口 body
 * 关键技术点：
 * 1. 使用 $('body').on() 绑定 move/up 事件（脚本中 $ 指向父窗口的 jQuery）
 * 2. 添加 5px 拖拽阈值，避免误触发
 * 3. 拖拽结束后临时拦截 click 事件，防止触发按钮
 */
function handleHeaderPointerDown(e: PointerEvent) {
  // 如果锁定面板，直接返回
  if (props.lockPanel) return;

  // 仅排除调整把手、滑块、输入框（不排除按钮，通过拖拽阈值区分点击和拖拽）
  const target = e.target as HTMLElement;
  if (target.closest('.acu-resize-handle, .acu-slider, input')) return;

  // 只响应左键/单指
  if (e.button !== 0) return;

  const navEl = navContainerRef.value;
  if (!navEl || !panelRef.value) return;

  // 记录初始状态
  const startX = e.clientX;
  const startY = e.clientY;
  const rect = panelRef.value.getBoundingClientRect();
  const startLeft = rect.left;
  const winH = window.parent?.innerHeight ?? window.innerHeight;
  const startBottom = winH - rect.bottom;

  let isDragging = false;
  let wasDragging = false;

  const handlePointerMove = (moveE: JQuery.TriggeredEvent) => {
    const originalEvent = moveE.originalEvent as PointerEvent;
    const dx = originalEvent.clientX - startX;
    const dy = originalEvent.clientY - startY;

    // 阈值检测：只有移动超过 5px 才开始算作拖动
    if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      isDragging = true;
      wasDragging = true;
      // 取消居中，转为绝对定位
      windowConfig.value.isCentered = false;
    }

    if (isDragging) {
      moveE.preventDefault();

      let newLeft = startLeft + dx;
      let newBottom = startBottom - dy;

      // 边界限制（考虑移动端安全区域）
      const parentWidth = window.parent?.innerWidth ?? window.innerWidth;
      const safeBottomMargin = getMobileSafeBottomMargin();
      const maxLeft = parentWidth - 50;
      const minBottom = safeBottomMargin; // 移动端底部安全边距
      const maxBottom = winH - 50;

      if (newLeft < -200) newLeft = -200;
      if (newLeft > maxLeft) newLeft = maxLeft;
      if (newBottom < minBottom) newBottom = minBottom;
      if (newBottom > maxBottom) newBottom = maxBottom;

      windowConfig.value.left = newLeft;
      windowConfig.value.bottom = newBottom;
    }
  };

  const handlePointerUp = () => {
    // 使用 jQuery 移除事件（关键！$('body') 指向父窗口的 body）
    $('body').off('pointermove', handlePointerMove);
    $('body').off('pointerup', handlePointerUp);

    if (wasDragging) {
      // 核心：在捕获阶段拦截 click 事件，防止触发按钮功能
      const preventClick = (clickE: Event) => {
        clickE.stopPropagation();
        clickE.preventDefault();
        navEl.removeEventListener('click', preventClick, true);
      };
      navEl.addEventListener('click', preventClick, true);
      console.info('[ACU MainPanel] 面板位置已更新');
    }
  };

  // 使用 jQuery 绑定到父窗口 body（关键！脚本项目中 $ 已指向 window.parent.$）
  $('body').on('pointermove', handlePointerMove);
  $('body').on('pointerup', handlePointerUp);
}

// ============================================================
// 高度调节（使用智能高度计算）
// ============================================================

/** 内容区域引用（用于自动高度调整监测） */
const contentInnerRef = ref<HTMLElement>();

/** 是否手动设置了高度 */
const isManualHeight = ref(false);

/** 当前面板高度 */
const panelHeight = ref(0);

/** 面板类型响应式引用 */
const panelTypeRef = computed(() => props.panelType);

/** 分页器显示状态（从配置 store 读取） */
const showPaginationRef = computed(() => configStore.config.showPagination);

// ============================================================
// 生命周期 - 初始化和边界检测
// ============================================================

onMounted(() => {
  // 验证保存的位置是否在屏幕内
  validateAndFixWindowPosition();

  // 手动绑定拖拽事件（跨 iframe 生产构建修复）
  const navEl = navContainerRef.value;
  if (navEl) {
    navEl.addEventListener('pointerdown', handleHeaderPointerDown);
    console.info('[ACU MainPanel] 导航栏拖拽事件已绑定');
  }

  // 手动绑定宽度调节事件
  const resizeEl = resizeHandleRef.value;
  if (resizeEl) {
    resizeEl.addEventListener('pointerdown', startWidthResize);
    console.info('[ACU MainPanel] 宽度调节事件已绑定');
  }
});

// 清理事件监听
onUnmounted(() => {
  const navEl = navContainerRef.value;
  if (navEl) {
    navEl.removeEventListener('pointerdown', handleHeaderPointerDown);
  }

  const resizeEl = resizeHandleRef.value;
  if (resizeEl) {
    resizeEl.removeEventListener('pointerdown', startWidthResize);
  }
});

// 监听窗口 resize，重新检查位置
useEventListener(window.parent ?? window, 'resize', () => {
  validateAndFixWindowPosition();
});

// 使用智能高度调整 composable
const { height: autoHeight, recalculate: recalculateHeight } = useSmartHeight(
  contentInnerRef,
  panelTypeRef,
  showPaginationRef,
  {
    minHeight: 200,
    maxHeightRatio: 0.8,
    headerHeight: 42,
    paginationHeight: 56,
    contentPadding: 25,
    onHeightChange: height => {
      if (!isManualHeight.value && dataAreaRef.value) {
        panelHeight.value = height;
        emit('height-change', height);
      }
    },
  },
);

// 手动高度调节
/**
 * 高度调节处理器（预留，目前模板中没有高度调节把手）
 * 如需启用，添加高度调节把手元素并绑定此函数
 */
const startHeightDrag = (e: PointerEvent, handleEl: HTMLElement) => {
  if (e.button !== 0) return;

  e.preventDefault();
  e.stopPropagation();

  if (!dataAreaRef.value) return;

  handleEl.setPointerCapture(e.pointerId);

  isManualHeight.value = true;
  const startY = e.clientY;
  const startHeight = dataAreaRef.value.offsetHeight;

  const handlePointerMove = (moveE: PointerEvent) => {
    if (!dataAreaRef.value) return;

    const dy = startY - moveE.clientY;
    let newHeight = startHeight + dy;

    // 限制高度范围：最小 200px，最大由 CSS 的 max-height: calc(100vh - bottom) 控制
    const minHeight = 200;
    newHeight = Math.max(minHeight, newHeight);

    dataAreaRef.value.style.height = `${newHeight}px`;
    panelHeight.value = newHeight;
    emit('height-change', newHeight);
  };

  const handlePointerUp = (upE: PointerEvent) => {
    handleEl.releasePointerCapture(upE.pointerId);
    handleEl.removeEventListener('pointermove', handlePointerMove);
    handleEl.removeEventListener('pointerup', handlePointerUp);
  };

  handleEl.addEventListener('pointermove', handlePointerMove);
  handleEl.addEventListener('pointerup', handlePointerUp);
};

/**
 * 重置高度为自适应
 *
 * 移动端修复方案：
 * 1. 完全清除所有高度限制
 * 2. 使用 setTimeout + rAF 确保移动端渲染完成
 * 3. 遍历子元素计算实际内容高度，避免 scrollHeight 受容器影响
 *
 * 横向布局特殊处理：
 * - 遍历所有卡片，找到最大内容高度
 * - 动态获取工具栏、分页器等元素的实际高度
 */
const resetHeight = () => {
  if (!dataAreaRef.value) return;

  // 1. 恢复自动高度模式
  isManualHeight.value = false;

  // 2. 完全清除所有高度限制
  dataAreaRef.value.style.height = '';
  dataAreaRef.value.style.minHeight = '';
  dataAreaRef.value.style.maxHeight = '';

  // 3. 使用 setTimeout 确保移动端浏览器完成布局
  // 50ms 延迟比纯 rAF 更可靠，因为移动端有额外的合成层处理
  setTimeout(() => {
    requestAnimationFrame(() => {
      if (!dataAreaRef.value) return;

      // 4. 高度范围
      const minHeight = 200;
      // 最大高度：视口高度 - 导航栏实际高度 - 边距
      const parentHeight = window.parent?.innerHeight ?? window.innerHeight;
      const navEl = navContainerRef.value;
      const navHeight = navEl ? navEl.offsetHeight : 0;
      const maxHeight = parentHeight - navHeight - 20;

      // 5. 检测是否包含关系图（特殊处理：强制撑满最大高度）
      const hasRelationshipGraph = dataAreaRef.value.querySelector('.acu-relationship-graph');
      if (hasRelationshipGraph) {
        const finalHeight = maxHeight;
        dataAreaRef.value.style.height = `${finalHeight}px`;
        panelHeight.value = finalHeight;
        console.info(`[ACU] 关系图高度重置: 强制最大高度 ${finalHeight}`);
        emit('height-change', finalHeight);
        return;
      }

      // 6. 检测是否是横向布局
      const isHorizontal = configStore.config.layout === 'horizontal';
      let naturalHeight: number;

      if (isHorizontal) {
        // 横向布局：遍历所有卡片，找到最大内容高度
        const cardsContainer = dataAreaRef.value.querySelector('.acu-cards-container');
        if (cardsContainer) {
          const cards = cardsContainer.querySelectorAll('.acu-data-card');
          let maxCardHeight = 0;

          cards.forEach(card => {
            const cardEl = card as HTMLElement;
            // 获取卡片内部的实际内容高度（scrollHeight 包含溢出内容）
            const cardContentHeight = cardEl.scrollHeight;
            if (cardContentHeight > maxCardHeight) {
              maxCardHeight = cardContentHeight;
            }
          });

          // 动态获取工具栏和分页器的实际高度
          const toolbar = dataAreaRef.value.querySelector('.acu-table-toolbar') as HTMLElement;
          const pagination = dataAreaRef.value.querySelector('.acu-pagination-container') as HTMLElement;
          const toolbarHeight = toolbar ? toolbar.offsetHeight : 0;
          const paginationHeight = pagination ? pagination.offsetHeight : 0;
          // 卡片容器的 padding（实时获取）
          const containerStyle = window.getComputedStyle(cardsContainer);
          const containerPadding = parseFloat(containerStyle.paddingTop) + parseFloat(containerStyle.paddingBottom);

          naturalHeight = maxCardHeight + toolbarHeight + paginationHeight + containerPadding;

          console.info(
            `[ACU] 横向布局高度计算: maxCard=${maxCardHeight}, toolbar=${toolbarHeight}, pagination=${paginationHeight}, padding=${containerPadding}`,
          );
        } else {
          naturalHeight = dataAreaRef.value.scrollHeight;
        }
      } else {
        // 纵向布局：使用原来的逻辑
        const contentEl = dataAreaRef.value.querySelector('.acu-panel-content');
        if (contentEl) {
          const firstChild = contentEl.firstElementChild as HTMLElement;
          if (firstChild) {
            naturalHeight = firstChild.offsetHeight + 20;
          } else {
            naturalHeight = (contentEl as HTMLElement).scrollHeight;
          }
        } else {
          naturalHeight = dataAreaRef.value.scrollHeight;
        }
      }

      // 7. 计算最终高度：至少 minHeight，最多 maxHeight
      const finalHeight = Math.min(maxHeight, Math.max(minHeight, naturalHeight));

      // 8. 应用高度
      // 【修复】如果是纵向布局且非关系图，不要强制设置固定高度，保持 auto 以便自适应
      // 只有在横向布局或关系图（需要撑满或计算）时才设置固定高度
      // 注意：横向布局下如果找不到卡片容器（如 Dashboard），也应该使用 auto
      const isSpecialHorizontal = isHorizontal && dataAreaRef.value.querySelector('.acu-cards-container');

      if (!hasRelationshipGraph && !isSpecialHorizontal) {
        dataAreaRef.value.style.height = '';
        // 重新获取实际高度用于状态更新
        const actualHeight = dataAreaRef.value.offsetHeight;
        panelHeight.value = actualHeight;
        console.info(`[ACU] 高度已重置(Auto): actual=${actualHeight}, horizontal=${isHorizontal}`);
        emit('height-change', actualHeight);
      } else {
        dataAreaRef.value.style.height = `${finalHeight}px`;
        panelHeight.value = finalHeight;
        console.info(
          `[ACU] 高度已重置(Fixed): natural=${naturalHeight}, max=${maxHeight}, final=${finalHeight}, horizontal=${isHorizontal}`,
        );
        emit('height-change', finalHeight);
      }
    });
  }, 50);
};

// ============================================================
// 宽度调节（使用 Pointer Events API + setPointerCapture）
// ============================================================

/**
 * 宽度调节处理器
 * 使用 jQuery $('body').on() 绑定到父窗口
 */
function startWidthResize(e: PointerEvent) {
  // 只响应左键
  if (e.button !== 0) return;

  e.preventDefault();
  e.stopPropagation();

  const handleEl = resizeHandleRef.value;
  if (!handleEl || !panelRef.value) return;

  const startX = e.clientX;
  const rect = panelRef.value.getBoundingClientRect();
  const startWidth = rect.width;

  const handlePointerMove = (moveE: JQuery.TriggeredEvent) => {
    const originalEvent = moveE.originalEvent as PointerEvent;
    const dx = originalEvent.clientX - startX;
    let newWidth = startWidth + dx;

    // 限制宽度范围
    const minWidth = 300;
    const parentWidth = window.parent?.innerWidth ?? window.innerWidth;
    const maxWidth = parentWidth - 10;
    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;

    windowConfig.value.width = newWidth;
    emit('width-change', newWidth);
  };

  const handlePointerUp = () => {
    // 使用 jQuery 移除事件（关键！$('body') 指向父窗口的 body）
    $('body').off('pointermove', handlePointerMove);
    $('body').off('pointerup', handlePointerUp);
    console.info('[ACU MainPanel] 宽度已更新:', windowConfig.value.width);
  };

  // 使用 jQuery 绑定到父窗口 body（关键！脚本项目中 $ 已指向 window.parent.$）
  $('body').on('pointermove', handlePointerMove);
  $('body').on('pointerup', handlePointerUp);
}

// ============================================================
// 其他方法
// ============================================================

const hideContent = () => {
  emit('hide-content');
};

// ============================================================
// 暴露方法
// ============================================================

defineExpose({
  /** 获取面板元素 */
  getPanelElement: () => panelRef.value,
  /** 获取数据区元素 */
  getDataAreaElement: () => dataAreaRef.value,
  /** 获取当前高度 */
  getCurrentHeight: () => panelHeight.value,
  /** 重置窗口位置 */
  resetPosition: () => {
    windowConfig.value = {
      width: 400,
      left: '50%',
      bottom: '50%',
      isCentered: true,
    };
  },
  /** 退出居中模式，切换到底部定位 */
  exitCenteredMode: () => {
    if (!windowConfig.value.isCentered) return;

    const parentWidth = window.parent?.innerWidth ?? window.innerWidth;
    windowConfig.value = {
      ...windowConfig.value,
      isCentered: false,
      // 如果没有有效的位置，设置合理的默认值
      bottom:
        typeof windowConfig.value.bottom === 'number' && windowConfig.value.bottom >= 50
          ? windowConfig.value.bottom
          : 100,
      left: typeof windowConfig.value.left === 'number' ? windowConfig.value.left : parentWidth / 2 - 200,
    };
    console.info('[ACU MainPanel] 退出居中模式，切换到底部定位');
  },
  /** 重置高度为自动 */
  resetHeight,
  /** 手动触发高度重新计算 */
  recalculateHeight,
});
</script>

<!-- 样式已迁移至 styles/layouts/panel.scss, styles/layouts/container.scss, styles/components/navigation.scss, styles/components/buttons.scss -->
