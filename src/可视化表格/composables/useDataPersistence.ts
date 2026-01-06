/**
 * 数据持久化 Composable
 * 迁移原代码中的 saveDataToDatabase 函数逻辑
 * 新增: 自动保存(防抖)、兼容层数据迁移
 */

import { watchDebounced } from '@vueuse/core';
import { klona } from 'klona';
import type { WatchStopHandle } from 'vue';
import { useConfigStore } from '../stores/useConfigStore';
import { useDataStore } from '../stores/useDataStore';
import type { RawDatabaseData } from '../types';
import { getCore, getTableData } from '../utils/index';
import { toast } from './useToast';

/** 隔离配置存储键 (保持与原代码兼容) */
const STORAGE_KEY_V5_SETTINGS = 'shujuku_v34_allSettings_v2';

/** 旧版本 localStorage 键名 - 用于兼容性检测 */
const LEGACY_KEYS = [
  'acu_table_order',
  'acu_reverse_tables',
  'acu_table_heights',
  'acu_active_tab',
  'acu_ui_collapse',
  'acu_pin',
  'acu_table_styles',
  'acu_win_config',
] as const;

export function useDataPersistence() {
  const dataStore = useDataStore();
  const configStore = useConfigStore();

  // ============================================================
  // 核心保存逻辑 (迁移自原 executeCoreSave)
  // ============================================================

  /**
   * 执行核心保存操作
   * @param dataToUse 要保存的数据
   * @param commitDeletes 是否提交删除操作
   * @param targetIndex 目标楼层索引 (-1 表示自动查找)
   */
  async function executeCoreSave(
    dataToUse: RawDatabaseData,
    commitDeletes: boolean,
    targetIndex: number = -1,
  ): Promise<RawDatabaseData | null> {
    // 深拷贝一份数据，避免污染源
    const finalData = klona(dataToUse);

    // A. 处理删除操作
    if (commitDeletes && dataStore.pendingDeletes.size > 0) {
      for (const sheetId in finalData) {
        if (sheetId === 'mate') continue;

        const sheet = finalData[sheetId];
        if (!sheet || !sheet.name || !sheet.content) continue;

        const newContent: (string | number)[][] = [sheet.content[0]]; // 保留表头
        for (let i = 1; i < sheet.content.length; i++) {
          const realIdx = i - 1;
          // 只有不在删除列表里的行才保留
          if (!dataStore.pendingDeletes.has(`${sheet.name}-row-${realIdx}`)) {
            newContent.push(sheet.content[i]);
          }
        }
        sheet.content = newContent;
      }
    }

    try {
      // B. 获取 SillyTavern 核心对象
      let ST = (window as any).SillyTavern || (window.parent ? (window.parent as any).SillyTavern : null);
      if (!ST && (window as any).top && (window as any).top.SillyTavern) {
        ST = (window as any).top.SillyTavern;
      }

      // C. 获取隔离配置 Key
      let configKey = '';
      try {
        let storage = window.localStorage;
        if (!storage.getItem(STORAGE_KEY_V5_SETTINGS) && window.parent) {
          try {
            storage = window.parent.localStorage;
          } catch {
            // ignore
          }
        }
        const settingsStr = storage.getItem(STORAGE_KEY_V5_SETTINGS);
        if (settingsStr) {
          const settings = JSON.parse(settingsStr);
          if (settings.dataIsolationEnabled && settings.dataIsolationCode) {
            configKey = settings.dataIsolationCode;
          }
        }
      } catch {
        // ignore
      }

      // D. 定位目标楼层并保存
      if (ST && ST.chat && ST.chat.length > 0) {
        let targetMsg: any = null;
        let targetMsgIndex = -1;

        // 策略：指定索引 > 最近的有数据 AI 楼层 > 最新的 AI 楼层
        if (targetIndex >= 0 && targetIndex < ST.chat.length) {
          targetMsgIndex = targetIndex;
          targetMsg = ST.chat[targetMsgIndex];
        } else {
          // 1. 优先寻找已经存在 ACU 数据的 AI 消息 (倒序查找)
          for (let i = ST.chat.length - 1; i >= 0; i--) {
            if (!ST.chat[i].is_user && ST.chat[i].TavernDB_ACU_IsolatedData) {
              targetMsgIndex = i;
              targetMsg = ST.chat[i];
              break;
            }
          }
          // 2. 如果没找到，兜底使用最新的 AI 消息
          if (!targetMsg) {
            for (let i = ST.chat.length - 1; i >= 0; i--) {
              if (!ST.chat[i].is_user) {
                targetMsgIndex = i;
                targetMsg = ST.chat[i];
                break;
              }
            }
          }
        }

        // 写入数据
        if (targetMsg) {
          // 确定存储的 Key
          let finalKey = configKey;
          if (targetMsg.TavernDB_ACU_IsolatedData) {
            const existingKeys = Object.keys(targetMsg.TavernDB_ACU_IsolatedData);
            if (existingKeys.length > 0) {
              finalKey = existingKeys[0]; // 沿用已有的 Key
            }
          } else {
            targetMsg.TavernDB_ACU_IsolatedData = {};
          }

          // 初始化结构
          if (!targetMsg.TavernDB_ACU_IsolatedData[finalKey]) {
            targetMsg.TavernDB_ACU_IsolatedData[finalKey] = {
              independentData: {},
              modifiedKeys: [],
              updateGroupKeys: [],
            };
          }

          const tagData = targetMsg.TavernDB_ACU_IsolatedData[finalKey];
          if (!tagData.independentData) tagData.independentData = {};

          // 过滤并保存 sheet 数据
          const sheetsToSave = Object.keys(finalData).filter(k => k.startsWith('sheet_'));
          sheetsToSave.forEach(k => {
            tagData.independentData[k] = klona(finalData[k]);
          });

          // 记录修改过的 Key
          const existingKeys: string[] = tagData.modifiedKeys || [];
          tagData.modifiedKeys = [...new Set([...existingKeys, ...sheetsToSave])];

          // 执行保存到聊天记录
          if (ST.saveChat) {
            await ST.saveChat();
            return { ...finalData, _savedToFloor: targetMsgIndex } as unknown as RawDatabaseData;
          }
        }
      }
    } catch (directErr) {
      console.error('[ACU] Core save error:', directErr);
      throw directErr;
    }

    // E. 调用 API 同步世界书
    await syncWorldbook();

    return finalData;
  }

  /**
   * 同步世界书条目
   */
  async function syncWorldbook(): Promise<void> {
    const api = getCore().getDB();
    if (api && api.syncWorldbookEntries) {
      try {
        await api.syncWorldbookEntries({ createIfNeeded: true });
      } catch (syncErr) {
        console.warn('[ACU] Worldbook sync failed after save:', syncErr);
      }
    } else {
      console.warn('[ACU] syncWorldbookEntries API not found, skipping sync.');
    }
  }

  // ============================================================
  // 主保存函数 (迁移自原 saveDataToDatabase)
  // ============================================================

  /**
   * 保存数据到数据库
   * @param tableData 表格数据 (可选，默认从暂存或 API 获取)
   * @param skipRender 是否跳过 UI 渲染
   * @param commitDeletes 是否提交删除操作
   * @param targetIndex 目标楼层索引 (-1 表示自动查找)
   * @returns 是否保存成功
   */
  async function saveToDatabase(
    tableData: RawDatabaseData | null = null,
    skipRender: boolean = false,
    commitDeletes: boolean = false,
    targetIndex: number = -1,
  ): Promise<boolean> {
    // 1. 状态锁检查
    if (dataStore.isSaving) {
      console.warn('[ACU] Save already in progress');
      return false;
    }

    // 2. 准备数据源
    let dataToUse = dataStore.getStagedData();
    if (!dataToUse) {
      dataToUse = tableData || getTableData();
    }

    if (!dataToUse) {
      console.warn('[ACU] 无数据可保存');
      return false;
    }

    const { $ } = getCore();
    const $saveBtn = $?.('#acu-btn-save-global, #acu-parent-container #acu-btn-save-global');
    let originalIcon = '';

    try {
      // 设置保存锁
      dataStore.isSaving = true;

      if (!skipRender && $saveBtn?.length) {
        originalIcon = $saveBtn.html();
        $saveBtn.html('<i class="fa-solid fa-spinner fa-spin"></i>').prop('disabled', true);
      }

      // 执行核心保存
      const savedData = await executeCoreSave(dataToUse, commitDeletes, targetIndex);

      if (!skipRender) {
        // 获取目标楼层用于提示
        const savedFloor = (savedData as any)?._savedToFloor;
        if (savedFloor !== undefined) {
          toast.success(`已更新至第 ${savedFloor} 层 (覆盖旧数据)`);
        }

        // 清理高亮
        const parentDoc = window.parent?.document || document;
        $(parentDoc).find('.acu-highlight-changed').removeClass('acu-highlight-changed');
        $saveBtn?.removeClass('acu-save-alert');

        // 清理缓存和标记
        dataStore.clearChanges(commitDeletes);

        // 清空暂存数据
        dataStore.stagedData = null;

        // 保存快照
        if (savedData) {
          dataStore.saveSnapshot(savedData);
        }
      }

      // 同步世界书
      await syncWorldbook();

      return true;
    } catch (e) {
      console.error('[ACU] Save failed:', e);
      if (!skipRender) {
        toast.error('保存失败: ' + (e as Error).message);
      }
      return false;
    } finally {
      // 解锁
      setTimeout(() => {
        dataStore.isSaving = false;
        if (!skipRender && $saveBtn?.length) {
          $saveBtn.html(originalIcon || '<i class="fa-solid fa-save"></i>').prop('disabled', false);
        }
      }, 100);
    }
  }

  // ============================================================
  // 快照管理
  // ============================================================

  /**
   * 保存快照
   * @param data 数据
   */
  function saveSnapshot(data: RawDatabaseData): void {
    dataStore.saveSnapshot(data);
  }

  /**
   * 加载快照
   */
  function loadSnapshot(): RawDatabaseData | null {
    return dataStore.loadSnapshot();
  }

  /**
   * 清除快照
   */
  function clearSnapshot(): void {
    dataStore.clearSnapshot();
  }

  // ============================================================
  // 范围清洗功能 (迁移自原 purgeFloorRange)
  // ============================================================

  /**
   * 清除指定楼层范围的数据
   * @param startIdx 起始楼层
   * @param endIdx 结束楼层
   */
  async function purgeFloorRange(startIdx: number, endIdx: number): Promise<void> {
    if (dataStore.isSaving) return;

    // 获取 SillyTavern 核心对象
    let ST = (window as any).SillyTavern || (window.parent ? (window.parent as any).SillyTavern : null);
    if (!ST && (window as any).top && (window as any).top.SillyTavern) {
      ST = (window as any).top.SillyTavern;
    }

    if (!ST || !ST.chat) {
      toast.error('无法连接到 SillyTavern 核心数据');
      return;
    }

    // 验证和修正范围
    const maxIdx = ST.chat.length - 1;
    startIdx = Math.max(0, startIdx);
    endIdx = Math.min(maxIdx, endIdx);

    if (isNaN(startIdx) || isNaN(endIdx) || startIdx > endIdx) {
      toast.warning('无效的楼层范围');
      return;
    }

    // 设置保存锁
    dataStore.isSaving = true;

    try {
      console.log(`[ACU-Purge] 开始强力清洗楼层范围: ${startIdx} - ${endIdx}`);

      let changesCount = 0;

      // 定义所有需要被清除的数据字段
      const keysToDelete = [
        'TavernDB_ACU_Data',
        'TavernDB_ACU_SummaryData',
        'TavernDB_ACU_IndependentData',
        'TavernDB_ACU_Identity',
        'TavernDB_ACU_IsolatedData',
        'TavernDB_ACU_ModifiedKeys',
        'TavernDB_ACU_UpdateGroupKeys',
      ];

      // 遍历并执行强力删除
      for (let i = startIdx; i <= endIdx; i++) {
        const msg = ST.chat[i];
        if (!msg) continue;

        let messageModified = false;
        for (const key of keysToDelete) {
          if (Object.prototype.hasOwnProperty.call(msg, key)) {
            delete msg[key];
            messageModified = true;
          }
        }

        if (messageModified) {
          changesCount++;
        }
      }

      // 如果有变动，则保存并刷新
      if (changesCount > 0) {
        // 持久化保存删除操作
        if (ST.saveChat) {
          await ST.saveChat();
        }

        // 清理本地缓存
        dataStore.clearSnapshot();
        dataStore.clearChanges(true);

        toast.success(`已强力清除 ${changesCount} 个楼层的数据，正在同步...`);

        // 同步世界书
        await syncWorldbook();
      } else {
        toast.info('指定范围内没有可清除的数据');
      }
    } catch (e) {
      console.error('[ACU] Purge Error:', e);
      toast.error('清除失败: ' + (e as Error).message);
    } finally {
      dataStore.isSaving = false;
    }
  }

  // ============================================================
  // 自动保存 (防抖)
  // ============================================================

  /** 自动保存 WatchStop 句柄 */
  let autoSaveStop: WatchStopHandle | null = null;

  /**
   * 设置自动保存
   * @param delay 防抖延迟时间 (毫秒), 默认 5000ms
   */
  function setupAutoSave(delay = 5000): void {
    // 如果已经设置过，先停止
    if (autoSaveStop) {
      autoSaveStop();
      autoSaveStop = null;
    }

    // 使用 VueUse 的 watchDebounced 监听表格数据变化
    // watchDebounced 直接返回 WatchStopHandle
    autoSaveStop = watchDebounced(
      () => dataStore.tables,
      async () => {
        // 检查是否有未保存的变更且开启了自动保存
        if (dataStore.hasChanges && configStore.config.autoSave) {
          try {
            console.info('[ACU] 自动保存触发...');
            await dataStore.saveToDatabase();
            console.info('[ACU] 自动保存完成');
          } catch (error) {
            console.error('[ACU] 自动保存失败:', error);
          }
        }
      },
      { debounce: delay, deep: true },
    );

    console.info(`[ACU] 自动保存已启用，防抖延迟: ${delay}ms`);
  }

  /**
   * 停止自动保存
   */
  function stopAutoSave(): void {
    if (autoSaveStop) {
      autoSaveStop();
      autoSaveStop = null;
      console.info('[ACU] 自动保存已停止');
    }
  }

  // ============================================================
  // 兼容旧版本数据迁移
  // ============================================================

  /**
   * 检测并记录旧版本数据
   * 用于向后兼容性检查
   */
  function migrateLegacyData(): void {
    console.info('[ACU] 检查旧版本数据...');

    let legacyDataFound = false;

    LEGACY_KEYS.forEach(key => {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          console.info(`[ACU] 发现旧版本数据: ${key}`);
          legacyDataFound = true;

          // 尝试解析并记录数据类型
          try {
            const parsed = JSON.parse(value);
            const dataType = Array.isArray(parsed) ? 'array' : typeof parsed;
            console.info(`[ACU]   - 数据类型: ${dataType}`);
          } catch {
            console.info(`[ACU]   - 数据类型: string`);
          }
        }
      } catch (e) {
        console.warn(`[ACU] 读取 ${key} 失败:`, e);
      }
    });

    // 检查 V5 设置
    try {
      const v5Settings = localStorage.getItem(STORAGE_KEY_V5_SETTINGS);
      if (v5Settings) {
        console.info('[ACU] 发现 V5 隔离设置数据');
        legacyDataFound = true;
      }
    } catch {
      // ignore
    }

    if (!legacyDataFound) {
      console.info('[ACU] 未发现旧版本数据');
    }
  }

  // ============================================================
  // 初始化函数
  // ============================================================

  /**
   * 初始化数据持久化
   * 包含: 旧数据迁移检查、加载数据、设置自动保存
   */
  async function initDataPersistence(): Promise<void> {
    console.info('[ACU] 初始化数据持久化...');

    // 1. 检查旧版本数据
    migrateLegacyData();

    // 2. 从数据库加载数据
    await dataStore.loadFromDatabase();

    // 3. 设置自动保存 (如果配置启用)
    if (configStore.config.autoSave) {
      setupAutoSave(configStore.config.autoSaveDelay || 5000);
    }

    console.info('[ACU] 数据持久化初始化完成');
  }

  // ============================================================
  // 返回公开 API
  // ============================================================

  return {
    // 主保存功能
    saveToDatabase,
    syncWorldbook,

    // 快照管理
    saveSnapshot,
    loadSnapshot,
    clearSnapshot,

    // 范围清洗
    purgeFloorRange,

    // 自动保存
    setupAutoSave,
    stopAutoSave,

    // 兼容层
    migrateLegacyData,

    // 初始化
    initDataPersistence,

    // 工具函数
    getTableData,

    // Store 引用 (便于外部访问)
    dataStore,
  };
}
