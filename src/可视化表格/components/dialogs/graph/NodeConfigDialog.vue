<template>
  <Transition name="modal">
    <div v-if="visible" class="acu-modal-container" @click.self="handleClose">
      <div class="acu-modal acu-node-config-modal">
        <!-- 头部 -->
        <div class="acu-modal-header">
          <span class="acu-modal-title">节点配置 - {{ fullName }}</span>
          <button class="acu-close-pill" @click.stop="handleClose">完成</button>
        </div>

        <!-- 内容 -->
        <div class="acu-modal-body">
          <!-- 显示名称设置 -->
          <div class="acu-settings-section">
            <div class="acu-settings-title">
              <i class="fas fa-font"></i>
              显示名称
            </div>
            <div class="acu-settings-group">
              <p class="acu-node-hint">点击选择要显示的字符（可多选）</p>
              <div class="acu-char-selector">
                <button
                  v-for="(char, index) in displayChars"
                  :key="index"
                  class="acu-char-btn"
                  :class="{ active: localSelectedIndices.has(index) }"
                  @click.stop="toggleCharSelection(index)"
                >
                  {{ char }}
                </button>
              </div>
              <p class="acu-node-preview">预览：{{ previewLabel }}</p>
              <div class="acu-node-config-actions">
                <button class="acu-action-btn secondary" @click.stop="handleResetToFullName">显示全名</button>
              </div>
            </div>
          </div>

          <!-- 样式设置 -->
          <div class="acu-settings-section">
            <div class="acu-settings-title">
              <i class="fas fa-palette"></i>
              节点样式
            </div>
            <div class="acu-settings-group">
              <!-- 节点大小 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  节点大小
                  <span class="hint">{{ localStyleConfig.size }}px</span>
                </div>
                <div class="acu-settings-control">
                  <input v-model.number="localStyleConfig.size" type="range" min="30" max="120" step="5" />
                </div>
              </div>

              <!-- 边框颜色 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  边框颜色
                  <span class="hint">头像边框色</span>
                </div>
                <div class="acu-settings-control">
                  <input v-model="localStyleConfig.borderColor" type="color" class="acu-dashed" title="边框颜色" />
                </div>
              </div>

              <!-- 边框宽度 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  边框宽度
                  <span class="hint">{{ localStyleConfig.borderWidth }}px</span>
                </div>
                <div class="acu-settings-control">
                  <input v-model.number="localStyleConfig.borderWidth" type="range" min="0" max="10" step="0.5" />
                </div>
              </div>

              <!-- 节点形状 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  头像形状
                  <span class="hint">圆角样式</span>
                </div>
                <div class="acu-settings-control">
                  <select v-model="localStyleConfig.shape">
                    <option value="ellipse">圆形</option>
                    <option value="round-rectangle">圆角矩形</option>
                    <option value="rectangle">矩形</option>
                    <option value="hexagon">六边形</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="acu-settings-section">
            <div class="acu-settings-group">
              <div class="acu-settings-row acu-action-row">
                <button class="acu-action-btn acu-action-btn-secondary" @click.stop="handleResetStyle">
                  <i class="fas fa-undo"></i>
                  重置样式
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
 * NodeConfigDialog.vue - 节点配置弹窗
 *
 * 用于在关系图中配置节点：
 * 1. 选择节点显示的字符
 *    - 中文名：按字符分割，默认选中最后一个字
 *    - 英文名：按空格分割单词，默认选中第一个单词
 * 2. 配置节点个性化样式
 *    - 节点大小、边框颜色/宽度、背景颜色、形状
 */

import { computed, reactive, ref, watch, watchEffect } from 'vue';

import { DEFAULT_NODE_STYLE, useGraphConfigStore } from '../../../stores/useGraphConfigStore';

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  /** 弹窗是否可见 */
  visible: boolean;
  /** 节点 ID */
  nodeId: string;
  /** 节点全名 */
  fullName: string;
  /** 当前显示标签 */
  currentLabel: string;
  /** 当前选中的字符索引 */
  selectedIndices: number[];
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  nodeId: '',
  fullName: '',
  currentLabel: '',
  selectedIndices: () => [],
});

const emit = defineEmits<{
  /** 关闭弹窗 */
  (e: 'close'): void;
  /** 确认选择 */
  (e: 'confirm', nodeId: string, displayLabel: string, selectedIndices: number[]): void;
  /** 重置为全名 */
  (e: 'reset-to-full-name', nodeId: string, fullName: string): void;
  /** 样式更新 */
  (e: 'style-update', nodeId: string): void;
}>();

// ============================================================
// Store
// ============================================================

const graphConfigStore = useGraphConfigStore();

// ============================================================
// 响应式状态
// ============================================================

/** 本地选中的字符索引集合 */
const localSelectedIndices = ref<Set<number>>(new Set());

/** 本地样式配置 */
interface LocalStyleConfig {
  size: number;
  borderColor: string;
  borderWidth: number;
  shape: 'ellipse' | 'rectangle' | 'round-rectangle' | 'hexagon';
}

/** 获取主题文本颜色作为默认边框色 */
function getThemeTextColor(): string {
  try {
    const parentDoc = window.parent?.document || document;
    const wrapper = parentDoc.querySelector('.acu-wrapper');
    if (wrapper) {
      const computed = getComputedStyle(wrapper).getPropertyValue('--acu-text-main').trim();
      if (computed) return computed;
    }
    return '#333333';
  } catch {
    return '#333333';
  }
}

const localStyleConfig = reactive<LocalStyleConfig>({
  size: DEFAULT_NODE_STYLE.size ?? 60,
  borderColor: getThemeTextColor(),
  borderWidth: DEFAULT_NODE_STYLE.borderWidth ?? 2,
  shape: (DEFAULT_NODE_STYLE.shape as 'ellipse' | 'rectangle' | 'round-rectangle' | 'hexagon') ?? 'ellipse',
});

// 监听 props 变化，同步到本地状态
watch(
  () => props.selectedIndices,
  newIndices => {
    localSelectedIndices.value = new Set(newIndices);
  },
  { immediate: true },
);

// 监听 visible 变化，重置本地状态
watch(
  () => props.visible,
  newVisible => {
    if (newVisible) {
      // 弹窗打开时，使用传入的 selectedIndices 或默认值
      if (props.selectedIndices.length > 0) {
        localSelectedIndices.value = new Set(props.selectedIndices);
      } else {
        // 使用默认选中
        localSelectedIndices.value = new Set(getDefaultIndices(props.fullName));
      }
      // 加载节点样式配置
      loadStyleConfig();
    }
  },
);

// 监听 nodeId 变化，加载配置
watch(
  () => props.nodeId,
  newId => {
    if (newId && props.visible) {
      loadStyleConfig();
    }
  },
);

/**
 * 从 Store 加载节点样式配置
 */
function loadStyleConfig(): void {
  const override = graphConfigStore.getNodeStyleOverride(props.nodeId);
  const defaultBorderColor = getThemeTextColor();

  if (override) {
    localStyleConfig.size = override.size ?? DEFAULT_NODE_STYLE.size ?? 60;
    localStyleConfig.borderColor = override.borderColor ?? defaultBorderColor;
    localStyleConfig.borderWidth = override.borderWidth ?? DEFAULT_NODE_STYLE.borderWidth ?? 2;
    localStyleConfig.shape =
      (override.shape as 'ellipse' | 'rectangle' | 'round-rectangle' | 'hexagon') ??
      DEFAULT_NODE_STYLE.shape ??
      'ellipse';
  } else {
    // 使用默认值
    localStyleConfig.size = DEFAULT_NODE_STYLE.size ?? 60;
    localStyleConfig.borderColor = defaultBorderColor;
    localStyleConfig.borderWidth = DEFAULT_NODE_STYLE.borderWidth ?? 2;
    localStyleConfig.shape =
      (DEFAULT_NODE_STYLE.shape as 'ellipse' | 'rectangle' | 'round-rectangle' | 'hexagon') ?? 'ellipse';
  }
}

// ============================================================
// 计算属性
// ============================================================

/**
 * 检测是否为英文名（包含空格或全英文）
 */
function isEnglishName(name: string): boolean {
  return /^[A-Za-z\s'-]+$/.test(name) && name.includes(' ');
}

/**
 * 获取显示的字符数组
 * - 英文名按单词分割
 * - 中文名按字符分割
 */
function getDisplayCharsFromName(fullName: string): string[] {
  if (isEnglishName(fullName)) {
    return fullName.split(' ').filter(Boolean);
  }
  return fullName.split('');
}

/**
 * 获取默认选中的索引
 */
function getDefaultIndices(fullName: string): number[] {
  const chars = getDisplayCharsFromName(fullName);
  if (isEnglishName(fullName)) {
    // 英文名：默认选中第一个单词
    return [0];
  }
  // 中文名：默认选中最后一个字
  return chars.length > 0 ? [chars.length - 1] : [];
}

/**
 * 获取默认显示标签
 */
function getDefaultLabel(fullName: string): string {
  if (isEnglishName(fullName)) {
    const firstName = fullName.split(' ')[0];
    return firstName.length > 6 ? firstName.slice(0, 6) : firstName;
  }
  return fullName.length > 0 ? fullName[fullName.length - 1] : fullName;
}

/** 显示的字符数组 */
const displayChars = computed(() => getDisplayCharsFromName(props.fullName));

/** 预览标签 */
const previewLabel = computed(() => {
  if (!props.fullName) return '';

  const chars = displayChars.value;
  const selectedChars = Array.from(localSelectedIndices.value)
    .sort((a, b) => a - b)
    .map(i => chars[i])
    .filter(Boolean);

  if (selectedChars.length === 0) {
    return getDefaultLabel(props.fullName);
  }

  // 英文名用空格连接，中文名直接连接
  if (isEnglishName(props.fullName)) {
    return selectedChars.join(' ');
  }
  return selectedChars.join('');
});

// ============================================================
// 事件处理
// ============================================================

/** 切换字符选择 */
function toggleCharSelection(index: number) {
  const newSet = new Set(localSelectedIndices.value);
  if (newSet.has(index)) {
    newSet.delete(index);
  } else {
    newSet.add(index);
  }
  localSelectedIndices.value = newSet;
}

/** 关闭弹窗（自动保存） */
function handleClose() {
  // 自动保存显示名称配置
  const selectedIndices = Array.from(localSelectedIndices.value);
  emit('confirm', props.nodeId, previewLabel.value, selectedIndices);
  emit('close');
}

/** 实时保存样式配置 */
watchEffect(() => {
  if (!props.visible || !props.nodeId) return;

  // 保存样式配置到 store
  graphConfigStore.setNodeStyleOverride(props.nodeId, {
    size: localStyleConfig.size,
    borderColor: localStyleConfig.borderColor,
    borderWidth: localStyleConfig.borderWidth,
    shape: localStyleConfig.shape,
  });

  // 触发样式更新
  emit('style-update', props.nodeId);
});

/** 重置为全名 */
function handleResetToFullName() {
  emit('reset-to-full-name', props.nodeId, props.fullName);
}

/** 重置样式为默认值 */
function handleResetStyle(): void {
  graphConfigStore.removeNodeStyleOverride(props.nodeId);

  // 重新加载默认配置
  localStyleConfig.size = DEFAULT_NODE_STYLE.size ?? 60;
  localStyleConfig.borderColor = getThemeTextColor();
  localStyleConfig.borderWidth = DEFAULT_NODE_STYLE.borderWidth ?? 2;
  localStyleConfig.shape =
    (DEFAULT_NODE_STYLE.shape as 'ellipse' | 'rectangle' | 'round-rectangle' | 'hexagon') ?? 'ellipse';

  emit('style-update', props.nodeId);
}
</script>

<style>
/* 样式通过 useParentStyleInjection 注入到父窗口 */
/* 详见 styles/overlays/dialogs.scss */
</style>
