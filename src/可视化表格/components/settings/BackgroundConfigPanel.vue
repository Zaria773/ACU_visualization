<template>
  <div class="acu-settings-section">
    <div class="acu-settings-title">
      <i class="fas fa-image"></i>
      背景配置
      <span style="font-weight: 400; font-size: 11px; color: var(--acu-text-sub); margin-left: auto;">
        自定义背景图片
      </span>
    </div>
    <div class="acu-settings-group">
      <!-- 启用背景 -->
      <div class="acu-settings-row">
        <div class="acu-settings-label">
          启用背景
          <span class="hint">显示自定义背景图片</span>
        </div>
        <div class="acu-settings-control">
          <label class="acu-switch">
            <input v-model="localConfig.enabled" type="checkbox" @change="handleConfigChange" />
            <span class="slider"></span>
          </label>
        </div>
      </div>
    </div>

    <!-- 背景详细设置 -->
    <div v-if="localConfig.enabled" class="acu-background-config-section">
      <!-- 图片预览区域 - 可拖动定位 -->
      <div class="acu-background-preview-container">
        <div
          ref="previewRef"
          class="acu-background-preview"
          :class="{ 'dragging': isPreviewDragging, 'has-image': !!localConfig.imageUrl }"
          @mousedown.prevent="handlePreviewDragStart"
          @touchstart.prevent="handlePreviewDragStart"
        >
          <!-- 有图片时显示预览 -->
          <template v-if="localConfig.imageUrl">
            <div
              class="acu-preview-image"
              :style="previewImageStyle"
            ></div>
          </template>
          <!-- 无图片时显示提示 -->
          <template v-else>
            <div class="acu-no-image-hint">
              <i class="fas fa-image"></i>
              <span>暂无背景图片</span>
            </div>
          </template>
        </div>
      </div>

      <!-- 操作按钮行 -->
      <div class="acu-background-actions">
        <button class="acu-action-btn" @click.stop="triggerFileInput">
          <i class="fas fa-camera"></i>
          上传图片
        </button>
        <button class="acu-action-btn" @click.stop="showUrlInput = !showUrlInput">
          <i class="fas fa-link"></i>
          使用URL
        </button>
        <button class="acu-action-btn acu-action-btn-danger" @click.stop="handleClearBackground">
          <i class="fas fa-trash"></i>
          清除
        </button>
        <!-- 隐藏的文件输入 -->
        <input
          ref="fileInputRef"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          style="display: none;"
          @change="handleFileSelect"
        />
      </div>

      <!-- URL 输入框（可折叠） -->
      <div v-if="showUrlInput" class="acu-settings-row acu-url-input-row">
        <input
          v-model="backgroundUrlInput"
          type="text"
          placeholder="输入图片 URL（https://...）"
          class="acu-background-url-input"
          @blur="handleUrlInputBlur"
          @keyup.enter="handleUrlInputBlur"
        />
      </div>

      <!-- 缩放 -->
      <div class="acu-settings-row">
        <div class="acu-settings-label">
          缩放
          <span class="hint">{{ localConfig.scale }}%</span>
        </div>
        <div class="acu-settings-control">
          <input
            v-model.number="localConfig.scale"
            type="range"
            min="50"
            max="200"
            step="5"
            @change="handleConfigChange"
          />
        </div>
      </div>

      <!-- 透明度 -->
      <div class="acu-settings-row">
        <div class="acu-settings-label">
          透明度
          <span class="hint">{{ localConfig.opacity }}%</span>
        </div>
        <div class="acu-settings-control">
          <input
            v-model.number="localConfig.opacity"
            type="range"
            min="0"
            max="100"
            step="5"
            @change="handleConfigChange"
          />
        </div>
      </div>

      <!-- 填充方式 -->
      <div class="acu-settings-row">
        <div class="acu-settings-label">
          填充方式
          <span class="hint">图片如何填充容器</span>
        </div>
        <div class="acu-settings-control">
          <select v-model="localConfig.size" class="acu-select" @change="handleConfigChange">
            <option value="cover">覆盖</option>
            <option value="auto">自动</option>
          </select>
        </div>
      </div>

      <!-- 模糊度 -->
      <div class="acu-settings-row">
        <div class="acu-settings-label">
          模糊度
          <span class="hint">{{ localConfig.blur }}px</span>
        </div>
        <div class="acu-settings-control">
          <input
            v-model.number="localConfig.blur"
            type="range"
            min="0"
            max="20"
            step="1"
            @change="handleConfigChange"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { deleteBackground, fileToBlob, loadBackground, revokeBlobUrl, saveBackground, urlToBlob } from '../../composables/useBackgroundStorage';
import type { BackgroundConfig } from '../../types';

const props = defineProps<{
  /** IndexedDB 存储键名 */
  storageKey: string;
  /** 背景配置对象 */
  modelValue: BackgroundConfig;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: BackgroundConfig): void;
}>();

/** 最大图片大小 (2MB) */
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

// 本地配置副本，用于双向绑定
const localConfig = reactive<BackgroundConfig>({ ...props.modelValue });

// 背景 URL 输入框
const backgroundUrlInput = ref(localConfig.imageUrl || '');

// 文件输入引用
const fileInputRef = ref<HTMLInputElement | null>(null);

// URL 输入框显示状态
const showUrlInput = ref(false);

// 预览区域 ref
const previewRef = ref<HTMLElement | null>(null);

// 预览拖动状态
const isPreviewDragging = ref(false);
const dragStartPos = { x: 0, y: 0 };
const dragStartOffset = { x: 0, y: 0 };

// 当前 blob URL（需要在组件卸载时释放）
const currentBlobUrl = ref<string | null>(null);

// 预览图片样式（计算属性）
const previewImageStyle = computed(() => {
  if (!localConfig.imageUrl) return {};
  const offsetX = localConfig.offsetX || 0;
  const offsetY = localConfig.offsetY || 0;
  const scale = (localConfig.scale || 100) / 100;
  return {
    backgroundImage: `url(${localConfig.imageUrl})`,
    backgroundPosition: 'center center',
    backgroundSize: localConfig.size === 'auto' ? '100%' : localConfig.size,
    transform: `translate(${offsetX}%, ${offsetY}%) scale(${scale})`,
    transformOrigin: 'center center',
    backgroundRepeat: 'no-repeat',
  };
});

// 监听 props 变化，更新本地状态
watch(
  () => props.modelValue,
  (newVal) => {
    Object.assign(localConfig, newVal);
    if (newVal.externalUrl) {
      backgroundUrlInput.value = newVal.externalUrl;
    }
  },
  { deep: true }
);

// 组件挂载时加载背景图片
onMounted(async () => {
  if (localConfig.externalUrl) {
    localConfig.imageUrl = localConfig.externalUrl;
    backgroundUrlInput.value = localConfig.externalUrl;
  } else if (localConfig.hasIndexedDBImage) {
    try {
      const blobUrl = await loadBackground(props.storageKey);
      if (blobUrl) {
        currentBlobUrl.value = blobUrl;
        localConfig.imageUrl = blobUrl;
        emitUpdate();
      }
    } catch (e) {
      console.warn('[BackgroundConfigPanel] 加载背景图片失败:', e);
    }
  }
});

// 组件卸载时释放 blob URL
onBeforeUnmount(() => {
  if (currentBlobUrl.value) {
    revokeBlobUrl(currentBlobUrl.value);
    currentBlobUrl.value = null;
  }
});

/**
 * 触发更新事件
 */
function emitUpdate() {
  emit('update:modelValue', { ...localConfig });
}

/**
 * 处理配置变化
 */
function handleConfigChange() {
  emitUpdate();
}

/**
 * 获取事件位置（兼容鼠标和触摸）
 */
function getEventPosition(e: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('touches' in e) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

/**
 * 开始预览区域拖动
 */
function handlePreviewDragStart(e: MouseEvent | TouchEvent): void {
  if (!localConfig.imageUrl) return;

  isPreviewDragging.value = true;
  const pos = getEventPosition(e);
  dragStartPos.x = pos.x;
  dragStartPos.y = pos.y;
  dragStartOffset.x = localConfig.offsetX || 0;
  dragStartOffset.y = localConfig.offsetY || 0;

  // 在父文档上添加事件监听
  const doc = window.parent.document;
  doc.addEventListener('mousemove', handlePreviewDragMove);
  doc.addEventListener('mouseup', handlePreviewDragEnd);
  doc.addEventListener('touchmove', handlePreviewDragMove, { passive: false });
  doc.addEventListener('touchend', handlePreviewDragEnd);
}

/**
 * 预览区域拖动中
 */
function handlePreviewDragMove(e: MouseEvent | TouchEvent): void {
  if (!isPreviewDragging.value) return;
  e.preventDefault();

  const pos = getEventPosition(e);
  const previewEl = previewRef.value;
  if (!previewEl) return;

  const rect = previewEl.getBoundingClientRect();
  const deltaX = ((pos.x - dragStartPos.x) / rect.width) * 100;
  const deltaY = ((pos.y - dragStartPos.y) / rect.height) * 100;

  // 限制偏移范围 -50 到 50
  localConfig.offsetX = Math.max(-50, Math.min(50, dragStartOffset.x + deltaX));
  localConfig.offsetY = Math.max(-50, Math.min(50, dragStartOffset.y + deltaY));
}

/**
 * 预览区域拖动结束
 */
function handlePreviewDragEnd(): void {
  if (!isPreviewDragging.value) return;

  isPreviewDragging.value = false;

  // 移除事件监听
  const doc = window.parent.document;
  doc.removeEventListener('mousemove', handlePreviewDragMove);
  doc.removeEventListener('mouseup', handlePreviewDragEnd);
  doc.removeEventListener('touchmove', handlePreviewDragMove);
  doc.removeEventListener('touchend', handlePreviewDragEnd);

  // 保存偏移配置
  handleConfigChange();
}

/**
 * 触发文件选择
 */
function triggerFileInput(): void {
  fileInputRef.value?.click();
}

/**
 * 处理文件选择
 */
function handleFileSelect(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    processImageFile(file);
  }
  // 重置 input 以便再次选择同一文件
  target.value = '';
}

/**
 * 处理图片文件 - 保存到 IndexedDB
 */
async function processImageFile(file: File): Promise<void> {
  // 检查文件类型
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    alert('不支持的图片格式，请使用 jpg/png/gif/webp 格式');
    return;
  }

  // 检查文件大小
  if (file.size > MAX_IMAGE_SIZE) {
    alert(`图片大小超过限制（最大 ${MAX_IMAGE_SIZE / 1024 / 1024}MB）`);
    return;
  }

  try {
    // 保存到 IndexedDB
    const { blob, mimeType } = await fileToBlob(file);
    await saveBackground(props.storageKey, blob, mimeType);

    // 释放旧的 blob URL
    if (currentBlobUrl.value) {
      revokeBlobUrl(currentBlobUrl.value);
    }

    // 加载预览
    const blobUrl = await loadBackground(props.storageKey);
    if (blobUrl) {
      currentBlobUrl.value = blobUrl;
      localConfig.imageUrl = blobUrl;
    }

    // 更新配置
    localConfig.hasIndexedDBImage = true;
    localConfig.externalUrl = undefined;
    backgroundUrlInput.value = '';

    emitUpdate();
    console.info('[BackgroundConfigPanel] 背景图片已保存到 IndexedDB');
  } catch (e) {
    console.error('[BackgroundConfigPanel] 保存背景图片失败:', e);
    alert('保存背景图片失败');
  }
}

/**
 * 处理 URL 输入框失焦
 */
async function handleUrlInputBlur(): Promise<void> {
  const url = backgroundUrlInput.value.trim();
  if (!url || url === localConfig.imageUrl) return;

  // 外部 URL（http/https）直接使用，不存入 IndexedDB
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // 释放旧的 blob URL
    if (currentBlobUrl.value) {
      revokeBlobUrl(currentBlobUrl.value);
      currentBlobUrl.value = null;
    }

    localConfig.imageUrl = url;
    localConfig.externalUrl = url;
    localConfig.hasIndexedDBImage = false;

    emitUpdate();
    console.info('[BackgroundConfigPanel] 使用外部 URL:', url);
    return;
  }

  // data URL 转换为 Blob 存储到 IndexedDB
  if (url.startsWith('data:')) {
    try {
      const { blob, mimeType } = await urlToBlob(url);
      await saveBackground(props.storageKey, blob, mimeType);

      // 释放旧的 blob URL
      if (currentBlobUrl.value) {
        revokeBlobUrl(currentBlobUrl.value);
      }

      // 加载预览
      const blobUrl = await loadBackground(props.storageKey);
      if (blobUrl) {
        currentBlobUrl.value = blobUrl;
        localConfig.imageUrl = blobUrl;
      }

      localConfig.hasIndexedDBImage = true;
      localConfig.externalUrl = undefined;

      emitUpdate();
      console.info('[BackgroundConfigPanel] data URL 已保存到 IndexedDB');
    } catch (e) {
      console.error('[BackgroundConfigPanel] 保存 data URL 失败:', e);
      alert('保存图片失败');
    }
  }
}

/**
 * 清除背景图片
 */
async function handleClearBackground(): Promise<void> {
  // 释放 blob URL
  if (currentBlobUrl.value) {
    revokeBlobUrl(currentBlobUrl.value);
    currentBlobUrl.value = null;
  }

  // 删除 IndexedDB 中的图片
  try {
    await deleteBackground(props.storageKey);
  } catch (e) {
    console.warn('[BackgroundConfigPanel] 删除背景图片失败:', e);
  }

  localConfig.imageUrl = '';
  localConfig.hasIndexedDBImage = false;
  localConfig.externalUrl = undefined;
  backgroundUrlInput.value = '';

  emitUpdate();
}
</script>

<style scoped>
/* 复用 dialogs-graph.scss 中的样式，这里只保留必要的结构样式 */
/* 实际样式由全局 CSS 提供 */
</style>
