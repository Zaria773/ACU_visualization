<template>
  <div class="acu-preset-header">
    <div class="acu-settings-row">
      <div class="acu-settings-label">
        {{ title || '预设管理' }}
        <span class="hint">{{ hint || '保存和加载配置' }}</span>
      </div>
      <div class="acu-settings-control acu-preset-control">
        <!-- 下拉选择框 -->
        <div class="acu-preset-dropdown" :class="{ open: isDropdownOpen }">
          <button class="acu-preset-dropdown-btn" @click.stop="toggleDropdown">
            <span class="acu-preset-selected-name">{{ selectedPresetName }}</span>
            <i class="fas fa-chevron-down"></i>
          </button>
          <div v-show="isDropdownOpen" class="acu-preset-dropdown-menu">
            <!-- 默认配置 -->
            <div
              class="acu-preset-option"
              :class="{ active: !activePresetId }"
              @click.stop="handleSelectDefault"
            >
              <span class="acu-preset-option-name">默认配置</span>
            </div>
            <!-- 用户预设 -->
            <div
              v-for="preset in presets"
              :key="preset.id"
              class="acu-preset-option"
              :class="{ active: activePresetId === preset.id }"
              @click.stop="handleSelect(preset.id)"
            >
              <span class="acu-preset-option-name">{{ preset.name }}</span>
              <button
                v-if="!preset.isBuiltin"
                class="acu-preset-delete-btn"
                title="删除"
                @click.stop="handleDelete(preset.id)"
              >
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- 操作按钮组 -->
        <div class="acu-preset-actions">
          <!-- 另存为 -->
          <button class="acu-tool-btn" title="另存为新预设" @click.stop="$emit('save-as')">
            <i class="fas fa-plus"></i>
          </button>
          <!-- 保存 -->
          <button class="acu-tool-btn" title="保存当前预设" @click.stop="$emit('save')">
            <i class="fas fa-save"></i>
          </button>

          <!-- 插槽：允许父组件添加额外按钮 -->
          <slot name="actions"></slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

interface Preset {
  id: string;
  name: string;
  isBuiltin?: boolean;
}

const props = defineProps<{
  presets: Preset[];
  activePresetId: string | null;
  title?: string;
  hint?: string;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'restore-default'): void;
  (e: 'delete', id: string): void;
  (e: 'save'): void;
  (e: 'save-as'): void;
}>();

const isDropdownOpen = ref(false);

const selectedPresetName = computed(() => {
  if (!props.activePresetId) return '默认配置';
  const preset = props.presets.find(p => p.id === props.activePresetId);
  return preset ? preset.name : '默认配置';
});

function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value;
}

function handleSelectDefault() {
  emit('restore-default');
  isDropdownOpen.value = false;
}

function handleSelect(id: string) {
  emit('select', id);
  isDropdownOpen.value = false;
}

function handleDelete(id: string) {
  emit('delete', id);
  // 不关闭下拉框，方便连续操作
}

// 点击外部关闭
function handleOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.acu-preset-dropdown')) {
    isDropdownOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick);
});

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick);
});
</script>
