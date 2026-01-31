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
              :class="{ active: !activePresetId, 'migrate-disabled': isMigrating }"
              @click.stop="!isMigrating && handleSelectDefault()"
            >
              <span class="acu-preset-option-name">默认配置</span>
              <span v-if="isMigrating" class="acu-migrate-hint">不可迁入</span>
            </div>
            <!-- 用户预设 -->
            <div
              v-for="preset in presets"
              :key="preset.id"
              class="acu-preset-option"
              :class="{
                active: activePresetId === preset.id,
                'migrate-target': isMigrating && activePresetId !== preset.id,
                'migrate-disabled': isMigrating && activePresetId === preset.id,
              }"
              @click.stop="!isMigrating && handleSelect(preset.id)"
            >
              <span class="acu-preset-option-name">{{ preset.name }}</span>
              <!-- 正常模式：删除按钮 -->
              <button
                v-if="!isMigrating && !preset.isBuiltin"
                class="acu-preset-delete-btn"
                title="删除"
                @click.stop="handleDelete(preset.id)"
              >
                <i class="fas fa-times"></i>
              </button>
              <!-- 迁移模式：迁入按钮（排除当前激活的预设） -->
              <button
                v-if="isMigrating && activePresetId !== preset.id"
                class="acu-icon-btn migrate-in"
                title="迁移选中的维度到此预设"
                @click.stop="$emit('migrate-to', preset.id)"
              >
                <i class="fas fa-arrow-down"></i>
              </button>
              <!-- 迁移模式：当前预设提示 -->
              <span v-if="isMigrating && activePresetId === preset.id" class="acu-migrate-hint">当前</span>
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

    <!-- 工具栏（可选显示） -->
    <div v-if="showToolbar" class="acu-dimension-toolbar">
      <span class="toolbar-label">工具</span>
      <span class="toolbar-spacer"></span>
      <button class="acu-icon-btn" title="全部折叠" @click.stop="$emit('collapse-all')">
        <i class="fas fa-compress-alt"></i>
      </button>
      <button class="acu-icon-btn" title="全部展开" @click.stop="$emit('expand-all')">
        <i class="fas fa-expand-alt"></i>
      </button>
      <span class="toolbar-divider"></span>
      <button class="acu-icon-btn" title="导入预设" @click.stop="$emit('import')">
        <i class="fas fa-file-import"></i>
      </button>
      <button class="acu-icon-btn" title="导出当前预设" @click.stop="$emit('export-current')">
        <i class="fas fa-file-export"></i>
      </button>
      <button class="acu-icon-btn" title="备份所有预设" @click.stop="$emit('export-all')">
        <i class="fas fa-archive"></i>
      </button>
      <span class="toolbar-divider"></span>
      <button
        class="acu-icon-btn"
        :class="{ active: isMigrating }"
        :title="isMigrating ? `退出迁移 (已选${selectedCount}个)` : '迁移模式'"
        @click.stop="$emit('toggle-migrate')"
      >
        <i class="fas fa-exchange-alt"></i>
      </button>
      <span v-if="isMigrating" class="toolbar-badge">{{ selectedCount }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

interface Preset {
  id: string;
  name: string;
  isBuiltin?: boolean;
}

const props = withDefaults(
  defineProps<{
    presets: Preset[];
    activePresetId: string | null;
    title?: string;
    hint?: string;
    showToolbar?: boolean;
    isMigrating?: boolean;
    selectedCount?: number;
  }>(),
  {
    showToolbar: false,
    isMigrating: false,
    selectedCount: 0,
  },
);

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'restore-default'): void;
  (e: 'delete', id: string): void;
  (e: 'save'): void;
  (e: 'save-as'): void;
  (e: 'collapse-all'): void;
  (e: 'expand-all'): void;
  (e: 'import'): void;
  (e: 'export-current'): void;
  (e: 'export-all'): void;
  (e: 'toggle-migrate'): void;
  (e: 'migrate-to', presetId: string): void;
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
