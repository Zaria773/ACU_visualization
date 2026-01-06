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
        }
      };
      api.registerTableUpdateCallback(tableUpdateCallback);
      console.info('[ACU] 已注册表格更新回调');
    }

    // 表格填充开始回调（高亮逻辑）
    // 参考原代码 6.4.1.ts:4556-4568
    if (api.registerTableFillStartCallback) {
      tableFillStartCallback = () => {
        // 检查是否正在关闭
        if (isShuttingDown) return;

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

  // 生命周期挂载
  onMounted(() => {
    registerCallbacks();
  });

  onUnmounted(() => {
    unregisterCallbacks();
  });

  // 返回手动控制接口（一般不需要使用）
  return {
    registerCallbacks,
    unregisterCallbacks,
  };
}
