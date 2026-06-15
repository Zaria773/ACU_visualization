<template>
  <TagManagerDialog
    :visible="uiStore.tagManagerDialog.visible"
    :widget-id="uiStore.tagManagerDialog.props.widgetId"
    :displayed-tag-ids="uiStore.tagManagerDialog.props.displayedTagIds"
    :displayed-category-ids="uiStore.tagManagerDialog.props.displayedCategoryIds"
    @close="uiStore.closeTagManagerDialog"
    @save="uiStore.handleTagManagerSave"
  />

  <CategorySelectPopup
    :visible="uiStore.categorySelectDialog.visible"
    :category-id="uiStore.categorySelectDialog.props.categoryId"
    :row-context="uiStore.categorySelectDialog.props.rowContext"
    :widget-id="uiStore.categorySelectDialog.props.widgetId"
    @close="uiStore.closeCategorySelectDialog"
    @select="(tag, rowContext) => emit('category-tag-select', tag, rowContext)"
  />

  <TagPreEditDialog
    :visible="uiStore.tagPreEditDialog.visible"
    :tag-label="uiStore.tagPreEditDialog.props.tagLabel"
    :resolved-prompt="uiStore.tagPreEditDialog.props.resolvedPrompt"
    :show-companions="uiStore.tagPreEditDialog.props.showCompanions"
    :widget-id="uiStore.tagPreEditDialog.props.widgetId"
    @close="uiStore.closeTagPreEditDialog"
  />

  <PromptEditorDialog
    :visible="uiStore.promptEditorDialog.visible"
    :prompt="uiStore.promptEditorDialog.props.prompt"
    @close="uiStore.closePromptEditorDialog"
    @save="prompt => emit('prompt-editor-save', prompt)"
  />

  <TagPreviewTooltip />
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { PromptEditorDialog } from './divination';
import { CategorySelectPopup, TagManagerDialog, TagPreEditDialog, TagPreviewTooltip } from './tag-manager';
import { useUIStore } from '../../stores/useUIStore';

const uiStore = useUIStore();
const emit = defineEmits<{
  'category-tag-select': [tag: any, rowContext: { title: string; value: string }];
  'prompt-editor-save': [prompt: string];
}>();
</script>
