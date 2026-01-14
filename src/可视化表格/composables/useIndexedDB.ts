/**
 * IndexedDB 操作封装
 * 为历史记录功能提供通用的 IndexedDB CRUD 操作
 *
 * 设计说明：
 * - 使用整行快照存储，而非单元格级别
 * - 按 chatId 隔离不同聊天的历史
 * - 支持最大 500MB 存储（浏览器默认限制）
 */

const DB_NAME = 'acu_history_db';
const DB_VERSION = 1;
const STORE_NAME = 'row_snapshots';

let dbInstance: IDBDatabase | null = null;

/**
 * 整行快照数据结构
 */
export interface RowSnapshot {
  /** IndexedDB 自增 ID */
  id?: number;
  /** 聊天文件唯一标识（用于隔离不同聊天） */
  chatId: string;
  /** 行唯一键 "表名-行索引" */
  rowKey: string;
  /** Unix 时间戳 */
  timestamp: number;
  /** 变更来源 */
  source: 'manual' | 'ai';
  /** 单元格数据 (列索引 -> 值) */
  cells: Record<number, string>;
}

/**
 * 初始化数据库
 * 如果数据库不存在则创建，如果版本不匹配则升级
 */
export async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[ACU IndexedDB] 打开数据库失败:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.info('[ACU IndexedDB] 数据库连接成功');
      resolve(dbInstance);
    };

    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });

        // 复合索引：按聊天+行查询（最常用）
        store.createIndex('by_chat_row', ['chatId', 'rowKey'], { unique: false });
        // 单独索引：按聊天查询（用于清理整个聊天的历史）
        store.createIndex('by_chat', 'chatId', { unique: false });
        // 时间戳索引：用于按时间排序和清理旧数据
        store.createIndex('by_timestamp', 'timestamp', { unique: false });

        console.info('[ACU IndexedDB] 创建数据库表和索引成功');
      }
    };
  });
}

/**
 * 添加快照
 * @param snapshot 快照数据（不含 id）
 * @returns 新增记录的 ID
 */
export async function addSnapshot(snapshot: Omit<RowSnapshot, 'id'>): Promise<number> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(snapshot);

    request.onsuccess = () => {
      console.info('[ACU IndexedDB] 添加快照成功, ID:', request.result);
      resolve(request.result as number);
    };

    request.onerror = () => {
      console.error('[ACU IndexedDB] 添加快照失败:', request.error);
      reject(request.error);
    };
  });
}

/**
 * 按 chatId + rowKey 查询快照
 * @param chatId 聊天ID
 * @param rowKey 行Key
 * @returns 快照数组
 */
export async function getSnapshots(chatId: string, rowKey: string): Promise<RowSnapshot[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('by_chat_row');
    const request = index.getAll([chatId, rowKey]);

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      console.error('[ACU IndexedDB] 查询快照失败:', request.error);
      reject(request.error);
    };
  });
}

/**
 * 删除指定 ID 的快照
 * @param id 快照ID
 */
export async function deleteSnapshot(id: number): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      console.info('[ACU IndexedDB] 删除快照成功, ID:', id);
      resolve();
    };

    request.onerror = () => {
      console.error('[ACU IndexedDB] 删除快照失败:', request.error);
      reject(request.error);
    };
  });
}

/**
 * 按 chatId 删除所有快照
 * 用于清理某个聊天的全部历史记录
 * @param chatId 聊天ID
 */
export async function deleteByChat(chatId: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('by_chat');
    const request = index.openCursor(IDBKeyRange.only(chatId));

    let deletedCount = 0;

    request.onsuccess = event => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      }
    };

    tx.oncomplete = () => {
      console.info(`[ACU IndexedDB] 按聊天删除完成, 共删除 ${deletedCount} 条`);
      resolve();
    };

    tx.onerror = () => {
      console.error('[ACU IndexedDB] 按聊天删除失败:', tx.error);
      reject(tx.error);
    };
  });
}

/**
 * 清空所有快照
 * 用于重置整个历史记录数据库
 */
export async function clearAll(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      console.info('[ACU IndexedDB] 清空所有快照成功');
      resolve();
    };

    request.onerror = () => {
      console.error('[ACU IndexedDB] 清空失败:', request.error);
      reject(request.error);
    };
  });
}

/**
 * 获取数据库统计信息
 * 用于调试和监控
 */
export async function getStats(): Promise<{ count: number }> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.count();

    request.onsuccess = () => {
      resolve({ count: request.result });
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}
