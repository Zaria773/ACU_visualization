import React from 'react';

// A corner flourish inspired by the Art Nouveau style of the card back
export const CornerFlourish = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg viewBox="0 0 100 100" className={className} style={style} fill="currentColor">
    <path d="M5,5 L30,5 C40,5 45,10 45,20 L45,25 C45,35 35,35 35,45 L35,60 C35,70 25,80 15,80 L5,80 L5,5 Z" opacity="0.2" />
    <path d="M5,5 L50,5 C60,5 65,15 55,25 C45,35 30,30 30,50 L30,90 L5,90 L5,5 Z" stroke="currentColor" strokeWidth="2" fill="none" />
    <circle cx="15" cy="15" r="3" />
  </svg>
);

export const CenterDivider = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg viewBox="0 0 200 20" className={className} style={style} fill="none" stroke="currentColor">
    <line x1="0" y1="10" x2="80" y2="10" strokeWidth="1" />
    <circle cx="100" cy="10" r="4" fill="currentColor" />
    <circle cx="100" cy="10" r="8" strokeWidth="1" />
    <line x1="120" y1="10" x2="200" y2="10" strokeWidth="1" />
  </svg>
);
