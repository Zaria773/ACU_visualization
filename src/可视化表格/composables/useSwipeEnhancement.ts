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
  async function handleSwipeClearOnly(swipedMesId?: number): Promise<void> {
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

    // 精准修复：只有在滑动最后一条且最后一条为AI消息时才清除
    if (swipedMesId !== undefined && swipedMesId !== lastIndex) {
      console.info('[ACU Swipe] 滑动的不是最后一楼，跳过清除');
      return;
    }

    if (lastMessage.is_user) {
      console.info('[ACU Swipe] 最后一楼是用户消息，跳过清除');
      return;
    }

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
  async function handleSwipe(swipedMesId?: number): Promise<void> {
    // 从 configStore 读取配置
    const clearEnabled = configStore.config.clearTableOnSwipe ?? config.value.clearTableOnSwipe;

    console.info('[ACU Swipe] handleSwipe 调用', { clearEnabled });

    if (!clearEnabled) {
      console.info('[ACU Swipe] 功能未启用，跳过');
      return;
    }

    console.info('[ACU Swipe] 执行清除表格');
    await handleSwipeClearOnly(swipedMesId);
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
    const handler = async (e: Event) => {
      const target = e.target as HTMLElement;
      const swipeBtn = target.closest('.swipe_right');

      // 检查是否点击的是 swipe 右箭头
      if (!swipeBtn) return;

      // 检查是否是我们触发的重试事件（避免死循环）
      if ((e as any).__acu_processed) return;

      // 从 configStore 读取配置，如果未启用则不拦截
      const clearEnabled = configStore.config.clearTableOnSwipe ?? config.value.clearTableOnSwipe;
      if (!clearEnabled) return;

      // 获取被滑动消息的 mesid
      const mesEl = target.closest('.mes');
      const swipedMesId = mesEl ? parseInt(mesEl.getAttribute('mesid') || '-1', 10) : -1;

      // --- 精准拦截跳过逻辑 ---
      const ctx = getSillyTavernContext();
      if (!ctx?.chat?.length) return;
      const lastIndex = ctx.chat.length - 1;

      // 如果滑动的不是最后一楼，直接不拦截 (让酒馆正常处理翻页，避免翻页两次的bug)
      if (swipedMesId !== lastIndex) return;

      const lastMessage = ctx.chat[lastIndex] as STChatMessage;
      if (lastMessage.is_user) return;

      const currentSwipeId = lastMessage.swipe_id ?? 0;
      const totalSwipes = lastMessage.swipes?.length ?? 1;

      // 如果不是在最后一个 swipe 上点击右滑，那仅仅是普通翻页，不会触发生成。不拦截！
      if (currentSwipeId < totalSwipes - 1) return;
      // -------------------------

      console.info('[ACU Swipe] 拦截 swipe_right 点击，准备清理数据');

      // 1. 拦截原始事件，阻止酒馆处理
      e.preventDefault();
      e.stopImmediatePropagation();

      try {
        // 2. 执行清理 (等待世界书同步完成)
        await handleSwipe(swipedMesId);
      } catch (err) {
        console.error('[ACU Swipe] 清理过程出错，仍继续触发 Swipe', err);
      }

      console.info('[ACU Swipe] 数据清理完成，重新触发 Swipe');

      // 3. 重新触发点击事件 (标记为已处理)
      const newEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window.parent,
      });
      (newEvent as any).__acu_processed = true;
      swipeBtn.dispatchEvent(newEvent);
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
   * 初始化酒馆事件监听（用于移动端手势等无法通过 click 拦截的场景）
   *
   * 监听 MESSAGE_SWIPED 事件，在 Swipe 发生后、AI 生成前执行清理
   * 使用 eventMakeFirst 确保我们的 listener 最先执行
   */
  function initTavernEventListener() {
    // 标记是否已经处理过（防止与 click 拦截重复处理）
    let lastProcessedSwipeTime = 0;
    const DEBOUNCE_MS = 500;

    const handleMessageSwiped = async (message_id: number) => {
      // 从 configStore 读取配置
      const clearEnabled = configStore.config.clearTableOnSwipe ?? config.value.clearTableOnSwipe;
      if (!clearEnabled) return;

      // 防抖：如果刚刚通过 click 处理过，跳过
      const now = Date.now();
      if (now - lastProcessedSwipeTime < DEBOUNCE_MS) {
        console.info('[ACU Swipe] 刚处理过，跳过重复触发');
        return;
      }
      lastProcessedSwipeTime = now;

      console.info('[ACU Swipe] MESSAGE_SWIPED 事件触发，message_id:', message_id);

      // MESSAGE_SWIPED 不应该用来清理数据，因为它只会在"翻页后"立刻触发。
      // 如果翻到了最后一页，就会被误判成"要生成了"而提前清理数据。
      // 此事件仅用作 fallback，如果必须清理，应在GENERATION_STARTED。
      // 因此此处不再调用 handleSwipeClearOnly() 以防倒数第二翻页到倒数第一时误清。
      console.info('[ACU Swipe] 跳过 MESSAGE_SWIPED 的清理，因已在 click 拦截精确处理');
      return;
    };

    // 使用 eventMakeFirst 确保我们的 listener 最先执行
    // 这样在酒馆发送 AI 请求之前，我们的清理操作就能完成
    const { stop } = eventMakeFirst(tavern_events.MESSAGE_SWIPED, errorCatched(handleMessageSwiped));

    cleanupFns.push(() => {
      stop();
      console.info('[ACU Swipe] 酒馆事件监听已清理');
    });

    console.info('[ACU Swipe] 酒馆事件监听已初始化 (MESSAGE_SWIPED)');
  }

  /**
   * 初始化所有监听器
   */
  function init() {
    initDesktopListener();
    initTavernEventListener();
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
