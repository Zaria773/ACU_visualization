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
        <!-- 锁定编辑模式：在最前面添加确认/取消/筛选按钮 -->
        <div v-if="uiStore.isLockEditMode" class="acu-action-btn-wrapper acu-lock-mode-btns">
          <button class="acu-action-btn acu-btn-success" title="完成锁定编辑" @click.stop="handleFinishLockEdit">
            <i class="fas fa-check"></i>
          </button>
          <button class="acu-action-btn acu-btn-cancel" title="取消锁定编辑" @click.stop="handleCancelLockEdit">
            <i class="fas fa-times"></i>
          </button>
          <button
            class="acu-action-btn"
            :class="{ 'acu-btn-active': uiStore.showLockedOnly }"
            title="只显示锁定的卡片"
            @click.stop="toggleShowLockedOnly"
          >
            <i class="fas fa-filter"></i>
          </button>
          <span v-if="cellLock.pendingLockCount.value > 0" class="acu-lock-count">
            {{ cellLock.pendingLockCount.value }}
          </span>
        </div>

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
import { toast, useCellLock, useSmartHeight } from '../composables';
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

/** 获取排序后的可见按钮列表 */
const visibleButtons = computed(() => {
  let order = configStore.config.buttonOrder || NAV_BUTTONS.map((b: NavButtonConfig) => b.id);
  // 修复：当 visibleButtons 为空数组或未定义时，使用默认值
  const visibleIds =
    configStore.config.visibleButtons?.length > 0
      ? [...configStore.config.visibleButtons]
      : [...DEFAULT_VISIBLE_BUTTONS];

  // 收纳Tab模式开启时，自动添加 collapseTab 按钮
  if (configStore.config.collapseTabBar) {
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
    // 收纳Tab模式关闭时，移除 collapseTab 按钮（但不要从 order 中移除，以保持配置位置）
    const collapseIndex = visibleIds.indexOf('collapseTab');
    if (collapseIndex > -1) {
      visibleIds.splice(collapseIndex, 1);
    }
  }

  console.info('[ACU MainPanel] 计算可见按钮:', {
    order,
    visibleIds,
    collapseTabBar: configStore.config.collapseTabBar,
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
// 锁定编辑模式处理
// ============================================================

/** 完成锁定编辑 */
const handleFinishLockEdit = () => {
  // 在保存前记录计数（因为保存后 pendingLocks 会被重置）
  const count = cellLock.pendingLockCount.value;
  cellLock.savePendingLocks();
  uiStore.isLockEditMode = false;
  toast.success(`已保存 ${count} 个单元格锁定`);
};

/** 取消锁定编辑 */
const handleCancelLockEdit = () => {
  cellLock.discardPendingLocks();
  uiStore.isLockEditMode = false;
  toast.info('已取消锁定编辑');
};

/** 切换只显示锁定卡片筛选 */
const toggleShowLockedOnly = () => {
  uiStore.showLockedOnly = !uiStore.showLockedOnly;
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

const windowConfig = useStorage<WindowConfig>('acu_win_config', {
  width: 400,
  left: '50%',
  bottom: '50%',
  isCentered: true,
});

// ============================================================
// 辅助函数 - 边界检测
// ============================================================

/** 获取父窗口尺寸 */
function getParentWindowSize() {
  return {
    width: window.parent?.innerWidth ?? window.innerWidth,
    height: window.parent?.innerHeight ?? window.innerHeight,
  };
}

/** 验证并修正面板位置 */
function validateAndFixWindowPosition() {
  const config = windowConfig.value;

  // 如果是居中模式，不需要检查
  if (config.isCentered) return;

  const { width: parentWidth, height: parentHeight } = getParentWindowSize();
  let needUpdate = false;
  let newLeft = config.left;
  let newBottom = config.bottom;

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
  }

  // 验证 bottom 位置
  if (typeof config.bottom === 'number') {
    const maxBottom = parentHeight - 50;
    if (config.bottom < 0) {
      newBottom = 0;
      needUpdate = true;
    } else if (config.bottom > maxBottom) {
      newBottom = Math.max(0, maxBottom);
      needUpdate = true;
    }
  }

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

  const config = windowConfig.value;
  const el = panelRef.value;

  // 设置 CSS 变量
  if (config.width) {
    el.style.setProperty('--acu-win-width', `${config.width}px`);
  }

  if (config.left !== undefined) {
    const leftValue = typeof config.left === 'number' ? `${config.left}px` : config.left;
    el.style.setProperty('--acu-win-left', leftValue);
  }

  if (config.bottom !== undefined) {
    const bottomValue = typeof config.bottom === 'number' ? `${config.bottom}px` : config.bottom;
    el.style.setProperty('--acu-win-bottom', bottomValue);
  }

  // 设置 transform
  if (config.isCentered) {
    el.style.transform = 'translate(-50%, 50%)';
  } else {
    el.style.transform = '';
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

      // 边界限制
      const parentWidth = window.parent?.innerWidth ?? window.innerWidth;
      const maxLeft = parentWidth - 50;
      const maxBottom = winH - 50;
      if (newLeft < -200) newLeft = -200;
      if (newLeft > maxLeft) newLeft = maxLeft;
      if (newBottom < 0) newBottom = 0;
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

    // 限制高度范围
    const minHeight = 200;
    const parentHeight = window.parent?.innerHeight ?? window.innerHeight;
    const maxHeight = parentHeight * 0.8;
    newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

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
 * 简洁方案：临时移除高度限制，让浏览器自然布局，然后获取 scrollHeight 作为理想高度。
 */
const resetHeight = () => {
  if (!dataAreaRef.value) return;

  // 1. 恢复自动高度模式
  isManualHeight.value = false;

  // 2. 计算最大允许高度
  const parentHeight = window.parent?.innerHeight ?? window.innerHeight;
  const maxAllowed = parentHeight * 0.8;
  const minHeight = 200;

  // 3. 临时移除高度限制，让内容自然撑开
  const originalHeight = dataAreaRef.value.style.height;
  dataAreaRef.value.style.height = 'auto';
  dataAreaRef.value.style.maxHeight = 'none';

  // 4. 获取自然高度（浏览器自动计算的完整高度）
  const naturalHeight = dataAreaRef.value.scrollHeight;

  // 5. 计算最终高度：clamp(naturalHeight, minHeight, maxAllowed)
  const finalHeight = Math.max(minHeight, Math.min(naturalHeight, maxAllowed));

  // 6. 应用高度
  dataAreaRef.value.style.height = `${finalHeight}px`;
  dataAreaRef.value.style.maxHeight = '';
  panelHeight.value = finalHeight;

  console.info(`[ACU] 高度已重置: natural=${naturalHeight}, final=${finalHeight}, max=${maxAllowed}`);
  emit('height-change', finalHeight);
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
  /** 重置高度为自动 */
  resetHeight,
  /** 手动触发高度重新计算 */
  recalculateHeight,
});
</script>

<!-- 样式已迁移至 styles/layouts/panel.scss, styles/layouts/container.scss, styles/components/navigation.scss, styles/components/buttons.scss -->
