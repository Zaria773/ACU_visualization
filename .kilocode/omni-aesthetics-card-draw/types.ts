export type ThemeId = 'pixel' | 'horror' | 'future' | 'ethereal' | 'medieval';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  fontMain: string;
  fontSecondary: string;
  colors: {
    bg: string;
    text: string;
    accent: string;
    cardBack: string;
    cardFront: string;
  };
  containerClass: string;
  buttonClass: string;
}

export interface CardData {
  id: string;
  title: string;
  description: string;
  rarity: 'Common' | 'Rare' | 'Legendary' | 'Mythic';
  visualElement?: string; // Could be an emoji or icon name (handled dynamically)
}

export interface DrawResult {
  card: CardData;
  timestamp: number;
}
