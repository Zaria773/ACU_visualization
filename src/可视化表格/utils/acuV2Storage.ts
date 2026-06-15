/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * shujuku / TavernDB ACU V2 存储兼容工具。
 */

export interface V2ScheduleState {
  lastFilledAiFloor?: number;
  lastChangedAiFloor?: number;
}

export interface V2StorageFrame {
  version: 2;
  headRevision?: string | null;
  checkpoint?: {
    kind: 'full';
    createdAt?: number;
    reason?: string;
    data?: Record<string, unknown>;
    scheduleSummary?: Record<string, V2ScheduleState>;
    event?: V2Event;
  };
  logEntries?: V2LogEntry[];
}

export interface V2Event {
  aiFloor?: number;
  filledSheetKeys?: string[];
  changedSheetKeys?: string[];
  groupKeys?: string[];
}

export interface V2LogEntry extends V2Event {
  seq?: number;
  kind?: string;
  type?: string;
  operation?: Record<string, unknown>;
  operations?: Array<Record<string, unknown>>;
  patch?: Record<string, unknown> | Array<Record<string, unknown>>;
  patches?: Array<Record<string, unknown>>;
}

export interface V2TagData {
  _acu_storage_version?: number;
  storageFrame?: V2StorageFrame;
  summaryVectorIndexState?: unknown;
  summaryVectorIndexManifest?: unknown;
  independentData?: Record<string, unknown>;
  incrementalData?: Record<string, unknown>;
  modifiedKeys?: string[];
  updateGroupKeys?: string[];
}

export function safeJsonClone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function parseObjectField(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : null;
}

export function parseIsolatedDataFromMessage(message: any): Record<string, V2TagData> | null {
  return parseObjectField(message?.TavernDB_ACU_IsolatedData) as Record<string, V2TagData> | null;
}

export function getTagDataFromMessage(message: any, slotKey: string): V2TagData | null {
  const isolatedData = parseIsolatedDataFromMessage(message);
  const tagData = isolatedData?.[slotKey];
  return tagData && typeof tagData === 'object' ? tagData : null;
}

export function isV2TagData(tagData: unknown): tagData is V2TagData & { storageFrame: V2StorageFrame } {
  const data = tagData as V2TagData | null;
  return !!(
    data &&
    typeof data === 'object' &&
    data.storageFrame &&
    typeof data.storageFrame === 'object' &&
    data.storageFrame.version === 2 &&
    Array.isArray(data.storageFrame.logEntries)
  );
}

export function countAiFloorUpToIndex(chat: any[], messageIndex: number): number {
  if (!Array.isArray(chat) || messageIndex < 0) return 0;
  let aiFloor = 0;
  for (let i = 0; i <= messageIndex && i < chat.length; i++) {
    if (chat[i] && !chat[i].is_user) aiFloor++;
  }
  return aiFloor;
}

export function findChatIndexByAiFloor(chat: any[], aiFloor: number): number {
  if (!Array.isArray(chat) || !Number.isFinite(aiFloor) || aiFloor <= 0) return -1;
  let current = 0;
  for (let i = 0; i < chat.length; i++) {
    if (chat[i] && !chat[i].is_user) {
      current++;
      if (current === aiFloor) return i;
    }
  }
  return -1;
}

function arrayHasSheet(value: unknown, sheetKey: string): boolean {
  return Array.isArray(value) && value.includes(sheetKey);
}

function collectStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
}

export function eventTracksSheetFill(event: V2Event | undefined | null, sheetKey: string): boolean {
  if (!event) return false;
  return arrayHasSheet(event.filledSheetKeys, sheetKey) || arrayHasSheet(event.groupKeys, sheetKey);
}

export function eventTouchesSheet(event: V2Event | undefined | null, sheetKey: string): boolean {
  if (!event) return false;
  return eventTracksSheetFill(event, sheetKey) || arrayHasSheet(event.changedSheetKeys, sheetKey);
}

function entryAiFloor(entry: V2LogEntry, fallbackAiFloor: number): number {
  const value = Number(entry?.aiFloor);
  return Number.isFinite(value) && value > 0 ? value : fallbackAiFloor;
}

function operationKind(operation: Record<string, any>): string {
  return String(operation.kind || operation.type || operation.op || '');
}

export function operationTouchesSheet(operation: Record<string, any> | undefined | null, sheetKey: string): boolean {
  if (!operation || typeof operation !== 'object') return false;
  const kind = operationKind(operation);
  if (kind === 'sheet_replace') return operation.sheetKey === sheetKey || operation.tableId === sheetKey;
  if (kind === 'row_upsert' || kind === 'row_delete' || kind === 'meta_update') {
    return operation.sheetKey === sheetKey || operation.tableId === sheetKey;
  }
  if (kind === 'data_replace') return operation.data?.[sheetKey] !== undefined;
  if ((operation.sheetKey || operation.tableId) === sheetKey) return true;
  return false;
}

function operationTouchesAnySheet(operation: Record<string, any> | undefined | null): boolean {
  if (!operation || typeof operation !== 'object') return false;
  const kind = operationKind(operation);
  if (['sheet_replace', 'row_upsert', 'row_delete', 'meta_update'].includes(kind)) {
    return typeof (operation.sheetKey || operation.tableId) === 'string';
  }
  if (kind === 'data_replace') {
    return Object.keys(operation.data || {}).some(k => k.startsWith('sheet_'));
  }
  return typeof (operation.sheetKey || operation.tableId) === 'string';
}

function entryOperations(entry: V2LogEntry): Array<Record<string, any>> {
  const out: Array<Record<string, any>> = [];
  if (entry.operation && typeof entry.operation === 'object') out.push(entry.operation as Record<string, any>);
  if (Array.isArray(entry.operations)) out.push(...(entry.operations as Array<Record<string, any>>));
  if (entry.patch && typeof entry.patch === 'object' && !Array.isArray(entry.patch)) out.push(entry.patch as Record<string, any>);
  if (Array.isArray(entry.patch)) out.push(...(entry.patch as Array<Record<string, any>>));
  if (Array.isArray(entry.patches)) out.push(...(entry.patches as Array<Record<string, any>>));
  return out;
}

export function v2LogEntryTouchesSheet(entry: V2LogEntry | undefined | null, sheetKey: string): boolean {
  if (!entry) return false;
  if (eventTouchesSheet(entry, sheetKey)) return true;
  if (String(entry.kind || entry.type || '').toLowerCase() === 'sql_batch') return false;
  return entryOperations(entry).some(op => operationTouchesSheet(op, sheetKey));
}

export function v2LogEntryTouchesAnySheet(entry: V2LogEntry | undefined | null): boolean {
  if (!entry) return false;
  if (
    collectStrings(entry.filledSheetKeys).some(k => k.startsWith('sheet_')) ||
    collectStrings(entry.changedSheetKeys).some(k => k.startsWith('sheet_')) ||
    collectStrings(entry.groupKeys).some(k => k.startsWith('sheet_'))
  ) {
    return true;
  }
  if (String(entry.kind || entry.type || '').toLowerCase() === 'sql_batch') return false;
  return entryOperations(entry).some(op => operationTouchesAnySheet(op));
}

export function v2FrameHasSheetData(tagData: V2TagData | null | undefined, sheetKey: string): boolean {
  if (!isV2TagData(tagData)) return false;
  const frame = tagData.storageFrame;
  if (frame.checkpoint?.kind === 'full' && frame.checkpoint.data?.[sheetKey] !== undefined) return true;
  return (frame.logEntries || []).some(entry => v2LogEntryTouchesSheet(entry, sheetKey));
}

export function tagDataHasAnyTableData(tagData: V2TagData | null | undefined): boolean {
  if (!tagData || typeof tagData !== 'object') return false;
  if (isV2TagData(tagData)) {
    const frame = tagData.storageFrame;
    if (frame.checkpoint?.kind === 'full' && frame.checkpoint.data) {
      if (Object.keys(frame.checkpoint.data).some(k => k.startsWith('sheet_'))) return true;
    }
    if ((frame.logEntries || []).some(entry => v2LogEntryTouchesAnySheet(entry))) return true;
  }
  if (tagData.independentData && Object.keys(tagData.independentData).some(k => k.startsWith('sheet_'))) return true;
  if (tagData.incrementalData && Object.keys(tagData.incrementalData).some(k => k.startsWith('sheet_'))) return true;
  return false;
}

export function messageHasAnyTableData(message: any): boolean {
  if (!message || message.is_user) return false;
  const isolatedData = parseIsolatedDataFromMessage(message);
  if (isolatedData && Object.values(isolatedData).some(slot => tagDataHasAnyTableData(slot))) return true;
  const legacyFields = ['TavernDB_ACU_IndependentData', 'TavernDB_ACU_Data', 'TavernDB_ACU_SummaryData'];
  return legacyFields.some(field => {
    const data = parseObjectField(message[field]);
    return !!data && Object.keys(data).some(k => k.startsWith('sheet_'));
  });
}

export const messageHasAnyAcuTableData = messageHasAnyTableData;

export function messageHasV2FullCheckpoint(message: any): boolean {
  const isolatedData = parseIsolatedDataFromMessage(message);
  if (!isolatedData) return false;
  return Object.values(isolatedData).some(tagData => {
    if (!isV2TagData(tagData)) return false;
    const checkpoint = tagData.storageFrame.checkpoint;
    return checkpoint?.kind === 'full' && Object.keys(checkpoint.data || {}).some(k => k.startsWith('sheet_'));
  });
}

export function v2FrameTrackedUpdateFloor(
  tagData: V2TagData | null | undefined,
  sheetKey: string,
  messageAiFloor: number,
): number {
  if (!isV2TagData(tagData)) return 0;
  const frame = tagData.storageFrame;
  let latestFloor = Number(frame.checkpoint?.scheduleSummary?.[sheetKey]?.lastFilledAiFloor) || 0;

  if (eventTracksSheetFill(frame.checkpoint?.event, sheetKey)) {
    const eventFloor = Number(frame.checkpoint?.event?.aiFloor) || messageAiFloor;
    latestFloor = Math.max(latestFloor, eventFloor);
  }

  for (const entry of frame.logEntries || []) {
    if (eventTracksSheetFill(entry, sheetKey)) {
      latestFloor = Math.max(latestFloor, entryAiFloor(entry, messageAiFloor));
    }
  }

  return latestFloor;
}

export function getV2FilledSheetKeysAtFloor(tagData: V2TagData | null | undefined): string[] {
  if (!isV2TagData(tagData)) return [];
  const set = new Set<string>();
  const collect = (event: V2Event | undefined | null) => {
    if (!event) return;
    collectStrings(event.filledSheetKeys).forEach(k => set.add(k));
    collectStrings(event.groupKeys).forEach(k => set.add(k));
  };
  collect(tagData.storageFrame.checkpoint?.event);
  (tagData.storageFrame.logEntries || []).forEach(entry => collect(entry));
  return Array.from(set);
}

export function getV2FilledSheetKeysFromMessage(message: any): string[] {
  const isolatedData = parseIsolatedDataFromMessage(message);
  if (!isolatedData) return [];
  const set = new Set<string>();
  Object.values(isolatedData).forEach(tagData => {
    getV2FilledSheetKeysAtFloor(tagData).forEach(k => set.add(k));
  });
  return Array.from(set);
}

export function buildScheduleSummaryForFloor(snapshot: Record<string, any>, aiFloor: number): Record<string, V2ScheduleState> {
  const floor = Math.max(1, Math.trunc(Number(aiFloor) || 1));
  const summary: Record<string, V2ScheduleState> = {};
  Object.keys(snapshot || {})
    .filter(key => key.startsWith('sheet_') && snapshot[key])
    .forEach(sheetKey => {
      summary[sheetKey] = {
        lastFilledAiFloor: floor,
        lastChangedAiFloor: floor,
      };
    });
  return summary;
}

export function buildV2FullCheckpointSlot(
  snapshot: Record<string, any>,
  scheduleSummary: Record<string, V2ScheduleState>,
  reason: string = 'import',
): V2TagData {
  const entryId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    _acu_storage_version: 2,
    storageFrame: {
      version: 2,
      headRevision: `checkpoint:visualizer:${entryId}`,
      checkpoint: {
        kind: 'full',
        createdAt: Date.now(),
        reason,
        data: safeJsonClone(snapshot),
        scheduleSummary: safeJsonClone(scheduleSummary),
      },
      logEntries: [],
    },
  };
}

export function purgeSheetKeysFromTagData(tagData: any, keys: string[]): boolean {
  if (!tagData || typeof tagData !== 'object') return false;
  const keySet = new Set(keys);
  let changed = false;

  if (isV2TagData(tagData)) {
    const checkpoint = tagData.storageFrame.checkpoint;
    if (checkpoint?.kind === 'full') {
      for (const key of keys) {
        if (checkpoint.data?.[key] !== undefined) {
          delete checkpoint.data[key];
          changed = true;
        }
        if (checkpoint.scheduleSummary?.[key] !== undefined) {
          delete checkpoint.scheduleSummary[key];
          changed = true;
        }
      }
    }

    const before = tagData.storageFrame.logEntries.length;
    tagData.storageFrame.logEntries = tagData.storageFrame.logEntries.filter(entry => {
      return !keys.some(key => v2LogEntryTouchesSheet(entry, key));
    });
    if (tagData.storageFrame.logEntries.length !== before) changed = true;
  }

  if (tagData.independentData && typeof tagData.independentData === 'object') {
    for (const key of keys) {
      if (tagData.independentData[key] !== undefined) {
        delete tagData.independentData[key];
        changed = true;
      }
    }
  }

  if (tagData.incrementalData && typeof tagData.incrementalData === 'object') {
    for (const key of keys) {
      if (tagData.incrementalData[key] !== undefined) {
        delete tagData.incrementalData[key];
        changed = true;
      }
    }
  }

  for (const field of ['modifiedKeys', 'updateGroupKeys'] as const) {
    if (Array.isArray(tagData[field])) {
      const next = tagData[field].filter((k: string) => !keySet.has(k));
      if (next.length !== tagData[field].length) {
        tagData[field] = next;
        changed = true;
      }
    }
  }

  return changed;
}
