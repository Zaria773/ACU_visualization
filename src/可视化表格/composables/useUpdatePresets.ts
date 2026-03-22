/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 更新预设管理 - 兼容导出
 *
 * 【已迁移】实际逻辑已迁移至 Pinia Store: stores/useUpdatePresetsStore.ts
 * 本文件保留 re-export 以兼容现有 import 路径。
 */

// Re-export Pinia Store（兼容别名）
export { useUpdatePresetsStore as useUpdatePresets } from '../stores/useUpdatePresetsStore';

// Re-export Schemas
export {
  AutoTriggerConfigSchema,
  PresetStorageSchema,
  UpdatePresetSchema,
  UpdateSettingsSchema,
} from '../stores/useUpdatePresetsStore';

// Re-export Types
export type { AutoTriggerConfig, PresetStorage, UpdatePreset, UpdateSettings } from '../stores/useUpdatePresetsStore';
