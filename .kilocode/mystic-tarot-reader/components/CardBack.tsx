import React from 'react';

export const CardBack: React.FC = () => {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-2xl border-[6px] border-[#4A3222] relative">
      <img 
        src="https://i.postimg.cc/j2MPbGv3/IMG-1590.jpg" 
        alt="Tarot Card Back" 
        className="w-full h-full object-cover"
      />
      {/* Subtle overlay to blend border */}
      <div className="absolute inset-0 border-[2px] border-[#8B5E3C]/50 rounded-lg pointer-events-none"></div>
    </div>
  );
};