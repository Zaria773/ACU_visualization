<!-- TagImportDialog.vue - 标签库导入弹窗 -->
<template>
  <div
    v-if="visible"
    class="acu-modal-container acu-center-modal"
    @click.self="handleClose"
  >
    <div class="acu-modal acu-import-modal">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">
          <i class="fas fa-file-import"></i>
          导入标签库
        </span>
        <button class="acu-close-pill" @click.stop="handleClose">关闭</button>
      </div>

      <!-- 内容 -->
      <div class="acu-modal-body">
        <!-- 文件选择 -->
        <div v-if="!importData" class="acu-import-upload">
          <div class="acu-upload-area" @click="triggerFileInput" @dragover.prevent @drop.prevent="handleDrop">
            <i class="fas fa-cloud-upload-alt"></i>
            <p>点击选择文件或拖拽 JSON 文件到此处</p>
            <span class="hint">支持从其他设备导出的标签库文件</span>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept=".json"
            style="display: none"
            @change="handleFileSelect"
          />
        </div>

        <!-- 导入预览 -->
        <div v-else class="acu-import-preview">
          <!-- 统计信息 -->
          <div class="acu-import-stats">
            <div class="acu-stat-item">
              <i class="fas fa-folder"></i>
              <span class="acu-stat-value">{{ importStats.categories }}</span>
              <span class="acu-stat-label">分类</span>
            </div>
            <div class="acu-stat-item">
              <i class="fas fa-tag"></i>
              <span class="acu-stat-value">{{ importStats.tags }}</span>
              <span class="acu-stat-label">标签</span>
            </div>
            <div v-if="importStats.conflicts > 0" class="acu-stat-item acu-stat-conflict">
              <i class="fas fa-exclamation-triangle"></i>
              <span class="acu-stat-value">{{ importStats.conflicts }}</span>
              <span class="acu-stat-label">冲突</span>
            </div>
          </div>

          <!-- 冲突处理选项 -->
          <div v-if="importStats.conflicts > 0" class="acu-conflict-options">
            <div class="acu-settings-title">
              <i class="fas fa-cog"></i>
              冲突处理
            </div>
            <div class="acu-settings-group">
              <label class="acu-radio-option">
                <input v-model="conflictStrategy" type="radio" value="overwrite" />
                <span>覆盖现有标签</span>
                <span class="hint">用导入的内容替换同名标签</span>
              </label>
              <label class="acu-radio-option">
                <input v-model="conflictStrategy" type="radio" value="rename" />
                <span>重命名导入标签</span>
                <span class="hint">为冲突的标签添加序号后缀</span>
              </label>
            </div>
          </div>

          <!-- 预览列表 -->
          <div class="acu-import-list">
            <div class="acu-settings-title">
              <i class="fas fa-list"></i>
              导入内容预览
            </div>
            <div class="acu-preview-scroll">
              <!-- 分类 -->
              <div v-if="importData.categories.length > 0" class="acu-preview-section">
                <div class="acu-preview-header">分类 ({{ importData.categories.length }})</div>
                <div class="acu-preview-items">
                  <span
                    v-for="cat in importData.categories.slice(0, 10)"
                    :key="cat.id"
                    class="acu-preview-item"
                  >
                    {{ cat.icon ? cat.icon + ' ' : '' }}{{ cat.path }}
                  </span>
                  <span v-if="importData.categories.length > 10" class="acu-preview-more">
                    还有 {{ importData.categories.length - 10 }} 个...
                  </span>
                </div>
              </div>
              <!-- 标签 -->
              <div v-if="importData.tags.length > 0" class="acu-preview-section">
                <div class="acu-preview-header">标签 ({{ importData.tags.length }})</div>
                <div class="acu-preview-items">
                  <span
                    v-for="tag in importData.tags.slice(0, 20)"
                    :key="tag.id"
                    class="acu-preview-item"
                    :class="{ conflict: isTagConflict(tag) }"
                  >
                    {{ tag.label }}
                  </span>
                  <span v-if="importData.tags.length > 20" class="acu-preview-more">
                    还有 {{ importData.tags.length - 20 }} 个...
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="acu-import-actions">
            <button class="acu-btn-secondary" @click.stop="resetImport">
              <i class="fas fa-redo"></i> 重新选择
            </button>
            <button class="acu-btn-primary" @click.stop="executeImport">
              <i class="fas fa-check"></i> 确认导入
            </button>
          </div>
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMessage" class="acu-import-error">
          <i class="fas fa-exclamation-circle"></i>
          {{ errorMessage }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTagLibraryStore } from '../../../stores/useTagLibraryStore';
import type { ImportOptions, TagLibraryExport } from '../../../types';

// Props
interface Props {
  visible: boolean;
}
defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'imported', result: { addedTags: number; addedCategories: number }): void;
}>();

// Store
const tagStore = useTagLibraryStore();

// Refs
const fileInput = ref<HTMLInputElement | null>(null);

// 本地状态
const importData = ref<TagLibraryExport | null>(null);
const conflictStrategy = ref<ImportOptions['conflictStrategy']>('rename');
const errorMessage = ref('');

// 计算属性
const importStats = computed(() => {
  if (!importData.value) {
    return { categories: 0, tags: 0, conflicts: 0 };
  }

  // 统计冲突数量
  let conflicts = 0;
  importData.value.tags.forEach(tag => {
    if (isTagConflict(tag)) {
      conflicts++;
    }
  });

  return {
    categories: importData.value.categories.length,
    tags: importData.value.tags.length,
    conflicts,
  };
});

// 方法
function handleClose() {
  resetImport();
  emit('update:visible', false);
}

function triggerFileInput() {
  fileInput.value?.click();
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    parseFile(file);
  }
}

function handleDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0];
  if (file && file.type === 'application/json') {
    parseFile(file);
  } else {
    errorMessage.value = '请选择 JSON 文件';
  }
}

async function parseFile(file: File) {
  errorMessage.value = '';
  try {
    const text = await file.text();
    const data = JSON.parse(text) as TagLibraryExport;

    // 验证格式
    if (!data.version || !Array.isArray(data.categories) || !Array.isArray(data.tags)) {
      throw new Error('无效的标签库文件格式');
    }

    importData.value = data;
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : '解析文件失败';
    importData.value = null;
  }
}

function isTagConflict(tag: { label: string; category: string }): boolean {
  // 查找是否存在同名同分类的标签
  const categoryId = tagStore.getCategoryByPath(tag.category)?.id || '';
  return tagStore.library.tags.some(
    t => t.label === tag.label && t.categoryId === categoryId,
  );
}

function resetImport() {
  importData.value = null;
  errorMessage.value = '';
  conflictStrategy.value = 'rename';
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

function executeImport() {
  if (!importData.value) return;

  const result = tagStore.importLibrary(importData.value, {
    conflictStrategy: conflictStrategy.value,
  });

  if (result.success) {
    emit('imported', {
      addedTags: result.addedTags + result.renamedTags,
      addedCategories: result.addedCategories,
    });
    handleClose();
  } else {
    errorMessage.value = result.error || '导入失败';
  }
}
</script>
