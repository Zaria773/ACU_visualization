/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 移动端手势系统 (VueUse 实现)
 *
 * 实现滑动新增/删除行、防误触等功能
 *
 * 手势规格说明：
 * - 横向布局：下拉（在顶部）新增行，上划到底后继续拉切换删除标记
 * - 竖向布局：右滑切换删除标记，左滑新增行
 * - 编辑：点按单元格触发，长按保留给系统复制功能
 */

import { useSwipe, useTextSelection, type UseSwipeDirection } from '@vueuse/core';
import { computed, onUnmounted, ref, watch, type Ref } from 'vue';

// ============================================================
// 类型定义
// ============================================================

export interface MobileGestureOptions {
  /** 布局方向 */
  layout: 'horizontal' | 'vertical';
  /** 滑动阈值（像素） */
  threshold?: number;
  /** 边缘检测阈值（像素） */
  edgeThreshold?: number;
  /** 新增行回调 */
  onInsertRow?: () => void;
  /** 切换删除标记回调 */
  onToggleDelete?: () => void;
}

export interface CardGestureOptions {
  /** 布局方向 */
  layout: 'horizontal' | 'vertical';
  /** 新增行回调 */
  onInsertRow: () => void;
  /** 切换删除标记回调 */
  onToggleDelete: () => void;
  /**
   * 横向布局滑动阈值（像素，默认 50）
   * 原版: topH > 50 / botH > 50
   */
  horizontalThreshold?: number;
  /**
   * 竖向布局滑动阈值（像素，默认 40）
   * 原版: leftW > 40 / rightW > 40
   */
  verticalThreshold?: number;
  /** 边缘检测阈值（像素，默认 5） */
  edgeThreshold?: number;
  /**
   * 长按判定时间（毫秒，默认 400）
   * 原版: 400ms
   */
  longPressDelay?: number;
  /**
   * 取消长按的移动阈值（像素，默认 5）
   * 原版: Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5
   */
  longPressCancelThreshold?: number;
}

export interface GestureState {
  /** 是否正在滑动 */
  isSwiping: Ref<boolean>;
  /** 是否正在选词 */
  isSelecting: Ref<boolean>;
  /** 是否在边缘 */
  isAtEdge: Ref<boolean>;
  /** 滑动方向 */
  direction: Ref<UseSwipeDirection | null>;
  /** 当前手势类型 */
  gestureType: Ref<'insert' | 'delete' | null>;
}

// ============================================================
// 移动端手势 Composable (容器级别)
// ============================================================

/**
 * 移动端手势系统 - 容器级别
 *
 * 用于在数据表格容器上监听手势事件
 *
 * @example
 * ```vue
 * <script setup>
 * const containerRef = ref<HTMLElement>();
 * const { isSwiping, isSelecting, gestureType } = useMobileGestures(containerRef, {
 *   layout: 'horizontal',
 *   threshold: 80,
 *   onInsertRow: () => console.log('新增行'),
 *   onToggleDelete: () => console.log('切换删除'),
 * });
 * </script>
 * ```
 */
export function useMobileGestures(target: Ref<HTMLElement | undefined>, options: MobileGestureOptions): GestureState {
  const { layout, threshold = 80, edgeThreshold = 10, onInsertRow, onToggleDelete } = options;

  // 选词检测（防误触）
  const { text: selectedText } = useTextSelection();
  const isSelecting = computed(() => selectedText.value.length > 0);

  // 边缘状态
  const isAtEdge = ref(false);
  const scrollDirection = ref<'start' | 'end' | null>(null);

  // 手势类型
  const gestureType = ref<'insert' | 'delete' | null>(null);

  /**
   * 检测是否滚动到边缘
   */
  const checkScrollEdge = (element: HTMLElement) => {
    if (layout === 'horizontal') {
      // 横向布局：检测上下边缘
      const atTop = element.scrollTop <= edgeThreshold;
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - edgeThreshold;

      isAtEdge.value = atTop || atBottom;
      scrollDirection.value = atTop ? 'start' : atBottom ? 'end' : null;
    } else {
      // 竖向布局：检测左右边缘
      const atLeft = element.scrollLeft <= edgeThreshold;
      const atRight = element.scrollLeft + element.clientWidth >= element.scrollWidth - edgeThreshold;

      isAtEdge.value = atLeft || atRight;
      scrollDirection.value = atLeft ? 'start' : atRight ? 'end' : null;
    }
  };

  /**
   * 处理滑动完成
   */
  const handleSwipeComplete = (dir: UseSwipeDirection, lengthX: number, lengthY: number) => {
    if (isSelecting.value) {
      console.info('[ACU Mobile] 选词中，跳过手势处理');
      return;
    }

    if (layout === 'horizontal' && dir === 'down' && lengthY > threshold && scrollDirection.value === 'start') {
      // 横向布局 - 下拉（在顶部）：新增行
      console.info('[ACU Mobile] 下拉手势触发 - 新增行');
      gestureType.value = 'insert';
      onInsertRow?.();
    } else if (layout === 'horizontal' && dir === 'up' && lengthY > threshold && scrollDirection.value === 'end') {
      // 横向布局 - 上划到底后继续拉：切换删除标记
      console.info('[ACU Mobile] 上划到底手势触发 - 切换删除');
      gestureType.value = 'delete';
      onToggleDelete?.();
    } else if (layout === 'vertical' && dir === 'right' && lengthX > threshold) {
      // 竖向布局 - 右滑：切换删除标记（与原版一致）
      console.info('[ACU Mobile] 右滑手势触发 - 切换删除');
      gestureType.value = 'delete';
      onToggleDelete?.();
    } else if (layout === 'vertical' && dir === 'left' && lengthX > threshold) {
      // 竖向布局 - 左滑：新增行（与原版一致）
      console.info('[ACU Mobile] 左滑手势触发 - 新增行');
      gestureType.value = 'insert';
      onInsertRow?.();
    }

    // 延迟重置手势类型
    setTimeout(() => {
      gestureType.value = null;
    }, 300);
  };

  // 使用 VueUse 的 useSwipe
  const { direction, lengthX, lengthY, isSwiping } = useSwipe(target, {
    passive: false,
    threshold: 10,
    onSwipeStart(e) {
      // 选词时阻止手势
      if (isSelecting.value) {
        e.preventDefault();
        return;
      }

      // 检测当前滚动位置
      if (target.value) {
        checkScrollEdge(target.value);
      }
    },
    onSwipe(_e) {
      if (isSelecting.value) return;

      // 实时更新边缘状态
      if (target.value) {
        checkScrollEdge(target.value);
      }
    },
    onSwipeEnd(_e, dir) {
      if (isSelecting.value) return;
      if (dir) {
        handleSwipeComplete(dir, Math.abs(lengthX.value), Math.abs(lengthY.value));
      }
    },
  });

  return {
    isSwiping,
    isSelecting,
    isAtEdge,
    direction,
    gestureType,
  };
}

// ============================================================
// 卡片级别手势 Composable
// ============================================================

/**
 * 卡片级别手势 - 原生 Touch 事件实现
 *
 * 用于单个 DataCard 组件上的手势检测
 * 与原版 6.4.1.ts 的逻辑保持一致
 */
export function useCardGestures(cardRef: Ref<HTMLElement | undefined>, options: CardGestureOptions) {
  const {
    layout,
    onInsertRow,
    onToggleDelete,
    // 原版参数：横向 50px，竖向 40px
    horizontalThreshold = 50,
    verticalThreshold = 40,
    edgeThreshold = 5,
    // 原版参数：长按 400ms
    longPressDelay = 400,
    // 原版参数：移动 5px 取消长按
    longPressCancelThreshold = 5,
  } = options;

  // 根据布局选择阈值
  const threshold = layout === 'horizontal' ? horizontalThreshold : verticalThreshold;

  // 选词检测（使用 VueUse）
  const { text } = useTextSelection();
  const isSelectingVueUse = computed(() => text.value.length > 0);

  // 边缘状态（初始化为 false，在 touchstart 时通过 checkScrollEdge 更新）
  const scrolledToEdge = ref(false);
  const atStart = ref(false);
  const atEnd = ref(false);

  // 手势类型（用于显示提示）
  const gestureType = ref<'insert' | 'delete' | null>(null);

  // 触摸状态
  const isSwiping = ref(false);
  const touchStartX = ref(0);
  const touchStartY = ref(0);
  const lengthX = ref(0);
  const lengthY = ref(0);

  // ============================================================
  // 【方向锁定机制】：解决长卡片横向滚动问题
  // 当滑动超过阈值后锁定方向，确保后续 touchmove 方向判断稳定
  // ============================================================
  const directionLocked = ref<'horizontal' | 'vertical' | null>(null);
  const DIRECTION_LOCK_THRESHOLD = 10; // 移动超过 10px 锁定方向

  // ============================================================
  // 【手势锁定机制】：解决短卡片视觉反馈抽搐问题
  // 一旦进入手势状态，就锁定该手势，直到用户松手
  // ============================================================
  const gestureLocked = ref(false);

  // ============================================================
  // 【修复问题2】：记录初始尺寸，避免视觉反馈元素影响 scrollHeight 判定
  // 问题：.acu-pull-overlay 元素高度变化会改变 scrollHeight，导致短卡片判定失效
  // 解决：在 touchstart 时记录初始尺寸，后续判定基于初始值
  // ============================================================
  const initialScrollHeight = ref(0);
  const initialClientHeight = ref(0);
  const initialIsShortCard = ref(false);

  // 【横向布局横滑】：父容器滚动支持
  const parentScrollStart = ref(0); // touchstart 时父容器的 scrollLeft
  const parentScrollContainer = ref<HTMLElement | null>(null); // 父滚动容器

  // ============================================================
  // 【原版核心机制】：shouldBlockClick 持久锁
  // 这个锁不会自动过期，只有在下一次 touchstart 时才会重置
  // ============================================================
  const shouldBlockClick = ref(false);

  // 长按判定
  const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);
  const isSelectionMode = ref(false);

  /**
   * 检测滚动到边缘
   */
  const checkScrollEdge = (e?: Event) => {
    const target = e?.currentTarget as HTMLElement | undefined;
    const el = target || cardRef.value;
    if (!el) return;

    if (layout === 'horizontal') {
      // 横向布局：检测上下滚动边缘
      atStart.value = el.scrollTop <= edgeThreshold;
      atEnd.value = el.scrollTop + el.clientHeight >= el.scrollHeight - edgeThreshold;
    } else {
      // 竖向布局：检测左右滚动边缘
      atStart.value = el.scrollLeft <= edgeThreshold;
      atEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - edgeThreshold;
    }

    scrolledToEdge.value = atStart.value || atEnd.value;
  };

  /**
   * 检测原生选区（原版使用 window.getSelection()）
   */
  const hasNativeSelection = (): boolean => {
    const selection = window.getSelection();
    return selection ? selection.toString().length > 0 : false;
  };

  /**
   * 综合检测是否正在选词
   */
  const isSelecting = computed(() => isSelectingVueUse.value || hasNativeSelection());

  /**
   * 触摸开始
   * 原版逻辑：重置所有状态，开启长按计时
   */
  const handleTouchStart = (e: TouchEvent) => {
    const el = cardRef.value;
    if (!el) return;

    // 【原版重置一切】：新的一次触摸开始了，把之前的状态清空
    shouldBlockClick.value = false;
    isSelectionMode.value = false;
    gestureType.value = null;
    directionLocked.value = null; // 重置方向锁定
    gestureLocked.value = false; // 重置手势锁定

    // 清除之前的长按计时器
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value);
      longPressTimer.value = null;
    }

    // 【原版逻辑】：如果开始触摸时，屏幕上已经有选区了，直接锁死点击
    if (hasNativeSelection()) {
      shouldBlockClick.value = true;
    }

    const touch = e.touches[0];
    touchStartX.value = touch.clientX;
    touchStartY.value = touch.clientY;
    lengthX.value = 0;
    lengthY.value = 0;
    isSwiping.value = true;

    // 【横向布局横滑】：记录父容器初始状态
    if (layout === 'horizontal') {
      const scrollContainer = el.closest('.acu-data-display') as HTMLElement | null;
      parentScrollContainer.value = scrollContainer;
      parentScrollStart.value = scrollContainer?.scrollLeft ?? 0;
    }

    // 【关键修复】：先初始化边缘检测，确保 atStart/atEnd 在 touchmove 前有正确的初始值
    // 这解决了"下拉删除视觉反馈抽搐"问题：因为 atStart 初始为 true，导致第一次 touchmove 就认为在顶部
    checkScrollEdge();

    // 【修复问题2】：记录初始尺寸（在视觉反馈元素高度为 0 时）
    initialScrollHeight.value = el.scrollHeight;
    initialClientHeight.value = el.clientHeight;
    initialIsShortCard.value = el.scrollHeight <= el.clientHeight + 2;

    // 【原版逻辑】：开启长按计时（400ms）
    longPressTimer.value = setTimeout(() => {
      isSelectionMode.value = true;
      // 长按触发瞬间，就把锁加上
      shouldBlockClick.value = true;
    }, longPressDelay);
  };

  /**
   * 触摸移动
   * 原版逻辑：检测选词、更新手势提示
   */
  const handleTouchMove = (e: TouchEvent) => {
    const el = cardRef.value;
    if (!el || !isSwiping.value) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX.value;
    const deltaY = touch.clientY - touchStartY.value;

    lengthX.value = deltaX;
    lengthY.value = deltaY;

    // 【原版逻辑】：移动超过 5px，取消长按判定
    if (Math.abs(deltaX) > longPressCancelThreshold || Math.abs(deltaY) > longPressCancelThreshold) {
      if (longPressTimer.value) {
        clearTimeout(longPressTimer.value);
        longPressTimer.value = null;
      }
    }

    // 【原版阻断逻辑】：如果已经判定要锁点击（比如选词中），或者有原生选区
    const nativeSelection = hasNativeSelection();
    if (shouldBlockClick.value || isSelectionMode.value || nativeSelection) {
      shouldBlockClick.value = true; // 持续加锁
      return; // 放行浏览器原生行为，不执行下拉/侧滑手势
    }

    // 实时更新边缘检测
    checkScrollEdge();

    // ============================================================
    // 【方向锁定】：滑动超过阈值后锁定方向
    // 这确保了长卡片横向滚动时不会被后续的轻微纵向偏移干扰
    // ============================================================
    if (
      !directionLocked.value &&
      (Math.abs(deltaX) > DIRECTION_LOCK_THRESHOLD || Math.abs(deltaY) > DIRECTION_LOCK_THRESHOLD)
    ) {
      directionLocked.value = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      console.info('[ACU Card] 方向锁定为:', directionLocked.value);
    }

    if (layout === 'horizontal') {
      const scrollTop = el.scrollTop;

      // 【修复问题2】：使用初始尺寸判定短卡片，避免视觉反馈元素影响
      const isShortCard = initialIsShortCard.value;

      // ============================================================
      // 【修复】短卡片也使用方向锁定机制
      // 问题：之前短卡片每次 touchmove 都重新判断方向，导致手指微小偏移时手势不稳定
      // 解决：短卡片也使用方向锁定，一旦锁定纵向就不再改变
      // ============================================================
      if (isShortCard) {
        // 【方向锁定】：滑动超过阈值后锁定方向（与长卡片一致）
        if (
          !directionLocked.value &&
          (Math.abs(deltaX) > DIRECTION_LOCK_THRESHOLD || Math.abs(deltaY) > DIRECTION_LOCK_THRESHOLD)
        ) {
          directionLocked.value = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
          console.info('[ACU Card] 短卡片方向锁定为:', directionLocked.value);
        }

        // 如果锁定为横向，处理父容器滚动
        if (directionLocked.value === 'horizontal') {
          if (!gestureLocked.value) {
            gestureType.value = null;
          }
          // 手动滚动父容器
          if (parentScrollContainer.value) {
            parentScrollContainer.value.scrollLeft = parentScrollStart.value - deltaX;
          }
          return; // 不触发自定义手势
        }

        // 如果锁定为纵向，或者还没锁定但是纵向意图明显
        if (directionLocked.value === 'vertical' || (directionLocked.value === null && Math.abs(deltaY) > 5)) {
          // 阻止默认行为
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();

          // 【原版系数】：deltaY * 0.6，预览阈值约 30px
          const displayHeight = Math.abs(deltaY) * 0.6;
          const newGestureType = deltaY > 0 ? 'insert' : 'delete';

          // 【修复问题3.2/3.3】：允许方向变化时更新 gestureType
          // 问题：之前手势锁定后 gestureType 不再更新，导致方向变化时视觉反馈与实际不一致
          // 解决：始终根据当前方向更新 gestureType
          if (displayHeight > 30) {
            gestureType.value = newGestureType;
            gestureLocked.value = true;
          } else if (!gestureLocked.value) {
            // 未达到阈值且未锁定，清空
            gestureType.value = null;
          }
          // 注意：已锁定但未达到阈值时，保持当前 gestureType（避免抽搐）
        }

        return; // 短卡片处理完毕，不再执行后续逻辑
      }

      // ============================================================
      // 长卡片：保持原有的方向锁定逻辑
      // ============================================================

      // 【修复】横向布局下，如果方向锁定为横向，手动滚动父容器
      // 浏览器不会自动将卡片上的触摸事件传递给父容器处理滚动
      if (directionLocked.value === 'horizontal') {
        if (!gestureLocked.value) {
          gestureType.value = null;
        }

        // 手动滚动父容器
        if (parentScrollContainer.value) {
          parentScrollContainer.value.scrollLeft = parentScrollStart.value - deltaX;
        }
        return; // 不触发自定义手势
      }

      // 横向布局：检测上下拉动（只有方向锁定为纵向时才会执行到这里）
      if (directionLocked.value === 'vertical') {
        // 【修复问题1】：增加边缘检测容错（从 -1 改为 -2）
        const scrollHeight = el.scrollHeight;
        const clientHeight = el.clientHeight;

        // 下拉条件：向下拉且已在顶部
        const isPullDown = deltaY > 0 && scrollTop <= 0;
        // 上划条件：向上拉且已在底部（增加容错）
        const isPullUp = deltaY < 0 && scrollTop + clientHeight >= scrollHeight - 2;

        if (isPullDown || isPullUp) {
          // 阻止默认滚动行为
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();

          // 【原版系数】：deltaY * 0.6，预览阈值约 30px
          const displayHeight = Math.abs(deltaY) * 0.6;
          const newGestureType = isPullDown ? 'insert' : 'delete';

          // 【修复问题3.2/3.3】：允许方向变化时更新 gestureType
          if (displayHeight > 30) {
            gestureType.value = newGestureType;
            gestureLocked.value = true;
          } else if (!gestureLocked.value) {
            gestureType.value = null;
          }
        } else if (!gestureLocked.value) {
          gestureType.value = null;
        }
      }
    } else if (layout === 'vertical' && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      // 竖向布局：检测左右滑动（原版阈值 10px）
      // 阻止默认行为
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();

      // 【原版系数】：deltaX * 0.7，预览阈值约 28px (对应实际 40px)
      const displayWidth = Math.abs(deltaX) * 0.7;
      if (deltaX > 0 && displayWidth > 28) {
        // 右滑 -> 删除（与原版一致）
        gestureType.value = 'delete';
      } else if (deltaX < 0 && displayWidth > 28) {
        // 左滑 -> 新增（与原版一致）
        gestureType.value = 'insert';
      } else {
        gestureType.value = null;
      }
    }
  };

  /**
   * 触摸结束
   * 原版逻辑：最终判定是否触发操作
   */
  const handleTouchEnd = (_e: TouchEvent) => {
    const el = cardRef.value;
    if (!el) return;

    // 清除长按计时器
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value);
      longPressTimer.value = null;
    }

    const deltaX = lengthX.value;
    const deltaY = lengthY.value;

    // 【修复问题3.1】：如果方向锁定为横向，跳过纵向手势触发
    // 问题：横滑后改变方向为上/下滑时，handleTouchEnd 仍会触发增删行
    // 解决：检查 directionLocked，横向锁定时不触发纵向操作
    if (layout === 'horizontal' && directionLocked.value === 'horizontal') {
      console.info('[ACU Card TouchEnd] 方向锁定为横向，跳过纵向手势');
      isSwiping.value = false;
      gestureType.value = null;
      gestureLocked.value = false;
      return;
    }

    // 【诊断日志】记录触摸结束时的关键状态
    console.info('[ACU Card TouchEnd] 开始处理', {
      layout,
      deltaX: deltaX.toFixed(1),
      deltaY: deltaY.toFixed(1),
      threshold,
      isSelectionMode: isSelectionMode.value,
      hasNativeSelection: hasNativeSelection(),
      shouldBlockClick: shouldBlockClick.value,
      gestureType: gestureType.value,
    });

    // 【原版核心判断】：手指离开的瞬间，再次确认一下是否选了字
    // 如果有字被选中，或者刚才处于选词模式，就"永久"锁住点击
    // 这个锁直到下一次 touchstart 才会解开
    if (isSelectionMode.value || hasNativeSelection()) {
      console.info('[ACU Card TouchEnd] 选词模式，跳过手势');
      shouldBlockClick.value = true;
      isSwiping.value = false;
      gestureType.value = null;
      return;
    }

    // 如果已经锁了，就直接退出
    if (shouldBlockClick.value) {
      console.info('[ACU Card TouchEnd] shouldBlockClick 锁定，跳过手势');
      isSwiping.value = false;
      gestureType.value = null;
      return;
    }

    if (layout === 'horizontal') {
      // 横向布局：结算上下拉动
      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight;
      const clientHeight = el.clientHeight;

      // 【修复问题2】：使用初始尺寸判定短卡片
      const isShortCard = initialIsShortCard.value;

      const isPullDown = deltaY > 0 && (scrollTop <= 0 || isShortCard);
      // 【修复问题1】：增加边缘检测容错（从 -1 改为 -2）
      const isPullUp = deltaY < 0 && (scrollTop + clientHeight >= scrollHeight - 2 || isShortCard);

      console.info('[ACU Card TouchEnd] 横向布局判定', {
        scrollTop,
        scrollHeight,
        clientHeight,
        isShortCard,
        isPullDown,
        isPullUp,
        deltaY: deltaY.toFixed(1),
        threshold,
        应触发新增: isPullDown && deltaY > threshold,
        应触发删除: isPullUp && Math.abs(deltaY) > threshold,
      });

      // 【原版阈值】：横向布局 > 50px (实际检测的是 indicator height > 50)
      // 由于原版用 deltaY * 0.6 计算 height，所以实际 deltaY > 83.3 才触发
      // 但原版的判定是 topH > 50，这里保持一致用 threshold（默认 50）
      if (isPullDown && deltaY > threshold) {
        console.info('[ACU Card] 下拉触发新增行 (deltaY:', deltaY, ')');
        onInsertRow();
      } else if (isPullUp && Math.abs(deltaY) > threshold) {
        console.info('[ACU Card] 上划触发删除切换 (deltaY:', deltaY, ')');
        onToggleDelete();
      } else {
        console.info('[ACU Card TouchEnd] 横向布局未触发任何操作');
      }
    } else if (layout === 'vertical') {
      console.info('[ACU Card TouchEnd] 纵向布局判定', {
        deltaX: deltaX.toFixed(1),
        threshold,
        '应触发删除(右滑)': deltaX > threshold,
        '应触发新增(左滑)': deltaX < -threshold,
      });

      // 【原版阈值】：竖向布局 > 40px
      if (deltaX > threshold) {
        // 右滑触发删除切换（与原版一致）
        console.info('[ACU Card] 右滑触发删除切换 (deltaX:', deltaX, ')');
        onToggleDelete();
      } else if (deltaX < -threshold) {
        // 左滑触发新增行（与原版一致）
        console.info('[ACU Card] 左滑触发新增行 (deltaX:', deltaX, ')');
        onInsertRow();
      } else {
        console.info('[ACU Card TouchEnd] 纵向布局未触发任何操作');
      }
    }

    // 延迟重置
    setTimeout(() => {
      gestureType.value = null;
      gestureLocked.value = false; // 重置手势锁定
    }, 300);

    isSwiping.value = false;
  };

  // 监听 cardRef 变化，绑定事件
  watch(
    cardRef,
    (el, oldEl) => {
      // 移除旧元素的事件
      if (oldEl) {
        oldEl.removeEventListener('touchstart', handleTouchStart);
        oldEl.removeEventListener('touchmove', handleTouchMove);
        oldEl.removeEventListener('touchend', handleTouchEnd);
      }

      // 绑定新元素的事件
      if (el) {
        el.addEventListener('touchstart', handleTouchStart, { passive: true });
        el.addEventListener('touchmove', handleTouchMove, { passive: false });
        el.addEventListener('touchend', handleTouchEnd, { passive: true });

        // 初始化边缘检测
        checkScrollEdge();
      }
    },
    { immediate: true },
  );

  // 组件卸载时清理
  onUnmounted(() => {
    const el = cardRef.value;
    if (el) {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    }
    // 清除长按计时器
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value);
      longPressTimer.value = null;
    }
  });

  return {
    /** 是否正在选词（综合 VueUse 和原生 API） */
    isSelecting,
    /** 是否滚动到边缘 */
    scrolledToEdge,
    /** 是否在起始边缘 */
    atStart,
    /** 是否在结束边缘 */
    atEnd,
    /** 是否正在滑动 */
    isSwiping,
    /** 当前检测到的手势类型 */
    gestureType,
    /** 检测滚动边缘 */
    checkScrollEdge,
    /** 横向滑动距离 */
    lengthX,
    /** 纵向滑动距离 */
    lengthY,
    /** 是否应该阻止点击（用于选词保护） */
    shouldBlockClick,
    /** 是否处于选词模式 */
    isSelectionMode,
  };
}

// ============================================================
// 防误触增强
// ============================================================

/**
 * 选词防护 Composable
 *
 * 用于检测用户是否正在选择文本，防止误触发其他交互
 *
 */
export function useSelectionGuardEnhanced() {
  const { text } = useTextSelection();

  // 是否正在选择文本
  const isSelecting = computed(() => text.value.length > 0);

  // 上次选择状态（用于检测选择结束）
  const wasSelecting = ref(false);
  const selectionEndTimer = ref<ReturnType<typeof setTimeout> | null>(null);

  // 监听选择状态变化
  watch(isSelecting, newValue => {
    if (!newValue && wasSelecting.value) {
      // 选择刚结束，延迟一小段时间再允许交互
      selectionEndTimer.value = setTimeout(() => {
        wasSelecting.value = false;
      }, 100);
    } else if (newValue) {
      wasSelecting.value = true;
      if (selectionEndTimer.value) {
        clearTimeout(selectionEndTimer.value);
        selectionEndTimer.value = null;
      }
    }
  });

  /**
   * 检查是否应该阻止交互
   */
  const shouldBlockInteraction = () => {
    return isSelecting.value || wasSelecting.value;
  };

  /**
   * 清除选择
   */
  const clearSelection = () => {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  };

  return {
    /** 当前选中的文本 */
    selectedText: text,
    /** 是否正在选择文本 */
    isSelecting,
    /** 是否刚刚完成选择 */
    wasSelecting: computed(() => wasSelecting.value),
    /** 是否应该阻止交互 */
    shouldBlockInteraction,
    /** 清除选择 */
    clearSelection,
  };
}

// ============================================================
// 移动端设备检测
// ============================================================

/** 移动端检测正则 */
const MOBILE_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

/**
 * 检测是否为移动端布局
 * 优先判断屏幕宽度，其次判断 UA
 */
function checkIsMobileLayout(): boolean {
  // 优先使用宽度判断（支持 F12 模拟器切换）
  if (typeof window !== 'undefined') {
    if (window.innerWidth <= 768) return true;
    if (window.innerWidth > 1024) return false;
  }
  // 中间宽度时使用 UA 判断
  return MOBILE_REGEX.test(navigator.userAgent);
}

/**
 * 移动端设备检测
 * 响应式：当窗口宽度变化时自动更新（支持 F12 模拟器切换）
 */
export function useIsMobile() {
  const isMobile = ref(checkIsMobileLayout());

  // 监听屏幕尺寸变化（支持 F12 模拟器切换）
  if (typeof window !== 'undefined') {
    const checkMobile = () => {
      isMobile.value = checkIsMobileLayout();
    };

    window.addEventListener('resize', checkMobile);
    onUnmounted(() => {
      window.removeEventListener('resize', checkMobile);
    });
  }

  return {
    isMobile,
    /** 是否支持触摸 */
    isTouchDevice: computed(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0),
  };
}

// ============================================================
// 手势指示器工具
// ============================================================

export interface GestureIndicatorConfig {
  /** 插入图标 */
  insertIcon: string;
  /** 插入文本 */
  insertText: string;
  /** 删除图标 */
  deleteIcon: string;
  /** 删除文本 */
  deleteText: string;
  /** 撤销删除图标 */
  undoDeleteIcon: string;
  /** 撤销删除文本 */
  undoDeleteText: string;
}

/**
 * 获取手势指示器配置
 */
export function getGestureIndicatorConfig(): GestureIndicatorConfig {
  return {
    insertIcon: 'fas fa-plus-circle',
    insertText: '新增行',
    deleteIcon: 'fas fa-trash-alt',
    deleteText: '标记删除',
    undoDeleteIcon: 'fas fa-undo',
    undoDeleteText: '撤销删除',
  };
}

/**
 * 根据手势类型和删除状态获取指示器信息
 */
export function getGestureIndicator(
  gestureType: 'insert' | 'delete' | null,
  isDeleting: boolean,
): { icon: string; text: string; type: 'success' | 'danger' | 'warning' | null } | null {
  if (!gestureType) return null;

  const config = getGestureIndicatorConfig();

  if (gestureType === 'insert') {
    return {
      icon: config.insertIcon,
      text: config.insertText,
      type: 'success',
    };
  }

  if (gestureType === 'delete') {
    if (isDeleting) {
      return {
        icon: config.undoDeleteIcon,
        text: config.undoDeleteText,
        type: 'warning',
      };
    }
    return {
      icon: config.deleteIcon,
      text: config.deleteText,
      type: 'danger',
    };
  }

  return null;
}
