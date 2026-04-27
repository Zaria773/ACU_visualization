/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * ACU Visualizer - 聊天区域嵌入 Composable
 *
 * 职责：
 * 1. 在酒馆聊天区域 (#chat) 最新一条 AI 消息中追加多个嵌入容器（每个嵌入组件一个）
 * 2. 通过 Vue Teleport，把仪表盘组件渲染到对应容器
 * 3. 监听 #chat DOM 变化（新消息到来），自动重新定位
 * 4. 监听 .mes_text 的内部变化（处理酒馆 refreshOneMessage 重写 innerHTML 导致容器丢失的情况）
 * 5. 响应配置 (enableChatEmbed / embedComponents.*) 的变化，自动重新定位/移除
 *
 * 关键设计：
 * - 每个嵌入组件有独立的 position/selector 配置（来自 config.embedComponents.{global,options}）
 * - 兼容旧字段 embedPosition/embedSelector（作为回退）
 * - 容器加在 .mes_block 末尾时最稳妥
 * - 加在 .mes_text 内部时需要 MutationObserver 在被清除后立即重新插入
 *
 * 选择器输入语法（mes_text_after_selector 模式下）：
 *   <think>       → 在 .mes_text 内 第一个 <think> 元素之前 插入
 *   </think>      → 在 .mes_text 内 最后一个 <think> 元素之后 插入
 *   <pre>         → 在 .mes_text 内 第一个 <pre> 之前
 *   </pre>        → 在 .mes_text 内 最后一个 <pre> 之后
 *   think         → 简化写法，等价于 </think>（最后一个 <think> 之后）
 *   pre:last-of-type
 *                 → 普通 CSS 选择器，默认在最后一个匹配元素之后（向下兼容）
 */

import { debounce } from 'lodash';
import { onMounted, onUnmounted, shallowRef, watch } from 'vue';
import { useConfigStore } from '../stores/useConfigStore';
import type { ChatEmbedComponentConfig } from '../types';

/** 嵌入容器的 class 名 */
const CONTAINER_CLASS = 'acu-chat-embed-root';

/** chatObserver debounce 时长，避免短时间内多次重定位 */
const CHAT_OBSERVER_DEBOUNCE = 300;

/** 支持的嵌入组件 ID（与配置中 embedComponents 的键一一对应） */
export type ChatEmbedComponentId = 'global' | 'options';

/**
 * 解析后的选择器规则
 */
interface ParsedSelectorRule {
  /** CSS 选择器（用于 jQuery .find()） */
  selector: string;
  /** 在元素的之前还是之后插入 */
  when: 'before' | 'after';
  /** 取所有匹配的第几个：'first' | 'last' */
  pick: 'first' | 'last';
}

/**
 * 把用户填的选择器字符串解析为规则:
 * - `<tag>`        → { selector: 'tag', when: 'before', pick: 'first' }
 * - `</tag>`       → { selector: 'tag', when: 'after',  pick: 'last' }
 * - `tag`          → 等价于 `</tag>` 的语义：在最后一个 tag 之后
 * - `xxx:last-of-type` 或带组合器 → 直接当 CSS 选择器，默认 after + last
 * - 空 → null
 */
export function parseSelectorRule(raw: string): ParsedSelectorRule | null {
  const sel = (raw || '').trim();
  if (!sel) return null;

  // 闭合标签写法: </xxx> → 放该元素之后
  const closeMatch = sel.match(/^<\s*\/\s*([A-Za-z][\w-]*)\s*>$/);
  if (closeMatch) {
    return { selector: closeMatch[1], when: 'after', pick: 'last' };
  }

  // 开标签写法: <xxx> 或 <xxx attr="..."> → 放该元素之前
  // 仅支持单纯标签名，不解析属性，把 < tag > 之间的标签名提取出来
  const openMatch = sel.match(/^<\s*([A-Za-z][\w-]*)\s*[^>]*>$/);
  if (openMatch) {
    return { selector: openMatch[1], when: 'before', pick: 'first' };
  }

  // 普通 CSS 选择器 → 默认放在最后一个匹配元素之后
  return { selector: sel, when: 'after', pick: 'last' };
}

/**
 * 聊天区域嵌入 Composable
 *
 * 返回每个组件的独立 Teleport 目标（embedTargets.global / embedTargets.options）
 */
export function useChatAreaEmbed() {
  const configStore = useConfigStore();

  /** 暴露给 Teleport 使用的容器 DOM 引用（按组件 ID 分） */
  const embedTargets = {
    global: shallowRef<HTMLElement | null>(null),
    options: shallowRef<HTMLElement | null>(null),
  };

  /** 监听 #chat 变化的 observer（新消息到来时重新定位） */
  let chatObserver: MutationObserver | null = null;

  /** 监听 .mes_text 内容变化的 observer（处理酒馆刷新清除容器的情况） */
  let mesTextObserver: MutationObserver | null = null;

  /** 当前 mesTextObserver 关联的 mes_text 元素，便于切换楼层时识别 */
  let watchedMesText: HTMLElement | null = null;

  /**
   * 上次成功插入时的"位置签名",用于判断是否需要重建容器
   * 签名包含: 楼层元素引用 + 各组件的 position+selector
   * 同签名 → 跳过重建,避免破坏 Vue 内部组件状态(包括滚动位置)
   */
  let lastSignature: {
    mesEl: HTMLElement | null;
    globalKey: string;
    optionsKey: string;
  } | null = null;

  /** 计算某个组件的位置签名 key */
  function getComponentSignature(componentId: ChatEmbedComponentId): string {
    const enabled =
      (componentId === 'global' && configStore.config.embedGlobalStatus) ||
      (componentId === 'options' && configStore.config.embedOptions);
    if (!enabled) return 'disabled';
    const { position, selector } = getComponentConfig(componentId);
    return `${position}|${selector || ''}`;
  }

  // ============================================================
  // 工具函数
  // ============================================================

  /** 获取父窗口 document（脚本运行在 iframe 中） */
  function getParentDoc(): Document {
    try {
      return window.parent?.document || document;
    } catch {
      return document;
    }
  }

  /**
   * 获取某个组件的 position/selector 配置（合并旧字段作为兜底）
   */
  function getComponentConfig(componentId: ChatEmbedComponentId): ChatEmbedComponentConfig {
    const cfg = configStore.config.embedComponents?.[componentId];
    if (cfg && cfg.position) {
      return { position: cfg.position, selector: cfg.selector || '' };
    }
    // 回退到旧的全局字段
    return {
      position: configStore.config.embedPosition || 'mes_block_end',
      selector: configStore.config.embedSelector || '',
    };
  }

  /**
   * 查找 #chat 中最后一条 AI 消息（不是用户消息、不是系统消息、未隐藏）
   * @returns JQuery<.mes> 或 null
   */
  function findLastAiMessage(): JQuery | null {
    const parentDoc = getParentDoc();
    const $allMes = $(parentDoc).find('#chat .mes');
    if ($allMes.length === 0) return null;

    const $aiMes = $allMes.filter(function () {
      const $this = $(this);
      // 排除用户消息
      if ($this.attr('is_user') === 'true') return false;
      // 排除系统消息
      if ($this.attr('is_system') === 'true') return false;
      if ($this.hasClass('sys_mes')) return false;
      // 排除显式 System 角色
      if ($this.find('.name_text').text().trim() === 'System') return false;
      // 排除被隐藏的（display: none）
      if ($this.css('display') === 'none') return false;
      return true;
    });

    return $aiMes.length > 0 ? $aiMes.last() : null;
  }

  // ============================================================
  // 容器创建/插入
  // ============================================================

  function createContainer(componentId: ChatEmbedComponentId): HTMLElement {
    const parentDoc = getParentDoc();
    const container = parentDoc.createElement('div');
    container.className = CONTAINER_CLASS;
    container.setAttribute('data-acu-embed', componentId);
    return container;
  }

  /** 在 parent 末尾追加一个嵌入容器 */
  function appendContainer(parent: HTMLElement, componentId: ChatEmbedComponentId): HTMLElement {
    const container = createContainer(componentId);
    parent.appendChild(container);
    return container;
  }

  /** 在 parent 最前面插入一个嵌入容器 */
  function prependContainer(parent: HTMLElement, componentId: ChatEmbedComponentId): HTMLElement {
    const container = createContainer(componentId);
    parent.insertBefore(container, parent.firstChild);
    return container;
  }

  /** 在 anchor 元素之后插入容器 */
  function insertAfter(anchor: HTMLElement, componentId: ChatEmbedComponentId): HTMLElement {
    const container = createContainer(componentId);
    if (anchor.parentNode) {
      anchor.parentNode.insertBefore(container, anchor.nextSibling);
    }
    return container;
  }

  /** 在 anchor 元素之前插入容器 */
  function insertBefore(anchor: HTMLElement, componentId: ChatEmbedComponentId): HTMLElement {
    const container = createContainer(componentId);
    if (anchor.parentNode) {
      anchor.parentNode.insertBefore(container, anchor);
    }
    return container;
  }

  /** 移除父窗口中所有的嵌入容器，并清空所有 embedTarget */
  function removeAllContainers(): void {
    const parentDoc = getParentDoc();
    const olds = parentDoc.querySelectorAll(`.${CONTAINER_CLASS}`);
    olds.forEach(el => el.parentNode?.removeChild(el));
    embedTargets.global.value = null;
    embedTargets.options.value = null;
  }

  /**
   * 根据 componentId 的配置在 $mes 内定位插入点并创建容器
   * @param $mes 目标 AI 消息
   * @param componentId 组件标识
   * @returns 创建好的容器 DOM 节点（找不到合适位置时返回 null）
   */
  function resolveInsertionPoint($mes: JQuery, componentId: ChatEmbedComponentId): HTMLElement | null {
    const { position, selector } = getComponentConfig(componentId);

    switch (position) {
      case 'mes_block_start': {
        // ⓪ 插入到 .mes_block 最前面 (思维链/任何内容之前)
        const $block = $mes.find('.mes_block');
        const target = $block.length ? $block[0] : $mes[0];
        return prependContainer(target as HTMLElement, componentId);
      }

      case 'mes_block_end': {
        // ① 插入到 .mes_block 末尾（最稳妥）
        const $block = $mes.find('.mes_block');
        const target = $block.length ? $block[0] : $mes[0];
        return appendContainer(target as HTMLElement, componentId);
      }

      case 'mes_text_end': {
        // ② 插入到 .mes_text 末尾
        const $text = $mes.find('.mes_text');
        if (!$text.length) {
          console.warn(`[ACU ChatEmbed][${componentId}] .mes_text 不存在，跳过`);
          return null;
        }
        return appendContainer($text[0] as HTMLElement, componentId);
      }

      case 'mes_text_after_selector': {
        // ③ 解析选择器规则。找不到就直接放弃，不做兜底降级
        const rule = parseSelectorRule(selector || '');
        const $text = $mes.find('.mes_text');

        if (!$text.length) {
          console.warn(`[ACU ChatEmbed][${componentId}] .mes_text 不存在，跳过`);
          return null;
        }

        if (!rule) {
          console.warn(`[ACU ChatEmbed][${componentId}] 未填写选择器，跳过`);
          return null;
        }

        try {
          const $matched = $text.find(rule.selector);
          if (!$matched.length) {
            console.warn(
              `[ACU ChatEmbed][${componentId}] 选择器 "${rule.selector}"（输入: "${selector}"）未匹配到元素，跳过`,
            );
            return null;
          }
          const $anchor = rule.pick === 'first' ? $matched.first() : $matched.last();
          if (rule.when === 'before') {
            return insertBefore($anchor[0] as HTMLElement, componentId);
          }
          return insertAfter($anchor[0] as HTMLElement, componentId);
        } catch (err) {
          console.warn(`[ACU ChatEmbed][${componentId}] 选择器 "${rule.selector}" 解析失败:`, err);
          return null;
        }
      }

      default:
        return null;
    }
  }

  // ============================================================
  // mes_text 内容变化监听（处理酒馆刷新消息清除容器的情况）
  // ============================================================

  /** 检查至少有一个组件用了 mes_text 内部的位置（需要监听 mes_text 重写） */
  function anyComponentNeedsMesTextWatch(): boolean {
    const ids: ChatEmbedComponentId[] = ['global', 'options'];
    return ids.some(id => {
      const enabled =
        (id === 'global' && configStore.config.embedGlobalStatus) ||
        (id === 'options' && configStore.config.embedOptions);
      if (!enabled) return false;
      const { position } = getComponentConfig(id);
      // 仅 mes_text 内部插入时才需要监听 mes_text 重写
      return position === 'mes_text_end' || position === 'mes_text_after_selector';
    });
  }

  /**
   * 监听 .mes_text 的 childList 变化
   * 酒馆 refreshOneMessage 会重写 mes_text.innerHTML，导致我们追加的容器被清除
   * 此时需要立刻重新插入
   */
  function watchMesTextChanges($mes: JQuery): void {
    if (!anyComponentNeedsMesTextWatch()) {
      mesTextObserver?.disconnect();
      mesTextObserver = null;
      watchedMesText = null;
      return;
    }

    const mesText = $mes.find('.mes_text')[0] as HTMLElement | undefined;
    if (!mesText) {
      mesTextObserver?.disconnect();
      mesTextObserver = null;
      watchedMesText = null;
      return;
    }

    // 如果已经在监听同一个 mes_text，不需要重新创建 observer
    if (watchedMesText === mesText && mesTextObserver) {
      return;
    }

    // 切换到新的 mes_text，先 disconnect 旧的
    mesTextObserver?.disconnect();

    mesTextObserver = new MutationObserver(() => {
      // 检查我们的容器是否还在 mes_text 内
      const stillThere = mesText.querySelector(`.${CONTAINER_CLASS}`);
      if (!stillThere) {
        // 容器被酒馆刷新清除了，重新插入（下一帧执行避免在变更回调里立即操作）
        requestAnimationFrame(() => {
          ensureContainers();
        });
      }
    });
    mesTextObserver.observe(mesText, { childList: true });
    watchedMesText = mesText;
  }

  // ============================================================
  // 主流程：ensureContainers
  // ============================================================

  /**
   * 检查容器是否仍然有效（在 DOM 中且在正确的楼层下）
   */
  function isContainerValid(container: HTMLElement | null, $mes: JQuery): boolean {
    if (!container) return false;
    if (!container.isConnected) return false;
    // 容器必须仍在当前 AI 消息内
    return $mes[0].contains(container);
  }

  /**
   * 确保所有启用的嵌入容器存在且位置正确
   *
   * 关键优化: 同签名(楼层 + 配置都没变)且容器仍在 DOM 中 → 直接 return,
   * 不去删除/重建容器,避免破坏 Vue 内部组件状态(滚动位置等)。
   */
  function ensureContainers(): void {
    // 1) 总开关关闭 → 移除所有容器
    if (!configStore.config.enableChatEmbed) {
      removeAllContainers();
      mesTextObserver?.disconnect();
      mesTextObserver = null;
      watchedMesText = null;
      lastSignature = null;
      return;
    }

    // 2) 找到最新 AI 消息
    const $mes = findLastAiMessage();
    if (!$mes) {
      removeAllContainers();
      lastSignature = null;
      return;
    }

    // 3) 计算当前签名
    const currentSig = {
      mesEl: $mes[0] as HTMLElement,
      globalKey: getComponentSignature('global'),
      optionsKey: getComponentSignature('options'),
    };

    // 4) 检查是否可以"复用现有容器"(签名一致 + 容器仍有效)
    const sameSig =
      lastSignature !== null &&
      lastSignature.mesEl === currentSig.mesEl &&
      lastSignature.globalKey === currentSig.globalKey &&
      lastSignature.optionsKey === currentSig.optionsKey;

    if (sameSig) {
      const globalOk = currentSig.globalKey === 'disabled' || isContainerValid(embedTargets.global.value, $mes);
      const optionsOk = currentSig.optionsKey === 'disabled' || isContainerValid(embedTargets.options.value, $mes);
      if (globalOk && optionsOk) {
        // 一切照旧,什么也不动 —— 这是关键的"不重建"路径
        return;
      }
    }

    // 5) 需要重建：先移除全部旧容器，再按需重新插入
    removeAllContainers();

    // 6) 按 enabled 状态分别为 global / options 创建容器
    if (configStore.config.embedGlobalStatus) {
      const container = resolveInsertionPoint($mes, 'global');
      if (container) {
        embedTargets.global.value = container;
      }
    }

    if (configStore.config.embedOptions) {
      const container = resolveInsertionPoint($mes, 'options');
      if (container) {
        embedTargets.options.value = container;
      }
    }

    // 7) 记录新签名
    lastSignature = currentSig;

    // 8) 如果至少一个组件不是 mes_block_end，需要额外监听 mes_text 变化
    watchMesTextChanges($mes);
  }

  // ============================================================
  // chatObserver: 监听 #chat 变化（新消息到来时重新定位）
  // ============================================================

  /** debounced 版本的 ensureContainers */
  const debouncedEnsure = debounce(() => {
    requestAnimationFrame(() => ensureContainers());
  }, CHAT_OBSERVER_DEBOUNCE);

  /** 启动 #chat 的 MutationObserver */
  function startChatObserver(): void {
    const parentDoc = getParentDoc();
    const chatEl = parentDoc.getElementById('chat');
    if (!chatEl) {
      console.warn('[ACU ChatEmbed] #chat 元素不存在，稍后重试');
      setTimeout(startChatObserver, 1000);
      return;
    }

    chatObserver?.disconnect();
    chatObserver = new MutationObserver(mutations => {
      // 过滤掉源自嵌入容器自身的变更,避免 InteractionTableWidget 内部 DOM 变化
      // 触发 ensureContainers,从而打断滚动等用户操作
      const relevant = mutations.some(m => {
        const target = m.target as HTMLElement | null;
        if (!target) return false;
        // 如果变更的目标在嵌入容器内,忽略
        if (target.closest?.(`.${CONTAINER_CLASS}`)) return false;
        return true;
      });
      if (relevant) {
        debouncedEnsure();
      }
    });
    chatObserver.observe(chatEl, {
      childList: true,
      subtree: true,
    });

    console.info('[ACU ChatEmbed] chatObserver 已启动');
  }

  /** 停止所有 observer */
  function stopObservers(): void {
    chatObserver?.disconnect();
    chatObserver = null;
    mesTextObserver?.disconnect();
    mesTextObserver = null;
    watchedMesText = null;
    debouncedEnsure.cancel();
  }

  // ============================================================
  // 配置监听
  // ============================================================

  // 监听总开关、组件启用状态、每组件位置/选择器、旧版兼容字段的变化
  watch(
    () => [
      configStore.config.enableChatEmbed,
      configStore.config.embedGlobalStatus,
      configStore.config.embedOptions,
      configStore.config.embedPosition,
      configStore.config.embedSelector,
      configStore.config.embedComponents?.global?.position,
      configStore.config.embedComponents?.global?.selector,
      configStore.config.embedComponents?.options?.position,
      configStore.config.embedComponents?.options?.selector,
    ],
    () => {
      ensureContainers();
    },
    { flush: 'post' },
  );

  // ============================================================
  // 生命周期
  // ============================================================

  onMounted(() => {
    ensureContainers();
    startChatObserver();
  });

  onUnmounted(() => {
    stopObservers();
    removeAllContainers();
  });

  return {
    /** 暴露给 Vue Teleport 的容器 DOM 引用（按组件 ID 分） */
    embedTargets,
    /** 立即检查并确保所有容器存在 */
    ensureContainers,
    /** 移除所有嵌入容器 */
    removeAllContainers,
  };
}

export type UseChatAreaEmbed = ReturnType<typeof useChatAreaEmbed>;
