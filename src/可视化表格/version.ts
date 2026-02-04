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
export const VERSION = '8.2.2';

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
