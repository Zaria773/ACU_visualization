/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 隐藏提示词管理 Composable
 * 移植自 src/抽签系统/index.ts
 */

import { toast } from './useToast';

// 使用全局变量存储隐藏提示词，便于从 index.ts 访问
// 初始化全局变量
if (typeof (window as any).__acu_hidden_prompt === 'undefined') {
  (window as any).__acu_hidden_prompt = '';
}

// DOM 事件清理函数列表
const domCleanupFns: (() => void)[] = [];

// 防止递归触发的标志
let isProcessing = false;

/**
 * 设置隐藏提示词
 * @param prompt 提示词内容
 */
export function setHiddenPrompt(prompt: string) {
  (window as any).__acu_hidden_prompt = prompt;
  console.info('[ACU] 隐藏提示词已设置:', prompt.substring(0, 50));
}

/**
 * 获取隐藏提示词
 */
export function getHiddenPrompt(): string {
  return (window as any).__acu_hidden_prompt || '';
}

/**
 * 设置 DOM 拦截
 * 严格参考 src/抽签系统/index.ts 的 setupSendIntercept 函数
 */
export function setupSendIntercept() {
  // 清理旧的拦截器
  cleanupSendIntercept();

  const parentDoc = window.parent.document;
  const textarea = parentDoc.getElementById('send_textarea') as HTMLTextAreaElement;
  const sendBtn = parentDoc.getElementById('send_but') as HTMLElement;

  if (!textarea || !sendBtn) {
    console.warn('[ACU] 未找到输入框或发送按钮，1秒后重试');
    setTimeout(setupSendIntercept, 1000);
    return;
  }

  // 处理发送拦截
  const handleSend = async (e: Event) => {
    // 防止递归
    if (isProcessing) return;

    // 没有隐藏提示词，不处理
    const hiddenPrompt = getHiddenPrompt();
    if (!hiddenPrompt.trim()) return;

    // 阻止原始事件
    e.preventDefault();
    e.stopImmediatePropagation();

    isProcessing = true;

    try {
      // 获取用户输入
      const userInput = textarea.value.trim();

      // 拼接：隐藏提示词 + 用户输入
      const combinedMessage = userInput ? `${hiddenPrompt}\n${userInput}` : hiddenPrompt;

      console.info('[ACU] 拼接消息:', combinedMessage.substring(0, 80));

      const parentWin = window.parent as any;
      if (!parentWin.TavernHelper) {
        console.error('[ACU] TavernHelper 不可用');
        throw new Error('TavernHelper API unavailable');
      }

      // ✅ 使用 createChatMessages 直接创建用户消息
      await parentWin.TavernHelper.createChatMessages([
        { role: 'user', message: combinedMessage },
      ]);

      console.info('[ACU] ✓ 用户消息已创建');

      // 清空隐藏提示词和输入框
      setHiddenPrompt('');
      textarea.value = '';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      // ✅ 先触发一次 click 让剧情推进记录"发送意图"
      // 由于输入框已清空，酒馆的 click 处理器会发现空输入而触发 continue 模式
      // 但剧情推进的 capture 钩子会记录发送意图时间戳
      isProcessing = false; // 临时放开，让 click 事件正常触发
      sendBtn.click();
      isProcessing = true; // 立即恢复

      // 短暂等待让剧情推进处理 click
      await new Promise(resolve => setTimeout(resolve, 10));

      // ✅ 使用 generate 触发 AI 生成（剧情推进会通过 TavernHelper.generate 钩子拦截）
      // 剧情推进已经记录了发送意图，现在会正常处理
      await parentWin.TavernHelper.generate({});

      console.info('[ACU] ✓ 已触发生成');

      // 延迟重渲染用户消息，确保剧情推进修改后的内容能正确显示
      setTimeout(async () => {
        try {
          if (parentWin.TavernHelper?.setChatMessages && parentWin.TavernHelper?.getLastMessageId) {
            const lastMsgId = parentWin.TavernHelper.getLastMessageId();
            const userMsgs = parentWin.TavernHelper.getChatMessages(`0-${lastMsgId}`, { role: 'user' });
            if (userMsgs && userMsgs.length > 0) {
              const lastUserMsg = userMsgs[userMsgs.length - 1];
              await parentWin.TavernHelper.setChatMessages([{ message_id: lastUserMsg.message_id }], { refresh: 'affected' });
              console.info('[ACU] ✓ 用户消息已重渲染，message_id:', lastUserMsg.message_id);
            }
          }
        } catch (e) {
          console.warn('[ACU] 重渲染用户消息失败:', e);
        }
      }, 800);
    } catch (err) {
      console.error('[ACU] 发送失败:', err);
      toast.error('隐藏提示词发送失败');
    } finally {
      isProcessing = false;
    }
  };

  // 监听发送按钮点击（capture 阶段拦截）
  const clickHandler = (e: MouseEvent) => {
    handleSend(e);
  };
  sendBtn.addEventListener('click', clickHandler, { capture: true });
  domCleanupFns.push(() => sendBtn.removeEventListener('click', clickHandler, { capture: true }));

  // 监听 Enter 键（capture 阶段）
  // 不直接处理，而是阻止 Enter 后触发 click，让 click 处理器统一处理
  // 这样避免数据库的 keydown capture 记录发送意图导致状态异常
  const keydownHandler = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // 没有隐藏提示词，不处理，让原始 Enter 继续
      const hiddenPrompt = getHiddenPrompt();
      if (!hiddenPrompt.trim()) return;

      // 阻止 Enter 的默认行为和传播
      e.preventDefault();
      e.stopImmediatePropagation();

      // 触发 click，让 click 处理器统一处理
      sendBtn.click();
    }
  };
  textarea.addEventListener('keydown', keydownHandler, { capture: true });
  domCleanupFns.push(() => textarea.removeEventListener('keydown', keydownHandler, { capture: true }));

  console.info('[ACU] 发送拦截已设置');
}

/**
 * 清理 DOM 拦截
 */
export function cleanupSendIntercept() {
  domCleanupFns.forEach(fn => fn());
  domCleanupFns.length = 0;
}

/**
 * 直接将提示词追加到输入框（所见即所得）
 * 不触发发送，不拦截
 * @param text 要追加的文本
 * @param separator 分隔符，默认换行
 * @param targetSelector 目标输入框选择器，默认为酒馆输入框
 */
export function appendPromptToInput(
  text: string,
  separator: string = '\n',
  targetSelector: string = '#send_textarea',
) {
  const parentDoc = window.parent.document;
  const textarea = parentDoc.querySelector(targetSelector) as HTMLTextAreaElement | HTMLInputElement | null;
  // 移动端正则检测 (简单的 UA 检测)
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (textarea) {
    const currentVal = textarea.value || '';
    // 如果已有内容，使用指定分隔符追加
    const newVal = currentVal ? currentVal + separator + text : text;

    textarea.value = newVal;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    if (!isMobile) {
      textarea.focus();
      // 光标移到最后（仅 textarea 支持 setSelectionRange）
      if ('setSelectionRange' in textarea) {
        textarea.setSelectionRange(newVal.length, newVal.length);
      }
    }
    console.info('[ACU] 提示词已追加到输入框:', targetSelector);
  } else {
    console.warn('[ACU] 未找到输入框:', targetSelector);
  }
}

// 全局变量：记录最后一个有焦点的输入框
let lastFocusedInput: HTMLTextAreaElement | HTMLInputElement | null = null;
let focusListenerSetup = false;

/**
 * 检查元素是否属于 ACU 自己的输入框
 * ACU 的输入框不应被记录为目标输入框
 */
function isACUInternalInput(el: HTMLElement): boolean {
  // 检查 id 或 class 是否包含 acu 前缀
  const id = el.id || '';
  const className = el.className || '';

  if (id.startsWith('acu') || id.includes('-acu-')) {
    return true;
  }

  if (className.includes('acu-')) {
    return true;
  }

  // 检查父元素是否在 ACU 容器内
  const acuContainer = el.closest('#acu-parent-container, .acu-wrapper, .acu-modal-container');
  if (acuContainer) {
    return true;
  }

  return false;
}

/**
 * 设置焦点监听器，记录最后一个获得焦点的输入框
 * 仅需调用一次
 * 注意：会过滤掉 ACU 自己的输入框（如搜索框、二次编辑弹窗等）
 */
export function setupFocusTracking() {
  if (focusListenerSetup) return;

  const parentDoc = window.parent.document;

  // 监听 focusin 事件（冒泡版的 focus）
  parentDoc.addEventListener(
    'focusin',
    (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'TEXTAREA' ||
          (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text'))
      ) {
        // 过滤掉 ACU 自己的输入框
        if (isACUInternalInput(target)) {
          console.info('[ACU] 忽略 ACU 内部输入框:', target.id || target.className);
          return;
        }

        lastFocusedInput = target as HTMLTextAreaElement | HTMLInputElement;
        console.info('[ACU] 记录焦点输入框:', target.id || target.className);
      }
    },
    true,
  );

  focusListenerSetup = true;
  console.info('[ACU] 焦点追踪已设置');
}

/**
 * 获取最后一个有焦点的输入框
 */
export function getLastFocusedInput(): HTMLTextAreaElement | HTMLInputElement | null {
  return lastFocusedInput;
}

/**
 * 设置目标输入框（手动指定）
 */
export function setTargetInput(input: HTMLTextAreaElement | HTMLInputElement | null) {
  lastFocusedInput = input;
}

/**
 * 追加到最后一个有焦点的输入框
 * 如果没有记录的输入框，则追加到酒馆默认输入框
 * @param text 要追加的文本
 * @param separator 分隔符，默认空格
 */
export function appendToActiveInput(text: string, separator: string = ' ') {
  // 首先尝试使用记录的最后焦点输入框
  if (lastFocusedInput && lastFocusedInput.isConnected) {
    const input = lastFocusedInput;
    const currentVal = input.value || '';
    const newVal = currentVal ? currentVal + separator + text : text;

    input.value = newVal;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // 重新聚焦并移动光标到最后
    input.focus();
    if ('setSelectionRange' in input) {
      input.setSelectionRange(newVal.length, newVal.length);
    }
    console.info('[ACU] 提示词已追加到记录的输入框:', input.id || input.className);
  } else {
    // 降级到酒馆默认输入框
    appendPromptToInput(text, separator);
  }
}

/**
 * 导出 Composable
 */
export function useHiddenPrompt() {
  return {
    setHiddenPrompt,
    getHiddenPrompt,
    setupSendIntercept,
    cleanupSendIntercept,
    appendPromptToInput,
    appendToActiveInput,
    setupFocusTracking,
    getLastFocusedInput,
    setTargetInput,
  };
}
