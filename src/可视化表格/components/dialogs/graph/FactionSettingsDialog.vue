<template>
  <Transition name="modal">
    <div v-if="visible" class="acu-modal-container" @click.self="handleClose">
      <div class="acu-modal acu-faction-settings-modal">
        <!-- 头部 -->
        <div class="acu-modal-header">
          <span class="acu-modal-title">势力设置 - {{ factionName }}</span>
          <button class="acu-close-pill" @click.stop="handleClose">完成</button>
        </div>

        <!-- 内容 -->
        <div class="acu-modal-body">
          <!-- 颜色设置 -->
          <div class="acu-settings-section">
            <div class="acu-settings-title">
              <i class="fas fa-palette"></i>
              颜色设置
            </div>
            <div class="acu-settings-group">
              <!-- 边框&tag颜色 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  边框&tag颜色
                  <span class="hint">虚线框颜色</span>
                </div>
                <div class="acu-settings-control">
                  <input v-model="localConfig.borderColor" type="color" class="acu-dashed" title="边框颜色" />
                </div>
              </div>

              <!-- 背景颜色 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  背景颜色
                  <span class="hint">容器填充色</span>
                </div>
                <div class="acu-settings-control">
                  <input v-model="localConfig.backgroundColor" type="color" title="背景颜色" />
                </div>
              </div>

              <!-- 背景透明度 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  背景透明度
                  <span class="hint">{{ localConfig.backgroundOpacity }}%</span>
                </div>
                <div class="acu-settings-control">
                  <input v-model.number="localConfig.backgroundOpacity" type="range" min="0" max="100" step="5" />
                </div>
              </div>
            </div>
          </div>

          <!-- 标签设置 -->
          <div class="acu-settings-section">
            <div class="acu-settings-title">
              <i class="fas fa-tag"></i>
              标签设置
            </div>
            <div class="acu-settings-group">
              <!-- 标签位置 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  标签位置
                  <span class="hint">势力名称显示位置</span>
                </div>
                <div class="acu-settings-control">
                  <select v-model="localConfig.labelPosition">
                    <option value="top">顶部</option>
                    <option value="bottom">底部</option>
                    <option value="top-left">内部左上</option>
                    <option value="top-right">内部右上</option>
                    <option value="bottom-left">内部左下</option>
                    <option value="bottom-right">内部右下</option>
                    <option value="none">不显示</option>
                  </select>
                </div>
              </div>

              <!-- 标签字体大小 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  标签字体
                  <span class="hint">{{ localConfig.labelFontSize }}px</span>
                </div>
                <div class="acu-settings-control">
                  <input v-model.number="localConfig.labelFontSize" type="range" min="10" max="24" step="1" />
                </div>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="acu-settings-section">
            <div class="acu-settings-group">
              <div class="acu-settings-row acu-action-row">
                <button class="acu-action-btn acu-action-btn-secondary" @click.stop="handleReset">
                  <i class="fas fa-undo"></i>
                  重置为默认
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * FactionSettingsDialog.vue - 势力设置弹窗
 *
 * 用于配置单个势力的个性化样式：
 * - 边框颜色
 * - 背景颜色
 * - 背景透明度
 * - 标签位置
 * - 标签字体大小
 */

import { reactive, watch, watchEffect } from 'vue';

import { DEFAULT_FACTION_STYLE, useGraphConfigStore } from '../../../stores/useGraphConfigStore';

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  /** 弹窗是否可见 */
  visible: boolean;
  /** 势力ID（容器节点ID） */
  factionId: string;
  /** 势力名称 */
  factionName: string;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  factionId: '',
  factionName: '',
});

const emit = defineEmits<{
  /** 关闭弹窗 */
  (e: 'close'): void;
  /** 保存设置 */
  (e: 'save'): void;
}>();

// ============================================================
// Store
// ============================================================

const graphConfigStore = useGraphConfigStore();

// ============================================================
// 本地配置状态
// ============================================================

interface LocalConfig {
  borderColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  labelPosition: 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
  labelFontSize: number;
}

const localConfig = reactive<LocalConfig>({
  borderColor: DEFAULT_FACTION_STYLE.border,
  backgroundColor: extractBaseColor(DEFAULT_FACTION_STYLE.background),
  backgroundOpacity: DEFAULT_FACTION_STYLE.opacity ?? 10,
  labelPosition: 'top',
  labelFontSize: 14,
});

// ============================================================
// 工具函数
// ============================================================

/**
 * 从 rgba 颜色中提取基础颜色为 hex
 * 如果已经是 hex 格式，直接返回
 */
function extractBaseColor(color: string): string {
  if (color.startsWith('#')) {
    return color;
  }
  // 从 rgba(r, g, b, a) 中提取 RGB 并转换为 hex
  const match = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (match) {
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  return '#808080'; // 默认灰色
}

/**
 * 将 hex 颜色转换为带透明度的 rgba
 */
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

// ============================================================
// 监听 props 变化，加载配置
// ============================================================

watch(
  () => props.visible,
  newVisible => {
    if (newVisible && props.factionId) {
      loadConfig();
    }
  },
);

watch(
  () => props.factionId,
  newId => {
    if (newId && props.visible) {
      loadConfig();
    }
  },
);

/**
 * 从 Store 加载势力配置
 */
function loadConfig(): void {
  const override = graphConfigStore.getFactionOverride(props.factionId);

  if (override) {
    localConfig.borderColor = override.border || DEFAULT_FACTION_STYLE.border;
    localConfig.backgroundColor = extractBaseColor(override.background || DEFAULT_FACTION_STYLE.background);
    localConfig.backgroundOpacity = override.opacity ?? DEFAULT_FACTION_STYLE.opacity ?? 10;
    localConfig.labelPosition = override.labelPosition ?? 'top';
    localConfig.labelFontSize = override.labelFontSize ?? graphConfigStore.config.factionLabelFontSize;
  } else {
    // 使用默认值
    localConfig.borderColor = DEFAULT_FACTION_STYLE.border;
    localConfig.backgroundColor = extractBaseColor(DEFAULT_FACTION_STYLE.background);
    localConfig.backgroundOpacity = DEFAULT_FACTION_STYLE.opacity ?? 10;
    localConfig.labelPosition = 'top';
    localConfig.labelFontSize = graphConfigStore.config.factionLabelFontSize;
  }
}

// ============================================================
// 实时保存
// ============================================================

/** 实时保存设置到 store */
watchEffect(() => {
  if (!props.visible || !props.factionId) return;

  graphConfigStore.setFactionOverride(props.factionId, {
    border: localConfig.borderColor,
    background: hexToRgba(localConfig.backgroundColor, localConfig.backgroundOpacity),
    opacity: localConfig.backgroundOpacity,
    labelPosition: localConfig.labelPosition,
    labelFontSize: localConfig.labelFontSize,
  });

  emit('save');
});

// ============================================================
// 事件处理
// ============================================================

/** 关闭弹窗 */
function handleClose(): void {
  emit('close');
}

/** 重置为默认 */
function handleReset(): void {
  graphConfigStore.removeFactionOverride(props.factionId);

  // 重新加载默认配置
  localConfig.borderColor = DEFAULT_FACTION_STYLE.border;
  localConfig.backgroundColor = extractBaseColor(DEFAULT_FACTION_STYLE.background);
  localConfig.backgroundOpacity = DEFAULT_FACTION_STYLE.opacity ?? 10;
  localConfig.labelPosition = 'top';
  localConfig.labelFontSize = graphConfigStore.config.factionLabelFontSize;
}
</script>

<style>
/* 样式通过 useParentStyleInjection 注入到父窗口 */
/* 详见 styles/overlays/dialogs.scss */
</style>
