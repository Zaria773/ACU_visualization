/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * ACU 可视化表格 - Vue 组件导出
 *
 * 第1批组件 (Phase 2 Batch 1)：
 * - FloatingBall: 悬浮球组件，支持拖拽、吸附、点击展开/收起
 * - MainPanel: 主面板容器，支持拖拽移动、调整大小、折叠/固定
 * - TabBar: 标签栏组件，支持切换、拖拽排序
 *
 * 第2批组件 (Phase 2 Batch 2) - 核心数据展示组件：
 * - DataCard: 数据卡片组件，支持网格/列表视图、点击编辑、滑动手势、删除标记
 * - InlineEditor: 内联编辑器组件，支持自动高度、快捷键操作
 * - Badge: 徽章组件，根据内容自动选择样式（等级、百分比、性别等）
 *
 * 第3批组件 (Phase 2 Batch 3) - 容器组件：
 * - DataTable: 数据表格容器，支持搜索、排序（变动优先）、分页、视图切换
 * - Dashboard: 仪表盘视图，聚合展示主角、NPC、任务、物品等关键表格
 * - OptionsPanel: 选项聚合面板，自动检测并展示"选项"类表格，支持矩阵模式
 *
 * 第4批组件 (Phase 2 Batch 4) - UI辅助组件：
 * - ContextMenu: 右键菜单组件，支持点击外部关闭、删除/撤销删除互斥显示
 * - Pagination: 分页器组件，支持智能页码列表、跳转输入
 * - SearchBox: 搜索框组件，支持防抖搜索、清空按钮
 *
 * 第5批组件 (Phase 2 Batch 5) - 弹窗组件：
 * - SettingsDialog: 设置弹窗，包含主题、字体、布局、行为等所有配置选项
 * - InputFloorDialog: 输入楼层弹窗，用于手动指定保存到哪个楼层
 * - PurgeRangeDialog: 清除范围弹窗，用于批量清除指定楼层范围的数据（危险操作）
 */

// 第1批组件
export { default as FloatingBall } from './FloatingBall.vue';
export { default as MainPanel } from './MainPanel.vue';
export { default as TabBar } from './TabBar.vue';

// 第2批组件 - 核心数据展示
export { default as Badge } from './Badge.vue';
export { default as DataCard } from './DataCard.vue';
export { default as InlineEditor } from './InlineEditor.vue';

// 第3批组件 - 容器组件
export { default as Dashboard } from './Dashboard.vue';
export { default as DataTable } from './DataTable.vue';
export { default as OptionsPanel } from './OptionsPanel.vue';

// 第4批组件 - UI辅助组件
export { default as ContextMenu } from './ContextMenu.vue';
export { default as Pagination } from './Pagination.vue';
export { default as SearchBox } from './SearchBox.vue';

// 第5批组件 - 弹窗组件
export * from './dialogs';

// 第6批组件 - UI基础组件
export { default as ActionBar } from './ActionBar.vue';

// 第7批组件 - 设置面板组件
export { default as NavButtonConfigPanel } from './settings/NavButtonConfigPanel.vue';
export { default as TabConfigPanel } from './settings/TabConfigPanel.vue';

// 第8批组件 - 通知组件
export { default as Toast } from './Toast.vue';

// 第9批组件 - 关系图组件
export { default as RelationshipGraph } from './RelationshipGraph.vue';

// 第10批组件 - 隐藏按钮浮窗
export { default as HiddenButtonsPopup } from './HiddenButtonsPopup.vue';

// 第11批组件 - Tab 收纳浮窗
export { default as TabsPopup } from './TabsPopup.vue';
