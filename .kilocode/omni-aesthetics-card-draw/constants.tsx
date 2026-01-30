import React from 'react';
import { ThemeConfig, CardData } from './types';
import { 
  Ghost, Cpu, Crown, Sparkles, Gamepad2, 
  Skull, Zap, Feather, Sword, Crosshair 
} from 'lucide-react';

export const THEMES: Record<string, ThemeConfig> = {
  pixel: {
    id: 'pixel',
    name: '8-BIT 像素',
    fontMain: 'font-["Press_Start_2P"]',
    fontSecondary: 'font-mono',
    colors: {
      bg: 'bg-zinc-900',
      text: 'text-green-400',
      accent: 'border-green-500',
      cardBack: 'bg-zinc-800',
      cardFront: 'bg-zinc-900',
    },
    containerClass: 'bg-zinc-950 text-green-400 selection:bg-green-500 selection:text-black',
    buttonClass: 'border-4 border-green-600 bg-black hover:bg-green-900 active:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,180,0,1)] transition-none uppercase tracking-widest',
  },
  horror: {
    id: 'horror',
    name: '中式恐怖',
    fontMain: 'font-["Ma_Shan_Zheng"]',
    fontSecondary: 'font-["Noto_Serif_SC"]',
    colors: {
      bg: 'bg-[#1a0505]',
      text: 'text-red-100',
      accent: 'border-red-900',
      cardBack: 'bg-[#2b0a0a]',
      cardFront: 'bg-[#e3d0b1]',
    },
    containerClass: 'bg-[#1a0505] text-stone-300 relative overflow-hidden',
    buttonClass: 'border border-red-900 bg-[#2b0a0a] text-red-500 tracking-[0.2em] hover:bg-red-950 hover:shadow-[0_0_15px_rgba(255,0,0,0.4)] transition-all duration-500',
  },
  future: {
    id: 'future',
    name: '赛博未来',
    fontMain: 'font-["Orbitron"]',
    fontSecondary: 'font-sans',
    colors: {
      bg: 'bg-slate-950',
      text: 'text-cyan-400',
      accent: 'border-cyan-500',
      cardBack: 'bg-slate-900',
      cardFront: 'bg-slate-900/90',
    },
    containerClass: 'bg-slate-950 text-cyan-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-black to-black',
    buttonClass: 'border border-cyan-500/50 bg-cyan-950/20 backdrop-blur-md text-cyan-400 hover:bg-cyan-500 hover:text-black shadow-[0_0_20px_rgba(6,182,212,0.3)] uppercase tracking-widest clip-path-polygon',
  },
  ethereal: {
    id: 'ethereal',
    name: '空灵梦境',
    fontMain: 'font-["Cormorant_Garamond"]',
    fontSecondary: 'font-serif',
    colors: {
      bg: 'bg-indigo-50',
      text: 'text-indigo-900',
      accent: 'border-indigo-200',
      cardBack: 'bg-white',
      cardFront: 'bg-white/60',
    },
    containerClass: 'bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 text-slate-600',
    buttonClass: 'rounded-full border border-white/50 bg-white/30 backdrop-blur-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-700 text-indigo-900 font-italic tracking-wider',
  },
  medieval: {
    id: 'medieval',
    name: '暗黑中世纪',
    fontMain: 'font-["Cinzel_Decorative"]',
    fontSecondary: 'font-serif',
    colors: {
      bg: 'bg-stone-900',
      text: 'text-amber-500',
      accent: 'border-amber-700',
      cardBack: 'bg-stone-800',
      cardFront: 'bg-[#d4c5a3]',
    },
    containerClass: 'bg-stone-950 text-amber-500',
    buttonClass: 'border-2 border-amber-700/50 bg-stone-900 text-amber-500 hover:border-amber-500 hover:text-amber-300 shadow-[0_4px_20px_-5px_rgba(0,0,0,0.8)] transition-all uppercase tracking-widest',
  },
};

export const POOL_DATA: Record<string, CardData[]> = {
  pixel: [
    { id: 'p1', title: '光剑', description: '一把嗡嗡作响的等离子剑。', rarity: 'Rare' },
    { id: 'p2', title: '能量饮料', description: '恢复 50% 的HP。', rarity: 'Common' },
    { id: 'p3', title: '故障之神', description: '代码中的幽灵。', rarity: 'Legendary' },
    { id: 'p4', title: '软盘', description: '包含失落的秘密。', rarity: 'Common' },
  ],
  horror: [
    { id: 'h1', title: '镇尸符', description: '贴在额头可定身。', rarity: 'Common' },
    { id: 'h2', title: '绣花鞋', description: '深夜里独自走动的鞋。', rarity: 'Rare' },
    { id: 'h3', title: '千年古尸', description: '它在呼吸...', rarity: 'Legendary' },
    { id: 'h4', title: '红嫁衣', description: '虽然美丽，但充满了怨气。', rarity: 'Mythic' },
  ],
  future: [
    { id: 'f1', title: '神经植入体', description: '增强你的反应速度。', rarity: 'Rare' },
    { id: 'f2', title: '全息伴侣', description: '永远不会背叛你。', rarity: 'Common' },
    { id: 'f3', title: '反物质核心', description: '足以摧毁一个星系。', rarity: 'Legendary' },
    { id: 'f4', title: '量子密钥', description: '解锁任何数字门锁。', rarity: 'Common' },
  ],
  ethereal: [
    { id: 'e1', title: '云端碎片', description: '触感像丝绸一样的空气。', rarity: 'Common' },
    { id: 'e2', title: '独角兽之泪', description: '能够治愈破碎的心灵。', rarity: 'Legendary' },
    { id: 'e3', title: '迷失的梦', description: '一段不属于你的记忆。', rarity: 'Rare' },
    { id: 'e4', title: '星尘', description: '宇宙的余烬。', rarity: 'Common' },
  ],
  medieval: [
    { id: 'm1', title: '圣杯', description: '永生的承诺。', rarity: 'Mythic' },
    { id: 'm2', title: '生锈的长剑', description: '一位无名骑士的遗物。', rarity: 'Common' },
    { id: 'm3', title: '龙鳞盾', description: '坚不可摧的防御。', rarity: 'Legendary' },
    { id: 'm4', title: '被诅咒的王冠', description: '沉重的权力代价。', rarity: 'Rare' },
  ],
};