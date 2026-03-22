/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * useApiCallbacks.ts - 数据库 API 回调管理
 *
 * 将 API 回调注册逻辑从 index.ts 移入 Vue Composable，
 * 使其随组件生命周期自动管理
 *
 * 原版参考：6.4.1.ts 的 registerTableUpdateCallback 和 registerTableFillStartCallback
 */

import { onMounted, onUnmounted } from 'vue';
import { useDataStore } from '../stores/useDataStore';
import { useUIStore } from '../stores/useUIStore';
import type { RawDatabaseData, TableRow } from '../types';
import { getCore, getTableData } from '../utils/index';
import { useDbSettings } from './useDbSettings';
import { saveSnapshot as saveRowSnapshot } from './useRowHistory';
import { useTableUpdateStatus } from './useTableUpdateStatus';
import { toast } from './useToast';
import { useUpdatePresets } from './useUpdatePresets';

// 回调函数引用（用于注销）
let tableUpdateCallback: (() => void) | null = null;
let tableFillStartCallback: (() => void) | null = null;

// 关闭标志，防止卸载后回调继续执行
let isShuttingDown = false;

/**
 * API 回调管理 Composable
 *
 * 功能：
 * - 注册表格更新回调，自动刷新数据
 * - 注册表格填充开始回调，管理高亮快照
 * - 随组件生命周期自动注册/注销
 */
export function useApiCallbacks() {
  const dataStore = useDataStore();
  const uiStore = useUIStore();
  const presetsManager = useUpdatePresets();
  const dbSettings = useDbSettings();
  const tableUpdateStatus = useTableUpdateStatus();

  // 上次检测到问题的时间（防止频繁提示）
  let lastIssueNotifyTime = 0;
  const NOTIFY_COOLDOWN = 30000; // 30秒冷却时间

  // 是否正在自动执行更新
  let isAutoUpdating = false;

  /**
   * 获取当前聊天ID
   */
  function getCurrentChatId(): string {
    try {
      const ST = (window as any).SillyTavern || (window.parent as any)?.SillyTavern || (window.top as any)?.SillyTavern;
      if (ST?.getCurrentChatId) {
        const chatId = ST.getCurrentChatId();
        if (chatId) return chatId;
      }
      if (ST?.chat_metadata?.chat_id) {
        return String(ST.chat_metadata.chat_id);
      }
    } catch (e) {
      console.warn('[ACU] 获取 chatId 失败:', e);
    }
    return 'default';
  }

  /**
   * 比较两行数据是否有变化
   */
  function hasRowChanged(oldRow: (string | number)[] | undefined, newRow: (string | number)[] | undefined): boolean {
    if (!oldRow && !newRow) return false;
    if (!oldRow || !newRow) return true;
    if (oldRow.length !== newRow.length) return true;

    for (let i = 0; i < oldRow.length; i++) {
      const oldVal = String(oldRow[i] ?? '').trim();
      const newVal = String(newRow[i] ?? '').trim();
      // 'null' 和 'undefined' 字符串也视为空
      const normalizedOld = oldVal === 'null' || oldVal === 'undefined' ? '' : oldVal;
      const normalizedNew = newVal === 'null' || newVal === 'undefined' ? '' : newVal;
      if (normalizedOld !== normalizedNew) return true;
    }
    return false;
  }

  /**
   * 保存 AI 填表变更到行历史
   * 在 tableUpdateCallback 中调用，对比快照与新数据，将变更行的旧值保存到 IndexedDB
   */
  async function saveAiChangesToHistory(oldData: RawDatabaseData, newData: RawDatabaseData): Promise<void> {
    const chatId = getCurrentChatId();
    if (!chatId) {
      console.warn('[ACU] 无法获取 chatId，跳过 AI 变更历史保存');
      return;
    }

    let savedCount = 0;

    for (const sheetId in newData) {
      if (!sheetId.startsWith('sheet_')) continue;

      const newSheet = newData[sheetId];
      const oldSheet = oldData[sheetId];

      if (!newSheet?.content || !Array.isArray(newSheet.content)) continue;

      const tableName = newSheet.name || sheetId.replace('sheet_', '');
      const headers = newSheet.content[0] || [];

      // 对比每一行（跳过表头行）
      for (let rowIdx = 1; rowIdx < newSheet.content.length; rowIdx++) {
        const realRowIdx = rowIdx - 1;
        const newRow = newSheet.content[rowIdx];
        const oldRow = oldSheet?.content?.[rowIdx];

        // 检查是否有变化
        if (hasRowChanged(oldRow, newRow)) {
          // 如果旧数据存在，保存旧数据到历史
          if (oldRow && Array.isArray(oldRow)) {
            // 构建 TableRow 格式的数据
            const tableRow: TableRow = {
              index: realRowIdx,
              key: `${tableName}-row-${realRowIdx}`,
              cells: oldRow.map((val, i) => ({
                colIndex: i,
                key: String(headers[i] || `col_${i}`),
                value: String(val ?? ''),
              })),
            };

            try {
              await saveRowSnapshot(chatId, tableName, tableRow, 'ai');
              savedCount++;
            } catch (err) {
              console.warn('[ACU] 保存 AI 变更历史失败:', err);
            }
          }
        }
      }
    }

    if (savedCount > 0) {
      console.info(`[ACU] 已保存 ${savedCount} 行 AI 变更历史记录`);
    }
  }

  /**
   * 注册 API 回调
   */
  function registerCallbacks() {
    const { getDB } = getCore();
    const api = getDB();

    if (!api) {
      console.warn('[ACU] 数据库 API 未就绪，跳过回调注册');
      return;
    }

    isShuttingDown = false;

    // 表格更新回调
    if (api.registerTableUpdateCallback) {
      tableUpdateCallback = async () => {
        // 检查是否正在关闭
        if (isShuttingDown) return;

        // 检查是否正在编辑排序或保存中
        if (uiStore.isEditingOrder || dataStore.isSaving) return;

        // 获取旧快照（AI填表前的数据）用于保存历史
        const oldSnapshot = dataStore.snapshot;

        // 重新加载数据
        const newData = getTableData();
        if (newData) {
          // 【关键修复】在更新数据前，对比快照保存变更行的历史记录
          if (oldSnapshot) {
            await saveAiChangesToHistory(oldSnapshot, newData);
          }

          const processedData = dataStore.setStagedData(newData);

          // 【已移除】syncNewTablesToVisibleTabs 会错误地把"用户隐藏的表格"当成"新表格"添加
          // 用户应该通过设置面板手动管理 Tab 可见性

          // 生成 AI 差异映射（高亮 AI 填表的变更）
          dataStore.generateDiffMap(processedData);

          // 触发悬浮球通知动画
          uiStore.triggerAiNotify();

          // 刷新表格更新状态看板（仪表盘中的组件）
          tableUpdateStatus.refresh();

          // 【关键修复】只有开启智能检测时才执行完整性检测
          if (presetsManager.globalAutoTriggerEnabled) {
            // 执行完整性检测
            dataStore.checkIntegrity(newData);

            // 检查是否有问题并需要提示
            checkAndNotifyIssues();
          } else {
            // 关闭检测时清除所有警告
            dataStore.clearIntegrityIssues();
          }
        }
      };
      api.registerTableUpdateCallback(tableUpdateCallback);
      console.info('[ACU] 已注册表格更新回调');
    }

    // 表格填充开始回调（高亮逻辑 + 撤回支持）
    // 参考原代码 6.4.1.ts:4556-4568
    if (api.registerTableFillStartCallback) {
      tableFillStartCallback = () => {
        // 检查是否正在关闭
        if (isShuttingDown) return;

        // 保存当前状态用于撤回（AI 填表也可以撤回）
        dataStore.saveLastState();

        // 设置 AI 生成状态
        uiStore.setAiGenerating(true);

        // A. 检测累积变动：如果界面上还有未保存的高亮（diffMap），跳过快照更新
        // 注意：只检查 diffMap，不检查 pendingDeletes，与原代码保持一致
        if (dataStore.diffMap && dataStore.diffMap.size > 0) {
          console.info('[ACU] 累积高亮：保留旧快照');
          return;
        }

        // B. 界面干净时：保存当前状态为基准快照
        const currentData = getTableData();
        if (currentData && Object.keys(currentData).length > 0) {
          dataStore.saveSnapshot(currentData);
          console.info('[ACU] 快照已更新');
        }
      };
      api.registerTableFillStartCallback(tableFillStartCallback);
      console.info('[ACU] 已注册表格填充回调 (高亮逻辑)');
    }
  }

  /**
   * 注销 API 回调
   */
  function unregisterCallbacks() {
    isShuttingDown = true;

    const { getDB } = getCore();
    const api = getDB();

    if (!api) return;

    try {
      if (api.registerTableUpdateCallback && tableUpdateCallback) {
        // 尝试用空函数替换，或者如果 API 支持 unregister 方法则调用它
        if (typeof api.unregisterTableUpdateCallback === 'function') {
          api.unregisterTableUpdateCallback(tableUpdateCallback);
        }
        tableUpdateCallback = null;
        console.info('[ACU] 已注销表格更新回调');
      }

      if (api.registerTableFillStartCallback && tableFillStartCallback) {
        if (typeof api.unregisterTableFillStartCallback === 'function') {
          api.unregisterTableFillStartCallback(tableFillStartCallback);
        }
        tableFillStartCallback = null;
        console.info('[ACU] 已注销表格填充回调');
      }
    } catch (e) {
      console.warn('[ACU] 注销回调时出错:', e);
    }
  }

  /**
   * 检查完整性问题并提示用户（或自动触发修复）
   */
  async function checkAndNotifyIssues() {
    // 【关键修复】首先检查全局开关是否开启
    // 全局开关关闭时（默认状态），不进行任何检测和提示
    if (!presetsManager.globalAutoTriggerEnabled) {
      return;
    }

    // 检查是否有问题
    if (!dataStore.hasIntegrityIssues) return;

    // 检查冷却时间
    const now = Date.now();
    if (now - lastIssueNotifyTime < NOTIFY_COOLDOWN) return;

    // 检查是否正在自动更新
    if (isAutoUpdating) return;

    // 检查是否配置了自动修复预设
    const autoFixPreset = presetsManager.autoFixPreset;

    if (autoFixPreset && autoFixPreset.autoTrigger.enabled) {
      // 检查触发条件 - 始终检测所有问题类型
      let shouldTrigger = false;

      // 获取有问题的表格列表
      const problematicTables = dataStore.problematicTables;
      if (problematicTables && problematicTables.length > 0) {
        // 只要有问题就触发
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        lastIssueNotifyTime = now;
        const summary = dataStore.getIntegritySummary();

        // 自动执行更新
        isAutoUpdating = true;
        toast.info(`🔧 检测到问题：${summary}，正在自动修复...`);
        console.info('[ACU] 自动触发修复:', summary);

        try {
          // 使用新 API: 传入参数 + 表格 sheetKeys 列表
          const targetSheetKeys = autoFixPreset.autoTrigger.updateTargetTables || [];
          const result = await dbSettings.executeWithPreset(
            {
              autoUpdateThreshold: autoFixPreset.settings.autoUpdateThreshold,
              autoUpdateFrequency: autoFixPreset.settings.autoUpdateFrequency,
              updateBatchSize: autoFixPreset.settings.updateBatchSize,
              skipUpdateFloors: autoFixPreset.settings.skipUpdateFloors,
            },
            targetSheetKeys,
          );

          if (result.success) {
            toast.success('✅ 自动修复已完成');
          } else {
            toast.warning('⚠️ 自动修复失败：' + (result.message || '请手动更新'));
          }
        } catch (error) {
          console.error('[ACU] 自动修复失败:', error);
          toast.error('❌ 自动修复出错');
        } finally {
          isAutoUpdating = false;
        }
      }
    }
    // 移除默认提示 - 只有用户开启了自动修复功能时才会提示/触发
  }

  // 生命周期挂载
  onMounted(() => {
    registerCallbacks();
  });

  onUnmounted(() => {
    unregisterCallbacks();
  });

  // 返回手动控制接口
  return {
    registerCallbacks,
    unregisterCallbacks,
    checkAndNotifyIssues,
  };
}
