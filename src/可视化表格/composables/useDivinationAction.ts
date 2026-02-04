import { useDivinationStore } from '../stores/useDivinationStore';
import { useUIStore } from '../stores/useUIStore';
import type { DivinationResult } from '../types';
import { appendToActiveInput, useHiddenPrompt } from './useHiddenPrompt';
import { buildFullPrompt } from './usePromptBuild';
import { toast } from './useToast';

// 从类型定义导入 ChatMessage 类型
type ChatMessage = {
  message_id: number;
  name: string;
  role: 'system' | 'assistant' | 'user';
  is_hidden: boolean;
  message: string;
  data: Record<string, any>;
  extra: Record<string, any>;
};

/**
 * 抽签动作 Composable
 *
 * 封装抽签的完整业务流程：
 * 1. 初始化检查
 * 2. 执行抽签
 * 3. 根据配置决定展示方式（动画/跳过）
 */
export function useDivinationAction() {
  const divinationStore = useDivinationStore() as any;
  const uiStore = useUIStore();
  const { setHiddenPrompt, setupSendIntercept } = useHiddenPrompt();

  /**
   * 构建提示词
   */
  function buildPromptFromResult(result: DivinationResult): string {
    const dimensionsForPrompt = result.dimensions.map(d => ({
      dimensionName: d.name,
      tierName: d.value,
      prompt: d.prompt,
    }));

    // 检查是否有自定义模板
    const config = divinationStore.config;
    const customTemplate =
      config && typeof config === 'object' && 'value' in config
        ? (config as any).value?.customTemplate
        : config?.customTemplate;

    if (customTemplate && customTemplate.trim()) {
      let prompt = customTemplate;

      // 1. 准备数据字典
      const luckPrompt = result.luck.prompt || '';
      const wordsStr = result.words.join('、');

      // 维度 Map (名称 -> Prompt)
      const dimensionMap = new Map<string, string>();
      result.dimensions.forEach(d => {
        if (d.prompt && d.prompt.trim()) {
          dimensionMap.set(d.name, d.prompt);
        }
      });

      const usedDimensions = new Set<string>();

      // 2. 替换 {{luck}}
      prompt = prompt.replace(/\{\{luck\}\}/gi, luckPrompt);

      // 3. 替换 {{words}}
      prompt = prompt.replace(/\{\{words\}\}/gi, wordsStr);

      // 4. 处理 {{维度名}} 精准匹配
      for (const [name, dimPrompt] of dimensionMap.entries()) {
        // 构造正则，匹配 {{维度名}}，处理大小写不敏感
        // 转义正则特殊字符
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\{\\{${escapedName}\\}\\}`, 'gi');

        if (regex.test(prompt)) {
          prompt = prompt.replace(regex, dimPrompt);
          usedDimensions.add(name);
        }
      }

      // 5. 处理 {{dimensions}} (剩余未使用的维度)
      const remainingPrompts: string[] = [];
      for (const [name, dimPrompt] of dimensionMap.entries()) {
        if (!usedDimensions.has(name)) {
          remainingPrompts.push(dimPrompt);
        }
      }
      const dimensionsText = remainingPrompts.join('\n');
      prompt = prompt.replace(/\{\{dimensions\}\}/gi, dimensionsText);

      return prompt;
    }

    return buildFullPrompt({
      luck: result.luck,
      words: result.words,
      dimensions: dimensionsForPrompt,
    });
  }

  /**
   * 确认抽签结果（注入提示词）
   * @param result 抽签结果
   * @param action 注入动作 ('reveal' | 'hide' | 'reroll')，默认为 'reveal'
   */
  function confirmDivination(result: DivinationResult, action: 'reveal' | 'hide' | 'reroll' = 'reveal') {
    const prompt = buildPromptFromResult(result);

    if (action === 'reroll') {
      // 快捷重抽模式
      injectIntoLastUserMessage(prompt);
    } else if (action === 'hide') {
      // 注入隐藏提示词
      setHiddenPrompt(prompt);
      setupSendIntercept();
      toast.success('提示词已注入隐藏编辑框');
    } else {
      // 使用所见即所得的追加方式 (reveal)，支持同层界面的输入框
      appendToActiveInput(prompt, '\n');
      toast.success('提示词已追加到输入框');
    }

    uiStore.closeDivinationOverlay();
  }

  /**
   * 注入到最后一条用户消息
   */
  async function injectIntoLastUserMessage(prompt: string): Promise<void> {
    const parentWin = window.parent as any;
    // 尝试从全局或 TavernHelper 获取接口
    const getChatMessagesFn = parentWin.getChatMessages || parentWin.TavernHelper?.getChatMessages;
    const setChatMessagesFn = parentWin.setChatMessages || parentWin.TavernHelper?.setChatMessages;
    const getLastMessageIdFn = parentWin.getLastMessageId || parentWin.TavernHelper?.getLastMessageId;

    if (!getChatMessagesFn || !setChatMessagesFn) {
      console.error('[ACU] getChatMessages/setChatMessages not found in parent window or TavernHelper');
      toast.error('无法获取酒馆接口，请确保酒馆助手已正确安装');
      return;
    }

    // 获取最后一条消息的 ID
    const lastMsgId = getLastMessageIdFn?.() ?? 999;
    // 计算起始楼层（往前 50 条，确保能找到用户消息）
    const startFloor = Math.max(0, lastMsgId - 50);
    // 获取范围内的所有消息
    const allMessages = getChatMessagesFn(`${startFloor}-${lastMsgId}`) as ChatMessage[];

    // 倒序查找最后一条用户消息
    let lastUserMsg: ChatMessage | undefined;
    for (let i = allMessages.length - 1; i >= 0; i--) {
      if (allMessages[i].role === 'user') {
        lastUserMsg = allMessages[i];
        break;
      }
    }

    console.info(
      '[ACU Divination] 搜索用户消息范围:',
      `${startFloor}-${lastMsgId}`,
      '总消息:',
      allMessages.length,
      '条，最后一条用户消息 ID:',
      lastUserMsg?.message_id,
    );

    if (!lastUserMsg) {
      toast.warning('未找到用户消息，已改为追加到输入框');
      appendToActiveInput(prompt, '\n');
      return;
    }

    // 移除 prompt 中可能已存在的标签（包括带属性的标签），避免双重包裹
    // 1. 移除开始标签 <剧情元指令...>
    // 2. 移除结束标签 </剧情元指令>
    const cleanPrompt = prompt
      .replace(/<剧情元指令[^>]*>/g, '')
      .replace(/<\/剧情元指令>/g, '')
      .trim();

    const newDirective = `<剧情元指令>\n${cleanPrompt}\n</剧情元指令>`;
    // 移除 g 标志，避免 test() 移动 lastIndex 导致 replace() 失败
    // 同时放宽正则匹配，以防标签有属性或空格
    const regex = /<剧情元指令[\s\S]*?<\/剧情元指令>/;
    const content = lastUserMsg.message || '';

    let newContent: string;
    if (regex.test(content)) {
      newContent = content.replace(regex, newDirective);
    } else {
      newContent = newDirective + '\n' + content;
    }

    await setChatMessagesFn([
      {
        message_id: lastUserMsg.message_id,
        message: newContent,
      },
    ]);

    toast.success('已替换用户消息中的剧情元指令，请点击重新生成');
  }

  /**
   * 触发快捷重抽
   */
  async function triggerQuickReroll(): Promise<void> {
    // 初始化检查 (复用 performDivination 逻辑)
    if (!divinationStore.isLoaded) divinationStore.loadConfig();
    await uiStore.initDivinationSystem();

    // 词库加载 (复用)
    if (divinationStore.categories.length === 0) {
      await divinationStore.loadFromWorldbook();
      if (divinationStore.categories.length === 0) {
        await divinationStore.syncFromACU();
        await divinationStore.loadFromWorldbook();
      }
    } else {
      divinationStore.loadFromWorldbook();
    }

    const result = divinationStore.performDivination();
    if (result) {
      const config = divinationStore.config;
      // 注意：config 可能是 ref 或对象，需兼容处理
      const flipMode = (config as any).value?.flipMode ?? config?.flipMode;

      if (flipMode === 'skip') {
        const prompt = buildPromptFromResult(result);
        await injectIntoLastUserMessage(prompt);
      } else {
        uiStore.openDivinationOverlay(result, true); // true = isQuickReroll
      }
    } else {
      toast.error('抽签失败，请检查配置');
    }
  }

  /**
   * 执行抽签
   */
  async function performDivination(): Promise<void> {
    // 确保系统已初始化
    // 只有在未加载时才加载，避免覆盖内存中的最新更改
    if (!divinationStore.isLoaded) {
      divinationStore.loadConfig();
    }

    // 确保抽签系统已初始化 (UI Store 中的初始化逻辑)
    // 注意：这里可能会有重复调用，但 loadConfig 内部有状态检查
    await uiStore.initDivinationSystem();

    // 确保词库已加载 (如果是首次运行)
    if (divinationStore.categories.length === 0) {
      console.info('[ACU] 首次抽签，尝试加载词库...');
      await divinationStore.loadFromWorldbook();

      // 如果加载后仍然为空，尝试从 ACU 同步（可能是首次安装，世界书未创建）
      if (divinationStore.categories.length === 0) {
        console.info('[ACU] 词库为空，尝试从 ACU 表格同步...');
        await divinationStore.syncFromACU();
        // 同步后再次加载
        await divinationStore.loadFromWorldbook();
      }
    } else {
      // 后台静默刷新，不阻塞本次抽签
      divinationStore.loadFromWorldbook();
    }

    if (divinationStore.categories.length === 0) {
      toast.warning('未找到随机词库。请确保存在名为 "Random" 或 "随机" 的表格。');
    }

    // 执行抽签
    const result = divinationStore.performDivination();

    if (result) {
      // 检查是否跳过动画
      // 注意：divinationStore.config 是 ref，需要通过 .value 访问
      // 但在 setup 中使用 storeToRefs 解构后可能是 ref，直接使用 store.config 则是对象
      // 这里为了安全起见，处理两种情况
      const config = divinationStore.config;
      const flipMode =
        config && typeof config === 'object' && 'value' in config ? (config as any).value?.flipMode : config?.flipMode;

      if (flipMode === 'skip') {
        const prompt = buildPromptFromResult(result);
        setHiddenPrompt(prompt);
        setupSendIntercept();
        toast.success('提示词已注入隐藏编辑框');
      } else {
        uiStore.openDivinationOverlay(result);
      }
    } else {
      toast.error('抽签失败，请检查配置');
    }
  }

  return {
    performDivination,
    confirmDivination,
    triggerQuickReroll,
  };
}
