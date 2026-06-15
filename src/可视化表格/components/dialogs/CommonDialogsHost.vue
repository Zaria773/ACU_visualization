<template>
  <SettingsDialog v-model:visible="uiStore.settingsDialog" @save="emit('settings-save')" />

  <DirectorDialog v-model:visible="uiStore.directorDialog" />

  <InputFloorDialog
    v-model:visible="uiStore.inputFloorDialog.visible"
    :current-floor="uiStore.inputFloorDialog.props.currentFloor"
    @confirm="floor => emit('save-to-floor', floor)"
  />

  <PurgeRangeDialog
    v-model:visible="uiStore.purgeRangeDialog.visible"
    :max-floor="uiStore.purgeRangeDialog.props.maxFloor"
    @confirm="(startFloor, endFloor) => emit('purge-range', startFloor, endFloor)"
    @advanced-confirm="result => emit('advanced-purge-confirm', result)"
  />

  <AdvancedPurgeDialog
    v-model:visible="uiStore.advancedPurgeDialog.visible"
    :initial-start-floor="uiStore.advancedPurgeDialog.props.initialStartFloor"
    :initial-end-floor="uiStore.advancedPurgeDialog.props.initialEndFloor"
    :initial-selected-tables="uiStore.advancedPurgeDialog.state.selectedTableKeys"
    @confirm="uiStore.handleAdvancedPurgeConfirm"
  />

  <ManualUpdateDialog v-model:visible="uiStore.manualUpdateDialog" />

  <HistoryDialog
    v-model:visible="uiStore.historyDialog.visible"
    :table-name="uiStore.historyDialog.props.tableName"
    :table-id="uiStore.historyDialog.props.tableId"
    :row-index="uiStore.historyDialog.props.rowIndex"
    :current-row-data="uiStore.historyDialog.props.currentRowData"
    :title-col-index="uiStore.historyDialog.props.titleColIndex"
    @apply="changes => emit('history-apply', changes)"
  />

  <PresetSaveDialog
    :visible="uiStore.presetSaveDialog.visible"
    :preset-type="uiStore.presetSaveDialog.props.presetType"
    :summary-items="uiStore.presetSaveDialog.props.summaryItems"
    :initial-name="uiStore.presetSaveDialog.props.initialName"
    :check-duplicate="uiStore.presetSaveDialog.props.checkDuplicate"
    @update:visible="uiStore.closePresetSaveDialog"
    @save="uiStore.handlePresetSave"
  />

  <AddTableDialog v-model:visible="uiStore.addTableDialog.visible" @confirm="uiStore.handleAddTableConfirm" />

  <IconSelectDialog
    :visible="uiStore.iconSelectDialog.visible"
    :current-icon="uiStore.iconSelectDialog.props.currentIcon"
    @update:visible="uiStore.closeIconSelectDialog"
    @select="uiStore.handleIconSelect"
  />
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useUIStore } from '../../stores/useUIStore';
import {
  AddTableDialog,
  AdvancedPurgeDialog,
  DirectorDialog,
  HistoryDialog,
  IconSelectDialog,
  InputFloorDialog,
  ManualUpdateDialog,
  PresetSaveDialog,
  PurgeRangeDialog,
  SettingsDialog,
} from './index';

const uiStore = useUIStore();

const emit = defineEmits<{
  'settings-save': [];
  'save-to-floor': [floorIndex: number];
  'purge-range': [startFloor: number, endFloor: number];
  'advanced-purge-confirm': [result: { changedCount: number; tables: string[] }];
  'history-apply': [changes: Map<number, string>];
}>();
</script>
