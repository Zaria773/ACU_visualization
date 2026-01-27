import React from 'react';
import { TarotReading } from '../types';
import { Star, Moon, Sun, Sparkles } from 'lucide-react';

interface CardFrontProps {
  data: TarotReading;
}

export const CardFront: React.FC<CardFrontProps> = ({ data }) => {
  return (
    <div className="w-full h-full bg-tarot-paper relative rounded-xl overflow-hidden shadow-2xl flex flex-col items-center justify-between p-6 border-[6px] border-tarot-ink">
      
      {/* Texture Overlay */}
      <div className="absolute inset-0 bg-grain opacity-20 pointer-events-none z-0 mix-blend-multiply"></div>
      
      {/* Decorative Border Frame inside */}
      <div className="absolute inset-3 border border-tarot-gold rounded-lg pointer-events-none z-10"></div>
      <div className="absolute inset-4 border border-tarot-accent/30 rounded-md pointer-events-none z-10"></div>

      {/* Corner Ornaments (SVG) */}
      <CornerOrnament className="absolute top-3 left-3 w-12 h-12 text-tarot-gold z-10" />
      <CornerOrnament className="absolute top-3 right-3 w-12 h-12 text-tarot-gold transform scale-x-[-1] z-10" />
      <CornerOrnament className="absolute bottom-3 left-3 w-12 h-12 text-tarot-gold transform scale-y-[-1] z-10" />
      <CornerOrnament className="absolute bottom-3 right-3 w-12 h-12 text-tarot-gold transform scale-[-1] z-10" />

      {/* Content Container */}
      <div className="relative z-20 flex flex-col items-center h-full w-full">
        
        {/* Top Icon */}
        <div className="mt-8 mb-4 text-tarot-accent animate-pulse">
           <Sparkles size={32} strokeWidth={1.5} />
        </div>

        {/* Card Title */}
        <h2 className="font-heading text-2xl md:text-3xl text-tarot-ink font-bold text-center tracking-wider uppercase border-b-2 border-tarot-gold pb-2 mb-6 w-3/4">
          {data.cardName}
        </h2>

        {/* Center Illustration Area (Abstract representation) */}
        <div className="flex-grow flex flex-col items-center justify-center w-full my-2">
            <div className="grid grid-cols-1 gap-3 w-full px-4">
              {data.keywords.map((keyword, idx) => (
                <div key={idx} className="flex items-center justify-center">
                  <span className="h-[1px] bg-tarot-gold/50 w-8 mx-2"></span>
                  <span className="font-heading text-tarot-accent text-sm tracking-[0.2em] uppercase">{keyword}</span>
                  <span className="h-[1px] bg-tarot-gold/50 w-8 mx-2"></span>
                </div>
              ))}
            </div>
            
            <div className="mt-8 px-2 text-center">
              <p className="font-body text-tarot-dark text-lg md:text-xl leading-relaxed italic">
                "{data.meaning}"
              </p>
            </div>
        </div>

        {/* Bottom Guidance */}
        <div className="mb-8 w-full bg-tarot-ink/5 p-4 rounded-lg border border-tarot-gold/30">
          <div className="flex justify-center mb-2 text-tarot-gold">
            <Sun size={16} />
          </div>
          <p className="font-heading text-tarot-dark text-xs md:text-sm text-center uppercase tracking-widest font-bold">
            Guidance
          </p>
          <p className="font-body text-tarot-ink text-center mt-1 text-lg">
            {data.guidance}
          </p>
        </div>

      </div>
    </div>
  );
};

const CornerOrnament: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} fill="currentColor">
    <path d="M0,0 L40,0 C20,0 10,10 10,30 L10,0 Z" opacity="0.5"/>
    <path d="M5,5 L95,5 L95,20 C70,20 20,70 20,95 L5,95 Z" />
    <circle cx="15" cy="15" r="3" fill="#8B5E3C" />
  </svg>
);