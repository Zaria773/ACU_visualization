import { useDivinationStore } from '../stores/useDivinationStore';
import { useUIStore } from '../stores/useUIStore';
import type { DivinationResult } from '../types';
import { useHiddenPrompt } from './useHiddenPrompt';
import { buildFullPrompt } from './usePromptBuild';
import { toast } from './useToast';

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
  const { setHiddenPrompt, setupSendIntercept, appendPromptToInput } = useHiddenPrompt();

  /**
   * 构建提示词
   */
  function buildPromptFromResult(result: DivinationResult): string {
    const dimensionsForPrompt = result.dimensions.map(d => ({
      dimensionName: d.name,
      tierName: d.value,
      prompt: d.prompt
    }));

    // 检查是否有自定义模板
    const config = divinationStore.config;
    const customTemplate = (config && typeof config === 'object' && 'value' in config)
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
      dimensions: dimensionsForPrompt
    });
  }

  /**
   * 确认抽签结果（注入提示词）
   */
  function confirmDivination(result: DivinationResult) {
    const prompt = buildPromptFromResult(result);
    // 使用所见即所得的追加方式
    appendPromptToInput(prompt);
    uiStore.closeDivinationOverlay();
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
      const flipMode = (config && typeof config === 'object' && 'value' in config)
        ? (config as any).value?.flipMode
        : config?.flipMode;

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
    confirmDivination
  };
}
