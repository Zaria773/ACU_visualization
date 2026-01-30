/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// 抽签系统类型定义

export interface CardDisplayData {
  /** 运势名称，如"大吉" */
  luckName: string;
  /** 运势颜色，如"#ffd700" */
  luckColor: string;
  /** 抽到的维度值列表（仅展示值，如"未来"、"森林"） */
  dimensions: string[];
  /** 抽到的随机词列表 */
  words: string[];
}
