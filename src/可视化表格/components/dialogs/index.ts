/**
 * ACU 可视化表格 - 弹窗组件导出
 *
 * 第5批组件 (Phase 2 Batch 5) - 弹窗组件：
 * - SettingsDialog: 设置弹窗，包含主题、字体、布局、行为等所有配置选项
 * - InputFloorDialog: 输入楼层弹窗，用于手动指定保存到哪个楼层
 * - PurgeRangeDialog: 清除范围弹窗，用于批量清除指定楼层范围的数据（危险操作）
 * - AdvancedPurgeDialog: 高级清除弹窗，支持按表格+楼层范围精确清除数据
 * - ManualUpdateDialog: 手动更新配置弹窗，用于配置和执行手动更新
 * - HistoryDialog: 历史记录弹窗，用于查看和恢复单元格历史值
 * - RowEditDialog: 行编辑弹窗，用于在仪表盘中快速编辑单行数据
 * - NodeLabelDialog: 节点标签选择弹窗，用于选择显示的字符（复用于关系图和头像管理）
 * - AvatarManagerDialog: 头像管理弹窗，用于管理节点头像配置
 * - AvatarCropDialog: 头像裁剪弹窗，用于调整头像显示效果
 * - DashboardWidgetManagerDialog: 看板管理弹窗，用于添加/移除/排序仪表盘看板
 */

export { default as AdvancedPurgeDialog } from './AdvancedPurgeDialog.vue';
export { default as AvatarCropDialog } from './AvatarCropDialog.vue';
export { default as AvatarManagerDialog } from './AvatarManagerDialog.vue';
export { default as DashboardWidgetManagerDialog } from './DashboardWidgetManagerDialog.vue';
export { default as HistoryDialog } from './HistoryDialog.vue';
export { default as InputFloorDialog } from './InputFloorDialog.vue';
export { default as ManualUpdateDialog } from './ManualUpdateDialog.vue';
export { default as NodeLabelDialog } from './NodeLabelDialog.vue';
export { default as PurgeRangeDialog } from './PurgeRangeDialog.vue';
export { default as RowEditDialog } from './RowEditDialog.vue';
export { default as SettingsDialog } from './SettingsDialog.vue';
export { default as WidgetActionsDialog } from './WidgetActionsDialog.vue';
export { default as WidgetSettingsDialog } from './WidgetSettingsDialog.vue';
