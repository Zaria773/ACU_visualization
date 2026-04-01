/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * ACU 可视化表格 - Vue 版本入口文件
 *
 * 脚本项目：以无沙盒 iframe 形式在酒馆后台运行
 * Vue 应用挂载到父窗口 document
 *
 * 注意：触摸滚动修复和 API 回调已移入 Vue Composables，
 * 随 App.vue 组件生命周期自动管理，解决切换 Tab 后失效的问题
 */

import { polyfill } from 'mobile-drag-drop';
import 'mobile-drag-drop/default.css';
import { scrollBehaviourDragImageTranslateOverride } from 'mobile-drag-drop/scroll-behaviour';
import { createPinia } from 'pinia';
import { createApp, type App as VueApp } from 'vue';
import App from './App.vue';
import { getACUConfigManager } from './composables/useACUConfigManager';
import { cleanupSendIntercept, setupFocusTracking, setupSendIntercept } from './composables/useHiddenPrompt';
import { useDivinationStore } from './stores/useDivinationStore';
import { useUIStore } from './stores/useUIStore';
import { getCore } from './utils/index';
import { VERSION } from './version';

// 初始化移动端拖拽 polyfill
// 解决移动端不支持 HTML5 拖拽 API 的问题
polyfill({
  // 长按 300ms 后开始拖拽（可调整）
  holdToDrag: 300,
  // 解决拖拽时页面滚动问题
  dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
});

// jQuery 兼容层 - 脚本项目中 jQuery 作用于父窗口
(window as any).$ = (window.parent as any).$;

const SCRIPT_ID = 'acu-parent-container';
const MAX_DATA_RETRIES = 10;

// 存储键常量（本地使用）
const LOCAL_KEYS = {
  WIN_CONFIG: 'acu_win_config',
  ACTIVE_TAB: 'acu_active_tab',
  UI_COLLAPSE: 'acu_ui_collapse_state',
} as const;

const DEFAULT_CENTERED_WIN_CONFIG = {
  width: 400,
  left: '50%',
  bottom: '50%',
  isCentered: true,
} as const;

function getLocalStorageUsageSummary(): Array<{ key: string; length: number }> {
  try {
    const summary: Array<{ key: string; length: number }> = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) ?? '';
      summary.push({ key, length: value.length });
    }
    return summary.sort((a, b) => b.length - a.length).slice(0, 8);
  } catch {
    return [];
  }
}

function safeSetLocalStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn('[ACU] localStorage 写入失败，已跳过，不阻断启动', {
      key,
      valueLength: value.length,
      topKeys: getLocalStorageUsageSummary(),
      error,
    });
    return false;
  }
}

function safeRemoveLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('[ACU] localStorage 删除失败，已跳过，不阻断启动', { key, error });
  }
}

function applySafeCenteredModeReset(reason: string): void {
  safeSetLocalStorage(LOCAL_KEYS.WIN_CONFIG, JSON.stringify(DEFAULT_CENTERED_WIN_CONFIG));
  safeRemoveLocalStorage(LOCAL_KEYS.ACTIVE_TAB);
  safeSetLocalStorage(LOCAL_KEYS.UI_COLLAPSE, 'false');
  console.info(`[ACU] ${reason}`);
}

/**
 * 【关键修复】参照 6.4.1：初始化时检测居中模式并重置状态
 *
 * 问题：居中模式下，如果加载了 Dashboard 内容，内容高度会把导航栏推到屏幕外面
 * 解决：
 * 1. 居中模式（首次加载或重置后）不打开任何 Tab，只显示导航栏
 * 2. 确保面板是展开状态（不显示悬浮球）
 *
 * 必须在 Vue 应用初始化之前执行，确保 Pinia store 初始化时不会恢复错误的状态
 */
function checkAndResetCenteredMode(): void {
  try {
    const winConfigRaw = localStorage.getItem(LOCAL_KEYS.WIN_CONFIG);

    // 情况1：没有保存过位置（首次加载）
    if (!winConfigRaw) {
      applySafeCenteredModeReset('首次加载：设置居中模式，清除 activeTab');
      return;
    }

    // 情况2：已保存位置，检查是否是居中模式
    const winConfig = JSON.parse(winConfigRaw);
    if (winConfig?.isCentered === true) {
      // 居中模式下清除 activeTab，只显示导航栏
      safeRemoveLocalStorage(LOCAL_KEYS.ACTIVE_TAB);
      // 确保面板展开（不显示悬浮球）
      safeSetLocalStorage(LOCAL_KEYS.UI_COLLAPSE, 'false');
      console.info('[ACU] 居中模式：清除 activeTab，确保面板展开');
    }
  } catch (e) {
    // 解析失败或 localStorage 异常时，尽量重置为安全的居中状态，但不阻断脚本启动
    console.warn('[ACU] 解析 win_config 失败，尝试重置为居中模式', e);
    applySafeCenteredModeReset('win_config 异常：已尝试重置为居中模式');
  }
}

// Vue 应用实例 (用于清理)
let vueApp: VueApp | null = null;
let mountContainer: HTMLElement | null = null;

// 定时器 ID (用于清理)
let dbCheckTimerId: ReturnType<typeof setTimeout> | null = null;

// 是否已停止初始化 (防止热重载时继续初始化)
let isShuttingDown = false;

// 数据库 API 是否就绪
let isDatabaseReady = false;

/**
 * 初始化 Vue 应用
 */
function initVueApp() {
  const parentDoc = window.parent.document;

  // 防止重复挂载
  const existingRoot = parentDoc.getElementById(SCRIPT_ID);
  if (existingRoot) {
    console.warn('[ACU] Vue 应用已存在，跳过重复初始化');
    return;
  }

  // 创建挂载点 - ID 必须是 'acu-parent-container'，与样式文件中的选择器匹配
  mountContainer = parentDoc.createElement('div');
  mountContainer.id = SCRIPT_ID;
  parentDoc.body.appendChild(mountContainer);

  // 创建 Pinia 实例
  const pinia = createPinia();

  // 创建 Vue 应用
  vueApp = createApp(App);
  vueApp.use(pinia);

  // 挂载到父窗口
  // 注意：触摸滚动修复和 API 回调已移入 App.vue 的 composables
  // 它们随 Vue 组件生命周期自动管理，解决切换 Tab 后失效的问题
  vueApp.mount(mountContainer);

  console.info(`[ACU] Vue 应用已挂载到父窗口 (${SCRIPT_ID})`);
}

/**
 * 等待数据库 API 就绪（后台进行，不阻塞 UI）
 *
 * 返回 Promise，在 API 就绪时 resolve
 */
function waitForDatabaseApi(): Promise<void> {
  return new Promise(resolve => {
    let dataCheckRetries = 0;

    const checkApi = () => {
      // 如果正在关闭，停止检查
      if (isShuttingDown) {
        console.info('[ACU] 脚本正在卸载，停止数据库 API 检查');
        return;
      }

      const { $, getDB } = getCore();
      const api = getDB();

      // 检查 API 和 jQuery 是否就绪
      if (api && typeof api.exportTableAsJson === 'function' && $) {
        // 尝试获取数据
        const data = api.exportTableAsJson();
        const hasData = data && Object.keys(data).length > 0;

        // 如果没有数据，且未达到最大重试次数，则继续等待
        if (!hasData && dataCheckRetries < MAX_DATA_RETRIES) {
          dataCheckRetries++;
          console.info(`[ACU] 数据库 API 就绪但无数据，等待中... (${dataCheckRetries}/${MAX_DATA_RETRIES})`);
          dbCheckTimerId = setTimeout(checkApi, 1000);
          return;
        }

        // 清除定时器 ID
        dbCheckTimerId = null;
        isDatabaseReady = true;
        resolve();
      } else {
        // API 未就绪，继续等待
        dbCheckTimerId = setTimeout(checkApi, 1000);
      }
    };

    checkApi();
  });
}

/**
 * 初始化 ACU
 *
 * 新的初始化流程：
 * 1. 加载配置（同步，extensionSettings 立即可用）
 * 2. 等待数据库 API 就绪（后台进行，不阻塞 UI）
 * 3. 挂载 Vue 应用（配置已加载，可以立即渲染）
 */
function initACU() {
  // 【关键】在 Vue 应用初始化之前检测居中模式
  // 必须先执行，确保 Pinia store 初始化时 activeTab 已被正确处理
  checkAndResetCenteredMode();

  // 1. 加载配置（同步，extensionSettings 立即可用）
  const configManager = getACUConfigManager();
  configManager.loadConfig();
  console.info('[ACU] 配置已同步加载');

  // 2. 等待数据库 API 就绪（后台进行，不阻塞 UI）
  waitForDatabaseApi().then(() => {
    console.info('[ACU] 数据库 API 就绪');
  });

  // 3. 挂载 Vue 应用（配置已加载，可以立即渲染）
  initVueApp();
}

/**
 * 清理 Vue 应用和相关资源
 *
 * 注意：触摸滚动修复和 API 回调已移入 Vue Composables，
 * 它们会随 Vue 组件卸载自动清理，无需在此手动处理
 */
function cleanup() {
  console.info('[ACU] 开始清理资源...');

  // 设置关闭标志，防止回调继续执行
  isShuttingDown = true;

  // 清理数据库检查定时器
  if (dbCheckTimerId !== null) {
    clearTimeout(dbCheckTimerId);
    dbCheckTimerId = null;
    console.info('[ACU] 数据库检查定时器已清除');
  }

  // 卸载 Vue 应用
  // 注意：composables 会在组件卸载时自动清理
  if (vueApp) {
    vueApp.unmount();
    vueApp = null;
    console.info('[ACU] Vue 应用已卸载');
  }

  // 移除挂载点
  if (mountContainer) {
    mountContainer.remove();
    mountContainer = null;
    console.info('[ACU] 挂载点已移除');
  }

  console.info('[ACU] 资源清理完成');
}

/**
 * 自动检测并更新过时的加载器脚本 (Loader)
 * 当我们在代码里修正了加载逻辑，下一次用户加载时，会自动把用户的脚本内容替换成最新版
 */
function autoUpdateLoaderScript() {
  try {
    if (typeof updateScriptTreesWith !== 'function') return;

    const PERFECT_LOADER = `(async function loadACU() {
  const repo = 'Zaria773/ACU_visualization';
  const path = 'dist/可视化表格/index.js';

  async function fetchLatestVersion() {
    const apiSources = [
      \`https://data.jsdelivr.com/v1/packages/gh/\${repo}\`,
      \`https://api.github.com/repos/\${repo}/releases/latest\`
    ];
    for (const api of apiSources) {
      try {
        const res = await fetch(api, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          let ver = data.tag_name || data.versions?.[0]?.version;
          if (ver && !ver.startsWith('v')) ver = 'v' + ver;
          console.log('[ACU-Loader] 探测到最新发布版本:', ver);
          return ver;
        }
      } catch (e) {
        console.warn('[ACU-Loader] 版本查询 API 暂时不可用:', api);
      }
    }
    return null;
  }

  async function tryImportFromList(urls) {
    for (const url of urls) {
      try {
        await import(url);
        console.log('[ACU-Loader] 加载成功:', url);
        return true;
      } catch (e) {
        console.warn('[ACU-Loader] 节点尝试失败:', url);
      }
    }
    return false;
  }

  const version = await fetchLatestVersion();
  let success = false;

  if (version) {
    console.log(\`[ACU-Loader] 正在尝试拉取精准版本: \${version}\`);
    const preciseUrls = [
      \`https://fastly.jsdelivr.net/gh/\${repo}@\${version}/\${path}\`,
      \`https://gcore.jsdelivr.net/gh/\${repo}@\${version}/\${path}\`,
      \`https://cdn.jsdelivr.net/gh/\${repo}@\${version}/\${path}\`,
    ];
    success = await tryImportFromList(preciseUrls);
  }

  if (!success) {
    if (version) console.warn('[ACU-Loader] 精准版本加载失败或文件尚未就绪，尝试 @latest 兜底...');
    const latestUrls = [
      \`https://fastly.jsdelivr.net/gh/\${repo}@latest/\${path}\`,
      \`https://gcore.jsdelivr.net/gh/\${repo}@latest/\${path}\`,
      \`https://cdn.jsdelivr.net/gh/\${repo}@latest/\${path}\`,
    ];
    success = await tryImportFromList(latestUrls);
  }

  if (!success) {
    console.error('[ACU Loader] 所有 CDN 节点及回退方案均加载失败，请检查网络或仓库状态');
  }
})();`;

    // 执行更新
    updateScriptTreesWith(
      trees => {
        let updated = false;
        const processTrees = (nodes: any[]) => {
          for (const node of nodes) {
            if (node.type === 'folder' && node.scripts) {
              processTrees(node.scripts);
            } else if (node.type === 'script' && typeof node.content === 'string') {
              // 通过特征字符串判断是否为我们的加载脚本
              if (
                node.content.includes('Zaria773/ACU_visualization') &&
                node.content.includes('dist/可视化表格/index.js')
              ) {
                // 通过核心标志位判断是否已经是最新版，只有没包含 'tryImportFromList' 的老版本才更新
                if (!node.content.includes('tryImportFromList') || !node.content.includes('fetchLatestVersion')) {
                  node.content = PERFECT_LOADER;
                  updated = true;
                  console.info(`[ACU] 成功自动修正更新了用户的加载器脚本 (${node.name})`);
                }
              }
            }
          }
        };

        processTrees(trees);
        return trees;
      },
      { type: 'global' },
    );
  } catch (e) {
    console.warn('[ACU] 加载器脚本自动检测更新失败', e);
  }
}

// ============================================================
// 入口点
// ============================================================

$(() => {
  console.info(`[ACU] v${VERSION} 脚本加载`);

  // 自动监测并修补用户加载器脚本
  autoUpdateLoaderScript();

  // 注册脚本按钮
  replaceScriptButtons([{ name: '🎴 隐藏提示词', visible: true }]);

  // 监听按钮点击事件
  eventOn(getButtonEvent('🎴 隐藏提示词'), () => {
    // 确保 Vue 应用已初始化
    if (!vueApp) {
      console.warn('[ACU] Vue 应用尚未初始化');
      return;
    }

    // 获取 store 并打开弹窗
    const uiStore = useUIStore();
    const currentPrompt = (window as any).__acu_hidden_prompt || '';
    uiStore.openPromptEditorDialog(currentPrompt);
  });

  // 监听酒馆原生 AI 生成开始事件，触发随机词库同步
  // 这样可以确保在 AI 生成前，最新的表格数据已同步到世界书
  // 注意：使用 'generation_started'（酒馆原生事件），而非 'js_generation_started'（酒馆助手 generate 函数事件）
  eventOn('generation_started', () => {
    if (!vueApp) return;

    const divinationStore = useDivinationStore();
    // 只有在启用了世界书词库且启用了自动同步时才执行
    if (divinationStore.config.enableWordPool && divinationStore.config.autoSync) {
      console.info('[ACU] 酒馆 AI 生成开始，触发随机词库同步...');
      divinationStore.syncFromACU();
    }
  });

  // 设置 DOM 发送拦截和焦点追踪
  setTimeout(() => {
    setupSendIntercept();
    setupFocusTracking(); // 追踪最后焦点的输入框，用于选项追加功能
  }, 500);

  // 初始化 ACU（同步配置加载 + 异步数据库等待 + 立即挂载 Vue）
  errorCatched(initACU)();

  // 卸载时清理 (使用 pagehide 而非 unload)
  $(window).on('pagehide', () => {
    console.info('[ACU] 页面卸载，执行清理');
    // 清理 DOM 拦截
    cleanupSendIntercept();
    cleanup();
  });
});
