/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 背景图片 IndexedDB 存储封装
 * 用于存储关系图背景图片，避免 Base64 存入聊天变量导致性能问题
 */

const DB_NAME = 'acu_background_db';
const DB_VERSION = 1;
const STORE_NAME = 'backgrounds';

/** 全局主题背景存储 Key */
export const GLOBAL_THEME_BG_KEY = 'global_theme_background';

let dbInstance: IDBDatabase | null = null;

/**
 * 背景图片记录结构
 */
export interface BackgroundRecord {
  /** 主键：聊天文件唯一标识 */
  chatId: string;
  /** 图片二进制数据 */
  imageData: Blob;
  /** 图片 MIME 类型 */
  mimeType: string;
  /** 上传时间戳 */
  timestamp: number;
}

/**
 * 初始化数据库
 */
async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[ACU Background] 打开数据库失败:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.info('[ACU Background] 数据库连接成功');
      resolve(dbInstance);
    };

    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'chatId' });
        console.info('[ACU Background] 创建背景图片表成功');
      }
    };
  });
}

/**
 * 保存背景图片
 * @param chatId 聊天文件 ID
 * @param imageData 图片 Blob 数据
 * @param mimeType 图片类型
 */
export async function saveBackground(
  chatId: string,
  imageData: Blob,
  mimeType: string = 'image/png'
): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record: BackgroundRecord = {
      chatId,
      imageData,
      mimeType,
      timestamp: Date.now(),
    };

    const request = store.put(record);

    request.onsuccess = () => {
      console.info('[ACU Background] 保存背景图片成功, chatId:', chatId);
      resolve();
    };

    request.onerror = () => {
      console.error('[ACU Background] 保存背景图片失败:', request.error);
      reject(request.error);
    };
  });
}

/**
 * 加载背景图片
 * @param chatId 聊天文件 ID
 * @returns blob URL 或 null
 */
export async function loadBackground(chatId: string): Promise<string | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(chatId);

    request.onsuccess = () => {
      const record = request.result as BackgroundRecord | undefined;
      if (record?.imageData) {
        const blobUrl = URL.createObjectURL(record.imageData);
        console.info('[ACU Background] 加载背景图片成功, chatId:', chatId);
        resolve(blobUrl);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      console.error('[ACU Background] 加载背景图片失败:', request.error);
      reject(request.error);
    };
  });
}

/**
 * 删除背景图片
 * @param chatId 聊天文件 ID
 */
export async function deleteBackground(chatId: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(chatId);

    request.onsuccess = () => {
      console.info('[ACU Background] 删除背景图片成功, chatId:', chatId);
      resolve();
    };

    request.onerror = () => {
      console.error('[ACU Background] 删除背景图片失败:', request.error);
      reject(request.error);
    };
  });
}

/**
 * 检查是否有背景图片
 * @param chatId 聊天文件 ID
 */
export async function hasBackground(chatId: string): Promise<boolean> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.count(IDBKeyRange.only(chatId));

    request.onsuccess = () => {
      resolve(request.result > 0);
    };

    request.onerror = () => {
      console.error('[ACU Background] 检查背景图片失败:', request.error);
      reject(request.error);
    };
  });
}

/**
 * 将 File/Blob 转换为可存储格式
 * @param file 文件对象
 */
export async function fileToBlob(file: File): Promise<{ blob: Blob; mimeType: string }> {
  return {
    blob: file,
    mimeType: file.type || 'image/png',
  };
}

/**
 * 将 URL（外部链接或 data URL）转换为 Blob
 * @param url 图片 URL
 */
export async function urlToBlob(url: string): Promise<{ blob: Blob; mimeType: string }> {
  // 如果是 data URL
  if (url.startsWith('data:')) {
    const response = await fetch(url);
    const blob = await response.blob();
    return { blob, mimeType: blob.type };
  }

  // 外部链接
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return { blob, mimeType: blob.type };
  } catch {
    throw new Error('无法加载外部图片，可能是跨域限制');
  }
}

/**
 * 清理 blob URL 以释放内存
 * @param blobUrl blob URL
 */
export function revokeBlobUrl(blobUrl: string): void {
  if (blobUrl.startsWith('blob:')) {
    URL.revokeObjectURL(blobUrl);
  }
}
