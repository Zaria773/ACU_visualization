<template>
  <div class="acu-chat-embed-panel">
    <!-- 总开关 -->
    <div class="acu-settings-section">
      <div class="acu-settings-title">
        <i class="fas fa-comment-dots"></i>
        基础设置
      </div>
      <div class="acu-settings-group">
        <div class="acu-settings-row">
          <div class="acu-settings-label">
            启用嵌入显示
            <span class="hint">将组件显示在聊天消息区域内,不修改消息内容</span>
          </div>
          <div class="acu-settings-control">
            <button
              class="acu-switch"
              :class="{ active: localConfig.enableChatEmbed }"
              @click="localConfig.enableChatEmbed = !localConfig.enableChatEmbed"
            ></button>
          </div>
        </div>

        <div class="acu-settings-row">
          <div class="acu-settings-label">
            默认折叠
            <span class="hint">嵌入的组件初始为折叠状态</span>
          </div>
          <div class="acu-settings-control">
            <button
              class="acu-switch"
              :class="{ active: localConfig.embedDefaultCollapsed, disabled: !localConfig.enableChatEmbed }"
              :disabled="!localConfig.enableChatEmbed"
              @click="
                localConfig.enableChatEmbed && (localConfig.embedDefaultCollapsed = !localConfig.embedDefaultCollapsed)
              "
            ></button>
          </div>
        </div>
      </div>
    </div>

    <!-- 选择器语法说明 -->
    <div class="acu-settings-section">
      <div class="acu-settings-title">
        <i class="fas fa-info-circle"></i>
        选择器语法
      </div>
      <div class="acu-css-hint">
        <p style="margin: 4px 0">当"插入位置"选择 <strong>指定元素后面</strong> 时,可使用以下写法:</p>
        <ul style="margin: 4px 0; padding-left: 20px">
          <li><code>&lt;think&gt;</code> – 在第一个 <code>&lt;think&gt;</code> 元素 <strong>之前</strong> 插入</li>
          <li><code>&lt;/think&gt;</code> – 在最后一个 <code>&lt;think&gt;</code> 元素 <strong>之后</strong> 插入</li>
          <li>
            <code>&lt;pre&gt;</code> / <code>&lt;/pre&gt;</code> – 同理,在第一个/最后一个
            <code>&lt;pre&gt;</code> 之前/之后
          </li>
          <li><code>think</code> – 等价于 <code>&lt;/think&gt;</code>(在最后一个 <code>think</code> 之后)</li>
          <li><code>pre:last-of-type</code> – 高级 CSS 选择器,默认放在最后一个匹配元素之后</li>
        </ul>
      </div>
    </div>

    <!-- 全局数据看板 -->
    <div class="acu-settings-section">
      <div class="acu-settings-title">
        <i class="fas fa-globe"></i>
        全局数据看板
      </div>
      <div class="acu-settings-group">
        <div class="acu-settings-row">
          <div class="acu-settings-label">
            启用此组件
            <span class="hint">在最新AI消息内显示全局数据(时间/地点等)</span>
          </div>
          <div class="acu-settings-control">
            <button
              class="acu-switch"
              :class="{ active: localConfig.embedGlobalStatus, disabled: !localConfig.enableChatEmbed }"
              :disabled="!localConfig.enableChatEmbed"
              @click="localConfig.enableChatEmbed && (localConfig.embedGlobalStatus = !localConfig.embedGlobalStatus)"
            ></button>
          </div>
        </div>

        <div class="acu-settings-row">
          <div class="acu-settings-label">
            插入位置
            <span class="hint">组件在消息中的显示位置</span>
          </div>
          <div class="acu-settings-control">
            <select
              v-model="globalPosition"
              class="acu-select"
              :disabled="!localConfig.enableChatEmbed || !localConfig.embedGlobalStatus"
            >
              <option value="mes_block_start">消息卡片最前面(思维链之前)</option>
              <option value="mes_block_end">消息卡片底部(推荐)</option>
              <option value="mes_text_end">消息文字末尾</option>
              <option value="mes_text_after_selector">指定元素后面</option>
            </select>
          </div>
        </div>

        <div v-if="globalPosition === 'mes_text_after_selector'" class="acu-settings-row">
          <div class="acu-settings-label">
            选择器
            <span class="hint">填 <code>&lt;think&gt;</code> 之前 / <code>&lt;/think&gt;</code> 之后</span>
          </div>
          <div class="acu-settings-control">
            <input
              v-model="globalSelector"
              type="text"
              class="acu-search-input"
              placeholder="例: </think>"
              :disabled="!localConfig.enableChatEmbed || !localConfig.embedGlobalStatus"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 行动选项(交互表) -->
    <div class="acu-settings-section">
      <div class="acu-settings-title">
        <i class="fas fa-hand-pointer"></i>
        行动选项(交互表)
      </div>
      <div class="acu-settings-group">
        <div class="acu-settings-row">
          <div class="acu-settings-label">
            启用此组件
            <span class="hint">在最新AI消息内显示交互表/选项</span>
          </div>
          <div class="acu-settings-control">
            <button
              class="acu-switch"
              :class="{ active: localConfig.embedOptions, disabled: !localConfig.enableChatEmbed }"
              :disabled="!localConfig.enableChatEmbed"
              @click="localConfig.enableChatEmbed && (localConfig.embedOptions = !localConfig.embedOptions)"
            ></button>
          </div>
        </div>

        <div class="acu-settings-row">
          <div class="acu-settings-label">
            插入位置
            <span class="hint">组件在消息中的显示位置</span>
          </div>
          <div class="acu-settings-control">
            <select
              v-model="optionsPosition"
              class="acu-select"
              :disabled="!localConfig.enableChatEmbed || !localConfig.embedOptions"
            >
              <option value="mes_block_start">消息卡片最前面(思维链之前)</option>
              <option value="mes_block_end">消息卡片底部(推荐)</option>
              <option value="mes_text_end">消息文字末尾</option>
              <option value="mes_text_after_selector">指定元素后面</option>
            </select>
          </div>
        </div>

        <div v-if="optionsPosition === 'mes_text_after_selector'" class="acu-settings-row">
          <div class="acu-settings-label">
            选择器
            <span class="hint">填 <code>&lt;think&gt;</code> 之前 / <code>&lt;/think&gt;</code> 之后</span>
          </div>
          <div class="acu-settings-control">
            <input
              v-model="optionsSelector"
              type="text"
              class="acu-search-input"
              placeholder="例: </think>"
              :disabled="!localConfig.enableChatEmbed || !localConfig.embedOptions"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * ChatEmbedPanel - 聊天区域嵌入配置子面板
 *
 * 功能:
 * - 总开关 / 默认折叠
 * - 全局数据看板:启用 + 独立 position + 独立 selector
 * - 行动选项(交互表):启用 + 独立 position + 独立 selector
 *
 * 选择器支持:
 * - `<think>` → 第一个该元素之前
 * - `</think>` → 最后一个该元素之后
 * - 普通 CSS 选择器
 */

import { computed } from 'vue';
import { useConfigStore } from '../../stores/useConfigStore';
import type { ChatEmbedComponentConfig } from '../../types';

// ============================================================
// Stores
// ============================================================

const configStore = useConfigStore();

// 直接绑定到 store 的 config（即时生效，不需要"完成"按钮才保存）
const localConfig = configStore.config;

// ============================================================
// 组件级配置访问器（双向绑定到 embedComponents.{global,options}）
// ============================================================

/** 确保 embedComponents 子对象存在,并返回它 */
function ensureComponentConfig(id: 'global' | 'options'): ChatEmbedComponentConfig {
  if (!localConfig.embedComponents) {
    localConfig.embedComponents = {};
  }
  if (!localConfig.embedComponents[id]) {
    // 默认与旧字段保持兼容
    localConfig.embedComponents[id] = {
      position: localConfig.embedPosition || 'mes_block_end',
      selector: localConfig.embedSelector || '',
    };
  }
  return localConfig.embedComponents[id]!;
}

// ============================================================
// 全局数据看板配置
// ============================================================

const globalPosition = computed<
  'mes_block_start' | 'mes_block_end' | 'mes_text_end' | 'mes_text_after_selector'
>({
  get: () => ensureComponentConfig('global').position,
  set: v => {
    ensureComponentConfig('global').position = v;
  },
});

const globalSelector = computed<string>({
  get: () => ensureComponentConfig('global').selector || '',
  set: v => {
    ensureComponentConfig('global').selector = v;
  },
});

// ============================================================
// 行动选项配置
// ============================================================

const optionsPosition = computed<
  'mes_block_start' | 'mes_block_end' | 'mes_text_end' | 'mes_text_after_selector'
>({
  get: () => ensureComponentConfig('options').position,
  set: v => {
    ensureComponentConfig('options').position = v;
  },
});

const optionsSelector = computed<string>({
  get: () => ensureComponentConfig('options').selector || '',
  set: v => {
    ensureComponentConfig('options').selector = v;
  },
});
</script>

<style scoped lang="scss">
/* 复用通用 settings 布局样式，无需自定义 */
.acu-chat-embed-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 选择器语法说明区的代码样式 */
.acu-css-hint {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--acu-text-sub);

  code {
    padding: 1px 5px;
    background: var(--acu-card-bg);
    border: 1px solid var(--acu-border);
    border-radius: 3px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 11px;
    color: var(--acu-title-color);
  }

  ul {
    list-style: disc;
  }

  li {
    margin: 3px 0;
    line-height: 1.5;
  }
}
</style>
