import { DEFAULT_DEBOUNCE_MS, SETTINGS_STORE } from './constants';
import type { SyncScriptSettings } from './types';

/**
 * 纪要世界书同步脚本：最小设置结构（子任务一）
 *
 * 说明：
 * - 仅保留当前开工必需字段
 * - 使用脚本变量持久化
 * - 不包含后续复杂业务设置（排序策略、世界书写入策略等）
 */
const SyncScriptSettingsSchema = z
  .object({
    auto_sync_enabled: z.boolean().default(true),
    debounce_ms: z.number().int().min(0).default(DEFAULT_DEBOUNCE_MS),
    preferred_summary_sheet_name: z.string().default(''),
    injection_target: z.enum(['character_primary', 'chat_bound']).default('character_primary'),
    wrapper_text_top: z.string().default(''),
    wrapper_text_bottom: z.string().default(''),
    depth_override: z.number().int().nullable().default(9997),
    injection_position: z
      .enum(['at_depth', 'before_character_definition', 'after_character_definition'])
      .default('at_depth'),
    debug_log_enabled: z.boolean().default(false),
    allow_worldbook_write_enabled: z.boolean().default(true),
    zero_tk_mode_enabled: z.boolean().default(false),
    zero_tk_inject_no_trigger: z.boolean().default(false),
    column_visibility: z.record(z.string(), z.enum(['both', 'detail_only', 'summary_only', 'none'])).default({}),
  })
  .prefault({});

/**
 * 读取并校正设置：
 * - 从脚本变量读取
 * - 经 zod 解析后返回安全设置对象
 */
export function loadSettings(): SyncScriptSettings {
  return SyncScriptSettingsSchema.parse(getVariables(SETTINGS_STORE));
}

/**
 * 保存设置到脚本变量。
 */
export function saveSettings(settings: SyncScriptSettings): void {
  insertOrAssignVariables(klona(settings), SETTINGS_STORE);
}
