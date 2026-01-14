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
import { getCore, getTableData } from '../utils/index';
import { useDbSettings } from './useDbSettings';
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

  // 上次检测到问题的时间（防止频繁提示）
  let lastIssueNotifyTime = 0;
  const NOTIFY_COOLDOWN = 30000; // 30秒冷却时间

  // 是否正在自动执行更新
  let isAutoUpdating = false;

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
      tableUpdateCallback = () => {
        // 检查是否正在关闭
        if (isShuttingDown) return;

        // 检查是否正在编辑排序或保存中
        if (uiStore.isEditingOrder || dataStore.isSaving) return;

        // 重新加载数据
        const newData = getTableData();
        if (newData) {
          dataStore.setStagedData(newData);

          // 同步新表格到可见列表（确保新模板的表格能显示）
          const allTableIds = Object.keys(newData).filter(k => k.startsWith('sheet_'));
          uiStore.syncNewTablesToVisibleTabs(allTableIds);

          // 生成 AI 差异映射（高亮 AI 填表的变更）
          dataStore.generateDiffMap(newData);

          // 执行完整性检测
          dataStore.checkIntegrity(newData);

          // 检查是否有问题并需要提示
          checkAndNotifyIssues();
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
    // 检查是否有问题
    if (!dataStore.hasIntegrityIssues) return;

    // 检查冷却时间
    const now = Date.now();
    if (now - lastIssueNotifyTime < NOTIFY_COOLDOWN) return;

    // 检查是否正在自动更新
    if (isAutoUpdating) return;

    // 检查是否配置了自动修复预设
    const autoFixPreset = presetsManager.autoFixPreset.value;

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
          // 使用新 API: executeWithPreset，直接传入四参数 + 表格选择
          const targetTables = autoFixPreset.autoTrigger.updateTargetTables || [];
          const result = await dbSettings.executeWithPreset(
            {
              autoUpdateThreshold: autoFixPreset.settings.autoUpdateThreshold,
              autoUpdateFrequency: autoFixPreset.settings.autoUpdateFrequency,
              updateBatchSize: autoFixPreset.settings.updateBatchSize,
              skipUpdateFloors: autoFixPreset.settings.skipUpdateFloors,
            },
            targetTables,
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
