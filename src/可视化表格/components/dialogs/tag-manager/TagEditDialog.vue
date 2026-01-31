<!-- TagEditDialog.vue - 标签编辑独立弹窗 -->
<template>
  <div v-if="visible" class="acu-modal-container acu-center-modal" @click.self="handleClose">
    <div class="acu-modal acu-tag-edit-modal">
      <!-- 头部 -->
      <div class="acu-modal-header">
        <span class="acu-modal-title">
          {{ isNew ? '新建标签' : '编辑标签' }}
        </span>
        <div class="acu-header-actions">
          <button class="acu-close-pill" :disabled="!canSave" @click.stop="handleSave">保存</button>
          <button class="acu-icon-btn" title="关闭" @click.stop="handleClose">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <!-- 内容 -->
      <div class="acu-modal-body">
        <!-- 标签文本 -->
        <div class="acu-settings-section">
          <div class="acu-settings-title">
            <i class="fas fa-tag"></i>
            基本信息
          </div>
          <div class="acu-settings-group">
            <!-- 标签文本 -->
            <div class="acu-settings-row">
              <div class="acu-settings-label">
                标签文本
                <span class="hint">标签显示的文字内容</span>
              </div>
              <div class="acu-settings-control">
                <input ref="labelInput" v-model="form.label" type="text" placeholder="输入标签文本" />
              </div>
            </div>

            <!-- 分类选择 -->
            <div class="acu-settings-row acu-category-row">
              <div class="acu-settings-label">
                所属分类
                <span class="hint">选择或创建分类</span>
              </div>
              <div class="acu-settings-control acu-category-control">
                <!-- 自定义下拉框 -->
                <div
                  class="acu-custom-select"
                  :class="{ active: showCategoryDropdown }"
                  @click.stop="toggleCategoryDropdown"
                >
                  <div class="selected-value">
                    <template v-if="currentCategory">
                      <i v-if="isFontAwesome(currentCategory.icon || '')" :class="currentCategory.icon"></i>
                      <span v-else-if="currentCategory.icon">{{ currentCategory.icon }}</span>
                      <span class="text">{{ currentCategory.path }}</span>
                    </template>
                    <span v-else class="placeholder">未分类</span>
                  </div>
                  <i class="fas fa-chevron-down arrow"></i>

                  <!-- 下拉菜单 -->
                  <div v-if="showCategoryDropdown" class="acu-custom-dropdown-menu">
                    <div
                      class="dropdown-item"
                      :class="{ selected: form.categoryId === '' }"
                      @click.stop="selectCategory('')"
                    >
                      <span class="text">未分类</span>
                    </div>
                    <div
                      v-for="cat in allCategories"
                      :key="cat.id"
                      class="dropdown-item"
                      :class="{ selected: form.categoryId === cat.id }"
                      @click.stop="selectCategory(cat.id)"
                    >
                      <i v-if="isFontAwesome(cat.icon || '')" :class="cat.icon"></i>
                      <span v-else-if="cat.icon">{{ cat.icon }}</span>
                      <span class="text">{{ cat.path }}</span>
                    </div>
                  </div>
                </div>

                <button class="acu-tool-btn" title="新增分类" @click.stop="showNewCategoryInput = true">
                  <i class="fas fa-plus"></i>
                </button>
              </div>
            </div>

            <!-- 新增分类输入（条件显示） -->
            <template v-if="showNewCategoryInput">
              <!-- 上级分类选择 -->
              <div class="acu-settings-row">
                <div class="acu-settings-label">
                  上级分类
                  <span class="hint">可选：在此分类下创建子分类</span>
                </div>
                <div class="acu-settings-control">
                  <div
                    class="acu-custom-select"
                    :class="{ active: showParentCategoryDropdown }"
                    @click.stop="toggleParentCategoryDropdown"
                  >
                    <div class="selected-value">
                      <template v-if="parentCategory">
                        <i v-if="isFontAwesome(parentCategory.icon || '')" :class="parentCategory.icon"></i>
                        <span v-else-if="parentCategory.icon">{{ parentCategory.icon }}</span>
                        <span class="text">{{ parentCategory.path }}</span>
                      </template>
                      <span v-else class="placeholder">无</span>
                    </div>
                    <i class="fas fa-chevron-down arrow"></i>

                    <div v-if="showParentCategoryDropdown" class="acu-custom-dropdown-menu">
                      <div
                        class="dropdown-item"
                        :class="{ selected: newCategoryParentId === '' }"
                        @click.stop="selectParentCategory('')"
                      >
                        <span class="text">无</span>
                      </div>
                      <div
                        v-for="cat in allCategories"
                        :key="cat.id"
                        class="dropdown-item"
                        :class="{ selected: newCategoryParentId === cat.id }"
                        @click.stop="selectParentCategory(cat.id)"
                      >
                        <i v-if="isFontAwesome(cat.icon || '')" :class="cat.icon"></i>
                        <span v-else-if="cat.icon">{{ cat.icon }}</span>
                        <span class="text">{{ cat.path }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="acu-settings-row acu-new-category-row">
                <div class="acu-settings-label">
                  新分类
                  <span class="hint">路径格式如：互动/日常</span>
                </div>
                <div class="acu-settings-control acu-new-category-control">
                  <input
                    v-model="newCategoryPath"
                    type="text"
                    placeholder="分类路径"
                    @keyup.enter="createNewCategory"
                  />
                  <button class="acu-tool-btn" title="选择图标" @click.stop="openNewCategoryIconSelect">
                    <i v-if="isFontAwesome(newCategoryIcon)" :class="newCategoryIcon"></i>
                    <span v-else>{{ newCategoryIcon || '图标' }}</span>
                  </button>
                  <button class="acu-tool-btn" title="确认" @click.stop="createNewCategory">
                    <i class="fas fa-check"></i>
                  </button>
                  <button class="acu-tool-btn" title="取消" @click.stop="showNewCategoryInput = false">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              </div>
            </template>

            <!-- 二次编辑开关 -->
            <div class="acu-settings-row">
              <div class="acu-settings-label">
                追加前二次编辑
                <span class="hint">点击标签时弹出编辑器，可修改后再追加</span>
              </div>
              <div class="acu-settings-control">
                <label class="acu-switch">
                  <input v-model="form.allowPreEdit" type="checkbox" />
                  <span class="slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- 提示词模板 -->
        <div class="acu-settings-section">
          <div class="acu-settings-title">
            <i class="fas fa-file-alt"></i>
            提示词模板
          </div>
          <div class="acu-settings-group">
            <div class="acu-settings-row column">
              <div class="acu-settings-label">
                模板内容
                <span class="hint">支持通配符替换</span>
              </div>
              <div class="acu-settings-control">
                <textarea
                  ref="promptInput"
                  v-model="form.promptTemplate"
                  class="acu-textarea"
                  placeholder="输入提示词模板，支持通配符"
                  rows="4"
                ></textarea>
              </div>
            </div>

            <!-- 通配符快捷按钮 -->
            <div class="acu-wildcard-shortcuts">
              <span class="hint">点击插入:</span>
              <button class="acu-wildcard-btn" @click.stop="insertWildcard(wildcards.value)">
                <code v-text="wildcards.value"></code>
              </button>
              <button class="acu-wildcard-btn" @click.stop="insertWildcard(wildcards.rowTitle)">
                <code v-text="wildcards.rowTitle"></code>
              </button>
              <button class="acu-wildcard-btn" @click.stop="insertWildcard(wildcards.user)">
                <code v-text="wildcards.user"></code>
              </button>
            </div>

            <!-- 通配符说明 -->
            <div class="acu-wildcard-help">
              <div class="acu-help-header" @click="helpExpanded = !helpExpanded">
                <i class="fas fa-lightbulb"></i>
                <strong>通配符说明</strong>
                <i :class="['fas', helpExpanded ? 'fa-chevron-up' : 'fa-chevron-down']"></i>
              </div>
              <ul v-if="helpExpanded">
                <li><code v-text="wildcards.value"></code> - 标签本身的值（label）</li>
                <li><code v-text="wildcards.rowTitle"></code> - 当前行标题</li>
                <li><code v-text="wildcards.user"></code> - 主角名（酒馆宏）</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useTagLibraryStore } from '../../../stores/useTagLibraryStore';
import { useUIStore } from '../../../stores/useUIStore';
import type { InteractiveTag } from '../../../types';

// Props
interface Props {
  visible: boolean;
  /** 编辑的标签（null 表示新建） */
  tag: InteractiveTag | null;
  /** 默认分类 ID（新建时使用） */
  defaultCategoryId?: string;
}
const props = withDefaults(defineProps<Props>(), {
  defaultCategoryId: '',
});

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'saved', tag: InteractiveTag): void;
  (e: 'close'): void;
}>();

// Store
const tagStore = useTagLibraryStore();
const uiStore = useUIStore();

// Refs
const labelInput = ref<HTMLInputElement | null>(null);
const promptInput = ref<HTMLTextAreaElement | null>(null);

// 本地状态
const form = ref({
  label: '',
  categoryId: '',
  promptTemplate: '',
  allowPreEdit: false,
});
const showNewCategoryInput = ref(false);
const newCategoryPath = ref('');
const newCategoryIcon = ref('');
const helpExpanded = ref(true);
const showCategoryDropdown = ref(false);
const showParentCategoryDropdown = ref(false);
const newCategoryParentId = ref('');

// 通配符常量
const wildcards = {
  value: '{{value}}',
  rowTitle: '{{rowTitle}}',
  user: '{{user}}',
};

// 计算属性
const isNew = computed(() => !props.tag);
const allCategories = computed(() => tagStore.library.categories);
const canSave = computed(() => form.value.label.trim().length > 0);
const currentCategory = computed(() => {
  if (!form.value.categoryId) return null;
  return allCategories.value.find(c => c.id === form.value.categoryId) || null;
});
const parentCategory = computed(() => {
  if (!newCategoryParentId.value) return null;
  return allCategories.value.find(c => c.id === newCategoryParentId.value) || null;
});

// 监听 visible 变化，初始化表单
watch(
  () => props.visible,
  visible => {
    if (visible) {
      if (props.tag) {
        // 编辑模式：填充现有数据
        form.value = {
          label: props.tag.label,
          categoryId: props.tag.categoryId,
          promptTemplate: props.tag.promptTemplate,
          allowPreEdit: props.tag.allowPreEdit || false,
        };
      } else {
        // 新建模式：重置表单
        form.value = {
          label: '',
          categoryId: props.defaultCategoryId,
          promptTemplate: '',
          allowPreEdit: false,
        };
      }
      showNewCategoryInput.value = false;
      newCategoryPath.value = '';
      newCategoryIcon.value = '';
      showCategoryDropdown.value = false;
      showParentCategoryDropdown.value = false;
      newCategoryParentId.value = '';

      // 聚焦输入框
      nextTick(() => {
        labelInput.value?.focus();
      });
    }
  },
);

// 方法
function handleClose() {
  emit('update:visible', false);
  emit('close');
}

function handleSave() {
  if (!canSave.value) return;

  const tagData: InteractiveTag = {
    id: props.tag?.id || `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    label: form.value.label.trim(),
    categoryId: form.value.categoryId,
    promptTemplate: form.value.promptTemplate,
    createdAt: props.tag?.createdAt || new Date().toISOString(),
    allowPreEdit: form.value.allowPreEdit,
  };

  // 保存到 store
  tagStore.upsertTag(tagData);

  emit('saved', tagData);
  handleClose();
}

function insertWildcard(wildcard: string) {
  if (!promptInput.value) return;

  const textarea = promptInput.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = form.value.promptTemplate;

  form.value.promptTemplate = text.slice(0, start) + wildcard + text.slice(end);

  // 恢复光标位置
  nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(start + wildcard.length, start + wildcard.length);
  });
}

function createNewCategory() {
  let path = newCategoryPath.value.trim();
  if (!path) return;

  if (parentCategory.value) {
    path = parentCategory.value.path + '/' + path;
  }

  const newCategory = tagStore.addCategory(path, newCategoryIcon.value || undefined);
  form.value.categoryId = newCategory.id;

  showNewCategoryInput.value = false;
  newCategoryPath.value = '';
  newCategoryIcon.value = '';
  newCategoryParentId.value = '';
}

function openNewCategoryIconSelect() {
  uiStore.openIconSelectDialog(
    { currentIcon: newCategoryIcon.value },
    {
      onSelect: icon => {
        newCategoryIcon.value = icon;
      },
    },
  );
}

function isFontAwesome(icon: string): boolean {
  return icon.startsWith('fa') || icon.includes(' fa-');
}

function toggleCategoryDropdown() {
  showCategoryDropdown.value = !showCategoryDropdown.value;
}

function selectCategory(id: string) {
  form.value.categoryId = id;
  showCategoryDropdown.value = false;
}

function toggleParentCategoryDropdown() {
  showParentCategoryDropdown.value = !showParentCategoryDropdown.value;
}

function selectParentCategory(id: string) {
  newCategoryParentId.value = id;
  showParentCategoryDropdown.value = false;
}

// 点击外部关闭下拉框
watch([showCategoryDropdown, showParentCategoryDropdown], ([val1, val2]) => {
  if (val1 || val2) {
    setTimeout(() => window.addEventListener('click', closeDropdown), 0);
  } else {
    window.removeEventListener('click', closeDropdown);
  }
});

function closeDropdown() {
  showCategoryDropdown.value = false;
  showParentCategoryDropdown.value = false;
}
</script>
