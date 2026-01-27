
import React, { useState } from 'react';
import CardFront from './CardFront';
import { Fortune } from '../types';
import { generateFortune } from '../services/geminiService';

const CARD_BACK_URL = "https://i.postimg.cc/qqPvqcjY/wei-xin-tu-pian-20260121204448-74-297.jpg";

const Card: React.FC = () => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fortune, setFortune] = useState<Fortune | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  const handleClick = async () => {
    if (isFlipped || loading) return; 

    setLoading(true);
    setIsFlipped(true);

    const data = await generateFortune();
    setFortune(data);
    setLoading(false);
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center perspective-1000">
      <div 
        className={`
          relative w-[300px] h-[510px] sm:w-[350px] sm:h-[595px] 
          cursor-pointer transition-transform duration-1000 transform-style-3d
          ${!isFlipped ? 'animate-float hover:scale-105' : ''}
          ${isFlipped ? 'rotate-y-180' : ''}
        `}
        onClick={handleClick}
      >
        {/* --- FRONT FACE (Revealed state) --- */}
        <div 
          className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 rounded-xl shadow-2xl overflow-hidden"
          style={{ 
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          }}
        >
          <CardFront data={fortune} loading={loading} />
        </div>

        {/* --- BACK FACE (Initial State) --- */}
        <div 
          className="absolute inset-0 w-full h-full backface-hidden rounded-xl overflow-hidden shadow-2xl"
          style={{ 
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            backgroundColor: '#2A6F6F' // Fallback color while loading
          }}
        >
           {/* Placeholder Decoration while loading */}
           <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${isImageLoaded ? 'opacity-0' : 'opacity-100'}`}>
              <div className="w-full h-full border-4 border-[#D4A056] m-2 rounded-lg opacity-30"></div>
           </div>

          <img 
            src={CARD_BACK_URL} 
            alt="Tarot Card Back" 
            className={`w-full h-full object-cover transition-opacity duration-700 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setIsImageLoaded(true)}
          />
          
          <div className="absolute inset-0 bg-black/10 mix-blend-overlay"></div>
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
        </div>
      </div>
    </div>
  );
};

export default Card;
