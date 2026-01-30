/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * 卡面主题系统类型定义
 */

import type { Component, DefineComponent } from 'vue';

/** CardFront 组件统一 Props */
export interface CardFrontProps {
  /** 运势名称 */
  luckName: string;
  /** 运势颜色 */
  luckColor?: string;
  /** 维度值列表 */
  dimensions?: string[];
  /** 关键词列表 */
  words: string[];
}

/** CardBack 组件统一 Props */
export interface CardBackProps {
  /** 卡背图片 URL */
  imageUrl?: string;
}

/** CardBack 组件 Emits */
export interface CardBackEmits {
  (e: 'load', aspectRatio: number): void;
}

/** 卡面主题定义 */
export interface CardTheme {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 预览图 URL（用于设置面板） */
  previewImage?: string;
  /** 默认卡背图 URL */
  defaultBackImage?: string;
  /** 牌面组件 */
  CardFront: Component | DefineComponent<CardFrontProps>;
  /** 牌背组件 */
  CardBack: Component | DefineComponent<CardBackProps>;
}
