/**
 * 纪要世界书同步脚本：类型定义
 */

export type InjectionTargetMode = 'character_primary' | 'chat_bound';

/**
 * 脚本设置
 */
export interface SyncScriptSettings {
  /** 是否启用自动同步（后续事件触发时使用） */
  auto_sync_enabled: boolean;
  /** 同步防抖时间（毫秒） */
  debounce_ms: number;
  /** 纪要表优先名称（可空） */
  preferred_summary_sheet_name: string;
  /** 注入目标：角色主世界书 / 当前聊天绑定世界书 */
  injection_target: InjectionTargetMode;
  /** 包裹上文本（可空） */
  wrapper_text_top: string;
  /** 包裹下文本（可空） */
  wrapper_text_bottom: string;
  /** depth 覆盖值（可空） */
  depth_override: number | null;
  /** 是否输出调试日志 */
  debug_log_enabled: boolean;
  /** 兼容字段：真实写入已固定开启，不再作为门控 */
  allow_worldbook_write_enabled: boolean;
  /** 0tk 模式：启用后不生成概览条目 */
  zero_tk_mode_enabled: boolean;
}

export type CleanupFn = () => void;

export interface RuntimeStatus {
  /** 当前命中的纪要表名（运行态） */
  current_summary_sheet_name: string;
  /** 当前目标世界书名（运行态） */
  current_target_worldbook_name: string;
  /** 当前是否正在执行同步 */
  sync_in_progress: boolean;
  /** 最近一次同步请求原因 */
  last_reason: string;
}

export interface RuntimeContext {
  settings: SyncScriptSettings;
  cleanup_fns: CleanupFn[];
  started_at: number;
  runtime_status: RuntimeStatus;
  on_runtime_status_changed?: () => void;
}

/**
 * ACU 单元格值
 */
export type AcuCellValue = string | number | boolean | null | undefined;

/**
 * ACU sheet 数据结构（最小子集）
 */
export interface AcuSheetData {
  name?: string;
  content?: AcuCellValue[][];
  [key: string]: unknown;
}

/**
 * ACU 表格导出 JSON 结构（最小子集）
 */
export type AcuTableJson = Record<string, unknown>;

/**
 * ACU API 最小结构
 */
export interface AcuApiLike {
  exportTableAsJson?: () => unknown;
}

/**
 * ACU 读取结果
 */
export type AcuTableReadResult =
  | {
      ok: true;
      data: AcuTableJson;
      source: 'bridge.getLatestDatabaseJson' | 'api.exportTableAsJson';
      /**
       * 最终隔离标识：
       * - '' 表示 default 槽位
       * - 非空表示非 default 槽位的最终 code
       * - null 表示本轮未从桥接层获得（走回退链路）
       */
      isolation_code: string | null;
    }
  | {
      ok: false;
      reason: string;
    };

/**
 * 纪要表表头映射（统一列位信息）
 */
export interface SummaryHeaderMap {
  raw_headers: string[];
  normalized_headers: string[];

  /** 必备列：纪要（详细内容） */
  detail: number | null;
  /** 必备列：概览（摘要内容） */
  summary: number | null;
  /** 必备列：编码索引 */
  code: number | null;

  /** 统计信息 */
  required_match_count: number;
}

/**
 * 纪要表元数据
 */
export interface EntryPlacementConfig {
  position: 'before_character_definition' | 'after_character_definition' | 'at_depth_as_system';
  depth: number;
  order: number;
}

export interface SummarySheetMeta {
  table_id: string;
  table_name: string;
  header_map: SummaryHeaderMap;
  match_score: number;
  is_preferred_name_match: boolean;
  entry_placement: EntryPlacementConfig;
}

/**
 * 纪要表识别结果
 */
export interface SummarySheetIdentifyResult {
  selected: SummarySheetMeta | null;
  candidates: SummarySheetMeta[];
  warnings: string[];
}

/**
 * 统一事件行模型（供后续世界书构建消费）
 */
export interface UnifiedEventRow {
  /** 必需：编码索引 */
  code: string;
  /** 必需：纪要 */
  detail: string;
  /** 必需：概览 */
  summary: string;

  /** 数据序数（仅数据区，从 1 开始） */
  serial: number;

  /** 元信息 */
  rowIndex: number;
  tableId: string;
  tableName: string;

  /** 保留原始列顺序（用于正文输出） */
  orderedFields: Array<{
    key: string;
    value: string;
    columnIndex: number;
  }>;
}

/**
 * 解析摘要
 */
export interface ParseSummary {
  total_data_rows: number;
  parsed_rows: number;
  skipped_empty_rows: number;
  skipped_empty_code_rows: number;
  skipped_duplicate_code_rows: number;
  duplicate_codes: string[];
  warnings: string[];
}

/**
 * 统一行解析结果
 */
export interface UnifiedRowParseResult {
  rows: UnifiedEventRow[];
  summary: ParseSummary;
}

/**
 * 世界书条目构建：条目类别
 */
export type BuiltEntryKind = 'wrapper_top' | 'summary' | 'detail' | 'wrapper_bottom';

/**
 * 世界书条目构建：目标插入位置（当前阶段仅支持 at_depth）
 */
export type BuiltEntryPosition =
  | {
      type: 'at_depth';
      role: 'system' | 'assistant' | 'user';
      depth: number;
      order: number;
    }
  | {
      type: 'before_character_definition' | 'after_character_definition';
      order: number;
    };

/**
 * 世界书条目构建：激活策略（对齐世界书 selective/constant 语义）
 */
export interface BuiltEntryStrategy {
  type: 'constant' | 'selective';
  keys: (string | RegExp)[];
  keys_secondary: { logic: 'and_any' | 'and_all' | 'not_all' | 'not_any'; keys: (string | RegExp)[] };
  scan_depth: 'same_as_global' | number;
}

/**
 * 单条构建结果（内部中间结构）
 */
export interface BuiltWorldbookEntry {
  kind: BuiltEntryKind;
  name: string;
  enabled: boolean;
  strategy: BuiltEntryStrategy;
  position: BuiltEntryPosition;
  content: string;

  /** 关联行信息：包裹条目为空 */
  source: {
    code: string | null;
    serial: number | null;
    rowIndex: number | null;
    tableId: string | null;
    tableName: string | null;
  };
}

/**
 * depth 计算结果（用于调试与摘要）
 */
export interface BuiltDepthPlan {
  base_depth: number;
  wrapper_top_depth: number;
  content_depth: number;
  wrapper_bottom_depth: number;
  placement_position: EntryPlacementConfig['position'];
  placement_order: number;
}

/**
 * 单行 order 计算结果
 */
export interface RowOrderInfo {
  code: string;
  rowIndex: number;
  order: number;
}

/**
 * 条目构建输入参数
 */
export interface BuildEntriesInput {
  rows: UnifiedEventRow[];
  entry_placement: EntryPlacementConfig;
  wrapper_text_top: string;
  wrapper_text_bottom: string;
  /** 启用后不生成概览条目 */
  zero_tk_mode_enabled: boolean;
}

/**
 * 条目构建摘要
 */
export interface BuildEntriesSummary {
  total_rows: number;
  parsed_order_rows: number;
  used_fallback_by_row_order: boolean;
  counts: {
    wrapper_top: number;
    summary: number;
    detail: number;
    wrapper_bottom: number;
    total_entries: number;
  };
  depth_plan: BuiltDepthPlan;
}

/**
 * 条目构建结果
 */
export interface BuildEntriesResult {
  entries: BuiltWorldbookEntry[];
  summary: BuildEntriesSummary;
  order_map: RowOrderInfo[];
}

/**
 * 世界书主书名解析结果
 */
export type PrimaryWorldbookResolveResult =
  | {
      ok: true;
      worldbook_name: string;
    }
  | {
      ok: false;
      reason: string;
    };

/**
 * 本轮世界书写入结果摘要
 */
export interface ManagedWorldbookSyncSummary {
  worldbook_name: string;
  removed_old_entries: number;
  added_new_entries: number;
  comment_rule_summary: string;
  skipped_write: boolean;
  skip_reason: string | null;
}
