<template>
  <RowEditDialog
    v-model:visible="uiStore.rowEditDialog.visible"
    :table-name="uiStore.rowEditDialog.props.tableName"
    :table-id="uiStore.rowEditDialog.props.tableId"
    :row-index="uiStore.rowEditDialog.props.rowIndex"
    :current-row-data="currentEditingRow"
    @close="uiStore.closeRowEditDialog"
    @show-history="uiStore.switchFromRowEditToHistory"
  />

  <HistoryDialog
    v-model:visible="uiStore.dashboardHistoryDialog.visible"
    :table-name="uiStore.dashboardHistoryDialog.props.tableName"
    :table-id="uiStore.dashboardHistoryDialog.props.tableId"
    :row-index="uiStore.dashboardHistoryDialog.props.rowIndex"
    :current-row-data="uiStore.dashboardHistoryDialog.props.currentRowData"
    :title-col-index="uiStore.dashboardHistoryDialog.props.titleColIndex"
    @close="uiStore.closeDashboardHistoryDialog"
  />

  <WidgetSettingsDialog
    v-model:visible="uiStore.widgetSettingsDialog.visible"
    :widget-id="uiStore.widgetSettingsDialog.props.widgetId"
    :widget-config="uiStore.widgetSettingsDialog.props.widgetConfig"
    :table-headers="uiStore.widgetSettingsDialog.props.tableHeaders"
    @close="uiStore.closeWidgetSettingsDialog"
  />

  <WidgetActionsDialog
    v-model:visible="uiStore.widgetActionsDialog.visible"
    :widget-id="uiStore.widgetActionsDialog.props.widgetId"
    :current-actions="uiStore.widgetActionsDialog.props.currentActions"
    @close="uiStore.closeWidgetActionsDialog"
  />
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useUIStore } from '../../stores/useUIStore';
import { HistoryDialog, RowEditDialog, WidgetActionsDialog, WidgetSettingsDialog } from './index';

const uiStore = useUIStore();

defineProps<{
  currentEditingRow: unknown;
}>();
</script>
