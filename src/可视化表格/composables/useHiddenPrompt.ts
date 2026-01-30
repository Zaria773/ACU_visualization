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
      const wrappedPrompt = `${hiddenPrompt}`;
      const combinedMessage = userInput ? `${wrappedPrompt}\n${userInput}` : wrappedPrompt;

      console.info('[ACU] 拼接消息:', combinedMessage.substring(0, 80));

      // 用 /send 创建用户消息（消息时间戳是当前时间，满足 12s 判定）
      // 使用 as user 确保是用户消息
      const parentWin = window.parent as any;
      if (parentWin.TavernHelper && parentWin.TavernHelper.triggerSlash) {
        await parentWin.TavernHelper.triggerSlash(`/send as=user ${combinedMessage}`);
      } else {
        console.error('[ACU] TavernHelper.triggerSlash 不可用');
        throw new Error('TavernHelper API unavailable');
      }

      console.info('[ACU] ✓ 用户消息已创建');

      // 清空输入框
      textarea.value = '';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      // 短暂延迟确保消息已写入
      await new Promise(resolve => setTimeout(resolve, 50));

      // 触发 click，此时输入框为空
      // - 空输入会让酒馆触发 AI 生成（continue 模式）
      // - 同时数据库的 capture 监听器会记录发送意图
      sendBtn.click();

      console.info('[ACU] ✓ 已触发生成');
    } catch (err) {
      console.error('[ACU] 发送失败:', err);
      toast.error('隐藏提示词发送失败');
    } finally {
      // 延迟重置标志，确保递归的 click 不会再次触发
      setTimeout(() => {
        isProcessing = false;
      }, 100);
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
 */
export function appendPromptToInput(text: string, separator: string = '\n') {
  const parentDoc = window.parent.document;
  const textarea = parentDoc.getElementById('send_textarea') as HTMLTextAreaElement;
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
      // 光标移到最后
      textarea.setSelectionRange(newVal.length, newVal.length);
    }
    console.info('[ACU] 提示词已追加到输入框');
  } else {
    console.warn('[ACU] 未找到输入框 #send_textarea');
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
  };
}
