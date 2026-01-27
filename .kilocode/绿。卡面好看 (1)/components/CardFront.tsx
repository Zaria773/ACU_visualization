
import React from 'react';
import { Fortune } from '../types';
import { CornerFlourish, CenterDivider } from './Decorations';
import { Sparkles, Moon, Sun, Cloud, Flame, Leaf } from 'lucide-react';

interface CardFrontProps {
  data: Fortune | null;
  loading: boolean;
}

const CardFront: React.FC<CardFrontProps> = ({ data, loading }) => {
  // Color palette extracted from the card back
  const colors = {
    teal: '#2C7A7B',   // The dominant border color
    gold: '#D69E2E',   // The ornate gold
    cream: '#F7F2E8',  // The paper background
    text: '#1A3638',   // Dark teal for text
  };

  const renderIcon = (element?: string) => {
    switch (element) {
      case 'Fire': return <Flame className="w-6 h-6 text-orange-800" />;
      case 'Water': return <Cloud className="w-6 h-6 text-blue-800" />;
      case 'Earth': return <Leaf className="w-6 h-6 text-green-800" />;
      case 'Air': return <Moon className="w-6 h-6 text-indigo-800" />;
      default: return <Sparkles className="w-6 h-6 text-yellow-800" />;
    }
  };

  if (loading) {
    return (
      <div 
        className="w-full h-full flex flex-col items-center justify-center p-6 border-4"
        style={{ backgroundColor: colors.cream, borderColor: colors.teal }}
      >
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: colors.gold, borderTopColor: 'transparent' }}></div>
          <span className="font-calligraphy text-xl tracking-widest" style={{ color: colors.text }}>
            命运占卜中...
          </span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div 
      className="w-full h-full relative overflow-hidden flex flex-col"
      style={{ backgroundColor: colors.cream }}
    >
      {/* --- BORDERS & FRAME --- */}
      <div className="absolute inset-2 border-[3px]" style={{ borderColor: colors.teal }}></div>
      <div className="absolute inset-4 border-[1px]" style={{ borderColor: colors.gold }}></div>
      
      <CornerFlourish className="absolute top-4 left-4 w-12 h-12" style={{ color: colors.teal }} />
      <CornerFlourish className="absolute top-4 right-4 w-12 h-12 rotate-90" style={{ color: colors.teal }} />
      <CornerFlourish className="absolute bottom-4 right-4 w-12 h-12 rotate-180" style={{ color: colors.teal }} />
      <CornerFlourish className="absolute bottom-4 left-4 w-12 h-12 -rotate-90" style={{ color: colors.teal }} />

      {/* --- CONTENT CONTAINER --- */}
      <div className="relative z-10 flex flex-col items-center h-full py-12 px-8 text-center">
        
        {/* HEADER: Element & Luck Level */}
        <div className="flex-none mt-2 animate-in fade-in slide-in-from-top-4 duration-700">
           <div className="mb-3 flex justify-center opacity-60">
            {renderIcon(data.element)}
          </div>
          <h2 
            className="font-calligraphy text-4xl leading-normal text-transparent bg-clip-text bg-gradient-to-b from-teal-900 to-teal-700"
            style={{ 
              textShadow: '0px 2px 0px rgba(214, 158, 46, 0.2)' 
            }}
          >
            {data.luckLevel}
          </h2>
        </div>

        {/* MIDDLE: Keywords (Vertical Layout for Chinese aesthetics) */}
        <div className="flex-1 flex flex-col items-center justify-center w-full my-4 animate-in fade-in zoom-in duration-1000 delay-300">
           
           <div className="flex items-center justify-center gap-6">
              {/* Vertical Dividers */}
              <div className="h-24 w-[1px] bg-gradient-to-b from-transparent via-[#D69E2E] to-transparent opacity-50"></div>
              
              {/* Keywords Container */}
              <div className="flex gap-6">
                {data.keywords.map((word, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-2 group">
                     <span 
                      className="writing-vertical font-serif text-lg font-bold tracking-[0.3em] text-[#1A3638]"
                    >
                      {word}
                    </span>
                    <div className="w-1 h-1 rounded-full bg-[#D69E2E] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </div>
                ))}
              </div>

              <div className="h-24 w-[1px] bg-gradient-to-b from-transparent via-[#D69E2E] to-transparent opacity-50"></div>
           </div>

        </div>

        {/* FOOTER: Message */}
        <div className="flex-none mb-4 w-full animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
          <CenterDivider className="w-full mb-4 opacity-40 text-[#2C7A7B]" />
          <p 
            className="text-lg font-serif leading-loose text-[#1A3638] font-medium"
          >
            {data.message}
          </p>
        </div>

      </div>
    </div>
  );
};

export default CardFront;
