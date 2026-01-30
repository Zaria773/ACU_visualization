export interface TarotReading {
  cardName: string;
  keywords: string[];
  meaning: string;
  guidance: string;
}

export enum AppState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  READY_TO_REVEAL = 'READY_TO_REVEAL',
  REVEALED = 'REVEALED',
  ERROR = 'ERROR'
}