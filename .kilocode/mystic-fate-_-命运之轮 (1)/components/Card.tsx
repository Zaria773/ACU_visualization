import React from 'react';
import { CardProps } from '../types';

const Card: React.FC<CardProps> = ({ isFlipped, onClick, data, loading }) => {
  
  // The provided back image URL
  const backImage = "https://i.postimg.cc/rmY9D1fL/wei-xin-tu-pian-20260121220508-79-297.jpg";

  return (
    <div className="relative w-[320px] h-[560px] perspective-1000 group">
      {/* Container for the flip motion */}
      <div
        onClick={!isFlipped ? onClick : undefined}
        className={`relative w-full h-full transition-all duration-1000 preserve-3d cursor-pointer ${
          isFlipped ? 'rotate-y-180' : 'animate-float hover:scale-105'
        }`}
        style={{ transformOrigin: 'center center' }}
      >
        
        {/* ================= CARD BACK ================= */}
        <div className="absolute inset-0 w-full h-full backface-hidden rounded-xl overflow-hidden shadow-2xl animate-glow">
          <img 
            src={backImage} 
            alt="Card Back" 
            className="w-full h-full object-cover"
          />
          {/* Subtle sheen overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/10 pointer-events-none" />
        </div>

        {/* ================= CARD FRONT ================= */}
        <div 
          className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 rounded-xl overflow-hidden shadow-[0_0_30px_rgba(199,210,254,0.3)] bg-[#0B1026]"
        >
          {/* --- Front Design Layers --- */}
          
          {/* 1. Base Texture/Gradient */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#1e293b] via-[#0f172a] to-[#020617]"></div>
          
          {/* 2. Main Border Frame (Gold) */}
          <div className="absolute inset-3 border-[1px] border-amber-500/30 rounded-lg"></div>
          <div className="absolute inset-4 border-[2px] border-amber-300/60 rounded-lg shadow-[0_0_15px_rgba(251,191,36,0.2)]"></div>

          {/* 3. Ornamental Corners (CSS implementation of Art Nouveau curves) */}
          <div className="absolute top-4 left-4 w-16 h-16 border-t-2 border-l-2 border-indigo-300/80 rounded-tl-2xl"></div>
          <div className="absolute top-4 right-4 w-16 h-16 border-t-2 border-r-2 border-indigo-300/80 rounded-tr-2xl"></div>
          <div className="absolute bottom-4 left-4 w-16 h-16 border-b-2 border-l-2 border-indigo-300/80 rounded-bl-2xl"></div>
          <div className="absolute bottom-4 right-4 w-16 h-16 border-b-2 border-r-2 border-indigo-300/80 rounded-br-2xl"></div>

          {/* 4. Inner Decorative Flourishes */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 w-32 h-32 opacity-20 bg-[radial-gradient(circle,rgba(251,191,36,0.4)_0%,transparent_70%)] blur-xl"></div>
          
          {/* --- Content Container --- */}
          <div className="absolute inset-0 flex flex-col items-center justify-between py-16 px-8 text-center z-10 font-serif">
            
            {/* Top: Decoration */}
            <div className="text-amber-200/80 mb-4">
               <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" className="opacity-80 drop-shadow-[0_0_5px_rgba(251,191,36,0.8)]">
                  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
               </svg>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center space-y-4 h-full">
                 <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                 <p className="text-indigo-200 text-sm tracking-widest animate-pulse">命运显现中...</p>
              </div>
            ) : data ? (
              <>
                {/* Title */}
                <div className="relative">
                  <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-400 font-['Noto_Serif_SC'] tracking-widest drop-shadow-md">
                    {data.title}
                  </h2>
                  <div className="w-16 h-[1px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent mx-auto mt-4"></div>
                </div>

                {/* Keywords */}
                <div className="flex flex-col gap-3 my-6">
                   {data.keywords.map((kw, idx) => (
                     <span key={idx} className="text-indigo-200 text-sm tracking-[0.2em] font-['Noto_Serif_SC'] uppercase border border-indigo-500/30 px-3 py-1 rounded-full bg-indigo-950/30 backdrop-blur-sm">
                       {kw}
                     </span>
                   ))}
                </div>

                {/* Main Message */}
                <div className="relative p-4 border-t border-b border-amber-500/20 bg-black/20">
                   <p className="text-lg text-amber-50 leading-relaxed font-['Noto_Serif_SC'] italic opacity-90">
                     “ {data.message} ”
                   </p>
                </div>

                {/* Footer / Lucky Element */}
                <div className="mt-auto pt-6">
                  <p className="text-xs text-indigo-300 uppercase tracking-widest mb-1">Lucky Element</p>
                  <p className="text-amber-200 font-['Cinzel']">{data.luckyElement}</p>
                </div>
              </>
            ) : null}

             {/* Bottom Decoration */}
            <div className="text-amber-200/50 mt-4 transform rotate-180">
               <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
               </svg>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Card;