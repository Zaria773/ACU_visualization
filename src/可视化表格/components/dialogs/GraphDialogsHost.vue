<template>
  <AvatarCropDialog
    :visible="uiStore.avatarCropDialog.visible"
    :image-url="uiStore.avatarCropDialog.props.imageUrl"
    :name="uiStore.avatarCropDialog.props.name"
    :initial-offset-x="uiStore.avatarCropDialog.props.initialOffsetX"
    :initial-offset-y="uiStore.avatarCropDialog.props.initialOffsetY"
    :initial-scale="uiStore.avatarCropDialog.props.initialScale"
    :initial-invert="uiStore.avatarCropDialog.props.initialInvert"
    :show-invert-option="uiStore.avatarCropDialog.props.showInvertOption"
    @close="uiStore.closeAvatarCropDialog"
    @apply="uiStore.handleAvatarCropApply"
    @upload="uiStore.handleAvatarCropUpload"
  />

  <AvatarManagerDialog
    :visible="uiStore.avatarManagerDialog.visible"
    :nodes="uiStore.avatarManagerDialog.props.nodes"
    :factions="uiStore.avatarManagerDialog.props.factions"
    @close="uiStore.closeAvatarManagerDialog"
    @update="uiStore.handleAvatarManagerUpdate"
    @label-change="uiStore.handleAvatarManagerLabelChange"
  />

  <NodeConfigDialog
    :visible="uiStore.nodeConfigDialog.visible"
    :node-id="uiStore.nodeConfigDialog.props.nodeId"
    :full-name="uiStore.nodeConfigDialog.props.fullName"
    :current-label="uiStore.nodeConfigDialog.props.currentLabel"
    :selected-indices="uiStore.nodeConfigDialog.props.selectedIndices"
    @close="uiStore.closeNodeConfigDialog"
    @confirm="uiStore.handleNodeConfigConfirm"
    @reset-to-full-name="uiStore.handleNodeConfigResetToFullName"
    @style-update="uiStore.handleNodeConfigStyleUpdate"
  />

  <NodeLabelDialog
    :visible="uiStore.nodeLabelDialog.visible"
    :full-name="uiStore.nodeLabelDialog.props.fullName"
    :initial-indices="uiStore.nodeLabelDialog.props.initialIndices"
    @close="uiStore.closeNodeLabelDialog"
    @apply="uiStore.handleNodeLabelApply"
    @reset="uiStore.handleNodeLabelReset"
  />

  <GraphSettingsDialog
    :visible="uiStore.graphSettingsDialog.visible"
    :factions="uiStore.graphSettingsDialog.props.factions"
    @close="uiStore.closeGraphSettingsDialog"
    @open-avatar-manager="emit('open-avatar-manager-from-settings')"
  />

  <FactionSettingsDialog
    :visible="uiStore.factionSettingsDialog.visible"
    :faction-id="uiStore.factionSettingsDialog.props.factionId"
    :faction-name="uiStore.factionSettingsDialog.props.factionName"
    @close="uiStore.closeFactionSettingsDialog"
  />
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useUIStore } from '../../stores/useUIStore';
import {
  AvatarCropDialog,
  AvatarManagerDialog,
  FactionSettingsDialog,
  GraphSettingsDialog,
  NodeConfigDialog,
  NodeLabelDialog,
} from './index';

const uiStore = useUIStore();
const emit = defineEmits<{
  'open-avatar-manager-from-settings': [];
}>();
</script>
