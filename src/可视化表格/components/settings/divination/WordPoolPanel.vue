<template>
  <div class="acu-settings-section">
    <div class="acu-settings-title">
      <i class="fas fa-book"></i>
      随机词库管理
    </div>

    <!-- 搜索/过滤 -->
    <div class="acu-settings-group">
      <div class="acu-settings-row">
        <div class="acu-settings-control" style="width: 100%; display: flex;">
          <input
            v-model="searchQuery"
            type="text"
            class="acu-word-pool-search"
            placeholder="搜索词库名称..."
            style="flex: 1; width: 100%;"
          />
        </div>
      </div>
    </div>

    <!-- 词库列表 -->
    <div v-if="filteredCategories.length === 0" class="acu-empty-hint" style="padding: 20px; text-align: center;">
      暂无词库数据
    </div>

    <div v-else class="acu-settings-group">
      <div v-for="category in filteredCategories" :key="category.id" class="acu-word-pool-item" style="border-bottom: 1px solid var(--acu-border); padding: 12px 0;">
        <!-- 头部：名称与开关 -->
        <div class="acu-settings-row">
          <div class="acu-settings-label">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>{{ category.name }}</span>
              <!-- 倾向徽章 -->
              <span v-if="category.bias === 'positive'" class="acu-badge acu-badge-success">吉</span>
              <span v-else-if="category.bias === 'negative'" class="acu-badge acu-badge-danger">凶</span>

              <!-- 强制抽取数量 -->
              <span v-if="category.limit > 0" class="acu-badge acu-badge-secondary">
                强抽: {{ category.limit }}
              </span>
            </div>
            <span class="hint">{{ category.words.length }} 个词条</span>
          </div>
          <div class="acu-settings-control">
            <button
              class="acu-switch"
              :class="{ active: category.enabled }"
              @click="toggleEnabled(category)"
            ></button>
            <button
              class="acu-icon-btn"
              :class="{ active: expandedId === category.id }"
              style="margin-left: 8px;"
              @click="toggleExpand(category.id)"
            >
              <i class="fas" :class="expandedId === category.id ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
            </button>
          </div>
        </div>

        <!-- 展开内容：编辑区域 -->
        <div v-if="expandedId === category.id" style="padding: 0 16px 16px;">
          <textarea
            v-model="editingContent[category.id]"
            class="acu-edit-textarea"
            rows="5"
            placeholder="输入词条，用逗号或换行分隔"
            @input="handleContentChange(category.id)"
          ></textarea>
          <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; color: var(--acu-text-sub);">
            <span>{{ isSaving[category.id] ? '保存中...' : '自动保存' }}</span>
            <span>当前词数: {{ getWordCount(editingContent[category.id]) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core';
import { computed, ref } from 'vue';
import { useDivinationStore } from '../../../stores/useDivinationStore';
import type { DivinationCategory } from '../../../types';

const divinationStore = useDivinationStore() as any;

// ============================================================
// State
// ============================================================

const searchQuery = ref('');
const expandedId = ref<number | string | null>(null);
const editingContent = ref<Record<string | number, string>>({});
const isSaving = ref<Record<string | number, boolean>>({});

// ============================================================
// Computed
// ============================================================

const filteredCategories = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return divinationStore.categories;

  return divinationStore.categories.filter(c =>
    c.name.toLowerCase().includes(query) ||
    c.words.some(w => w.toLowerCase().includes(query))
  );
});

// ============================================================
// Methods
// ============================================================

const toggleEnabled = (category: DivinationCategory) => {
  const newCategory = { ...category, enabled: !category.enabled };
  divinationStore.updateCategory(newCategory);
};

const toggleExpand = (id: number | string) => {
  if (expandedId.value === id) {
    expandedId.value = null;
  } else {
    expandedId.value = id;
    // 初始化编辑内容
    const category = divinationStore.categories.find(c => c.id === id);
    if (category) {
      editingContent.value[id] = category.words.join('\n');
    }
  }
};

const getWordCount = (content: string | undefined) => {
  if (!content) return 0;
  return content.split(/[,，、\n]/).map(w => w.trim()).filter(w => w).length;
};

// 自动保存逻辑
const saveContent = async (id: number | string) => {
  const content = editingContent.value[id];
  const category = divinationStore.categories.find(c => c.id === id);

  if (!category || content === undefined) return;

  isSaving.value[id] = true;

  try {
    const words = content.split(/[,，、\n]/).map(w => w.trim()).filter(w => w);
    const newCategory = { ...category, words };
    await divinationStore.updateCategory(newCategory);
  } finally {
    // 延迟一点取消保存状态，让用户看到
    setTimeout(() => {
      isSaving.value[id] = false;
    }, 500);
  }
};

const debouncedSave = useDebounceFn((id: number | string) => {
  saveContent(id);
}, 1000);

const handleContentChange = (id: number | string) => {
  debouncedSave(id);
};

</script>

<style scoped lang="scss">
// 样式使用全局类，这里只写少量特定的
.acu-word-pool-search {
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--acu-radius-md);
  border: 1px solid var(--acu-border);
  background: var(--acu-input-bg);
  color: var(--acu-text-main);
  font-size: 13px;

  &:focus {
    border-color: var(--acu-title-color);
    outline: none;
  }
}

.acu-edit-textarea {
  width: 100%;
  padding: 8px;
  border-radius: var(--acu-radius-md);
  border: 1px solid var(--acu-border);
  background: var(--acu-input-bg);
  color: var(--acu-text-main);
  resize: vertical;
  font-family: inherit;
  font-size: 13px;

  &:focus {
    border-color: var(--acu-title-color);
    outline: none;
  }
}

.acu-word-pool-item:last-child {
  border-bottom: none !important;
}
</style>
