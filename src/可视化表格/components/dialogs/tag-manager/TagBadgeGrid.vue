<!-- TagBadgeGrid.vue - 右侧标签网格组件 -->
<template>
  <div class="acu-tag-grid" @click="handleGridClick">
    <!-- 标签列表 -->
    <template v-for="tag in displayedTags" :key="tag.id">
      <div
        class="acu-tag-badge"
        :class="{
          selected: selectedTagIds.has(tag.id),
          added: displayedTagIdSet.has(tag.id),
          'mode-add': mode === 'add',
          'mode-delete': mode === 'delete',
        }"
        @click.stop="handleTagClick(tag)"
      >
        <!-- 标签文本 -->
        <span class="acu-badge-label">{{ tag.label }}</span>
        <!-- 添加模式：已添加显示✓，未添加显示+ -->
        <span v-if="mode === 'add'" class="acu-badge-icon">
          <i v-if="displayedTagIdSet.has(tag.id)" class="fas fa-check added-icon"></i>
          <i v-else class="fas fa-plus add-icon"></i>
        </span>
        <!-- 迁移/导出模式：手指点击图标 -->
        <span v-if="mode === 'migrate' || mode === 'export'" class="acu-badge-icon tap-icon">
          <i class="fas fa-hand-pointer"></i>
        </span>
        <!-- 删除模式：删除图标（常驻） -->
        <span v-if="mode === 'delete'" class="acu-badge-delete">
          <i class="fas fa-times"></i>
        </span>
      </div>
    </template>

    <!-- 空状态 -->
    <div v-if="displayedTags.length === 0" class="acu-grid-empty">
      <i class="fas fa-tag"></i>
      <span>{{ emptyMessage }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTagLibraryStore } from '../../../stores/useTagLibraryStore';
import type { InteractiveTag, TagManagerMode } from '../../../types';

// Props
interface Props {
  mode: TagManagerMode;
  /** 已展示的标签 ID 列表（用于添加模式显示已添加状态） */
  displayedTagIds?: string[];
}
const props = withDefaults(defineProps<Props>(), {
  displayedTagIds: () => [],
});

// Emits
const emit = defineEmits<{
  (e: 'tagClick', tag: InteractiveTag): void;
  (e: 'createTag'): void;
  (e: 'deleteTag', tagId: string): void;
  (e: 'addTag', tagId: string): void;
}>();

// Store
const tagStore = useTagLibraryStore();

// 计算属性
const displayedTags = computed(() => tagStore.filteredTags);
const selectedTagIds = computed(() => tagStore.selectedTagIds);
const displayedTagIdSet = computed(() => new Set(props.displayedTagIds));

const emptyMessage = computed(() => {
  if (tagStore.searchKeyword) {
    return '未找到匹配的标签';
  }
  if (tagStore.selectedLevel1 === '未分类') {
    return '暂无未分类的标签';
  }
  if (tagStore.selectedLevel1) {
    return `"${tagStore.selectedLevel1}" 分类下暂无标签`;
  }
  return '暂无标签，点击新建按钮创建';
});

// 方法
function handleTagClick(tag: InteractiveTag) {
  switch (props.mode) {
    case 'normal':
      // 普通模式：弹出编辑弹窗
      emit('tagClick', tag);
      break;
    case 'add':
      // 添加模式：添加到展示区
      emit('addTag', tag.id);
      break;
    case 'delete':
      // 删除模式：直接删除
      emit('deleteTag', tag.id);
      break;
    case 'migrate':
    case 'export':
      // 迁移/导出模式：切换选中状态
      toggleTagSelection(tag.id);
      break;
    case 'create':
      // 新建模式：点击已有标签也弹出编辑
      emit('tagClick', tag);
      break;
  }
}

function handleGridClick() {
  if (props.mode === 'create') {
    // 新建模式：点击空白区域新建标签
    emit('createTag');
  }
}

function toggleTagSelection(tagId: string) {
  tagStore.toggleTagSelection(tagId);
}
</script>
