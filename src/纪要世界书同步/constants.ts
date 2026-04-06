/**
 * 纪要世界书同步脚本：常量定义（子任务一骨架）
 */

export const SCRIPT_LOG_PREFIX = '[纪要世界书同步]';

export const DEFAULT_DEBOUNCE_MS = 600;

/**
 * 纪要同步条目 comment 核心前缀：
 * - 与数据库脚本“基于 comment 识别/清理”的习惯对齐
 * - 后续所有本脚本托管条目都应以此开头
 */
export const SCRIPT_COMMENT_CORE_PREFIX = 'TavernDB-TH-SummarySync';

export const SETTINGS_STORE = {
  type: 'script' as const,
  get script_id() {
    return getScriptId();
  },
};

export const SETTINGS_BUTTON_NAME = '纪要同步设置';
