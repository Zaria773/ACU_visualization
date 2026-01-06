/**
 * ACU 可视化表格 - Vue 版本入口文件
 *
 * 脚本项目：以无沙盒 iframe 形式在酒馆后台运行
 * Vue 应用挂载到父窗口 document
 *
 * 注意：触摸滚动修复和 API 回调已移入 Vue Composables，
 * 随 App.vue 组件生命周期自动管理，解决切换 Tab 后失效的问题
 */

import { createPinia } from 'pinia';
import { createApp, type App as VueApp } from 'vue';
import App from './App.vue';
import { getCore } from './utils/index';

// jQuery 兼容层 - 脚本项目中 jQuery 作用于父窗口
(window as any).$ = (window.parent as any).$;

const SCRIPT_ID = 'acu-parent-container';
const MAX_DATA_RETRIES = 10;

// Vue 应用实例 (用于清理)
let vueApp: VueApp | null = null;
let mountContainer: HTMLElement | null = null;

// 定时器 ID (用于清理)
let initCheckTimerId: ReturnType<typeof setTimeout> | null = null;

// 是否已停止初始化 (防止热重载时继续初始化)
let isShuttingDown = false;

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
 * 等待 API 就绪并初始化
 */
function waitForApiAndInit() {
  let dataCheckRetries = 0;

  const checkApi = () => {
    // 如果正在关闭，停止检查
    if (isShuttingDown) {
      console.info('[ACU] 脚本正在卸载，停止 API 检查');
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
        console.info(`[ACU] API 就绪但无数据，等待中... (${dataCheckRetries}/${MAX_DATA_RETRIES})`);
        initCheckTimerId = setTimeout(checkApi, 1000);
        return;
      }

      // 清除定时器 ID
      initCheckTimerId = null;

      // 初始化 Vue 应用
      initVueApp();
    } else {
      // API 未就绪，继续等待
      initCheckTimerId = setTimeout(checkApi, 1000);
    }
  };

  checkApi();
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

  // 清理初始化定时器
  if (initCheckTimerId !== null) {
    clearTimeout(initCheckTimerId);
    initCheckTimerId = null;
    console.info('[ACU] 初始化定时器已清除');
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

// ============================================================
// 入口点
// ============================================================

$(() => {
  console.info(`[ACU] 脚本加载: ${SCRIPT_ID}`);

  // 等待 API 就绪并初始化
  waitForApiAndInit();

  // 卸载时清理 (使用 pagehide 而非 unload)
  $(window).on('pagehide', () => {
    console.info('[ACU] 页面卸载，执行清理');
    cleanup();
  });
});
