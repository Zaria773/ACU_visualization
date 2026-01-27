import React, { useState, useEffect, useCallback } from 'react';
import Card from './components/Card';
import Background from './components/Background';
import { generateFortune } from './services/geminiService';
import { FortuneData } from './types';

const App: React.FC = () => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [fortune, setFortune] = useState<FortuneData | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Pre-load data or load on click? 
  // Strategy: Start loading on mount so it's ready, but handle loading state if user clicks too fast.
  const fetchFortune = useCallback(async () => {
    setLoading(true);
    const data = await generateFortune();
    setFortune(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Fetch initial fortune
    fetchFortune();
    setInitialized(true);
  }, [fetchFortune]);

  const handleCardClick = () => {
    if (!isFlipped) {
      setIsFlipped(true);
    }
  };

  const handleReset = () => {
    setIsFlipped(false);
    // Fetch a new one for the next draw after the card closes
    setTimeout(() => {
      setFortune(null);
      fetchFortune();
    }, 600); // Wait for half the flip animation duration
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-4 overflow-hidden font-sans selection:bg-amber-500/30">
      <Background />

      <div className="z-10 flex flex-col items-center space-y-12">
        
        {/* Header / Title */}
        <div className={`transition-opacity duration-1000 ${isFlipped ? 'opacity-80' : 'opacity-100'}`}>
          <h1 className="text-3xl md:text-5xl font-['Cinzel'] text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 via-amber-100 to-indigo-200 tracking-[0.2em] text-center drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
            MYSTIC FATE
          </h1>
          <p className="text-indigo-400/60 text-center text-xs md:text-sm mt-3 tracking-widest uppercase font-['Noto_Serif_SC']">
            探寻命运的指引
          </p>
        </div>

        {/* The Card Area */}
        <div className="relative">
           <Card 
             isFlipped={isFlipped} 
             onClick={handleCardClick} 
             data={fortune}
             loading={loading}
           />
           
           {/* Shadow beneath card for depth */}
           <div className={`absolute -bottom-12 left-1/2 -translate-x-1/2 w-48 h-12 bg-black/60 blur-xl rounded-full transition-all duration-1000 ${isFlipped ? 'scale-110 opacity-40' : 'scale-75 opacity-20'}`}></div>
        </div>

        {/* Controls */}
        <div className={`h-16 transition-all duration-700 ${isFlipped ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
          <button 
            onClick={handleReset}
            className="px-8 py-3 bg-gradient-to-r from-indigo-900 to-slate-900 border border-indigo-500/30 rounded-full text-indigo-100 font-['Cinzel'] tracking-widest hover:bg-indigo-800 hover:border-amber-400/50 hover:shadow-[0_0_20px_rgba(251,191,36,0.3)] transition-all active:scale-95"
          >
            DRAW AGAIN
          </button>
        </div>

      </div>
    </div>
  );
};

export default App;