/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * useFullscreenSupport - 全屏模式支持
 *
 * 支持三种全屏场景：
 * 1. CSS 全屏 (position: fixed) - ACU 本身就在父窗口，只需调整 z-index
 * 2. 浏览器全屏 (requestFullscreen) - 需要将 ACU 迁移到全屏元素内
 * 3. 同层 iframe 内全屏 - 需要跨 iframe 插入 DOM 并复制样式
 *
 * 核心原理：
 * - 监听 fullscreenchange 事件
 * - 检测全屏元素的位置（主页面 or iframe 内）
 * - 将 .acu-wrapper 动态迁移到全屏元素内
 * - 同时复制必要的样式
 */

import { onMounted, onUnmounted, ref } from 'vue';
import { teleportStyle } from '@util/script';

/** 全屏状态 */
export interface FullscreenState {
  /** 是否有元素处于全屏 */
  isFullscreen: boolean;
  /** 全屏元素所在的 document（主页面或 iframe 的 document） */
  fullscreenDocument: Document | null;
  /** 全屏元素本身 */
  fullscreenElement: Element | null;
  /** ACU 是否已迁移到全屏元素内 */
  isMigrated: boolean;
}

/** ACU wrapper 的原始父元素（用于退出全屏时恢复） */
let originalParent: Element | null = null;

/** 样式清理函数 */
let styleCleanup: (() => void) | null = null;

/**
 * 全屏支持 Composable
 */
export function useFullscreenSupport() {
  const state = ref<FullscreenState>({
    isFullscreen: false,
    fullscreenDocument: null,
    fullscreenElement: null,
    isMigrated: false,
  });

  // 存储事件监听器引用，用于清理
  const eventListeners: Array<{ doc: Document; handler: () => void }> = [];
  // 存储 MutationObserver 引用
  let iframeObserver: MutationObserver | null = null;

  /**
   * 获取 ACU wrapper 元素
   */
  function getACUWrapper(): HTMLElement | null {
    const parentDoc = window.parent?.document || document;
    return parentDoc.querySelector('.acu-wrapper') as HTMLElement | null;
  }

  /**
   * 检测全屏元素
   * 优先检查流式楼层界面的 iframe
   */
  function detectFullscreenElement(): { doc: Document; element: Element | null } {
    const parentDoc = window.parent?.document || document;

    // 1. 先检查主页面的全屏元素
    const mainFullscreen = parentDoc.fullscreenElement;
    if (mainFullscreen) {
      return { doc: parentDoc, element: mainFullscreen };
    }

    // 2. 检查所有流式楼层界面的 iframe
    const streamingIframes = parentDoc.querySelectorAll('.mes_streaming iframe');
    for (const iframe of streamingIframes) {
      const iframeEl = iframe as HTMLIFrameElement;
      try {
        const iframeDoc = iframeEl.contentDocument;
        if (iframeDoc?.fullscreenElement) {
          return { doc: iframeDoc, element: iframeDoc.fullscreenElement };
        }
      } catch (e) {
        // 跨域 iframe，跳过
        console.warn('[ACU Fullscreen] Cannot access iframe:', e);
      }
    }

    return { doc: parentDoc, element: null };
  }

  /**
   * 将 ACU 迁移到全屏元素内
   */
  function migrateToFullscreen(fullscreenElement: Element, targetDoc: Document): void {
    const wrapper = getACUWrapper();
    if (!wrapper) {
      console.warn('[ACU Fullscreen] ACU wrapper not found');
      return;
    }

    // 保存原始父元素
    if (!originalParent) {
      originalParent = wrapper.parentElement;
    }

    // 如果全屏元素在 iframe 内，需要先注入样式
    if (targetDoc !== (window.parent?.document || document)) {
      console.info('[ACU Fullscreen] Fullscreen in iframe, injecting styles...');

      // 清理之前的样式注入
      if (styleCleanup) {
        styleCleanup();
        styleCleanup = null;
      }

      // 注入样式到 iframe 的 head
      const result = teleportStyle(targetDoc.head);
      styleCleanup = result.destroy;
    }

    // 迁移 wrapper 到全屏元素内
    fullscreenElement.appendChild(wrapper);

    // 确保 wrapper 在全屏元素内可见
    wrapper.style.position = 'fixed';
    wrapper.style.zIndex = '2147483647'; // 最大 z-index

    state.value.isMigrated = true;
    console.info('[ACU Fullscreen] ACU migrated to fullscreen element');
  }

  /**
   * 将 ACU 恢复到原始位置
   */
  function restoreFromFullscreen(): void {
    const wrapper = getACUWrapper();
    if (!wrapper || !originalParent) {
      return;
    }

    // 恢复到原始父元素
    originalParent.appendChild(wrapper);

    // 清理样式注入
    if (styleCleanup) {
      styleCleanup();
      styleCleanup = null;
    }

    // 恢复默认样式
    wrapper.style.position = '';
    wrapper.style.zIndex = '';

    state.value.isMigrated = false;
    originalParent = null;
    console.info('[ACU Fullscreen] ACU restored from fullscreen');
  }

  /**
   * 处理全屏变化
   */
  function handleFullscreenChange(): void {
    const { doc, element } = detectFullscreenElement();

    if (element) {
      // 进入全屏
      state.value.isFullscreen = true;
      state.value.fullscreenDocument = doc;
      state.value.fullscreenElement = element;

      // 迁移 ACU
      migrateToFullscreen(element, doc);
    } else {
      // 退出全屏
      state.value.isFullscreen = false;
      state.value.fullscreenDocument = null;
      state.value.fullscreenElement = null;

      // 恢复 ACU
      restoreFromFullscreen();
    }
  }

  /**
   * 为指定 document 添加全屏事件监听
   */
  function addFullscreenListener(doc: Document): void {
    const handler = () => handleFullscreenChange();
    doc.addEventListener('fullscreenchange', handler);
    eventListeners.push({ doc, handler });
  }

  /**
   * 扫描并监听所有 iframe
   */
  function scanAndListenIframes(): void {
    const parentDoc = window.parent?.document || document;
    const iframes = parentDoc.querySelectorAll('.mes_streaming iframe');

    for (const iframe of iframes) {
      const iframeEl = iframe as HTMLIFrameElement;
      try {
        const iframeDoc = iframeEl.contentDocument;
        if (iframeDoc) {
          // 检查是否已添加监听
          const alreadyListening = eventListeners.some(l => l.doc === iframeDoc);
          if (!alreadyListening) {
            addFullscreenListener(iframeDoc);
            console.info('[ACU Fullscreen] Added listener to iframe:', iframeEl.id || 'anonymous');
          }

          // 暴露挂载点给 iframe（供同层界面主动调用）
          (iframeEl.contentWindow as any).getACUMountPoint = () => {
            return iframeDoc.body;
          };
          (iframeEl.contentWindow as any).isFullscreen = () => {
            return !!iframeDoc.fullscreenElement;
          };
        }
      } catch (e) {
        // 跨域 iframe，跳过
      }
    }
  }

  /**
   * 初始化
   */
  function init(): void {
    const parentDoc = window.parent?.document || document;

    // 1. 监听主页面的全屏事件
    addFullscreenListener(parentDoc);

    // 2. 扫描现有 iframe 并添加监听
    scanAndListenIframes();

    // 3. 使用 MutationObserver 监听新增的 iframe
    iframeObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // 有新节点添加时，重新扫描 iframe
          const hasNewIframe = Array.from(mutation.addedNodes).some(node => {
            if (node instanceof Element) {
              return node.matches('.mes_streaming') || node.querySelector('.mes_streaming');
            }
            return false;
          });

          if (hasNewIframe) {
            // 延迟执行，等待 iframe 加载
            setTimeout(scanAndListenIframes, 500);
          }
        }
      }
    });

    // 观察聊天容器
    const chatContainer = parentDoc.querySelector('#chat');
    if (chatContainer) {
      iframeObserver.observe(chatContainer, {
        childList: true,
        subtree: true,
      });
    }

    console.info('[ACU Fullscreen] Initialized');
  }

  /**
   * 清理
   */
  function cleanup(): void {
    // 移除所有事件监听器
    for (const { doc, handler } of eventListeners) {
      try {
        doc.removeEventListener('fullscreenchange', handler);
      } catch (e) {
        // document 可能已销毁
      }
    }
    eventListeners.length = 0;

    // 停止 MutationObserver
    if (iframeObserver) {
      iframeObserver.disconnect();
      iframeObserver = null;
    }

    // 清理样式注入
    if (styleCleanup) {
      styleCleanup();
      styleCleanup = null;
    }

    // 如果还在全屏状态，恢复 ACU
    if (state.value.isMigrated) {
      restoreFromFullscreen();
    }

    console.info('[ACU Fullscreen] Cleaned up');
  }

  // 生命周期
  onMounted(() => {
    init();
  });

  onUnmounted(() => {
    cleanup();
  });

  return {
    /** 全屏状态 */
    state,
    /** 手动初始化（如果不使用 onMounted） */
    init,
    /** 手动清理 */
    cleanup,
    /** 手动触发全屏检测 */
    checkFullscreen: handleFullscreenChange,
  };
}

/**
 * 供同层界面调用的全局方法
 * 在 util/streaming.ts 中暴露给 iframe
 */
export function exposeFullscreenAPI(iframeWindow: Window, iframeDocument: Document): void {
  (iframeWindow as any).getACUMountPoint = () => iframeDocument.body;
  (iframeWindow as any).isFullscreen = () => !!iframeDocument.fullscreenElement;
  (iframeWindow as any).requestACUMigration = () => {
    // 触发主页面的全屏检测
    const event = new CustomEvent('acu-fullscreen-check');
    window.parent?.document?.dispatchEvent(event);
  };
}
