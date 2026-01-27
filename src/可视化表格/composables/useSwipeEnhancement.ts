/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Swipe 增强功能 Composable
 *
 * 功能：Swipe 时自动清除最后一楼的表格数据
 *
 * 支持桌面端按钮点击和移动端触摸手势
 */

import { onUnmounted, ref } from 'vue';
import { useConfigStore } from '../stores/useConfigStore';
import { useDataStore } from '../stores/useDataStore';
import { getCore } from '../utils/index';
import { toast } from './useToast';

// ============================================================
// 类型定义
// ============================================================

/** Swipe 增强配置 */
export interface SwipeEnhancementConfig {
  /** 是否启用 Swipe 时清除表格 */
  clearTableOnSwipe: boolean;
}

/** SillyTavern 聊天消息类型（简化版） */
interface STChatMessage {
  is_user?: boolean;
  swipe_id?: number;
  swipes?: string[];
  [key: string]: unknown;
}

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_CONFIG: SwipeEnhancementConfig = {
  clearTableOnSwipe: true,
};

// ============================================================
// 工具函数
// ============================================================

/**
 * 获取 SillyTavern Context（包含 chat 数据）
 */
function getSillyTavernContext(): any {
  const win = window.parent || window;
  const ST = (win as any).SillyTavern || (win as any).top?.SillyTavern;
  if (ST && typeof ST.getContext === 'function') {
    return ST.getContext();
  }
  return null;
}

/**
 * 判断 touch 目标是否在最后一条消息区域
 */
function isTouchOnLastMessage(target: Element | null): boolean {
  if (!target) return false;

  const parentDoc = window.parent.document;
  const allMessages = parentDoc.querySelectorAll('#chat .mes');
  if (allMessages.length === 0) return false;

  const lastMessageEl = allMessages[allMessages.length - 1];
  return lastMessageEl.contains(target);
}

// ============================================================
// Composable 定义
// ============================================================

export function useSwipeEnhancement() {
  const dataStore = useDataStore();
  const configStore = useConfigStore();

  // 状态
  const isProcessing = ref(false);
  const config = ref<SwipeEnhancementConfig>({ ...DEFAULT_CONFIG });

  // 事件清理函数
  const cleanupFns: Array<() => void> = [];

  // 移动端手势状态
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  const SWIPE_THRESHOLD = 50;

  // ============================================================
  // 配置管理
  // ============================================================

  /**
   * 更新配置
   */
  function updateConfig(newConfig: Partial<SwipeEnhancementConfig>) {
    config.value = { ...config.value, ...newConfig };
    console.info('[ACU Swipe] 配置已更新:', config.value);
  }

  /**
   * 获取当前配置
   */
  function getConfig(): SwipeEnhancementConfig {
    return { ...config.value };
  }

  // ============================================================
  // 核心功能
  // ============================================================

  /**
   * 清除指定楼层的表格数据
   */
  async function clearFloorData(floorIndex: number): Promise<boolean> {
    try {
      await dataStore.purgeFloorRange(floorIndex, floorIndex);
      console.info(`[ACU Swipe] 已清除第 ${floorIndex} 楼的表格数据`);
      return true;
    } catch (e) {
      console.error('[ACU Swipe] 清除楼层数据失败:', e);
      return false;
    }
  }

  /**
   * 检查是否会触发新生成
   */
  function willTriggerNewGeneration(message: STChatMessage): boolean {
    if (message.is_user) return false;

    const currentSwipeId = message.swipe_id ?? 0;
    const totalSwipes = message.swipes?.length ?? 1;

    return currentSwipeId >= totalSwipes - 1;
  }

  /**
   * 检查指定楼层是否有 ACU 数据
   */
  function hasACUData(message: STChatMessage): boolean {
    // 检查是否有 TavernDB_ACU_IsolatedData 字段
    const isolatedData = (message as any).TavernDB_ACU_IsolatedData;
    if (!isolatedData || typeof isolatedData !== 'object') {
      return false;
    }
    // 检查是否有任何隔离标签的数据
    return Object.keys(isolatedData).length > 0;
  }

  /**
   * 处理 Swipe 事件 - 功能 A：简单清除表格
   */
  async function handleSwipeClearOnly(): Promise<void> {
    console.info('[ACU Swipe] handleSwipeClearOnly 开始执行');

    if (isProcessing.value) {
      console.info('[ACU Swipe] 正在处理中，跳过');
      return;
    }

    const ctx = getSillyTavernContext();
    if (!ctx?.chat?.length) {
      console.warn('[ACU Swipe] SillyTavern context.chat 不可用');
      return;
    }

    const lastIndex = ctx.chat.length - 1;
    const lastMessage = ctx.chat[lastIndex] as STChatMessage;

    console.info('[ACU Swipe] 检查最后一楼:', {
      index: lastIndex,
      is_user: lastMessage.is_user,
      swipe_id: lastMessage.swipe_id,
      swipes_length: lastMessage.swipes?.length,
    });

    // 检查是否会触发新生成
    if (!willTriggerNewGeneration(lastMessage)) {
      console.info('[ACU Swipe] 查看历史 swipe，跳过清除');
      return;
    }

    // 检查最后一楼是否有 ACU 数据
    const hasData = hasACUData(lastMessage);
    console.info('[ACU Swipe] 最后一楼是否有 ACU 数据:', hasData);

    if (!hasData) {
      console.info('[ACU Swipe] 最后一楼无 ACU 数据，跳过清除');
      return;
    }

    isProcessing.value = true;
    try {
      console.info('[ACU Swipe] 开始清除第', lastIndex, '楼的表格数据');
      const success = await clearFloorData(lastIndex);
      if (success) {
        toast.info('Swipe: 已清除最后一楼表格数据');
      }
    } finally {
      isProcessing.value = false;
    }
  }

  /**
   * 统一的 Swipe 处理入口
   * 从 configStore 读取配置
   */
  async function handleSwipe(event?: Event): Promise<void> {
    // 从 configStore 读取配置
    const clearEnabled = configStore.config.clearTableOnSwipe ?? config.value.clearTableOnSwipe;

    console.info('[ACU Swipe] handleSwipe 调用', { clearEnabled });

    if (!clearEnabled) {
      console.info('[ACU Swipe] 功能未启用，跳过');
      return;
    }

    console.info('[ACU Swipe] 执行清除表格');
    await handleSwipeClearOnly();
  }

  // ============================================================
  // 事件监听
  // ============================================================

  /**
   * 初始化桌面端按钮监听
   */
  function initDesktopListener() {
    const { $ } = getCore();
    if (!$) {
      console.warn('[ACU Swipe] jQuery 不可用，无法初始化桌面端监听');
      return;
    }

    const parentDoc = window.parent.document;

    // 使用原生事件监听的捕获阶段，确保优先于 SillyTavern 的处理器执行
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      // 检查是否点击的是 swipe 右箭头
      if (!target.closest('.swipe_right')) return;

      console.info('[ACU Swipe] 检测到 swipe_right 点击');
      handleSwipe(e);
    };

    // 使用 capture: true 在捕获阶段拦截事件
    parentDoc.addEventListener('click', handler, { capture: true });

    // 注册清理函数
    cleanupFns.push(() => {
      parentDoc.removeEventListener('click', handler, { capture: true });
      console.info('[ACU Swipe] 桌面端监听已清理');
    });

    console.info('[ACU Swipe] 桌面端监听已初始化 (捕获模式)');
  }

  /**
   * 初始化移动端触摸监听
   */
  function initMobileListener() {
    const parentDoc = window.parent.document;
    const chatContainer = parentDoc.getElementById('chat');
    if (!chatContainer) {
      console.warn('[ACU Swipe] 未找到 #chat 容器，无法初始化移动端监听');
      return;
    }

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      isSwiping = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isSwiping) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      // 水平滑动优先（避免与垂直滚动冲突）
      // 左滑 = 负的 deltaX，相当于点击右箭头
      if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX < -SWIPE_THRESHOLD) {
        isSwiping = true;

        // 检测是否在最后一条消息上
        if (isTouchOnLastMessage(e.target as Element)) {
          console.log('[ACU Swipe] 移动端：检测到左滑手势');
          handleSwipe();
        }
      }
    };

    chatContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
    chatContainer.addEventListener('touchmove', handleTouchMove, { passive: true });

    // 注册清理函数
    cleanupFns.push(() => {
      chatContainer.removeEventListener('touchstart', handleTouchStart);
      chatContainer.removeEventListener('touchmove', handleTouchMove);
      console.info('[ACU Swipe] 移动端监听已清理');
    });

    console.info('[ACU Swipe] 移动端监听已初始化');
  }

  /**
   * 初始化所有监听器
   */
  function init() {
    initDesktopListener();
    initMobileListener();
    console.info('[ACU Swipe] Swipe 增强功能已初始化');
  }

  /**
   * 清理所有监听器
   */
  function cleanup() {
    cleanupFns.forEach(fn => fn());
    cleanupFns.length = 0;
    console.info('[ACU Swipe] Swipe 增强功能已清理');
  }

  // 组件卸载时自动清理
  onUnmounted(() => {
    cleanup();
  });

  // ============================================================
  // 返回接口
  // ============================================================

  return {
    // 状态
    isProcessing,
    config,

    // 配置管理
    updateConfig,
    getConfig,

    // 核心功能
    clearFloorData,
    handleSwipe,
    handleSwipeClearOnly,

    // 工具函数
    willTriggerNewGeneration,

    // 生命周期
    init,
    cleanup,
  };
}
