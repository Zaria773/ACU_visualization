
export interface Fortune {
  luckLevel: string; // e.g., "The Stars Align", "Great Blessing"
  keywords: string[]; // e.g., ["Courage", "Silence", "Dawn"]
  message: string; // A poetic sentence
  element?: string; // e.g., Water, Fire (for decoration logic)
}
