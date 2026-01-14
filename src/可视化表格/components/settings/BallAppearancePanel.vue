<template>
  <div class="acu-ball-appearance-panel">
    <!-- 预览区域 - 固定在顶部（使用 position: absolute） -->
    <div class="acu-ball-preview-fixed">
      <button class="acu-reset-mini-btn" title="重置为默认" @click.stop="resetToDefault">
        <i class="fas fa-undo"></i>
      </button>
      <div class="acu-ball-preview" :class="previewClasses" :style="previewStyle">
        <template v-if="localAppearance.type === 'icon'">
          <i :class="['fa-solid', localAppearance.content]"></i>
        </template>
        <template v-else-if="localAppearance.type === 'emoji'">
          {{ localAppearance.content }}
        </template>
        <template v-else-if="localAppearance.type === 'image' && localAppearance.content">
          <img :src="localAppearance.content" alt="" />
        </template>
        <template v-else>
          <i class="fa-solid fa-image"></i>
        </template>
      </div>
    </div>

    <!-- 可滚动内容区 -->
    <div class="acu-ball-scroll-content">
      <!-- 通知动画类型 - 标题与按钮同行 -->
      <div class="acu-settings-section">
        <div class="acu-settings-title-row">
          <div class="acu-settings-title">
            <i class="fas fa-bell"></i>
            AI 填表通知动画
          </div>
          <div class="acu-preview-buttons">
            <button class="acu-tool-btn" @click.stop="playPreviewAnim">▶️ 播放</button>
            <button class="acu-tool-btn" @click.stop="playNotifyEffect">🔔 通知</button>
          </div>
        </div>
        <div class="acu-anim-grid">
          <div
            class="acu-anim-option"
            :class="{ active: localAppearance.notifyAnimation === 'ripple' }"
            @click.stop="localAppearance.notifyAnimation = 'ripple'"
          >
            <span class="acu-anim-icon">🌊</span>
            <span class="acu-anim-name">脉冲波纹</span>
          </div>
          <div
            class="acu-anim-option"
            :class="{ active: localAppearance.notifyAnimation === 'arc' }"
            @click.stop="localAppearance.notifyAnimation = 'arc'"
          >
            <span class="acu-anim-icon">⚡</span>
            <span class="acu-anim-name">电磁闪烁</span>
          </div>
        </div>
      </div>

      <!-- 边框颜色 -->
      <div class="acu-settings-section">
        <div class="acu-settings-title">
          <i class="fas fa-palette"></i>
          边框颜色
        </div>
        <div class="acu-settings-group">
          <div class="acu-settings-row">
            <div class="acu-settings-label">颜色</div>
            <div class="acu-settings-control acu-color-picker-inline">
              <input v-model="localAppearance.borderColor" type="text" class="acu-color-input" placeholder="#RRGGBB" />
              <input v-model="localAppearance.borderColor" type="color" class="acu-color-swatch" />
            </div>
          </div>
          <div class="acu-settings-row">
            <div class="acu-settings-label">
              透明度
              <span class="hint">{{ localAppearance.borderOpacity }}%</span>
            </div>
            <div class="acu-settings-control">
              <input v-model.number="localAppearance.borderOpacity" type="range" min="0" max="100" step="5" />
            </div>
          </div>
        </div>
      </div>

      <!-- 背景颜色 -->
      <div class="acu-settings-section">
        <div class="acu-settings-title">
          <i class="fas fa-fill-drip"></i>
          背景颜色
        </div>
        <div class="acu-settings-group">
          <div class="acu-settings-row">
            <div class="acu-settings-label">颜色</div>
            <div class="acu-settings-control acu-color-picker-inline">
              <input v-model="localAppearance.bgColor" type="text" class="acu-color-input" placeholder="#RRGGBB" />
              <input v-model="localAppearance.bgColor" type="color" class="acu-color-swatch" />
            </div>
          </div>
          <div class="acu-settings-row">
            <div class="acu-settings-label">
              透明度
              <span class="hint">{{ localAppearance.bgOpacity }}%</span>
            </div>
            <div class="acu-settings-control">
              <input v-model.number="localAppearance.bgOpacity" type="range" min="0" max="100" step="5" />
            </div>
          </div>
        </div>
      </div>

      <!-- 尺寸 -->
      <div class="acu-settings-section">
        <div class="acu-settings-title">
          <i class="fas fa-expand-arrows-alt"></i>
          尺寸
        </div>
        <div class="acu-settings-group">
          <div class="acu-settings-row">
            <div class="acu-settings-label">
              球体大小
              <span class="hint">{{ localAppearance.size }}px</span>
            </div>
            <div class="acu-settings-control">
              <input v-model.number="localAppearance.size" type="range" min="40" max="100" step="2" />
            </div>
          </div>
        </div>
      </div>

      <!-- 图标类型 -->
      <div class="acu-settings-section">
        <div class="acu-settings-title">
          <i class="fas fa-icons"></i>
          图标
        </div>
        <!-- 图标类型按钮 - 图标和文字同行 -->
        <div class="acu-icon-type-row">
          <label class="acu-icon-btn" :class="{ active: localAppearance.type === 'icon' }">
            <input v-model="localAppearance.type" type="radio" value="icon" />
            <i class="fa-solid fa-icons"></i>
            <span>FA图标</span>
          </label>
          <label class="acu-icon-btn" :class="{ active: localAppearance.type === 'emoji' }">
            <input v-model="localAppearance.type" type="radio" value="emoji" />
            <span class="emoji-icon">😀</span>
            <span>Emoji</span>
          </label>
          <!-- 图片按钮 - 点击直接上传 -->
          <div
            class="acu-icon-btn"
            :class="{ active: localAppearance.type === 'image' }"
            @click.stop="handleImageBtnClick"
          >
            <input ref="imageInputRef" type="file" accept="image/*" hidden @change="handleImageUpload" />
            <i class="fa-solid fa-image"></i>
            <span>图片</span>
          </div>
        </div>

        <!-- 根据类型显示不同输入（仅图标/Emoji需要输入，图片无需额外输入） -->
        <div v-if="localAppearance.type === 'icon'" class="acu-icon-input-area">
          <div class="acu-icon-input">
            <input v-model="localAppearance.content" placeholder="fa-layer-group" />
            <span class="acu-input-hint">输入 FontAwesome 图标类名</span>
          </div>
        </div>
        <div v-else-if="localAppearance.type === 'emoji'" class="acu-icon-input-area">
          <div class="acu-emoji-input">
            <input v-model="localAppearance.content" placeholder="🎭" />
            <span class="acu-input-hint">输入 Emoji 表情</span>
          </div>
        </div>
        <!-- 图片模式：已上传时显示清除按钮 -->
        <div v-else-if="localAppearance.type === 'image' && localAppearance.content" class="acu-icon-input-area">
          <div class="acu-image-preview-row">
            <img :src="localAppearance.content" alt="" class="acu-preview-thumb" />
            <button class="acu-clear-btn" @click.stop="localAppearance.content = ''">
              <i class="fas fa-times"></i> 清除
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { DEFAULT_BALL_APPEARANCE, useBallAppearanceStore } from '../../stores';
import type { FloatingBallAppearance } from '../../types';
import { compressImage, fileToBase64, hexToRgba } from '../../utils';

// ============================================================
// Store
// ============================================================

const ballStore = useBallAppearanceStore();

// ============================================================
// 本地状态
// ============================================================

const localAppearance = reactive<FloatingBallAppearance>({ ...ballStore.appearance });

/** 预览动画状态 */
const isPreviewAnimating = ref(false);
const isPreviewNotify = ref(false);

/** 图片上传 input ref */
const imageInputRef = ref<HTMLInputElement>();

// ============================================================
// 同步到 Store
// ============================================================

watch(
  localAppearance,
  newVal => {
    ballStore.updateAppearance(newVal);
  },
  { deep: true },
);

// ============================================================
// 预览样式计算
// ============================================================

const previewClasses = computed(() => ({
  'p-anim-ripple': isPreviewAnimating.value && localAppearance.notifyAnimation === 'ripple',
  'p-anim-arc': isPreviewAnimating.value && localAppearance.notifyAnimation === 'arc',
  'p-notify': isPreviewNotify.value,
}));

const previewStyle = computed(() => ({
  '--ball-size': `${localAppearance.size}px`,
  '--ball-border-color': localAppearance.borderColor,
  '--ball-border-color-rgba': hexToRgba(localAppearance.borderColor, localAppearance.borderOpacity),
  '--ball-bg-color': hexToRgba(localAppearance.bgColor, localAppearance.bgOpacity),
}));

// ============================================================
// 预览功能
// ============================================================

function playPreviewAnim() {
  isPreviewAnimating.value = true;
  isPreviewNotify.value = false;
  setTimeout(() => {
    isPreviewAnimating.value = false;
  }, 3000);
}

function playNotifyEffect() {
  isPreviewNotify.value = true;
  isPreviewAnimating.value = false;
  setTimeout(() => {
    isPreviewNotify.value = false;
  }, 3000);
}

// ============================================================
// 图片上传
// ============================================================

/** 点击图片按钮 - 选择图片类型并弹出上传 */
function handleImageBtnClick() {
  localAppearance.type = 'image';
  imageInputRef.value?.click();
}

async function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    let base64 = await fileToBase64(file);
    // 压缩到 100x100 以内
    base64 = await compressImage(base64, 100, 0.8);
    localAppearance.content = base64;
  } catch (e) {
    console.error('[ACU] 图片上传失败:', e);
  }

  // 清空 input，允许重复选择同一文件
  input.value = '';
}

// ============================================================
// 重置
// ============================================================

function resetToDefault() {
  Object.assign(localAppearance, DEFAULT_BALL_APPEARANCE);
}
</script>

<!-- 样式已迁移至 styles/overlays/dialogs.scss -->
