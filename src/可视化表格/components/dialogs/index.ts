/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * ACU 可视化表格 - 弹窗组件导出
 *
 * 按领域分类：
 * - common/: 通用弹窗（设置、楼层输入、清除、历史记录、手动更新）
 * - graph/: 关系图弹窗（图设置、节点配置、势力设置、头像管理）
 * - dashboard/: 仪表盘弹窗（行编辑、看板管理、快捷按钮配置）
 */

// ============================================
// 通用弹窗 (common/)
// ============================================
export { default as AddTableDialog } from './common/AddTableDialog.vue';
export { default as AdvancedPurgeDialog } from './common/AdvancedPurgeDialog.vue';
export { default as DirectorDialog } from './common/DirectorDialog.vue';
export { default as HistoryDialog } from './common/HistoryDialog.vue';
export { default as IconSelectDialog } from './common/IconSelectDialog.vue';
export { default as InputFloorDialog } from './common/InputFloorDialog.vue';
export { default as ManualUpdateDialog } from './common/ManualUpdateDialog.vue';
export { default as PresetSaveDialog } from './common/PresetSaveDialog.vue';
export { default as PurgeRangeDialog } from './common/PurgeRangeDialog.vue';
export { default as SettingsDialog } from './common/SettingsDialog.vue';

// ============================================
// 关系图弹窗 (graph/)
// ============================================
export { default as AvatarCropDialog } from './graph/AvatarCropDialog.vue';
export { default as AvatarManagerDialog } from './graph/AvatarManagerDialog.vue';
export { default as FactionSettingsDialog } from './graph/FactionSettingsDialog.vue';
export { default as GraphSettingsDialog } from './graph/GraphSettingsDialog.vue';
export { default as NodeConfigDialog } from './graph/NodeConfigDialog.vue';
export { default as NodeLabelDialog } from './graph/NodeLabelDialog.vue';

// ============================================
// 仪表盘弹窗 (dashboard/)
// ============================================
export { default as RowEditDialog } from './dashboard/RowEditDialog.vue';
export { default as WidgetActionsDialog } from './dashboard/WidgetActionsDialog.vue';
export { default as WidgetSettingsDialog } from './dashboard/WidgetSettingsDialog.vue';

// ============================================
// 抽签系统弹窗 (divination/)
// ============================================
export { default as CardBack } from './divination/CardBack.vue';
export { default as CardFront } from './divination/CardFront.vue';
export { default as CornerOrnament } from './divination/CornerOrnament.vue';
export { default as DivinationOverlay } from './divination/DivinationOverlay.vue';
export { default as TarotCard } from './divination/TarotCard.vue';

