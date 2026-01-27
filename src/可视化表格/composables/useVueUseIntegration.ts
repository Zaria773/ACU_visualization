/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * VueUse 集成工具函数
 * 封装常用的 VueUse 功能，简化组件使用
 *
 * 这个模块提供了以下功能的封装：
 * - useDraggableWithSnap: 可拖拽 + 边缘吸附
 * - useAutoHeight: 自动高度调整
 * - useCopyWithFeedback: 复制到剪贴板（带反馈）
 * - useSelectionGuard: 防误触选词检测
 * - useParentEventListener: 父窗口事件监听
 * - useDebouncedSave: 防抖保存
 */

import {
  onClickOutside,
  useClipboard,
  useDebounceFn,
  useDraggable,
  useEventListener,
  useResizeObserver,
  useStorage,
  useTextSelection,
  useThrottleFn,
  watchDebounced,
  type MaybeRefOrGetter,
} from '@vueuse/core';
import { computed, ref, type Ref } from 'vue';

// ============================================================
// 类型定义
// ============================================================

export interface DraggableWithSnapOptions {
  /** 初始 X 坐标 */
  initialX?: number;
  /** 初始 Y 坐标 */
  initialY?: number;
  /** 吸附阈值（默认为屏幕宽度的一半） */
  snapThreshold?: number;
  /** 边缘间距 */
  edgePadding?: number;
  /** 元素宽度（用于计算右边缘吸附位置） */
  elementWidth?: number;
  /** 位置变化回调 */
  onPositionChange?: (x: number, y: number) => void;
  /** 是否使用父窗口尺寸（跨 iframe 场景） */
  useParentWindow?: boolean;
}

export interface AutoHeightOptions {
  /** 最小高度 */
  minHeight?: number;
  /** 最大高度比例（相对于视口） */
  maxHeightRatio?: number;
  /** 额外内边距 */
  padding?: number;
  /** 高度变化回调 */
  onHeightChange?: (height: number) => void;
  /** 是否使用父窗口尺寸 */
  useParentWindow?: boolean;
}

/** 面板类型 */
export type PanelType = 'normal' | 'dashboard' | 'options';

export interface SmartHeightOptions {
  /** 最小高度 (默认 200) */
  minHeight?: number;
  /** 最大高度比例，相对于视口 (默认 0.8) */
  maxHeightRatio?: number;
  /** 顶栏高度 (默认 42) */
  headerHeight?: number;
  /** 分页器高度 (默认 56) */
  paginationHeight?: number;
  /** 内容区内边距 (默认 25) */
  contentPadding?: number;
  /** 高度变化回调 */
  onHeightChange?: (height: number) => void;
}

export interface DebouncedSaveOptions {
  /** 防抖延迟（毫秒） */
  delay?: number;
  /** 深度监听 */
  deep?: boolean;
  /** 保存成功回调 */
  onSuccess?: () => void;
  /** 保存失败回调 */
  onError?: (error: unknown) => void;
}

// ============================================================
// 可拖拽 + 边缘吸附
// ============================================================

/**
 * 可拖拽 + 边缘吸附
 *
 * 封装 VueUse 的 useDraggable，增加了边缘吸附功能。
 * 支持跨 iframe 场景，可以使用父窗口的尺寸进行计算。
 *
 * @example
 * ```vue
 * <script setup>
 * const ballRef = ref<HTMLElement>();
 * const { x, y, style, isDragging } = useDraggableWithSnap(ballRef, {
 *   initialX: 100,
 *   initialY: 100,
 *   useParentWindow: true,
 *   onPositionChange: (x, y) => console.log('位置变化:', x, y)
 * });
 * </script>
 * <template>
 *   <div ref="ballRef" :style="style">悬浮球</div>
 * </template>
 * ```
 */
export function useDraggableWithSnap(target: Ref<HTMLElement | undefined>, options: DraggableWithSnapOptions = {}) {
  const {
    initialX = 100,
    initialY = 100,
    edgePadding = 10,
    elementWidth = 50,
    onPositionChange,
    useParentWindow = false,
  } = options;

  // 获取目标窗口（支持跨 iframe）
  const getTargetWindow = () => {
    if (useParentWindow && window.parent && window.parent !== window) {
      return window.parent;
    }
    return window;
  };

  // 获取目标文档（用于事件绑定）
  const getTargetDocument = () => {
    return getTargetWindow().document;
  };

  // 获取屏幕尺寸
  const getScreenSize = () => {
    const targetWindow = getTargetWindow();
    return {
      width: targetWindow.innerWidth,
      height: targetWindow.innerHeight,
    };
  };

  // 计算吸附阈值
  const getSnapThreshold = () => {
    return options.snapThreshold ?? getScreenSize().width / 2;
  };

  // 记录拖拽状态
  const wasDragging = ref(false);

  // 记录拖拽起始位置（用于判断是否真正拖拽）
  let dragStartX = 0;
  let dragStartY = 0;
  const DRAG_THRESHOLD = 5; // 移动超过 5 像素才算拖拽

  // 使用父窗口文档作为拖拽容器（解决跨 iframe 问题）
  const draggingElement = computed(() => {
    if (useParentWindow) {
      try {
        return getTargetDocument();
      } catch {
        return document;
      }
    }
    return document;
  });

  const { x, y, isDragging } = useDraggable(target, {
    initialValue: {
      x: initialX,
      y: initialY,
    },
    // 关键：在父窗口文档上监听拖拽事件
    draggingElement,
    onStart(_position, event) {
      wasDragging.value = false;
      // 使用鼠标位置而非元素位置，避免跨 iframe 坐标问题
      dragStartX = (event as PointerEvent).clientX;
      dragStartY = (event as PointerEvent).clientY;
    },
    onMove(_position, event) {
      // 只有鼠标移动距离超过阈值才认为是拖拽
      const mouseX = (event as PointerEvent).clientX;
      const mouseY = (event as PointerEvent).clientY;
      const dx = Math.abs(mouseX - dragStartX);
      const dy = Math.abs(mouseY - dragStartY);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        wasDragging.value = true;
      }
    },
    onEnd() {
      if (wasDragging.value) {
        const { width: screenWidth, height: screenHeight } = getScreenSize();

        // 只做边界检查，不做边缘吸附
        // 悬浮球拖到哪里就停在哪里

        // 水平边界检查
        if (x.value < edgePadding) {
          x.value = edgePadding;
        }
        if (x.value > screenWidth - elementWidth - edgePadding) {
          x.value = screenWidth - elementWidth - edgePadding;
        }

        // 垂直边界检查
        if (y.value < edgePadding) {
          y.value = edgePadding;
        }
        if (y.value > screenHeight - elementWidth - edgePadding) {
          y.value = screenHeight - elementWidth - edgePadding;
        }

        // 触发回调保存位置
        onPositionChange?.(x.value, y.value);

        // 注意：不在这里重置 wasDragging，让组件的 click handler 处理
        // 这样可以正确区分拖拽结束和点击事件
      }
    },
  });

  // 计算样式
  const style = computed(() => ({
    left: `${x.value}px`,
    top: `${y.value}px`,
    cursor: isDragging.value ? 'grabbing' : 'grab',
  }));

  return {
    x,
    y,
    isDragging,
    wasDragging,
    style,
    /** 重置到初始位置 */
    reset: () => {
      x.value = initialX;
      y.value = initialY;
      onPositionChange?.(x.value, y.value);
    },
  };
}

// ============================================================
// 自动高度调整
// ============================================================

/**
 * 自动高度调整
 *
 * 使用 ResizeObserver 监听内容区域尺寸变化，
 * 自动计算并调整容器高度。
 *
 * @example
 * ```vue
 * <script setup>
 * const contentRef = ref<HTMLElement>();
 * const { height, heightStyle } = useAutoHeight(contentRef, {
 *   minHeight: 200,
 *   maxHeightRatio: 0.8,
 *   onHeightChange: (h) => console.log('高度变化:', h)
 * });
 * </script>
 * <template>
 *   <div :style="heightStyle">
 *     <div ref="contentRef">内容区域</div>
 *   </div>
 * </template>
 * ```
 */
export function useAutoHeight(contentRef: Ref<HTMLElement | undefined>, options: AutoHeightOptions = {}) {
  const { minHeight = 200, maxHeightRatio = 0.8, padding = 100, onHeightChange, useParentWindow = false } = options;

  const height = ref(minHeight);

  // 获取目标窗口高度
  const getParentHeight = () => {
    if (useParentWindow && window.parent && window.parent !== window) {
      return window.parent.innerHeight;
    }
    return window.innerHeight;
  };

  // 监听内容尺寸变化
  useResizeObserver(contentRef, entries => {
    const entry = entries[0];
    if (!entry) return;

    const contentHeight = entry.contentRect.height;
    const parentHeight = getParentHeight();
    const maxHeight = parentHeight * maxHeightRatio;

    const newHeight = Math.max(minHeight, Math.min(contentHeight + padding, maxHeight));

    height.value = newHeight;
    onHeightChange?.(newHeight);
  });

  // 计算高度样式
  const heightStyle = computed(() => ({
    height: `${height.value}px`,
    maxHeight: `${getParentHeight() * maxHeightRatio}px`,
  }));

  return {
    height,
    heightStyle,
    /** 重置高度 */
    reset: () => {
      height.value = minHeight;
      onHeightChange?.(minHeight);
    },
  };
}

// ============================================================
// 智能高度调整
// ============================================================

/**
 * 智能高度调整
 *
 * 根据面板类型和配置智能计算高度：
 * - 普通面板：顶栏高度 + 内容高度 + 分页器(可选) + padding，clamp 在 [min, max] 范围内
 * - 仪表盘：直接使用最大高度（视口 * 0.8）
 *
 * @param contentRef - 内容区域元素引用
 * @param panelType - 面板类型（normal/dashboard/options）
 * @param showPagination - 是否显示分页器（从 configStore 获取）
 * @param options - 配置选项
 *
 * @example
 * ```vue
 * <script setup>
 * const contentRef = ref<HTMLElement>();
 * const configStore = useConfigStore();
 * const panelType = computed(() => activeTab.value === 'dashboard' ? 'dashboard' : 'normal');
 *
 * const { height, heightStyle } = useSmartHeight(
 *   contentRef,
 *   panelType,
 *   computed(() => configStore.config.showPagination),
 *   {
 *     onHeightChange: (h) => console.log('高度变化:', h)
 *   }
 * );
 * </script>
 * <template>
 *   <div :style="heightStyle">
 *     <div ref="contentRef">内容区域</div>
 *   </div>
 * </template>
 * ```
 */
export function useSmartHeight(
  contentRef: Ref<HTMLElement | undefined>,
  panelType: Ref<PanelType> | PanelType,
  showPagination: Ref<boolean> | boolean,
  options: SmartHeightOptions = {},
) {
  const {
    minHeight = 200,
    maxHeightRatio = 0.8,
    headerHeight = 42,
    paginationHeight = 56,
    contentPadding = 25,
    onHeightChange,
  } = options;

  const height = ref(minHeight);

  // 获取父窗口高度（跨 iframe 支持）
  const getParentHeight = () => {
    if (window.parent && window.parent !== window) {
      return window.parent.innerHeight;
    }
    return window.innerHeight;
  };

  // 计算最大高度
  const getMaxHeight = () => {
    return getParentHeight() * maxHeightRatio;
  };

  // 获取面板类型值
  const getPanelType = (): PanelType => {
    return typeof panelType === 'string' ? panelType : panelType.value;
  };

  // 获取分页器显示状态
  const getShowPagination = (): boolean => {
    return typeof showPagination === 'boolean' ? showPagination : showPagination.value;
  };

  // 监听内容尺寸变化
  useResizeObserver(contentRef, entries => {
    const entry = entries[0];
    if (!entry) return;

    const currentPanelType = getPanelType();

    // 仪表盘直接使用最大高度
    if (currentPanelType === 'dashboard') {
      const maxH = getMaxHeight();
      console.info('[ACU useSmartHeight] 仪表盘高度计算:', {
        maxH,
        parentHeight: getParentHeight(),
        ratio: maxHeightRatio,
      });
      height.value = maxH;
      onHeightChange?.(maxH);
      return;
    }

    // 普通面板和选项面板：计算实际需要的高度
    const contentHeight = entry.contentRect.height;
    const paginationH = getShowPagination() ? paginationHeight : 0;

    // 计算总高度：顶栏 + 内容 + 内容内边距 + 分页器
    const totalHeight = headerHeight + contentHeight + contentPadding + paginationH;

    // Clamp 在 [minHeight, maxHeight] 范围内
    const maxH = getMaxHeight();
    const newHeight = Math.max(minHeight, Math.min(totalHeight, maxH));

    height.value = newHeight;
    onHeightChange?.(newHeight);
  });

  // 监听面板类型变化
  if (typeof panelType !== 'string') {
    watch(panelType, newType => {
      if (newType === 'dashboard') {
        const maxH = getMaxHeight();
        console.info('[ACU useSmartHeight] 切换到仪表盘，设置高度:', maxH);
        height.value = maxH;
        onHeightChange?.(maxH);
      }
    });
  }

  // 监听分页器显示状态变化
  if (typeof showPagination !== 'boolean') {
    watch(showPagination, () => {
      // 触发重新计算（通过读取当前内容高度）
      if (contentRef.value) {
        const contentHeight = contentRef.value.scrollHeight;
        const currentPanelType = getPanelType();

        if (currentPanelType !== 'dashboard') {
          const paginationH = getShowPagination() ? paginationHeight : 0;
          const totalHeight = headerHeight + contentHeight + contentPadding + paginationH;
          const maxH = getMaxHeight();
          const newHeight = Math.max(minHeight, Math.min(totalHeight, maxH));

          height.value = newHeight;
          onHeightChange?.(newHeight);
        }
      }
    });
  }

  // 计算高度样式
  const heightStyle = computed(() => ({
    height: `${height.value}px`,
    maxHeight: `${getMaxHeight()}px`,
  }));

  return {
    /** 当前计算的高度 */
    height,
    /** 高度样式对象 */
    heightStyle,
    /** 最大高度 */
    maxHeight: computed(() => getMaxHeight()),
    /** 重置到最小高度 */
    reset: () => {
      height.value = minHeight;
      onHeightChange?.(minHeight);
    },
    /** 设置为最大高度 */
    maximize: () => {
      const maxH = getMaxHeight();
      height.value = maxH;
      onHeightChange?.(maxH);
    },
    /** 手动触发重新计算 */
    recalculate: () => {
      if (contentRef.value) {
        const currentPanelType = getPanelType();

        if (currentPanelType === 'dashboard') {
          const maxH = getMaxHeight();
          height.value = maxH;
          onHeightChange?.(maxH);
        } else {
          const contentHeight = contentRef.value.scrollHeight;
          const paginationH = getShowPagination() ? paginationHeight : 0;
          const totalHeight = headerHeight + contentHeight + contentPadding + paginationH;
          const maxH = getMaxHeight();
          const newHeight = Math.max(minHeight, Math.min(totalHeight, maxH));

          height.value = newHeight;
          onHeightChange?.(newHeight);
        }
      }
    },
  };
}

// ============================================================
// 复制到剪贴板（带反馈）
// ============================================================

/**
 * 复制到剪贴板（带反馈）
 *
 * 封装 VueUse 的 useClipboard，增加了 toastr 提示反馈。
 *
 * @example
 * ```vue
 * <script setup>
 * const { copyWithToast, copied } = useCopyWithFeedback();
 *
 * const handleCopy = async () => {
 *   const success = await copyWithToast('要复制的文本');
 *   if (success) {
 *     console.log('复制成功');
 *   }
 * };
 * </script>
 * ```
 */
export function useCopyWithFeedback() {
  const { copy, copied, isSupported } = useClipboard();

  /**
   * 复制并显示 toast 提示
   */
  const copyWithToast = async (text: string, successMessage = '已复制到剪贴板'): Promise<boolean> => {
    // 延迟导入避免循环依赖
    const { toast } = await import('./useToast');

    if (!isSupported.value) {
      console.warn('[ACU] 剪贴板 API 不支持');
      toast.warning('剪贴板功能不可用');
      return false;
    }

    try {
      await copy(text);

      if (copied.value) {
        toast.success(successMessage);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[ACU] 复制失败:', error);
      toast.error('复制失败');
      return false;
    }
  };

  return {
    copyWithToast,
    copied,
    isSupported,
    /** 原始复制方法 */
    copy,
  };
}

// ============================================================
// 防误触选词检测
// ============================================================

/**
 * 防误触选词检测
 *
 * 检测用户是否正在选择文本，用于防止误触发其他交互。
 *
 * @example
 * ```vue
 * <script setup>
 * const { isSelecting, shouldBlockInteraction } = useSelectionGuard();
 *
 * const handleClick = () => {
 *   if (shouldBlockInteraction()) return;
 *   // 执行点击逻辑
 * };
 * </script>
 * ```
 */
export function useSelectionGuard() {
  const { text } = useTextSelection();

  const isSelecting = computed(() => text.value.length > 0);

  /**
   * 检查是否应该阻止交互
   */
  const shouldBlockInteraction = () => isSelecting.value;

  return {
    /** 当前选中的文本 */
    selectedText: text,
    /** 是否正在选择文本 */
    isSelecting,
    /** 是否应该阻止交互 */
    shouldBlockInteraction,
  };
}

// ============================================================
// 父窗口事件监听
// ============================================================

/**
 * 父窗口事件监听（自动清理）
 *
 * 用于在 iframe 中监听父窗口事件，组件卸载时自动解绑。
 *
 * @example
 * ```vue
 * <script setup>
 * useParentEventListener('resize', () => {
 *   console.log('父窗口尺寸变化');
 * });
 *
 * useParentEventListener('keydown', (e) => {
 *   if (e.key === 'Escape') {
 *     console.log('按下 Escape');
 *   }
 * });
 * </script>
 * ```
 */
export function useParentEventListener<K extends keyof WindowEventMap>(
  event: K,
  handler: (e: WindowEventMap[K]) => void,
  options?: AddEventListenerOptions,
) {
  const targetWindow = window.parent && window.parent !== window ? window.parent : window;

  return useEventListener(targetWindow, event, handler, options);
}

/**
 * 父窗口文档事件监听
 */
export function useParentDocumentEventListener<K extends keyof DocumentEventMap>(
  event: K,
  handler: (e: DocumentEventMap[K]) => void,
  options?: AddEventListenerOptions,
) {
  const targetDocument = window.parent && window.parent !== window ? window.parent.document : document;

  return useEventListener(targetDocument, event, handler, options);
}

// ============================================================
// 防抖保存
// ============================================================

/**
 * 防抖保存
 *
 * 监听数据变化，防抖后自动保存。
 *
 * @example
 * ```vue
 * <script setup>
 * const data = ref({ name: 'test' });
 *
 * useDebouncedSave(
 *   () => data.value,
 *   async (data) => {
 *     await saveToServer(data);
 *   },
 *   {
 *     delay: 500,
 *     onSuccess: () => console.log('保存成功'),
 *     onError: (err) => console.error('保存失败', err)
 *   }
 * );
 * </script>
 * ```
 */
export function useDebouncedSave<T>(
  source: MaybeRefOrGetter<T>,
  saveFn: (data: T) => void | Promise<void>,
  options: DebouncedSaveOptions = {},
) {
  const { delay = 500, deep = true, onSuccess, onError } = options;

  const isSaving = ref(false);
  const lastError = ref<unknown>(null);

  watchDebounced(
    source,
    async newValue => {
      isSaving.value = true;
      lastError.value = null;

      try {
        await saveFn(newValue);
        onSuccess?.();
      } catch (error) {
        lastError.value = error;
        console.error('[ACU] 保存失败:', error);
        onError?.(error);
      } finally {
        isSaving.value = false;
      }
    },
    { debounce: delay, deep },
  );

  return {
    /** 是否正在保存 */
    isSaving,
    /** 最后的错误 */
    lastError,
  };
}

// ============================================================
// 持久化存储助手
// ============================================================

/**
 * 创建带命名空间的持久化存储
 *
 * @example
 * ```vue
 * <script setup>
 * const position = useACUStorage('ball_position', { x: 100, y: 100 });
 * </script>
 * ```
 */
export function useACUStorage<T>(key: string, defaultValue: T) {
  return useStorage<T>(`acu_${key}`, defaultValue);
}

// ============================================================
// 点击外部关闭增强
// ============================================================

/**
 * 点击外部关闭（带回调）
 *
 * 封装 onClickOutside，支持更灵活的配置。
 *
 * @example
 * ```vue
 * <script setup>
 * const menuRef = ref<HTMLElement>();
 * const visible = ref(true);
 *
 * useClickOutsideClose(menuRef, () => {
 *   visible.value = false;
 * }, {
 *   ignore: ['.acu-trigger-button']
 * });
 * </script>
 * ```
 */
export function useClickOutsideClose(
  target: Ref<HTMLElement | undefined>,
  callback: () => void,
  options?: {
    /** 忽略的元素选择器 */
    ignore?: string[];
    /** 是否监听 */
    enabled?: Ref<boolean> | boolean;
  },
) {
  const { ignore = [], enabled = true } = options ?? {};

  onClickOutside(
    target,
    event => {
      // 检查是否启用
      const isEnabled = typeof enabled === 'boolean' ? enabled : enabled.value;
      if (!isEnabled) return;

      // 检查是否应该忽略
      const clickedElement = event.target as HTMLElement;
      const shouldIgnore = ignore.some(selector => clickedElement.closest(selector));

      if (!shouldIgnore) {
        callback();
      }
    },
    { ignore },
  );
}

// ============================================================
// 导出 VueUse 原始功能（方便统一导入）
// ============================================================

export {
  onClickOutside,
  useClipboard,
  useDebounceFn,
  useDraggable,
  useEventListener,
  useResizeObserver,
  useStorage,
  useTextSelection,
  useThrottleFn,
  watchDebounced,
};
