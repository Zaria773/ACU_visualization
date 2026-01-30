/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 卡面主题注册表
 * 统一管理所有可用的卡面主题
 */

import type { CardTheme } from './types';

// 导入各主题的组件
import * as mystic from './mystic';
import * as wafuku from './wafuku';

/** 和风御札主题 */
const wafukuTheme: CardTheme = {
  id: 'wafuku',
  name: '和风御札',
  description: '传统日式御札风格，素雅淡黄纸质',
  defaultBackImage: 'https://i.postimg.cc/j2MPbGv3/IMG-1590.jpg',
  CardFront: wafuku.CardFront,
  CardBack: wafuku.CardBack,
};

/** 神秘塔罗主题 */
const mysticTheme: CardTheme = {
  id: 'mystic',
  name: '神秘塔罗',
  description: '西方塔罗风格，深蓝底金装饰',
  defaultBackImage: 'https://i.postimg.cc/rmY9D1fL/wei-xin-tu-pian-20260121220508-79-297.jpg',
  CardFront: mystic.CardFront,
  CardBack: mystic.CardBack,
};

/** 所有已注册主题 */
export const CARD_THEMES: Record<string, CardTheme> = {
  wafuku: wafukuTheme,
  mystic: mysticTheme,
};

/** 默认主题 ID */
export const DEFAULT_THEME_ID = 'wafuku';

/**
 * 获取主题，不存在则返回默认主题
 */
export function getTheme(id: string): CardTheme {
  return CARD_THEMES[id] || CARD_THEMES[DEFAULT_THEME_ID];
}

/**
 * 获取所有主题列表（用于设置面板）
 */
export function getAllThemes(): CardTheme[] {
  return Object.values(CARD_THEMES);
}

// 导出类型
export type { CardBackProps, CardFrontProps, CardTheme } from './types';
