import {
  createSummaryWorldbookSyncBridge,
  disposeSummaryWorldbookSyncBridgeGlobal,
  initializeSummaryWorldbookSyncBridgeGlobal,
} from './bridge';
import { buildWorldbookEntries } from './builder';
import { clearManagedIsolationCodeContext, setManagedIsolationCodeContext } from './comment';
import { SCRIPT_LOG_PREFIX, SETTINGS_BUTTON_NAME } from './constants';
import { parseUnifiedRowsFromSummarySheet } from './parser';
import { loadSettings, saveSettings } from './settings';
import { findGlobalSheet, identifySummarySheet, readAcuTableJsonBridgeFirst, readCurrentTimeFromGlobalSheet } from './source';
import { applyTimeTransformToRows, parseTimeTemplate } from './timeTransform';
import type {
  BuildEntriesResult,
  CleanupFn,
  RuntimeContext,
  RuntimeStatus,
  SyncScriptSettings,
  UnifiedEventRow,
} from './types';
import { createMinimalSettingsDialog } from './ui';
import {
  buildWritableWorldbookEntries,
  purgeManagedEntriesFromNonTargetWorldbook,
  purgeManagedEntriesFromTargetWorldbook,
  replaceManagedEntriesInTargetWorldbook,
  resolveTargetWorldbook,
} from './worldbook';

const UI_RESYNC_REASON = '设置弹窗按钮：立即重新注入';

/**
 * 调试日志（受设置开关控制）。
 */
function logDebug(ctx: RuntimeContext, ...args: unknown[]): void {
  if (!ctx.settings.debug_log_enabled) return;
  console.info(SCRIPT_LOG_PREFIX, '[调试]', ...args);
}

/**
 * 基础日志。
 */
function logInfo(...args: unknown[]): void {
  console.info(SCRIPT_LOG_PREFIX, ...args);
}

/**
 * 初始化设置：
 * - 当前仅完成读取与日志输出
 * - 后续可扩展为设置迁移、合法性纠偏、远端覆盖等
 */
function initSettings(): RuntimeContext {
  const settings = loadSettings();
  const runtime_status: RuntimeStatus = {
    current_summary_sheet_name: '尚未识别',
    current_target_worldbook_name: '尚未定位',
    sync_in_progress: false,
    last_reason: '尚无',
    current_raw_headers: [],
    current_global_sheet_headers: [],
  };
  const ctx: RuntimeContext = {
    settings,
    cleanup_fns: [],
    started_at: Date.now(),
    runtime_status,
  };

  logInfo('设置已初始化。');
  logDebug(ctx, '当前设置：', settings);

  return ctx;
}

/**
 * 打印统一行模型演示数据（仅调试展示）。
 */
function logRowPreview(ctx: RuntimeContext, rows: UnifiedEventRow[]): void {
  if (rows.length === 0) {
    logInfo('统一行模型演示：没有可展示的数据行。');
    return;
  }

  const preview = rows.slice(0, 5).map(row => ({
    rowIndex: row.rowIndex,
    serial: row.serial,
    code: row.code,
    summary: row.summary,
    detail: row.detail,
    orderedFieldKeys: row.orderedFields.map(field => field.key),
  }));

  logDebug(ctx, '统一行模型预览（最多 5 行）：', preview);
}

/**
 * 打印条目构建预览（仅调试展示，不写入世界书）。
 */
function logBuiltEntriesPreview(ctx: RuntimeContext, built: BuildEntriesResult): void {
  logInfo(
    `条目构建完成：共 ${built.summary.counts.total_entries} 条（表头 ${built.summary.counts.header} / 概览 ${built.summary.counts.summary} / 纪要 ${built.summary.counts.detail} / 包裹上 ${built.summary.counts.wrapper_top} / 包裹下 ${built.summary.counts.wrapper_bottom}）。`,
  );
  logDebug(ctx, '条目构建摘要：', built.summary);
  logDebug(ctx, '条目 order 映射预览（最多 10 行）：', built.order_map.slice(0, 10));

  const summaryPreview = built.entries
    .filter(entry => entry.kind === 'summary')
    .slice(0, 3)
    .map(entry => ({
      name: entry.name,
      position_type: entry.position.type,
      depth: entry.position.type === 'at_depth' ? entry.position.depth : null,
      order: entry.position.order,
      strategy: entry.strategy,
      content: entry.content,
    }));

  const detailPreview = built.entries
    .filter(entry => entry.kind === 'detail')
    .slice(0, 3)
    .map(entry => ({
      name: entry.name,
      position_type: entry.position.type,
      depth: entry.position.type === 'at_depth' ? entry.position.depth : null,
      order: entry.position.order,
      strategy: entry.strategy,
      content: entry.content,
    }));

  logDebug(ctx, '概览条目预览（最多 3 条）：', summaryPreview);
  logDebug(ctx, '纪要条目预览（最多 3 条）：', detailPreview);
}

interface SyncScheduler {
  scheduleSync: (reason: string) => void;
  flushSync: (reason: string) => void;
  flushSyncAsync: (reason: string) => Promise<void>;
  dispose: () => void;
}

/**
 * 更新运行时展示状态，并通知 UI 刷新。
 */
function updateRuntimeStatus(ctx: RuntimeContext, patch: Partial<RuntimeStatus>): void {
  Object.assign(ctx.runtime_status, patch);
  ctx.on_runtime_status_changed?.();
}

/**
 * 事件监听全局挂载状态（防止重复注册）。
 */
let listenersMounted = false;

/**
 * 执行一轮完整同步（统一业务入口）：
 * - ACU 读取
 * - 纪要表识别
 * - 统一行解析
 * - 条目构建
 * - 主世界书受控替换（或只读预览）
 */
async function performSync(ctx: RuntimeContext, reason: string): Promise<void> {
  logInfo(`开始同步。触发原因：${reason}`);
  logInfo(
    `[桥接诊断] performSync 入口：auto_sync_enabled=${String(ctx.settings.auto_sync_enabled)}; sync_in_progress=${String(
      ctx.runtime_status.sync_in_progress,
    )}; last_reason=${ctx.runtime_status.last_reason}`,
  );

  if (!ctx.settings.auto_sync_enabled) {
    logInfo(`本轮跳过：自动同步已关闭。触发原因：${reason}`);
    return;
  }

  const tableRead = await readAcuTableJsonBridgeFirst();
  if (!tableRead.ok) {
    logInfo(`本轮跳过：ACU 数据读取失败。触发原因：${reason}`);
    console.warn(SCRIPT_LOG_PREFIX, 'ACU 数据读取失败详情：', tableRead.reason);
    return;
  }

  logDebug(ctx, 'ACU 数据读取成功，来源：', tableRead.source);

  // comment / name 命名使用“桥接优先”的最终隔离标识
  setManagedIsolationCodeContext(tableRead.isolation_code);

  try {
    const identifyResult = identifySummarySheet(tableRead.data, ctx.settings);
    for (const warning of identifyResult.warnings) {
      console.warn(SCRIPT_LOG_PREFIX, warning);
    }

    if (!identifyResult.selected) {
      updateRuntimeStatus(ctx, { current_summary_sheet_name: '未命中纪要表' });
      logInfo(`本轮跳过：未找到可用纪要表。触发原因：${reason}`);
      return;
    }

    // 提取有效列名（跳过第一列、跳过空列名），供列显示设置弹窗使用
    const relevantHeaders = identifyResult.selected.header_map.raw_headers.filter((h, i) => i >= 1 && h !== '');
    updateRuntimeStatus(ctx, {
      current_summary_sheet_name: identifyResult.selected.table_name,
      current_raw_headers: relevantHeaders,
    });
    logInfo(`命中纪要表：${identifyResult.selected.table_name}（${identifyResult.selected.table_id}）。`);

    const parsed = parseUnifiedRowsFromSummarySheet(tableRead.data, identifyResult.selected);
    for (const warning of parsed.summary.warnings) {
      console.warn(SCRIPT_LOG_PREFIX, warning);
    }

    logInfo(`统一行解析完成：共 ${parsed.summary.total_data_rows} 行，成功解析 ${parsed.summary.parsed_rows} 行。`);
    logDebug(ctx, '统一行解析摘要：', parsed.summary);
    logRowPreview(ctx, parsed.rows);

    // ── 全局数据表列名读取（供时间设置 UI 下拉框使用） ──
    if (ctx.settings.global_sheet_name) {
      const globalSheetResult = findGlobalSheet(tableRead.data, ctx.settings.global_sheet_name);
      if (globalSheetResult.found) {
        updateRuntimeStatus(ctx, { current_global_sheet_headers: globalSheetResult.headers.filter(h => h !== '') });
      }
    }

    // ── 时间变换 ──
    if (ctx.settings.time_transform_enabled) {
      const templateSegments = parseTimeTemplate(ctx.settings.time_format_template);
      const currentTimeResult = readCurrentTimeFromGlobalSheet(
        tableRead.data,
        ctx.settings.global_sheet_name,
        ctx.settings.global_time_column,
        templateSegments,
      );
      if (currentTimeResult?.has_any) {
        applyTimeTransformToRows(parsed.rows, {
          template: templateSegments,
          currentTime: currentTimeResult.parsed,
          summaryTimeColumn: ctx.settings.summary_time_column,
        });
        logInfo(`时间变换已应用：当前时间来源=${ctx.settings.global_sheet_name}.${ctx.settings.global_time_column}`);
        logDebug(ctx, '当前时间解析结果：', currentTimeResult.parsed);
      } else {
        logInfo('时间变换跳过：无法从全局数据表读取当前时间。');
      }
    }
    // ── 时间变换结束 ──

    const depth = ctx.settings.depth_override ?? 9997;
    const built = buildWorldbookEntries({
      rows: parsed.rows,
      depth,
      position: ctx.settings.injection_position,
      wrapper_text_top: ctx.settings.wrapper_text_top,
      wrapper_text_bottom: ctx.settings.wrapper_text_bottom,
      zero_tk_mode_enabled: ctx.settings.zero_tk_mode_enabled,
      zero_tk_inject_no_trigger: ctx.settings.zero_tk_inject_no_trigger,
      column_visibility: ctx.settings.column_visibility,
      table_name: identifyResult.selected.table_name,
      relevant_headers: relevantHeaders,
    });

    logBuiltEntriesPreview(ctx, built);

    const targetResolved = resolveTargetWorldbook(ctx.settings.injection_target);
    if (!targetResolved.ok) {
      updateRuntimeStatus(ctx, { current_target_worldbook_name: '未定位目标世界书' });
      logInfo(`本轮跳过：无法定位目标世界书。触发原因：${reason}`);
      console.warn(SCRIPT_LOG_PREFIX, targetResolved.reason);
      return;
    }

    const targetWorldbookName = targetResolved.worldbook_name;
    updateRuntimeStatus(ctx, { current_target_worldbook_name: targetWorldbookName });
    logInfo(
      `本轮目标世界书：${targetWorldbookName}（target=${ctx.settings.injection_target === 'chat_bound' ? '当前聊天绑定世界书' : '角色主世界书'}）`,
    );

    logDebug(
      ctx,
      '构建的条目详情（前3条）：',
      built.entries.slice(0, 3).map(e => ({
        kind: e.kind,
        name: e.name,
        position: e.position,
        content: e.content.slice(0, 80),
      })),
    );

    const writableEntries = buildWritableWorldbookEntries(built);

    // 每轮同步前清理“非当前目标世界书”中的托管条目，避免切换目标后双世界书残留
    try {
      const purgeResult = await purgeManagedEntriesFromNonTargetWorldbook(ctx.settings.injection_target);
      if (purgeResult && purgeResult.removed_count > 0) {
        logInfo(`已清理非目标世界书托管条目 ${purgeResult.removed_count} 条（${purgeResult.worldbook_name}）。`);
      }
    } catch (error) {
      console.warn(SCRIPT_LOG_PREFIX, '清理非目标世界书托管条目失败：', error);
    }

    logInfo(
      `同步模式：真实写入（固定开启）。设置中的 allow_worldbook_write_enabled=${String(ctx.settings.allow_worldbook_write_enabled)} 仅保留兼容，不再作为门控。`,
    );

    const syncSummary = await replaceManagedEntriesInTargetWorldbook(writableEntries, {
      target_mode: ctx.settings.injection_target,
      expected_entry_count: built.summary.counts.total_entries,
    });

    if (syncSummary.skipped_write) {
      logInfo(`本轮跳过写入：${syncSummary.skip_reason ?? '内容一致'}`);
      return;
    }

    logInfo(`世界书受控替换完成：目标世界书=${syncSummary.worldbook_name}`);
    logInfo(`本次清理旧条目：${syncSummary.removed_old_entries} 条`);
    logInfo(`本次新增条目：${syncSummary.added_new_entries} 条`);
    logInfo(`comment 规则摘要：${syncSummary.comment_rule_summary}`);
    logInfo('同步完成（真实写入）。');
  } finally {
    clearManagedIsolationCodeContext();
  }
}

/**
 * 创建同步调度器：
 * - 提供 scheduleSync / flushSync / dispose
 * - 处理防抖、重入保护、待重跑
 */
function createSyncScheduler(ctx: RuntimeContext): SyncScheduler {
  let disposed = false;
  let debounceTimer: number | null = null;
  let pendingDebounceReason: string | null = null;

  let syncInProgress = false;
  let pendingRerunReason: string | null = null;

  const getDebounceMs = (): number => Math.max(0, ctx.settings.debounce_ms);

  const clearDebounceTimer = (): void => {
    if (debounceTimer === null) return;
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
    pendingDebounceReason = null;
  };

  const markRerun = (reason: string): void => {
    pendingRerunReason = reason;
    logInfo(`检测到同步重入，已记录待重跑请求。原因：${reason}`);
  };

  const executeSync = async (reason: string): Promise<void> => {
    logInfo(
      `[桥接诊断] executeSync 收到请求：reason=${reason}; disposed=${String(disposed)}; syncInProgress=${String(syncInProgress)}; pendingRerunReason=${
        pendingRerunReason ?? 'null'
      }`,
    );

    if (disposed) {
      logInfo(`调度器已销毁，忽略同步请求。原因：${reason}`);
      return;
    }

    if (syncInProgress) {
      markRerun(reason);
      return;
    }

    syncInProgress = true;
    updateRuntimeStatus(ctx, { sync_in_progress: true, last_reason: reason });
    logDebug(ctx, '同步执行状态：进入运行中。');

    try {
      await performSync(ctx, reason);
      logInfo(`本轮同步成功结束。触发原因：${reason}`);
    } catch (error) {
      console.warn(SCRIPT_LOG_PREFIX, `本轮同步失败。触发原因：${reason}`, error);
    } finally {
      syncInProgress = false;
      updateRuntimeStatus(ctx, { sync_in_progress: false });
      logDebug(ctx, '同步执行状态：已退出运行中。');

      if (!disposed && pendingRerunReason) {
        const rerunReason = pendingRerunReason;
        pendingRerunReason = null;

        logInfo(`检测到待重跑请求，立即追加一轮同步。原因：${rerunReason}`);
        void executeSync(`重跑：${rerunReason}`);
      }
    }
  };

  const scheduleSync = (reason: string): void => {
    if (disposed) {
      logInfo(`调度器已销毁，忽略防抖请求。原因：${reason}`);
      return;
    }

    if (syncInProgress) {
      markRerun(reason);
      return;
    }

    const debounceMs = getDebounceMs();
    if (debounceMs <= 0) {
      logInfo(`防抖时间为 0ms，立即执行同步。触发原因：${reason}`);
      void executeSync(reason);
      return;
    }

    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      logInfo(`防抖计时已刷新：${debounceMs}ms 后执行。最新触发原因：${reason}`);
    } else {
      logInfo(`已安排防抖同步：${debounceMs}ms 后执行。触发原因：${reason}`);
    }

    pendingDebounceReason = reason;
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      const runReason = pendingDebounceReason ?? reason;
      pendingDebounceReason = null;
      void executeSync(runReason);
    }, debounceMs);
  };

  const flushSyncAsync = async (reason: string): Promise<void> => {
    logInfo(
      `[桥接诊断] flushSyncAsync 收到立即请求：reason=${reason}; disposed=${String(disposed)}; debounceTimer=${
        debounceTimer === null ? 'null' : 'active'
      }; syncInProgress=${String(syncInProgress)}`,
    );

    if (disposed) {
      logInfo(`调度器已销毁，忽略立即同步请求。原因：${reason}`);
      return;
    }

    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
      pendingDebounceReason = null;
      logInfo('已清理待执行的防抖任务，改为立即执行同步。');
    }

    await executeSync(reason);
    logInfo(`[桥接诊断] flushSyncAsync 执行结束：reason=${reason}`);
  };

  const flushSync = (reason: string): void => {
    void flushSyncAsync(reason);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;

    clearDebounceTimer();
    pendingRerunReason = null;

    logInfo('同步调度器已销毁：防抖计时器已清理、待重跑标记已清空。');
  };

  return {
    scheduleSync,
    flushSync,
    flushSyncAsync,
    dispose,
  };
}

/**
 * 事件监听注册：
 * - MESSAGE_SENT
 * - GENERATION_STARTED
 * - CHAT_CHANGED
 */
function setupEventListeners(ctx: RuntimeContext, scheduler: SyncScheduler): void {
  if (listenersMounted) {
    logDebug(ctx, '事件监听已注册，忽略重复注册请求。');
    return;
  }

  const onMessageSent = (messageId: number): void => {
    const reason = `事件触发：MESSAGE_SENT（message_id=${messageId}）`;
    logInfo(reason);
    scheduler.scheduleSync(reason);
  };

  const onGenerationStarted = (): void => {
    const reason = '事件触发：GENERATION_STARTED';
    logInfo(reason);
    scheduler.scheduleSync(reason);
  };

  const onChatChanged = (chatFileName: string): void => {
    const reason = `事件触发：CHAT_CHANGED（chat=${chatFileName}）`;
    logInfo(reason);
    scheduler.scheduleSync(reason);
  };

  const onCharacterPageLoaded = (): void => {
    const reason = '事件触发：CHARACTER_PAGE_LOADED';
    logInfo(reason);
    scheduler.scheduleSync(reason);
  };

  const stopMessageSent = eventOn(tavern_events.MESSAGE_SENT, onMessageSent);
  const stopGenerationStarted = eventOn(tavern_events.GENERATION_STARTED, onGenerationStarted);
  const stopChatChanged = eventOn(tavern_events.CHAT_CHANGED, onChatChanged);
  const stopCharacterPageLoaded = eventOn(tavern_events.CHARACTER_PAGE_LOADED, onCharacterPageLoaded);

  listenersMounted = true;
  logInfo('事件监听已注册：MESSAGE_SENT / GENERATION_STARTED / CHAT_CHANGED / CHARACTER_PAGE_LOADED。');

  const dispose: CleanupFn = () => {
    if (!listenersMounted) return;
    stopMessageSent.stop();
    stopGenerationStarted.stop();
    stopChatChanged.stop();
    stopCharacterPageLoaded.stop();
    listenersMounted = false;
    logInfo('事件监听已注销。');
  };

  ctx.cleanup_fns.push(dispose);
}

/**
 * 卸载清理：
 * - 在 pagehide 中执行
 * - 统一调用所有清理函数
 */
function cleanup(ctx: RuntimeContext): void {
  if (ctx.cleanup_fns.length === 0) {
    logInfo('卸载清理已执行过，本次跳过。');
    return;
  }

  // 卸载时主动隐藏按钮，避免脚本异常中断后按钮残留
  replaceScriptButtons([{ name: SETTINGS_BUTTON_NAME, visible: false }]);

  logInfo('开始执行卸载清理。');

  for (let index = ctx.cleanup_fns.length - 1; index >= 0; index -= 1) {
    const fn = ctx.cleanup_fns[index];
    try {
      fn();
    } catch (error) {
      console.warn(SCRIPT_LOG_PREFIX, '清理函数执行失败：', error);
    }
  }

  ctx.cleanup_fns.length = 0;

  const aliveMs = Date.now() - ctx.started_at;
  logInfo(`卸载清理完成，脚本存活时长：${aliveMs}ms`);
}

/**
 * 脚本主初始化流程。
 */
function setupSettingsUi(ctx: RuntimeContext, scheduler: SyncScheduler): void {
  replaceScriptButtons([{ name: SETTINGS_BUTTON_NAME, visible: true }]);
  logInfo(`脚本按钮已注册：${SETTINGS_BUTTON_NAME}（replaceScriptButtons）。`);

  const dialog = createMinimalSettingsDialog({
    getSettings: () => ctx.settings,
    getRuntimeStatus: () => ctx.runtime_status,
    saveAndApply: (next: SyncScriptSettings): void => {
      const prev = ctx.settings;
      ctx.settings = next;
      saveSettings(next);

      const raceTraceId = `switch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let oldTargetPurgeFinishedAt: number | null = null;
      let syncFinishedAt: number | null = null;

      if (prev.injection_target !== next.injection_target) {
        const purgeStartAt = Date.now();
        logInfo(`竞态诊断[${raceTraceId}] 旧目标清理开始：from=${prev.injection_target} to=${next.injection_target}`);

        // 先清理旧注入目标中的托管条目，避免切换后双世界书残留
        void purgeManagedEntriesFromTargetWorldbook(prev.injection_target)
          .then(result => {
            oldTargetPurgeFinishedAt = Date.now();
            const elapsed = oldTargetPurgeFinishedAt - purgeStartAt;
            const relation =
              syncFinishedAt === null
                ? '同步写入尚未完成'
                : oldTargetPurgeFinishedAt <= syncFinishedAt
                  ? '先于同步写入完成'
                  : '晚于同步写入完成';

            logInfo(
              `注入目标切换：已清理旧目标世界书托管条目 ${result.removed_count} 条（${result.worldbook_name}）。`,
            );
            logInfo(`竞态诊断[${raceTraceId}] 旧目标清理结束：耗时=${elapsed}ms；时序=${relation}`);
          })
          .catch(error => {
            oldTargetPurgeFinishedAt = Date.now();
            const relation =
              syncFinishedAt === null
                ? '同步写入尚未完成'
                : oldTargetPurgeFinishedAt <= syncFinishedAt
                  ? '先于同步写入完成'
                  : '晚于同步写入完成';
            console.warn(SCRIPT_LOG_PREFIX, '注入目标切换时清理旧目标世界书失败：', error);
            logInfo(`竞态诊断[${raceTraceId}] 旧目标清理失败结束：时序=${relation}`);
          });

        updateRuntimeStatus(ctx, {
          current_target_worldbook_name: '注入目标已切换，等待同步刷新',
        });
      }

      const syncStartAt = Date.now();
      logInfo(`竞态诊断[${raceTraceId}] 计划触发同步写入：reason=设置弹窗保存后重新注入`);
      void scheduler.flushSyncAsync(`设置弹窗保存后重新注入 [${raceTraceId}]`).then(() => {
        syncFinishedAt = Date.now();
        const elapsed = syncFinishedAt - syncStartAt;
        const relation =
          oldTargetPurgeFinishedAt === null
            ? '旧目标清理尚未完成'
            : oldTargetPurgeFinishedAt <= syncFinishedAt
              ? '旧目标清理先于同步写入完成'
              : '旧目标清理晚于同步写入完成';
        logInfo(`竞态诊断[${raceTraceId}] 同步写入流程结束：耗时=${elapsed}ms；时序=${relation}`);
      });
    },
    triggerResync: (_reason: string): void => {
      // 设置弹窗按钮与外部桥接使用同一调度路径和同一 reason
      scheduler.flushSync(UI_RESYNC_REASON);
    },
  });

  const onSettingsButtonClick = (): void => {
    logInfo(`按钮事件触发：${SETTINGS_BUTTON_NAME}，准备打开设置弹窗。`);
    dialog.open();
  };

  const stopSettingsButton = eventOn(getButtonEvent(SETTINGS_BUTTON_NAME), onSettingsButtonClick);
  ctx.cleanup_fns.push(() => {
    stopSettingsButton.stop();
  });

  ctx.on_runtime_status_changed = () => {
    dialog.refresh();
  };

  ctx.cleanup_fns.push(() => {
    ctx.on_runtime_status_changed = undefined;
    dialog.destroy();
  });

  logInfo(`设置弹窗入口已注册：按钮“${SETTINGS_BUTTON_NAME}”。`);
}

function init(): void {
  logInfo('脚本加载开始。');

  // 尽早注册按钮可见，避免后续初始化报错导致“看起来没注册”
  replaceScriptButtons([{ name: SETTINGS_BUTTON_NAME, visible: true }]);

  const ctx = initSettings();
  const scheduler = createSyncScheduler(ctx);

  const runtimeSession = `${getScriptId()}-${ctx.started_at}`;
  logInfo(`运行时上下文已建立：session=${runtimeSession}`);

  // 先挂入调度器销毁逻辑，确保卸载时优先清理 timer
  ctx.cleanup_fns.push(() => {
    scheduler.dispose();
  });

  // 与设置弹窗按钮“立即重新注入”共用的唯一函数入口
  const triggerResyncLikeUiButton = (): void => {
    scheduler.flushSync(UI_RESYNC_REASON);
  };

  const syncBridge = createSummaryWorldbookSyncBridge({
    requestRefresh: (reason: string): void => {
      scheduler.scheduleSync(reason);
    },
    refreshNow: async (reason: string): Promise<void> => {
      await scheduler.flushSyncAsync(reason);
    },
    triggerResyncLikeUiButton: (): void => {
      triggerResyncLikeUiButton();
    },
    getRuntimeStatus: () => ctx.runtime_status,
    getStartedAt: () => ctx.started_at,
  });
  initializeSummaryWorldbookSyncBridgeGlobal(syncBridge);
  ctx.cleanup_fns.push(() => {
    disposeSummaryWorldbookSyncBridgeGlobal();
  });

  setupEventListeners(ctx, scheduler);
  setupSettingsUi(ctx, scheduler);

  // 首次同步：立即执行一轮（仍受自动同步与安全门设置控制）
  scheduler.flushSync('初始化首次同步');

  const onPageHide = (): void => {
    cleanup(ctx);
  };

  $(window).on('pagehide', onPageHide);

  ctx.cleanup_fns.push(() => {
    $(window).off('pagehide', onPageHide);
  });

  logInfo('脚本加载完成。');
}

/**
 * 按脚本项目规范使用 jQuery 加载时机。
 */
$(() => {
  errorCatched(init)();
});
