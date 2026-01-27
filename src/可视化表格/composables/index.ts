/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * ACU Visualizer Composables
 * Vue 3 Composition API 函数集合
 *
 * 注意：旧的 jQuery composables 已被移除，请使用 Vue 组件替代：
 * - useCellMenu → ContextMenu.vue
 * - useFloatingManager → FloatingBall.vue + MainPanel.vue
 * - useInlineEdit → InlineEditor.vue
 * - useMobileGestures → useMobileGesturesNew (VueUse 实现)
 * - useStyles → useParentStyleInjection (SCSS 文件)
 * - useTableRender → DataTable.vue + DataCard.vue
 * - useDialogs → dialogs/*.vue 组件
 * - usePanelEvents → Vue 模板事件
 */

// ============================================
// 样式注入（跨 iframe）
// ============================================
export { useParentStyleInjection } from './useParentStyleInjection';

// ============================================
// 触摸滚动修复（跨 iframe，随组件生命周期管理）
// ============================================
export { useTouchScrollFix } from './useTouchScrollFix';

// ============================================
// API 回调管理（随组件生命周期管理）
// ============================================
export { useApiCallbacks } from './useApiCallbacks';

// ============================================
// 数据持久化
// ============================================
export { useDataPersistence } from './useDataPersistence';

// ============================================
// 数据库配置管理
// ============================================
export { useDbSettings } from './useDbSettings';
export type { DbSettings } from './useDbSettings';

// ============================================
// 核心业务操作
// ============================================
export { useCoreActions } from './useCoreActions';

// ============================================
// 移动端手势系统（VueUse 实现）
// ============================================
export {
  getGestureIndicator,
  getGestureIndicatorConfig,
  useCardGestures,
  useIsMobile,
  useMobileGestures as useMobileGesturesNew,
  useSelectionGuardEnhanced,
} from './useMobileGesturesNew';

// 类型导出 - 手势系统
export type {
  CardGestureOptions,
  GestureIndicatorConfig,
  GestureState,
  MobileGestureOptions,
} from './useMobileGesturesNew';

// ============================================
// VueUse 集成 - 封装常用功能
// ============================================
export {
  // 重导出的 VueUse 原始功能
  onClickOutside,
  useACUStorage,
  useAutoHeight,
  useClickOutsideClose,
  useClipboard,
  useCopyWithFeedback,
  useDebouncedSave,
  useDebounceFn,
  useDraggable,
  // 封装的增强功能
  useDraggableWithSnap,
  useEventListener,
  useParentDocumentEventListener,
  useParentEventListener,
  useResizeObserver,
  useSelectionGuard,
  // 智能高度调整
  useSmartHeight,
  useStorage,
  useTextSelection,
  useThrottleFn,
  watchDebounced,
} from './useVueUseIntegration';

// 类型导出 - VueUse 集成
export type {
  AutoHeightOptions,
  DebouncedSaveOptions,
  DraggableWithSnapOptions,
  PanelType,
  SmartHeightOptions,
} from './useVueUseIntegration';

// ============================================
// Toast 通知
// ============================================
export { toast, useToast } from './useToast';
export type { ToastType } from './useToast';

// ============================================
// 表格完整性检测
// ============================================
export {
  checkTableIntegrity,
  extractNumber,
  isSummaryOrOutlineTable,
  useTableIntegrityCheck,
} from './useTableIntegrityCheck';

export type {
  IntegrityCheckConfig,
  IntegrityIssue,
  IntegrityIssueType,
  TableCheckResult,
} from './useTableIntegrityCheck';

// ============================================
// 更新预设管理
// ============================================
export {
  AutoTriggerConfigSchema,
  PresetStorageSchema,
  UpdatePresetSchema,
  UpdateSettingsSchema,
  useUpdatePresets,
} from './useUpdatePresets';

export type { AutoTriggerConfig, PresetStorage, UpdatePreset, UpdateSettings } from './useUpdatePresets';

// ============================================
// 历史记录系统（IndexedDB 存储）
// ============================================
export { useRowHistory } from './useRowHistory';
export type { RowSnapshot } from './useRowHistory';

// IndexedDB 底层操作（一般不直接使用，由 useRowHistory 封装）
export {
  addSnapshot,
  clearAll as clearAllSnapshots,
  deleteByChat,
  deleteSnapshot,
  getStats as getDBStats,
  getSnapshots as getSnapshotsFromDB,
  initDB,
} from './useIndexedDB';
export type { RowSnapshot as IndexedDBRowSnapshot } from './useIndexedDB';

// ============================================
// Swipe 增强功能
// ============================================
export { useSwipeEnhancement } from './useSwipeEnhancement';
export type { SwipeEnhancementConfig } from './useSwipeEnhancement';

// ============================================
// 单元格锁定管理
// ============================================
export { useCellLock } from './useCellLock';

// ============================================
// 头像管理（IndexedDB 存储）
// ============================================
export { getAvatarManager, useAvatarManager } from './useAvatarManager';
export type { AvatarRecord, AvatarStats } from './useAvatarManager';

// ============================================
// 表格更新状态（仪表盘看板）
// ============================================
export { useTableUpdateStatus } from './useTableUpdateStatus';
export type { DbGlobalSettings, TableUpdateStatus } from './useTableUpdateStatus';

// ============================================
// 背景图片存储（IndexedDB）
// ============================================
export {
  deleteBackground,
  fileToBlob,
  hasBackground,
  loadBackground,
  revokeBlobUrl,
  saveBackground,
  urlToBlob,
} from './useBackgroundStorage';
export type { BackgroundRecord } from './useBackgroundStorage';

// ============================================
// App 事件处理 Composables（从 App.vue 提取）
// ============================================
export { useAppDataActions } from './useAppDataActions';
export type { UseAppDataActionsOptions } from './useAppDataActions';

export { useAppNavigation } from './useAppNavigation';
export type { UseAppNavigationOptions } from './useAppNavigation';

export { useAppContextMenu } from './useAppContextMenu';
export type { ContextMenuState, UseAppContextMenuOptions } from './useAppContextMenu';

// ============================================
// 关系图数据计算（从 App.vue 提取）
// ============================================
export { useRelationshipData } from './useRelationshipData';

// ============================================
// 抽签系统 - 运势抽取
// ============================================
export {
  calculateProbabilities,
  cloneLuckTier,
  createLuckTier,
  DEFAULT_LUCK_TIERS,
  drawLuck,
  getTierProbability,
  useDraw,
  validateLuckTiers,
} from './useDraw';
export type { LuckTier, UseDrawOptions, UseDrawReturn } from './useDraw';

// ============================================
// 抽签系统 - 词库扫描与预处理
// ============================================
export {
  detectWordPoolTables,
  drawOneFromEachPool,
  drawOneFromPool,
  drawWords,
  getWordPoolStats,
  getWordPoolTableData,
  parseWordPool,
  useWordPool,
} from './useWordPool';
export type { TableRow, UseWordPoolOptions, UseWordPoolReturn, WordPool } from './useWordPool';

// ============================================
// 抽签系统 - 提示词拼装
// ============================================
export {
  buildFullPrompt,
  buildPrompt,
  buildPromptWithTemplate,
  extractPlaceholders,
  formatWords,
  previewPrompt,
  TEMPLATE_FULL,
  TEMPLATE_SIMPLE,
  TEMPLATE_WITH_DIMENSIONS,
  usePromptBuild,
  validateTemplate,
} from './usePromptBuild';
export type { DrawResult, FullDrawResult, UsePromptBuildOptions, UsePromptBuildReturn } from './usePromptBuild';
