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
 * - 调整悬浮球位置确保在全屏元素内可见
 */

import { onMounted, onUnmounted, ref, nextTick } from 'vue';

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

/** 悬浮球原始位置（用于退出全屏时恢复） */
let originalBallPosition: { left: string; top: string } | null = null;

/** 复制的样式元素列表（用于清理） */
let copiedStyleElements: HTMLElement[] = [];

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
   * 获取 ACU 根容器元素（包含整个 Vue 应用）
   * 这是由 index.ts 创建的挂载点，包含悬浮球、面板和所有弹窗
   */
  function getACUContainer(): HTMLElement | null {
    const parentDoc = window.parent?.document || document;
    // 首选 #acu-parent-container（整个 Vue 应用的挂载点）
    const container = parentDoc.getElementById('acu-parent-container');
    if (container) return container;
    // 备选：查找 .acu-app（Vue App 的根元素）
    return parentDoc.querySelector('.acu-app') as HTMLElement | null;
  }

  /**
   * 获取 ACU wrapper 元素（主面板容器）
   * @deprecated 使用 getACUContainer() 代替
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
   * 获取悬浮球元素
   */
  function getFloatingBall(): HTMLElement | null {
    const container = getACUContainer();
    if (!container) return null;
    return container.querySelector('.acu-floating-ball-vue') as HTMLElement | null;
  }

  /**
   * 调整悬浮球位置到全屏元素内可见区域
   * 通过添加 CSS 类强制覆盖 Vue 响应式样式
   */
  function adjustBallPositionForFullscreen(fullscreenElement: Element): void {
    const container = getACUContainer();
    if (!container) return;

    // 获取全屏元素尺寸
    const rect = fullscreenElement.getBoundingClientRect();
    const ballSize = 50; // 悬浮球大小
    const padding = 20;

    // 计算新位置（左下角）
    const newLeft = padding;
    const newTop = rect.height - ballSize - padding;

    // 使用 CSS 变量注入位置（这样可以用 !important 覆盖 Vue 绑定的样式）
    container.style.setProperty('--acu-fullscreen-ball-left', `${newLeft}px`);
    container.style.setProperty('--acu-fullscreen-ball-top', `${newTop}px`);

    // 添加全屏模式类
    container.classList.add('acu-fullscreen-mode');

    console.info(`[ACU Fullscreen] Adjusted ball position: left=${newLeft}px, top=${newTop}px (fullscreen height=${rect.height}px)`);
  }

  /**
   * 恢复悬浮球原始位置
   */
  function restoreBallPosition(): void {
    const container = getACUContainer();
    if (!container) return;

    // 移除全屏模式类
    container.classList.remove('acu-fullscreen-mode');

    // 清除 CSS 变量
    container.style.removeProperty('--acu-fullscreen-ball-left');
    container.style.removeProperty('--acu-fullscreen-ball-top');

    console.info('[ACU Fullscreen] Restored ball position');
  }

  /**
   * 将 ACU 迁移到全屏元素内
   * 迁移整个 ACU 容器（包括悬浮球、面板和所有弹窗）
   */
  function migrateToFullscreen(fullscreenElement: Element, targetDoc: Document): void {
    const container = getACUContainer();
    if (!container) {
      console.warn('[ACU Fullscreen] ACU container not found');
      return;
    }

    // 保存原始父元素
    if (!originalParent) {
      originalParent = container.parentElement;
    }

    // 如果全屏元素在 iframe 内，需要复制 ACU 的样式到那个 iframe
    const parentDoc = window.parent?.document || document;
    if (targetDoc !== parentDoc) {
      console.info('[ACU Fullscreen] Fullscreen in iframe, copying ACU styles...');

      // 清理之前复制的样式
      cleanupCopiedStyles();

      // 复制所有 ACU 相关的样式到目标 document
      copyACUStyles(parentDoc, targetDoc);
    }

    // 迁移整个 ACU 容器到全屏元素内
    fullscreenElement.appendChild(container);

    // 确保容器在全屏元素内可见
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '2147483647'; // 最大 z-index
    container.style.pointerEvents = 'none'; // 容器本身不拦截点击

    // 确保子元素可以接收点击
    const acuApp = container.querySelector('.acu-app') as HTMLElement;
    if (acuApp) {
      acuApp.style.pointerEvents = 'auto';
    }

    state.value.isMigrated = true;
    console.info('[ACU Fullscreen] ACU container migrated to fullscreen element');

    // 延迟调整悬浮球位置（等待 DOM 更新）
    nextTick(() => {
      adjustBallPositionForFullscreen(fullscreenElement);
    });
  }

  /**
   * 复制 ACU 样式到目标 document
   * @param sourceDoc 源 document（通常是父窗口）
   * @param targetDoc 目标 document（通常是全屏 iframe）
   */
  function copyACUStyles(sourceDoc: Document, targetDoc: Document): void {
    // 查找所有 ACU 相关的样式元素
    const acuStyleSelectors = [
      'style[data-source="acu-visualizer"]',
      'style[id*="acu-styles"]',
      'style[id*="acu-dynamic"]',
      'style[id*="acu-theme"]',
    ];

    for (const selector of acuStyleSelectors) {
      const styleElements = sourceDoc.querySelectorAll(selector);
      styleElements.forEach(originalStyle => {
        const clonedStyle = originalStyle.cloneNode(true) as HTMLElement;
        // 修改 ID 以避免冲突
        if (clonedStyle.id) {
          clonedStyle.id = `fullscreen-${clonedStyle.id}`;
        }
        clonedStyle.setAttribute('data-fullscreen-copy', 'true');
        targetDoc.head.appendChild(clonedStyle);
        copiedStyleElements.push(clonedStyle);
        console.info('[ACU Fullscreen] Copied style:', clonedStyle.id || 'anonymous');
      });
    }

    // 也复制 Font Awesome 样式（如果存在）
    const faStyles = sourceDoc.querySelectorAll('link[href*="fontawesome"], link[href*="font-awesome"]');
    faStyles.forEach(link => {
      const clonedLink = link.cloneNode(true) as HTMLElement;
      clonedLink.setAttribute('data-fullscreen-copy', 'true');
      targetDoc.head.appendChild(clonedLink);
      copiedStyleElements.push(clonedLink);
    });

    console.info(`[ACU Fullscreen] Copied ${copiedStyleElements.length} style elements`);
  }

  /**
   * 清理复制的样式元素
   */
  function cleanupCopiedStyles(): void {
    for (const el of copiedStyleElements) {
      try {
        el.remove();
      } catch (e) {
        // 元素可能已被移除
      }
    }
    copiedStyleElements = [];
  }

  /**
   * 将 ACU 恢复到原始位置
   */
  function restoreFromFullscreen(): void {
    const container = getACUContainer();
    if (!container || !originalParent) {
      return;
    }

    // 恢复悬浮球位置（在恢复容器之前）
    restoreBallPosition();

    // 恢复到原始父元素
    originalParent.appendChild(container);

    // 清理复制的样式
    cleanupCopiedStyles();

    // 清理样式注入
    if (styleCleanup) {
      styleCleanup();
      styleCleanup = null;
    }

    // 恢复默认样式
    container.style.position = '';
    container.style.top = '';
    container.style.left = '';
    container.style.width = '';
    container.style.height = '';
    container.style.zIndex = '';
    container.style.pointerEvents = '';

    // 恢复子元素样式
    const acuApp = container.querySelector('.acu-app') as HTMLElement;
    if (acuApp) {
      acuApp.style.pointerEvents = '';
    }

    state.value.isMigrated = false;
    originalParent = null;
    console.info('[ACU Fullscreen] ACU container restored from fullscreen');
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

    // 清理复制的样式
    cleanupCopiedStyles();

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
