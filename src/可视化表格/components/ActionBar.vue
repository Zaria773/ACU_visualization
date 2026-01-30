<template>
  <div class="acu-action-bar">
    <!-- 锁定编辑模式：完成按钮 -->
    <div v-if="uiStore.isLockEditMode" class="acu-action-btn-wrapper acu-lock-mode-btns">
      <button class="acu-action-btn acu-btn-primary" title="完成锁定编辑" @click.stop="handleFinishLockEdit">
        <i class="fas fa-check"></i>
      </button>
      <button class="acu-action-btn acu-btn-secondary" title="取消锁定编辑" @click.stop="handleCancelLockEdit">
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

    <!-- 普通模式：常规按钮 -->
    <template v-else>
      <div v-for="btnId in sortedVisibleButtonIds" :key="btnId" class="acu-action-btn-wrapper">
        <button
          class="acu-action-btn"
          :class="getButtonClass(btnId)"
          :title="getButtonTitle(btnId)"
          @click="handleClick(btnId)"
          @mousedown="startLongPress(btnId)"
          @mouseup="endLongPress"
          @mouseleave="endLongPress"
          @touchstart.passive="startLongPress(btnId)"
          @touchend="endLongPress"
        >
          <i :class="['fas', getButtonIcon(btnId)]"></i>
          <!-- 附属按钮指示点 -->
          <span v-if="hasSecondary(btnId)" class="secondary-indicator"></span>
        </button>

        <!-- 长按弹出的附属按钮 -->
        <transition name="popup">
          <button
            v-if="popupButtonId === btnId && getSecondaryId(btnId)"
            class="acu-action-btn acu-popup-btn"
            :title="getButtonLabel(getSecondaryId(btnId)!)"
            @click.stop="handleSecondaryClick(btnId)"
          >
            <i :class="['fas', getButtonIcon(getSecondaryId(btnId)!)]"></i>
          </button>
        </transition>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * ActionBar - 导航栏按钮组件（支持收纳组）
 *
 * 功能说明:
 * - 根据 configStore 配置动态渲染可见按钮
 * - 支持按钮收纳组：主按钮 + 长按触发附属按钮
 * - 长按直接执行开关：开启后长按直接执行附属功能，关闭则弹出附属按钮
 * - 按钮顺序可配置
 * - 特殊按钮样式（危险按钮、切换按钮等）
 *
 * 用于:
 * - 主面板顶部导航栏
 */

import { computed, ref } from 'vue';
import { useCellLock } from '../composables';
import { NAV_BUTTONS, useConfigStore } from '../stores/useConfigStore';
import { useUIStore } from '../stores/useUIStore';

interface Props {
  /** 是否有未保存的更改 */
  hasChanges?: boolean;
  /** 是否已固定面板 */
  isPinned?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  hasChanges: false,
  isPinned: false,
});

const emit = defineEmits<{
  /** 保存 */
  save: [];
  /** 另存为 */
  saveAs: [];
  /** 刷新 */
  refresh: [];
  /** 手动更新 */
  manualUpdate: [];
  /** 清除范围 */
  purge: [];
  /** 固定面板 */
  pin: [];
  /** 收起面板 */
  toggle: [];
  /** 打开设置 */
  settings: [];
  /** 打开原生编辑器 */
  openNative: [];
  /** 完成锁定编辑 */
  finishLockEdit: [];
  /** 取消锁定编辑 */
  cancelLockEdit: [];
}>();

const configStore = useConfigStore();
const uiStore = useUIStore();
const cellLock = useCellLock();

// ============================================================
// 按钮配置获取
// ============================================================

/** 获取排序后的可见按钮 ID 列表 */
const sortedVisibleButtonIds = computed(() => {
  return configStore.sortedVisibleButtons;
});

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
  const btn = NAV_BUTTONS.find(b => b.id === buttonId);
  return btn?.icon || 'fa-circle';
};

/**
 * 获取按钮标签
 * @param buttonId 按钮 ID
 */
const getButtonLabel = (buttonId: string): string => {
  const btn = NAV_BUTTONS.find(b => b.id === buttonId);
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

/**
 * 获取按钮样式类
 * @param buttonId 按钮 ID
 */
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

  // 有附属按钮的样式
  if (hasSecondary(buttonId)) {
    classes.push('has-secondary');
  }

  return classes;
};

// ============================================================
// 长按检测与弹出按钮
// ============================================================

let longPressTimer: ReturnType<typeof setTimeout> | null = null;
const isLongPress = ref(false);
const popupButtonId = ref<string | null>(null);

/**
 * 开始长按计时
 * @param buttonId 按钮 ID
 */
const startLongPress = (buttonId: string) => {
  const secondaryId = getSecondaryId(buttonId);
  console.log(
    '[ACU ActionBar] startLongPress:',
    buttonId,
    'secondaryId:',
    secondaryId,
    'groups:',
    configStore.buttonGroups,
  );

  if (!secondaryId) {
    console.log('[ACU ActionBar] No secondary button for:', buttonId);
    return;
  }

  isLongPress.value = false;
  longPressTimer = setTimeout(() => {
    isLongPress.value = true;
    console.log('[ACU ActionBar] Long press triggered for:', buttonId, 'directExec:', configStore.longPressDirectExec);

    // 根据配置决定是弹出按钮还是直接执行
    if (configStore.longPressDirectExec) {
      // 直接执行附属功能
      console.log('[ACU ActionBar] Direct exec:', secondaryId);
      emitAction(secondaryId);
    } else {
      // 弹出附属按钮
      console.log('[ACU ActionBar] Popup button:', secondaryId);
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

/**
 * 结束长按计时
 */
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
    emitAction(secondaryId);
  }
  popupButtonId.value = null;
};

// ============================================================
// 事件处理
// ============================================================

/**
 * 触发按钮动作事件
 * @param actionId 动作 ID
 */
const emitAction = (actionId: string) => {
  switch (actionId) {
    case 'save':
      emit('save');
      break;
    case 'saveAs':
      emit('saveAs');
      break;
    case 'refresh':
      emit('refresh');
      break;
    case 'manualUpdate':
      emit('manualUpdate');
      break;
    case 'purge':
      emit('purge');
      break;
    case 'pin':
      emit('pin');
      break;
    case 'toggle':
      emit('toggle');
      break;
    case 'settings':
      emit('settings');
      break;
    case 'openNative':
      emit('openNative');
      break;
    default:
      console.warn(`[ActionBar] 未知的动作 ID: ${actionId}`);
  }
};

/**
 * 处理按钮点击
 * @param buttonId 按钮 ID
 */
const handleClick = (buttonId: string) => {
  // 如果是长按触发，不执行点击
  if (isLongPress.value) {
    isLongPress.value = false;
    return;
  }

  emitAction(buttonId);
};

// ============================================================
// 锁定编辑模式
// ============================================================

/**
 * 完成锁定编辑
 */
const handleFinishLockEdit = () => {
  emit('finishLockEdit');
};

/**
 * 取消锁定编辑
 */
const handleCancelLockEdit = () => {
  emit('cancelLockEdit');
};

/**
 * 切换只显示锁定卡片筛选
 */
const toggleShowLockedOnly = () => {
  uiStore.showLockedOnly = !uiStore.showLockedOnly;
};
</script>

<style scoped lang="scss">
/* 样式已迁移至 styles/components/buttons.scss */
</style>
