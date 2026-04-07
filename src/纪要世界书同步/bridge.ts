import type { RuntimeStatus } from './types';

export interface SummaryWorldbookSyncStatus {
  startedAt: number;
  currentSummarySheetName: string;
  currentTargetWorldbookName: string;
  syncInProgress: boolean;
  lastReason: string;
}

export interface SummaryWorldbookSyncBridge {
  requestSummaryWorldbookRefresh: (reason: string) => void;
  refreshSummaryWorldbookNow: (reason: string) => Promise<void>;
  /**
   * 与设置弹窗“立即重新注入”按钮共用同一个函数入口（不接收参数，避免路径偏差）
   */
  triggerSummaryWorldbookResyncLikeUiButton: () => void;
  getSummaryWorldbookSyncStatus: () => SummaryWorldbookSyncStatus;
}

interface SummaryWorldbookSyncBridgeDeps {
  requestRefresh: (reason: string) => void;
  refreshNow: (reason: string) => Promise<void>;
  triggerResyncLikeUiButton: () => void;
  getRuntimeStatus: () => RuntimeStatus;
  getStartedAt: () => number;
}

const SUMMARY_WORLDBOOK_SYNC_BRIDGE_GLOBAL = 'SummaryWorldbookSyncBridge';

let globalInitialized = false;

function normalizeReason(reason: string): string {
  const normalized = String(reason ?? '').trim();
  return normalized.length > 0 ? normalized : '外部请求：未提供原因';
}

export function createSummaryWorldbookSyncBridge(deps: SummaryWorldbookSyncBridgeDeps): SummaryWorldbookSyncBridge {
  return {
    requestSummaryWorldbookRefresh: (reason: string): void => {
      const normalized = `外部桥接请求（防抖）：${normalizeReason(reason)}`;
      console.info('[纪要同步桥接][诊断] 收到 requestSummaryWorldbookRefresh：', normalized);
      deps.requestRefresh(normalized);
    },

    refreshSummaryWorldbookNow: async (reason: string): Promise<void> => {
      const normalized = `外部桥接请求（立即）：${normalizeReason(reason)}`;
      console.info('[纪要同步桥接][诊断] 收到 refreshSummaryWorldbookNow：', normalized);
      await deps.refreshNow(normalized);
      console.info('[纪要同步桥接][诊断] refreshSummaryWorldbookNow 执行完成：', normalized);
    },

    triggerSummaryWorldbookResyncLikeUiButton: (): void => {
      console.info('[纪要同步桥接][诊断] 收到 triggerSummaryWorldbookResyncLikeUiButton：设置弹窗按钮：立即重新注入');
      deps.triggerResyncLikeUiButton();
    },

    getSummaryWorldbookSyncStatus: (): SummaryWorldbookSyncStatus => {
      const status = deps.getRuntimeStatus();
      const payload = {
        startedAt: deps.getStartedAt(),
        currentSummarySheetName: status.current_summary_sheet_name,
        currentTargetWorldbookName: status.current_target_worldbook_name,
        syncInProgress: status.sync_in_progress,
        lastReason: status.last_reason,
      };
      console.info('[纪要同步桥接][诊断] getSummaryWorldbookSyncStatus：', payload);
      return payload;
    },
  };
}

export function initializeSummaryWorldbookSyncBridgeGlobal(bridge: SummaryWorldbookSyncBridge): void {
  initializeGlobal(SUMMARY_WORLDBOOK_SYNC_BRIDGE_GLOBAL, bridge);
  globalInitialized = true;
  console.info(`[纪要同步桥接] 全局桥接已初始化：${SUMMARY_WORLDBOOK_SYNC_BRIDGE_GLOBAL}`);
}

export function disposeSummaryWorldbookSyncBridgeGlobal(): void {
  if (!globalInitialized) return;
  initializeGlobal(SUMMARY_WORLDBOOK_SYNC_BRIDGE_GLOBAL, undefined);
  globalInitialized = false;
  console.info(`[纪要同步桥接] 全局桥接已卸载：${SUMMARY_WORLDBOOK_SYNC_BRIDGE_GLOBAL}`);
}
