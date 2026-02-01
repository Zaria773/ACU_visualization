<template>
  <Teleport :to="parentBody">
    <Transition
      enter-active-class="divination-overlay-enter-active"
      leave-active-class="divination-overlay-leave-active"
    >
      <div
        v-if="visible"
        class="divination-overlay"
        :style="{
          zIndex: 2147483647,
          paddingBottom: `${configStore.config.mobileSafeAreaBottom ?? 50}px`,
        }"
        @click="handleOverlayClick"
      >
        <!-- 噪点纹理层 -->
        <div class="divination-grain"></div>

        <!-- 动态星空 -->
        <div class="divination-starfield">
          <div
            v-for="star in stars"
            :key="star.id"
            class="divination-star"
            :style="{
              left: star.left,
              top: star.top,
              width: `${star.size}px`,
              height: `${star.size}px`,
              '--duration': `${star.duration}s`,
              '--delay': `${star.delay}s`,
            }"
          ></div>
        </div>

        <!-- 流动星云 -->
        <div class="divination-nebula divination-nebula--purple"></div>
        <div class="divination-nebula divination-nebula--golden"></div>

        <!-- 中心光晕 -->
        <div class="divination-central-glow"></div>

        <!-- 神圣几何背景 -->
        <div class="divination-geometry divination-geometry--outer">
          <svg viewBox="0 0 100 100" fill="none" stroke="#D4AF37" stroke-width="0.05">
            <circle cx="50" cy="50" r="48" />
            <path d="M50 0 L93 75 L6 75 Z" opacity="0.5" />
            <path d="M50 100 L93 25 L6 25 Z" opacity="0.5" />
          </svg>
        </div>
        <div class="divination-geometry divination-geometry--inner">
          <svg viewBox="0 0 100 100" fill="none" stroke="#C6A664" stroke-width="0.1">
            <circle cx="50" cy="50" r="45" stroke-dasharray="2 1" />
            <circle cx="50" cy="50" r="30" />
            <rect x="29" y="29" width="42" height="42" transform="rotate(45 50 50)" />
            <rect x="29" y="29" width="42" height="42" transform="rotate(0 50 50)" />
          </svg>
        </div>

        <!-- 装饰边框 -->
        <div class="divination-frame">
          <div class="divination-frame__corner divination-frame__corner--tl"></div>
          <div class="divination-frame__corner divination-frame__corner--tr"></div>
          <div class="divination-frame__corner divination-frame__corner--bl"></div>
          <div class="divination-frame__corner divination-frame__corner--br"></div>
          <div class="divination-frame__top-line"></div>
          <div class="divination-frame__bottom-line"></div>
        </div>

        <!-- 关闭按钮 -->
        <button class="divination-close" @click.stop="handleClose">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        <!-- 内容区域 -->
        <div class="divination-content">
          <!-- 顶部装饰（移除文字，保留装饰元素） -->
          <div class="divination-header">
            <div class="divination-header__title">
              <span class="divination-header__sparkle divination-header__sparkle--static">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
                  />
                </svg>
              </span>
              <div class="divination-header__divider"></div>
            </div>
          </div>

          <!-- 卡片舞台 -->
          <div class="divination-stage">
            <TarotCard
              :is-flipped="isFlipped"
              :result="result"
              :card-back-image="divinationStore.config.cardBackImage"
              :theme-id="divinationStore.config.themeId"
              :peep-mode="divinationStore.config.peepMode"
              @flip="handleFlip"
              @confirm="handleConfirm()"
            />
          </div>

          <!-- 底部控制区：提示文字和再抽一次按钮共用同一位置 -->
          <div class="divination-footer">
            <!-- 翻牌前提示 -->
            <div v-if="!isFlipped" class="divination-hint">
              <p class="divination-hint__text">点击牌面 揭晓命运</p>
            </div>
            <!-- 翻牌后显示再抽一次按钮 -->
            <button v-else class="divination-btn divination-btn--retry" @click.stop="handleRetry">
              再抽一次
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useConfigStore } from '../../../stores/useConfigStore';
import { useDivinationStore } from '../../../stores/useDivinationStore';
import { useUIStore } from '../../../stores/useUIStore';
import type { DivinationResult } from '../../../types';
import TarotCard from './TarotCard.vue';

interface Props {
  /** 是否可见 */
  visible: boolean;
  /** 抽签结果 */
  result: DivinationResult | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', action: 'reveal' | 'hide' | 'reroll'): void;
  (e: 'retry'): void;
}>();

const divinationStore = useDivinationStore();
const configStore = useConfigStore();
const uiStore = useUIStore();

// 获取父窗口 body 用于 Teleport
const parentBody = window.parent.document.body;

// 是否已翻转
const isFlipped = ref(false);

// 生成随机星星
const stars = computed(() => {
  return Array.from({ length: 50 }).map((_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: Math.random() * 2 + 1,
    delay: Math.random() * 5,
    duration: Math.random() * 3 + 2,
  }));
});

// 监听 visible 变化，重置翻转状态
watch(
  () => props.visible,
  newVal => {
    if (newVal) {
      // 如果是自动翻牌模式，延迟自动翻转
      if (divinationStore.config.flipMode === 'auto') {
        isFlipped.value = false; // 先重置确保有翻转动画
        setTimeout(() => {
          isFlipped.value = true;
        }, 500);
      } else {
        isFlipped.value = false;
      }
    }
  },
);

function handleClose() {
  emit('close');
}

function handleOverlayClick() {
  if (isFlipped.value) {
    handleConfirm();
  }
}

function handleFlip() {
  isFlipped.value = true;
}

function handleConfirm() {
  const config = divinationStore.config;

  // 优先检查快捷重抽模式
  if (uiStore.divinationOverlay.isQuickRerollMode) {
    emit('confirm', 'reroll');
  } else if (config.peepMode) {
    emit('confirm', 'hide');
  } else {
    emit('confirm', 'reveal');
  }
}

function handleRetry() {
  // 再抽一次不再重置为背面，直接显示新结果
  emit('retry');
}
</script>
