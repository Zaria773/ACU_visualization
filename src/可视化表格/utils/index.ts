/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 工具函数统一导出
 * 工具函数导出索引
 */
import type { RawDatabaseData } from '../types';

// 关系图相关导出
export * from './relationshipColors';
export * from './relationshipParser';

// 图片上传和颜色工具
export * from './imageUpload';

// 选项解析工具
export * from './optionParser';

/**
 * 获取核心依赖 (jQuery 和数据库 API)
 */
export function getCore() {
  const w = window.parent || window;
  return {
    $: (window as any).jQuery || (w as any).jQuery,
    getDB: () => (w as any).AutoCardUpdaterAPI || (window as any).AutoCardUpdaterAPI,
  };
}

/**
 * 获取表格数据 (API 封装)
 */
export function getTableData(): RawDatabaseData | null {
  const api = getCore().getDB();
  try {
    return api && api.exportTableAsJson ? api.exportTableAsJson() : null;
  } catch (e) {
    console.warn('[ACU] getTableData error:', e);
    return null;
  }
}

/**
 * 处理 JSON 数据
 * 将原始对象转换为可迭代的表格结构
 * 注意：与原代码保持一致，仅处理有 name 属性的 sheet
 */
export function processJsonData(data: any): Record<string, { key: string; headers: any[]; rows: any[][] }> | null {
  if (!data || typeof data !== 'object') return {};
  const tables: Record<string, { key: string; headers: any[]; rows: any[][] }> = {};
  for (const sheetId in data) {
    // 原代码逻辑：仅处理有 name 属性的 sheet
    if (data[sheetId]?.name) {
      const sheet = data[sheetId];
      tables[sheet.name] = {
        key: sheetId, // 保留原始 Key 用于保存
        headers: sheet.content?.[0] || [],
        rows: sheet.content?.slice(1) || [],
      };
    }
  }
  // 原代码逻辑：如果没有有效表格则返回 null
  return Object.keys(tables).length > 0 ? tables : null;
}

/**
 * 获取表格图标
 */
export function getIconForTableName(name: string): string {
  if (name.includes('仪表盘')) return 'fa-tachometer-alt';
  if (name.includes('选项')) return 'fa-list-check';
  if (name.includes('主角') || name.includes('属性')) return 'fa-user-circle';
  if (name.includes('关系') || name.includes('好感') || name.includes('NPC')) return 'fa-users';
  if (name.includes('任务') || name.includes('日志')) return 'fa-tasks';
  if (name.includes('物品') || name.includes('背包') || name.includes('装备')) return 'fa-box-open';
  if (name.includes('技能') || name.includes('能力')) return 'fa-bolt';
  if (name.includes('地点') || name.includes('位置')) return 'fa-map-marked-alt';
  if (name.includes('总结') || name.includes('大纲')) return 'fa-book';
  return 'fa-table';
}

/**
 * 获取徽章样式
 * 根据单元格内容返回对应的 class
 */
export function getBadgeStyle(text: string): string {
  if (!text) return '';
  const str = String(text);
  if (str === 'True' || str === 'Yes' || str === '完成' || str === '已完成') return 'acu-badge-success';
  if (str === 'False' || str === 'No' || str === '失败' || str === '未完成') return 'acu-badge-danger';
  if (str === '进行中' || str === 'Doing') return 'acu-badge-warning';
  if (/^\d+%$/.test(str)) return 'acu-badge-info'; // 百分比
  if (/^Lv\.?\d+$/i.test(str)) return 'acu-badge-primary'; // 等级
  return '';
}
