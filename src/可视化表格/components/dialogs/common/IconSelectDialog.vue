<!-- IconSelectDialog.vue - 全局图标选择弹窗 -->
<template>
  <div
    v-if="visible"
    class="acu-modal-container acu-center-modal"
    @click.self="handleClose"
  >
    <div class="acu-modal acu-icon-select-modal">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">选择图标</span>
        <div class="acu-header-actions">
          <button class="acu-close-pill" @click.stop="handleClose">取消</button>
        </div>
      </div>

      <!-- 顶部 Tab 栏 -->
      <div class="acu-icon-tabs">
        <div
          class="acu-icon-tab"
          :class="{ active: activeTab === 'emoji' }"
          @click="activeTab = 'emoji'"
        >
          Emoji 表情
        </div>
        <div
          class="acu-icon-tab"
          :class="{ active: activeTab === 'fa' }"
          @click="activeTab = 'fa'"
        >
          FontAwesome
        </div>
      </div>

      <!-- 搜索栏 -->
      <div class="acu-icon-search-bar">
        <div class="acu-search-input-wrapper">
          <i class="fas fa-search"></i>
          <input
            v-model="searchTerm"
            type="text"
            placeholder="搜索图标..."
            @input="handleSearch"
          />
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="acu-modal-body">
        <div class="acu-icon-grid-container">
          <div v-if="filteredIcons.length > 0" class="acu-icon-grid">
            <div
              v-for="icon in filteredIcons"
              :key="icon"
              class="acu-icon-item"
              :class="{ selected: currentIcon === icon }"
              :title="icon"
              @click.stop="handleSelect(icon)"
            >
              <i v-if="activeTab === 'fa'" :class="icon"></i>
              <span v-else>{{ icon }}</span>
            </div>
          </div>
          <div v-else class="acu-no-icons">
            <i class="fas fa-search"></i>
            <span>未找到相关图标</span>
          </div>
        </div>

        <!-- 底部手动输入 -->
        <div class="acu-icon-manual-input">
          <span class="acu-manual-label">手动输入:</span>
          <div class="acu-manual-field">
            <div class="acu-preview-icon">
              <i v-if="isFontAwesome(manualInput)" :class="manualInput"></i>
              <span v-else>{{ manualInput }}</span>
            </div>
            <input
              v-model="manualInput"
              type="text"
              placeholder="输入 Emoji 或 fa-class"
              @keyup.enter="handleManualConfirm"
            />
          </div>
          <button class="acu-tool-btn" @click.stop="handleManualConfirm">
            <i class="fas fa-check"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { EMOJI_LIST, FA_ICONS } from '../../../constants/icons';

// Props
interface Props {
  visible: boolean;
  currentIcon?: string;
}
const props = withDefaults(defineProps<Props>(), {
  currentIcon: '',
});

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'select', icon: string): void;
  (e: 'close'): void;
}>();

// State
const activeTab = ref<'emoji' | 'fa'>('emoji');
const searchTerm = ref('');
const manualInput = ref('');

// 初始化
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      manualInput.value = props.currentIcon;
      searchTerm.value = '';

      // 根据当前图标自动切换 Tab
      if (props.currentIcon && isFontAwesome(props.currentIcon)) {
        activeTab.value = 'fa';
      } else {
        activeTab.value = 'emoji';
      }
    }
  }
);

// Helpers
function isFontAwesome(icon: string): boolean {
  return icon.startsWith('fa') || icon.includes(' fa-');
}

// Computed
const filteredIcons = computed(() => {
  const term = searchTerm.value.toLowerCase().trim();
  const list = activeTab.value === 'emoji' ? EMOJI_LIST : FA_ICONS;

  if (!term) return list;

  return list.filter(icon => icon.toLowerCase().includes(term));
});

// Methods
function handleClose() {
  emit('update:visible', false);
  emit('close');
}

function handleSelect(icon: string) {
  emit('select', icon);
  handleClose();
}

function handleSearch() {
  // 搜索逻辑已在 computed 中实现
}

function handleManualConfirm() {
  const icon = manualInput.value.trim();
  if (icon) {
    handleSelect(icon);
  }
}
</script>
