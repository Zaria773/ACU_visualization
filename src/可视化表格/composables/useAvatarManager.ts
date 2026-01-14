/**
 * useAvatarManager - 头像管理 Composable
 *
 * 功能：
 * - IndexedDB 图片存储（全局共享）
 * - 头像配置管理
 * - 异步获取头像 URL
 * - 酒馆主角头像自动获取
 * - 别名解析与姓名显示
 */

import { ref } from 'vue';

// ============================================================
// 类型定义
// ============================================================

export interface AvatarRecord {
  /** 角色名（主键） */
  name: string;
  /** 图片 Blob（可选，有 URL 时可为空） */
  blob?: Blob;
  /** 远程 URL（可选） */
  url?: string;
  /** 裁剪配置 - X 偏移 (0-100) */
  offsetX: number;
  /** 裁剪配置 - Y 偏移 (0-100) */
  offsetY: number;
  /** 裁剪配置 - 缩放比例 (100-300) */
  scale: number;
  /** 别名列表（用于姓名映射） */
  aliases: string[];
  /** 显示标签配置（选中的字符索引） */
  labelIndices?: number[];
  /** 更新时间 */
  updatedAt: number;
}

export interface AvatarStats {
  count: number;
  totalSizeBytes: number;
  totalSizeMB: string;
}

// ============================================================
// IndexedDB 配置
// ============================================================

const DB_NAME = 'acu_avatars';
const DB_VERSION = 1;
const STORE_NAME = 'avatars';

// ============================================================
// 单例状态
// ============================================================

let dbInstance: IDBDatabase | null = null;
const urlCache = new Map<string, string>(); // 缓存 ObjectURL 避免重复创建

// ============================================================
// Composable 导出
// ============================================================

export function useAvatarManager() {
  const isReady = ref(false);
  const error = ref<string | null>(null);

  // ============================================================
  // IndexedDB 初始化
  // ============================================================

  async function initDB(): Promise<IDBDatabase> {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        const errMsg = `[AvatarManager] 打开数据库失败: ${request.error?.message}`;
        console.error(errMsg);
        error.value = errMsg;
        reject(request.error);
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        isReady.value = true;
        console.info('[AvatarManager] 数据库连接成功');
        resolve(dbInstance);
      };

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // 主键为角色名
          db.createObjectStore(STORE_NAME, { keyPath: 'name' });
          console.info('[AvatarManager] 创建数据库表成功');
        }
      };
    });
  }

  // ============================================================
  // CRUD 操作
  // ============================================================

  /**
   * 保存头像记录
   */
  async function saveAvatar(record: AvatarRecord): Promise<void> {
    const db = await initDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // 清理旧的 ObjectURL 缓存
      if (urlCache.has(record.name)) {
        URL.revokeObjectURL(urlCache.get(record.name)!);
        urlCache.delete(record.name);
      }

      // 确保 updatedAt 存在
      const data = {
        ...record,
        updatedAt: record.updatedAt || Date.now(),
      };

      const request = store.put(data);

      request.onsuccess = () => {
        console.info(`[AvatarManager] 保存头像成功: ${record.name}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`[AvatarManager] 保存头像失败: ${request.error}`);
        reject(request.error);
      };
    });
  }

  /**
   * 获取头像记录
   */
  async function getAvatar(name: string): Promise<AvatarRecord | null> {
    if (!name) return null;

    const db = await initDB();

    return new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(name);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error(`[AvatarManager] 获取头像失败: ${request.error}`);
        resolve(null);
      };
    });
  }

  /**
   * 删除头像记录
   */
  async function deleteAvatar(name: string): Promise<void> {
    if (!name) return;

    // 清理 ObjectURL 缓存
    if (urlCache.has(name)) {
      URL.revokeObjectURL(urlCache.get(name)!);
      urlCache.delete(name);
    }

    const db = await initDB();

    return new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(name);

      request.onsuccess = () => {
        console.info(`[AvatarManager] 删除头像成功: ${name}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`[AvatarManager] 删除头像失败: ${request.error}`);
        resolve();
      };
    });
  }

  /**
   * 批量删除头像记录
   */
  async function deleteAvatars(names: string[]): Promise<void> {
    if (!names.length) return;

    // 清理 ObjectURL 缓存
    for (const name of names) {
      if (urlCache.has(name)) {
        URL.revokeObjectURL(urlCache.get(name)!);
        urlCache.delete(name);
      }
    }

    const db = await initDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      let completed = 0;
      const total = names.length;

      for (const name of names) {
        const request = store.delete(name);
        request.onsuccess = () => {
          completed++;
          if (completed === total) {
            console.info(`[AvatarManager] 批量删除完成: ${total} 个`);
            resolve();
          }
        };
        request.onerror = () => {
          console.error(`[AvatarManager] 删除失败: ${name}`);
          completed++;
          if (completed === total) {
            resolve();
          }
        };
      }

      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * 获取所有头像记录
   */
  async function getAllAvatars(): Promise<AvatarRecord[]> {
    const db = await initDB();

    return new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error(`[AvatarManager] 获取所有头像失败: ${request.error}`);
        resolve([]);
      };
    });
  }

  /**
   * 检查头像是否存在
   */
  async function hasAvatar(name: string): Promise<boolean> {
    if (!name) return false;

    const db = await initDB();

    return new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getKey(name);

      request.onsuccess = () => resolve(request.result !== undefined);
      request.onerror = () => resolve(false);
    });
  }

  /**
   * 获取统计信息
   */
  async function getStats(): Promise<AvatarStats> {
    const db = await initDB();

    return new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result || [];
        const totalSizeBytes = items.reduce((sum, item) => {
          return sum + (item.blob?.size || 0);
        }, 0);

        resolve({
          count: items.length,
          totalSizeBytes,
          totalSizeMB: (totalSizeBytes / 1024 / 1024).toFixed(2),
        });
      };

      request.onerror = () => {
        resolve({ count: 0, totalSizeBytes: 0, totalSizeMB: '0.00' });
      };
    });
  }

  /**
   * 清空所有头像
   */
  async function clearAll(): Promise<void> {
    // 清理所有 ObjectURL 缓存
    urlCache.forEach(url => URL.revokeObjectURL(url));
    urlCache.clear();

    const db = await initDB();

    return new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.info('[AvatarManager] 清空所有头像成功');
        resolve();
      };

      request.onerror = () => {
        console.error(`[AvatarManager] 清空失败: ${request.error}`);
        resolve();
      };
    });
  }

  // ============================================================
  // 头像 URL 获取
  // ============================================================

  /**
   * 异步获取头像 URL（核心 API）
   * 优先级：本地 Blob > URL > 酒馆自动获取
   */
  async function getAvatarUrl(name: string): Promise<string | null> {
    if (!name) return null;

    // 1. 先查缓存
    if (urlCache.has(name)) {
      return urlCache.get(name)!;
    }

    // 2. 查 IndexedDB
    const record = await getAvatar(name);

    if (record) {
      // 有 Blob 优先
      if (record.blob) {
        const url = URL.createObjectURL(record.blob);
        urlCache.set(name, url);
        return url;
      }

      // 有 URL
      if (record.url) {
        return record.url;
      }
    }

    // 3. 尝试通过别名查找
    const primaryName = await resolvePrimaryName(name);
    if (primaryName !== name) {
      return getAvatarUrl(primaryName);
    }

    // 4. 主角特殊处理：尝试酒馆头像
    if (isPlayerNode(name)) {
      const stAvatar = getSillyTavernUserAvatar();
      if (stAvatar) return stAvatar;
    }

    return null;
  }

  /**
   * 获取头像显示配置（裁剪参数）
   */
  async function getAvatarDisplayConfig(
    name: string
  ): Promise<{ offsetX: number; offsetY: number; scale: number }> {
    const record = await getAvatar(name);

    if (record) {
      return {
        offsetX: record.offsetX ?? 50,
        offsetY: record.offsetY ?? 50,
        scale: record.scale ?? 150,
      };
    }

    // 默认值
    return { offsetX: 50, offsetY: 50, scale: 150 };
  }

  // ============================================================
  // 酒馆集成
  // ============================================================

  /**
   * 获取酒馆用户头像 URL
   * 优先获取当前聊天绑定的 persona 头像
   */
  function getSillyTavernUserAvatar(): string | null {
    try {
      const w = window.parent || window;
      const $ = (w as any).jQuery || (window as any).jQuery;

      if ($) {
        // 1. 优先：从当前聊天的用户消息中获取头像（这会显示绑定的 persona 头像）
        const $userMes = $('.mes[is_user="true"]').last().find('.avatar img');
        if ($userMes.length && $userMes.attr('src')) {
          const src = $userMes.attr('src');
          // 排除默认头像
          if (src && !src.includes('default') && !src.includes('placeholder')) {
            return src;
          }
        }

        // 2. 备选：从 #user_avatar_block 获取（全局用户头像）
        const $avatar = $('#user_avatar_block img').first();
        if ($avatar.length && $avatar.attr('src')) {
          return $avatar.attr('src');
        }
      }

      // 3. 尝试从 SillyTavern API 获取
      const ST = (w as any).SillyTavern || (window as any).SillyTavern;
      if (ST?.getContext) {
        const ctx = ST.getContext();
        if (ctx?.userAvatar) {
          return ctx.userAvatar;
        }
      }
    } catch (e) {
      console.warn('[AvatarManager] getSillyTavernUserAvatar error:', e);
    }

    return null;
  }

  /**
   * 获取酒馆角色卡头像 URL
   */
  function getSillyTavernCharacterAvatar(): string | null {
    try {
      const w = window.parent || window;
      const $ = (w as any).jQuery || (window as any).jQuery;

      if ($) {
        // 角色卡头像通常在 #avatar_img_holder img
        const $avatar = $('#avatar_img_holder img').first();
        if ($avatar.length && $avatar.attr('src')) {
          return $avatar.attr('src');
        }

        // 备选：查找聊天中 AI 消息的头像
        const $aiMes = $('.mes:not([is_user="true"])').last().find('.avatar img');
        if ($aiMes.length && $aiMes.attr('src')) {
          return $aiMes.attr('src');
        }
      }

      // 尝试从 SillyTavern API 获取
      const ST = (w as any).SillyTavern || (window as any).SillyTavern;
      if (ST?.getContext) {
        const ctx = ST.getContext();
        if (ctx?.characterAvatar) {
          return ctx.characterAvatar;
        }
      }
    } catch (e) {
      console.warn('[AvatarManager] getSillyTavernCharacterAvatar error:', e);
    }

    return null;
  }

  /**
   * 获取主角名称（从数据表中）
   */
  function getPlayerNameFromTable(): string | null {
    try {
      const w = window.parent || window;
      const api = (w as any).AutoCardUpdaterAPI;

      if (api?.exportTableAsJson) {
        const rawData = api.exportTableAsJson();
        for (const key in rawData) {
          const sheet = rawData[key];
          if (sheet?.name?.includes('主角') && sheet.content?.[1]?.[1]) {
            return sheet.content[1][1];
          }
        }
      }
    } catch (e) {
      console.warn('[AvatarManager] getPlayerNameFromTable error:', e);
    }

    return null;
  }

  /**
   * 判断是否是主角节点
   */
  function isPlayerNode(name: string): boolean {
    if (!name) return false;

    // 常见主角标识
    const playerPatterns = ['<user>', '{{user}}', '主角', 'player', 'protagonist'];
    const lowerName = name.toLowerCase();

    for (const pattern of playerPatterns) {
      if (lowerName === pattern.toLowerCase()) return true;
    }

    // 检查是否匹配表格中的主角名
    const playerName = getPlayerNameFromTable();
    if (playerName && name === playerName) return true;

    return false;
  }

  // ============================================================
  // 别名解析
  // ============================================================

  /**
   * 解析别名，返回主名称
   */
  async function resolvePrimaryName(name: string): Promise<string> {
    if (!name) return name;

    const all = await getAllAvatars();

    for (const record of all) {
      if (record.aliases?.includes(name)) {
        return record.name;
      }
    }

    return name;
  }

  /**
   * 添加别名
   */
  async function addAlias(name: string, alias: string): Promise<void> {
    const record = await getAvatar(name);
    if (!record) return;

    const aliases = record.aliases || [];
    if (!aliases.includes(alias)) {
      aliases.push(alias);
      await saveAvatar({ ...record, aliases, updatedAt: Date.now() });
    }
  }

  /**
   * 移除别名
   */
  async function removeAlias(name: string, alias: string): Promise<void> {
    const record = await getAvatar(name);
    if (!record) return;

    const aliases = (record.aliases || []).filter(a => a !== alias);
    await saveAvatar({ ...record, aliases, updatedAt: Date.now() });
  }

  // ============================================================
  // 显示标签
  // ============================================================

  /**
   * 获取显示标签（根据 labelIndices 配置）
   */
  async function getDisplayLabel(name: string): Promise<string> {
    if (!name) return '';

    const record = await getAvatar(name);

    if (record?.labelIndices?.length) {
      // 将全名按字符分割，只保留选中的索引
      const chars = getDisplayChars(name);
      return record.labelIndices.map(i => chars[i] || '').join('');
    }

    return name;
  }

  /**
   * 设置显示标签配置
   */
  async function setDisplayLabel(name: string, labelIndices: number[]): Promise<void> {
    let record = await getAvatar(name);

    if (!record) {
      // 创建新记录
      record = {
        name,
        offsetX: 50,
        offsetY: 50,
        scale: 150,
        aliases: [],
        labelIndices,
        updatedAt: Date.now(),
      };
    } else {
      record = { ...record, labelIndices, updatedAt: Date.now() };
    }

    await saveAvatar(record);
  }

  /**
   * 获取显示用的字符数组（处理表情符号等）
   */
  function getDisplayChars(name: string): string[] {
    if (!name) return [];
    // 使用 Intl.Segmenter 正确分割 Unicode 字符（包括 emoji）
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
      return Array.from(segmenter.segment(name), s => s.segment);
    }
    // Fallback: 简单分割
    return [...name];
  }

  // ============================================================
  // 清理资源
  // ============================================================

  /**
   * 清理 ObjectURL 缓存
   */
  function cleanup(): void {
    urlCache.forEach(url => URL.revokeObjectURL(url));
    urlCache.clear();
    console.info('[AvatarManager] 已清理 ObjectURL 缓存');
  }

  // ============================================================
  // 返回 API
  // ============================================================

  return {
    // 状态
    isReady,
    error,

    // 初始化
    initDB,

    // CRUD
    saveAvatar,
    getAvatar,
    deleteAvatar,
    deleteAvatars,
    getAllAvatars,
    hasAvatar,
    getStats,
    clearAll,

    // 头像获取
    getAvatarUrl,
    getAvatarDisplayConfig,

    // 酒馆集成
    getSillyTavernUserAvatar,
    getSillyTavernCharacterAvatar,
    getPlayerNameFromTable,
    isPlayerNode,

    // 别名
    resolvePrimaryName,
    addAlias,
    removeAlias,

    // 显示标签
    getDisplayLabel,
    setDisplayLabel,
    getDisplayChars,

    // 清理
    cleanup,
  };
}

// 导出单例实例（可选，方便全局使用）
let instance: ReturnType<typeof useAvatarManager> | null = null;

export function getAvatarManager() {
  if (!instance) {
    instance = useAvatarManager();
  }
  return instance;
}
