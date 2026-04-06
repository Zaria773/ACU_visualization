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
  getSummaryWorldbookSyncStatus: () => SummaryWorldbookSyncStatus;
}

interface SummaryWorldbookSyncBridgeDeps {
  requestRefresh: (reason: string) => void;
  refreshNow: (reason: string) => Promise<void>;
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
      deps.requestRefresh(`外部桥接请求（防抖）：${normalizeReason(reason)}`);
    },

    refreshSummaryWorldbookNow: async (reason: string): Promise<void> => {
      await deps.refreshNow(`外部桥接请求（立即）：${normalizeReason(reason)}`);
    },

    getSummaryWorldbookSyncStatus: (): SummaryWorldbookSyncStatus => {
      const status = deps.getRuntimeStatus();
      return {
        startedAt: deps.getStartedAt(),
        currentSummarySheetName: status.current_summary_sheet_name,
        currentTargetWorldbookName: status.current_target_worldbook_name,
        syncInProgress: status.sync_in_progress,
        lastReason: status.last_reason,
      };
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
