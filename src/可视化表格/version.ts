/**
 * ACU Visualizer 版本号
 *
 * 用途：
 * 1. 调试日志 - 快速定位用户使用的版本
 * 2. 用户界面显示 - 设置页面的版本号
 * 3. 存储键前缀 - 大版本升级时避免旧配置冲突
 *
 * 版本规范：
 * - 主版本号：重大更新/不兼容变更
 * - 次版本号：新功能
 * - 修订号：bug 修复
 */
export const VERSION = '8.3.4';

/**
 * GitHub Release 版本号
 *
 * 用途：生成 CDN URL，确保各镜像站能立即获取最新版本
 *
 * 注意：每次发布 release 时必须同步更新此值！
 * 格式：v0.0.x（与 GitHub release tag 保持一致）
 */
export const RELEASE_VERSION = 'v0.0.60';

/**
 * 生成 CDN URL 列表（用于加载脚本）
 * @param path 资源路径，如 'dist/可视化表格/index.js'
 * @returns CDN URL 数组，按优先级排序
 */
export function getCdnUrls(path: string): string[] {
  const repo = 'Zaria773/ACU_visualization';
  return [
    `https://cdn.jsdelivr.net/gh/${repo}@${RELEASE_VERSION}/${path}`,
    `https://fastly.jsdelivr.net/gh/${repo}@${RELEASE_VERSION}/${path}`,
    `https://gcore.jsdelivr.net/gh/${repo}@${RELEASE_VERSION}/${path}`,
  ];
}

/**
 * 存储键版本（只取主版本号）
 * 当主版本号变化时，会使用新的存储键，避免旧配置冲突
 */
export const STORAGE_VERSION = VERSION.split('.')[0]; // '8'

/**
 * 获取带版本前缀的存储键
 * @param key 原始键名
 * @returns 带版本前缀的键名
 */
export function getVersionedKey(key: string): string {
  return `acu_v${STORAGE_VERSION}_${key}`;
}
