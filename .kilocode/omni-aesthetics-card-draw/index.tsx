import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { THEMES, POOL_DATA } from './constants';
import { ThemeId, CardData, ThemeConfig } from './types';
import { 
  Sparkles, Skull, Cpu, Ghost, Crown, Zap, 
  Dna, Star, Shield, Cross
} from 'lucide-react';

const ThemeIcons: Record<ThemeId, React.ElementType> = {
  pixel: Zap,
  horror: Skull,
  future: Cpu,
  ethereal: Sparkles,
  medieval: Crown
};

const CardBack = ({ theme }: { theme: ThemeConfig }) => {
  switch (theme.id) {
    case 'pixel':
      return (
        <div className={`w-full h-full card-back-pixel flex items-center justify-center ${theme.colors.text}`}>
          <div className="text-8xl animate-pulse">?</div>
        </div>
      );
    case 'horror':
      return (
        <div className="w-full h-full card-back-horror flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 flex justify-center items-center opacity-20">
            <div className="w-48 h-48 border-4 border-red-900 rounded-full flex items-center justify-center">
              <div className="w-36 h-36 border-2 border-red-900 rotate-45"></div>
            </div>
          </div>
          <div className="w-16 h-4/5 bg-yellow-600/20 border-x-2 border-yellow-800/40 flex flex-col items-center py-4">
             <div className="text-4xl text-red-800 font-bold talisman-text font-serif opacity-80">
               敕令封印
             </div>
          </div>
        </div>
      );
    case 'future':
      return (
        <div className="w-full h-full card-back-future flex flex-col items-center justify-center p-6">
          <div className="w-24 h-24 border-4 border-cyan-500/30 rounded-full flex items-center justify-center animate-spin-slow" style={{animationDuration: '10s'}}>
            <div className="w-16 h-16 border-t-4 border-cyan-400 rounded-full"></div>
          </div>
          <div className="mt-8 text-xs tracking-[0.3em] text-cyan-500/60 uppercase">System Locked</div>
          <div className="w-full h-1 bg-cyan-900/50 mt-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-cyan-400/50 w-1/2 animate-slide-x"></div>
          </div>
        </div>
      );
    case 'ethereal':
      return (
        <div className="w-full h-full card-back-ethereal flex items-center justify-center relative overflow-hidden">
           <div className="absolute top-0 -left-10 w-40 h-40 bg-purple-300/30 rounded-full mix-blend-multiply filter blur-xl animate-blob"></div>
           <div className="absolute top-0 -right-10 w-40 h-40 bg-indigo-300/30 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-2000"></div>
           <div className="absolute -bottom-8 left-20 w-40 h-40 bg-pink-300/30 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000"></div>
           <Star className="text-white w-16 h-16 animate-pulse" />
        </div>
      );
    case 'medieval':
      return (
        <div className="w-full h-full card-back-medieval flex items-center justify-center border-[12px] border-double border-amber-900/40">
           <div className="w-32 h-40 border-4 border-amber-700/60 flex items-center justify-center rotate-45 bg-stone-900">
              <Crown className="w-16 h-16 -rotate-45 text-amber-700" />
           </div>
        </div>
      );
    default:
      return <div className="bg-gray-800 w-full h-full"></div>;
  }
};

const CardFront = ({ data, theme }: { data: CardData | null, theme: ThemeConfig }) => {
  if (!data) return null;

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center p-6 text-center border-4 ${theme.colors.accent} ${theme.colors.cardFront} shadow-xl`}>
      <div className={`text-sm uppercase tracking-widest mb-4 opacity-70 ${theme.fontSecondary}`}>
        {data.rarity}
      </div>
      <h2 className={`text-3xl mb-4 ${theme.fontMain} ${theme.colors.text}`}>
        {data.title}
      </h2>
      <div className={`w-full h-px bg-current opacity-30 my-4`}></div>
      <p className={`text-lg opacity-90 leading-relaxed ${theme.fontSecondary}`}>
        {data.description}
      </p>
    </div>
  );
};

const App = () => {
  const [activeTheme, setActiveTheme] = useState<ThemeId>('pixel');
  const [isFlipping, setIsFlipping] = useState(false);
  const [showFront, setShowFront] = useState(false);
  const [currentCard, setCurrentCard] = useState<CardData | null>(null);
  
  const theme = THEMES[activeTheme];

  const handleDraw = () => {
    if (isFlipping) return;

    // 1. Start flip animation
    setIsFlipping(true);
    setShowFront(false);

    // 2. Select card
    const pool = POOL_DATA[activeTheme];
    const randomCard = pool[Math.floor(Math.random() * pool.length)];

    // 3. Wait for flip to halfway point to swap data, then finish
    setTimeout(() => {
      setCurrentCard(randomCard);
      setShowFront(true);
    }, 600); // Wait for the card to be perpendicular (90deg)

    // 4. Reset flip state
    setTimeout(() => {
      setIsFlipping(false);
    }, 1200);
  };

  const switchTheme = (id: ThemeId) => {
    setActiveTheme(id);
    setShowFront(false);
    setCurrentCard(null);
  };

  return (
    <div className={`min-h-screen w-full transition-colors duration-700 flex flex-col ${theme.containerClass} ${theme.fontMain}`}>
      
      {/* Background Effects */}
      {activeTheme === 'pixel' && <div className="fixed inset-0 scanlines z-10 pointer-events-none"></div>}
      {activeTheme === 'horror' && (
        <>
          <div className="fixed inset-0 grain z-10"></div>
          <div className="fixed inset-0 vignette z-20"></div>
        </>
      )}
      {activeTheme === 'future' && <div className="fixed inset-0 cyber-grid z-0"></div>}
      {activeTheme === 'medieval' && <div className="fixed inset-0 dust-overlay z-10"></div>}

      {/* Navigation */}
      <nav className="relative z-30 w-full p-4 md:p-6 flex justify-center items-center gap-4 flex-wrap">
        {Object.values(THEMES).map((t) => {
          const Icon = ThemeIcons[t.id];
          const isActive = activeTheme === t.id;
          return (
            <button
              key={t.id}
              onClick={() => switchTheme(t.id)}
              className={`
                flex items-center gap-2 px-4 py-2 transition-all duration-300
                ${isActive ? 'opacity-100 scale-110' : 'opacity-50 hover:opacity-80 hover:scale-105'}
                ${theme.id === 'pixel' ? 'rounded-none' : 'rounded-full'}
                ${isActive && theme.id === 'pixel' ? 'bg-green-900/50' : ''}
                ${isActive && theme.id === 'future' ? 'border border-cyan-500 bg-cyan-900/20' : ''}
              `}
            >
              <Icon size={18} />
              <span className={`hidden md:inline ${theme.fontSecondary} text-sm`}>{t.name}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center relative z-30 p-4 perspective-1000">
        
        {/* Card Container */}
        <div className="relative w-72 h-96 md:w-80 md:h-[28rem] mb-12 group cursor-pointer" onClick={handleDraw}>
          <div 
            className={`
              w-full h-full transition-transform duration-1000 preserve-3d
              ${showFront ? 'rotate-y-180' : ''}
              ${isFlipping && !showFront ? 'animate-shake' : ''} 
            `}
          >
            {/* Front of Card (The Back Design) */}
            <div className={`absolute inset-0 backface-hidden rounded-xl overflow-hidden shadow-2xl ${theme.colors.cardBack}`}>
              <CardBack theme={theme} />
            </div>

            {/* Back of Card (The Result) */}
            <div className={`absolute inset-0 backface-hidden rotate-y-180 rounded-xl overflow-hidden shadow-2xl bg-black`}>
              <CardFront data={currentCard} theme={theme} />
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleDraw}
          disabled={isFlipping}
          className={`
            px-12 py-4 text-xl font-bold min-w-[200px]
            ${theme.buttonClass}
            ${isFlipping ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {isFlipping ? '...' : 'DRAW'}
        </button>

        {/* Footer Hint */}
        <p className={`mt-8 text-sm opacity-50 ${theme.fontSecondary}`}>
          {activeTheme === 'pixel' && "INSERT COIN TO CONTINUE"}
          {activeTheme === 'horror' && "切勿回头..."}
          {activeTheme === 'future' && "WAITING FOR INPUT..."}
          {activeTheme === 'ethereal' && "Listen to the whispers..."}
          {activeTheme === 'medieval' && "Thy destiny awaits."}
        </p>

      </main>

      {/* Custom Styles Injection for specific React logic if needed */}
      <style>{`
        .animate-shake {
          animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }
        @keyframes shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }
        .animate-slide-x {
          animation: slideX 2s linear infinite;
        }
        @keyframes slideX {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
      `}</style>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}