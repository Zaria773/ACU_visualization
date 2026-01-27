export interface FortuneData {
  title: string;
  keywords: string[];
  message: string;
  luckyElement?: string;
}

export interface CardProps {
  isFlipped: boolean;
  onClick: () => void;
  data: FortuneData | null;
  loading: boolean;
}