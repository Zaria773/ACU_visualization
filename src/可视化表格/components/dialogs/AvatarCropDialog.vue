<template>
  <div v-if="visible" class="acu-modal-container acu-crop-modal-overlay" @click.self="handleClose">
    <div class="acu-modal acu-crop-dialog">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">
          <i class="fas fa-crop-simple"></i>
          调整头像 - {{ name }}
        </span>
        <button class="acu-close-pill" @click.stop="handleClose">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- 内容区 -->
      <div class="acu-modal-body acu-crop-body">
        <!-- 预览区 - 支持拖动 -->
        <div class="acu-crop-preview-wrapper">
          <div
            ref="previewRef"
            class="acu-crop-preview"
            :class="{ 'is-dragging': isDragging }"
            :style="previewStyle"
            @mousedown="handleDragStart"
            @touchstart.prevent="handleTouchStart"
          >
            <!-- 无图片时显示占位 -->
            <div v-if="!imageUrl" class="acu-crop-placeholder">
              <i class="fas fa-image"></i>
              <span>暂无图片</span>
            </div>
          </div>
        </div>

        <!-- 滑块控制 -->
        <div class="acu-crop-controls">
          <!-- X 偏移 -->
          <div class="acu-crop-control-row">
            <label class="acu-crop-label">
              <i class="fas fa-arrows-left-right"></i>
              X偏移
            </label>
            <input
              type="range"
              class="acu-crop-slider"
              min="0"
              max="100"
              :value="offsetX"
              @input="offsetX = Number(($event.target as HTMLInputElement).value)"
            />
            <span class="acu-crop-value">{{ offsetX }}%</span>
          </div>

          <!-- Y 偏移 -->
          <div class="acu-crop-control-row">
            <label class="acu-crop-label">
              <i class="fas fa-arrows-up-down"></i>
              Y偏移
            </label>
            <input
              type="range"
              class="acu-crop-slider"
              min="0"
              max="100"
              :value="offsetY"
              @input="offsetY = Number(($event.target as HTMLInputElement).value)"
            />
            <span class="acu-crop-value">{{ offsetY }}%</span>
          </div>

          <!-- 缩放 -->
          <div class="acu-crop-control-row">
            <label class="acu-crop-label">
              <i class="fas fa-magnifying-glass-plus"></i>
              缩放
            </label>
            <input
              type="range"
              class="acu-crop-slider"
              min="100"
              max="300"
              :value="scale"
              @input="scale = Number(($event.target as HTMLInputElement).value)"
            />
            <span class="acu-crop-value">{{ scale }}%</span>
          </div>
        </div>

        <!-- 上传新图片按钮 -->
        <div class="acu-crop-upload-section">
          <button class="acu-modal-btn secondary" @click.stop="triggerUpload">
            <i class="fas fa-upload"></i> 上传新图片
          </button>
          <input ref="fileInputRef" type="file" accept="image/*" style="display: none" @change="handleFileSelect" />
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="acu-modal-footer">
        <button class="acu-modal-btn secondary" @click.stop="resetValues">重置</button>
        <button class="acu-modal-btn primary" @click.stop="applyAndClose">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AvatarCropDialog.vue - 头像裁剪弹窗
 *
 * 功能：
 * - 预览头像效果
 * - 调整 X/Y 偏移和缩放
 * - 支持上传新图片替换
 */

import { computed, ref, watch } from 'vue';

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  /** 是否显示 */
  visible: boolean;
  /** 图片 URL */
  imageUrl: string;
  /** 角色名称 */
  name: string;
  /** 初始 X 偏移 */
  initialOffsetX?: number;
  /** 初始 Y 偏移 */
  initialOffsetY?: number;
  /** 初始缩放 */
  initialScale?: number;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  imageUrl: '',
  name: '',
  initialOffsetX: 50,
  initialOffsetY: 50,
  initialScale: 150,
});

const emit = defineEmits<{
  /** 关闭弹窗 */
  (e: 'close'): void;
  /** 应用更改 */
  (e: 'apply', data: { offsetX: number; offsetY: number; scale: number }): void;
  /** 上传新图片 */
  (e: 'upload', file: File): void;
}>();

// ============================================================
// 状态
// ============================================================

const offsetX = ref(props.initialOffsetX);
const offsetY = ref(props.initialOffsetY);
const scale = ref(props.initialScale);
const fileInputRef = ref<HTMLInputElement | null>(null);
const previewRef = ref<HTMLElement | null>(null);

// 拖动状态
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);
const dragStartOffsetX = ref(0);
const dragStartOffsetY = ref(0);

// ============================================================
// 计算属性
// ============================================================

const previewStyle = computed(() => {
  if (!props.imageUrl) return {};

  return {
    backgroundImage: `url('${props.imageUrl}')`,
    backgroundPosition: `${offsetX.value}% ${offsetY.value}%`,
    backgroundSize: `${scale.value}%`,
  };
});

// ============================================================
// 事件处理
// ============================================================

function handleClose() {
  emit('close');
}

function applyAndClose() {
  emit('apply', {
    offsetX: offsetX.value,
    offsetY: offsetY.value,
    scale: scale.value,
  });
}

function resetValues() {
  offsetX.value = 50;
  offsetY.value = 50;
  scale.value = 150;
}

function triggerUpload() {
  fileInputRef.value?.click();
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (file) {
    emit('upload', file);
  }

  input.value = '';
}

// ============================================================
// 拖动功能
// ============================================================

/** 鼠标拖动开始 */
function handleDragStart(e: MouseEvent) {
  if (!props.imageUrl) return;

  isDragging.value = true;
  dragStartX.value = e.clientX;
  dragStartY.value = e.clientY;
  dragStartOffsetX.value = offsetX.value;
  dragStartOffsetY.value = offsetY.value;

  // 添加全局事件监听
  const parentDoc = window.parent?.document || document;
  parentDoc.addEventListener('mousemove', handleDragMove);
  parentDoc.addEventListener('mouseup', handleDragEnd);
}

/** 触摸拖动开始 */
function handleTouchStart(e: TouchEvent) {
  if (!props.imageUrl || e.touches.length !== 1) return;

  const touch = e.touches[0];
  isDragging.value = true;
  dragStartX.value = touch.clientX;
  dragStartY.value = touch.clientY;
  dragStartOffsetX.value = offsetX.value;
  dragStartOffsetY.value = offsetY.value;

  // 添加全局事件监听
  const parentDoc = window.parent?.document || document;
  parentDoc.addEventListener('touchmove', handleTouchMove, { passive: false });
  parentDoc.addEventListener('touchend', handleTouchEnd);
}

/** 鼠标拖动中 */
function handleDragMove(e: MouseEvent) {
  if (!isDragging.value) return;

  const deltaX = e.clientX - dragStartX.value;
  const deltaY = e.clientY - dragStartY.value;

  updateOffset(deltaX, deltaY);
}

/** 触摸拖动中 */
function handleTouchMove(e: TouchEvent) {
  if (!isDragging.value || e.touches.length !== 1) return;

  e.preventDefault(); // 阻止页面滚动

  const touch = e.touches[0];
  const deltaX = touch.clientX - dragStartX.value;
  const deltaY = touch.clientY - dragStartY.value;

  updateOffset(deltaX, deltaY);
}

/** 更新偏移值 */
function updateOffset(deltaX: number, deltaY: number) {
  // 将像素移动转换为百分比偏移
  // 预览区大小约 120px，偏移范围 0-100%
  // 移动 120px 对应 100% 偏移变化
  const sensitivity = 0.8; // 灵敏度系数
  const previewSize = 120;

  // 注意：拖动方向与背景偏移方向相反
  const newOffsetX = dragStartOffsetX.value - (deltaX / previewSize) * 100 * sensitivity;
  const newOffsetY = dragStartOffsetY.value - (deltaY / previewSize) * 100 * sensitivity;

  // 限制在 0-100 范围内
  offsetX.value = Math.max(0, Math.min(100, Math.round(newOffsetX)));
  offsetY.value = Math.max(0, Math.min(100, Math.round(newOffsetY)));
}

/** 鼠标拖动结束 */
function handleDragEnd() {
  isDragging.value = false;

  const parentDoc = window.parent?.document || document;
  parentDoc.removeEventListener('mousemove', handleDragMove);
  parentDoc.removeEventListener('mouseup', handleDragEnd);
}

/** 触摸拖动结束 */
function handleTouchEnd() {
  isDragging.value = false;

  const parentDoc = window.parent?.document || document;
  parentDoc.removeEventListener('touchmove', handleTouchMove);
  parentDoc.removeEventListener('touchend', handleTouchEnd);
}

// ============================================================
// 监听器
// ============================================================

// 当弹窗打开时，重置为初始值
watch(
  () => props.visible,
  visible => {
    if (visible) {
      offsetX.value = props.initialOffsetX;
      offsetY.value = props.initialOffsetY;
      scale.value = props.initialScale;
    }
  },
);
</script>
