import React, { useState, useEffect, useMemo } from 'react';
import { generateTarotReading } from './services/geminiService';
import { TarotCard } from './components/TarotCard';
import { AppState, TarotReading } from './types';
import { Sparkles, Loader2, Star } from 'lucide-react';
import { motion } from 'framer-motion';

// Helper to generate random stars
const generateStars = (count: number) => {
  return Array.from({ length: count }).map((_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: Math.random() * 2 + 1,
    delay: Math.random() * 5,
    duration: Math.random() * 3 + 2,
  }));
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [reading, setReading] = useState<TarotReading | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);

  const stars = useMemo(() => generateStars(50), []);

  const handleDrawCard = async () => {
    setAppState(AppState.GENERATING);
    try {
      const data = await generateTarotReading();
      setReading(data);
      setAppState(AppState.READY_TO_REVEAL);
    } catch (error) {
      console.error("Failed to generate reading", error);
      setAppState(AppState.ERROR);
    }
  };

  const handleCardClick = () => {
    if (appState === AppState.READY_TO_REVEAL) {
      setIsFlipped(true);
      setAppState(AppState.REVEALED);
    }
  };

  const reset = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setAppState(AppState.IDLE);
      setReading(null);
    }, 500);
  };

  return (
    <div className="min-h-screen w-full relative flex flex-col items-center justify-center p-6 overflow-hidden bg-mystic-gradient">

      {/* --- LAYER 1: 动态星空 (Dynamic Starfield) --- */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {stars.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full bg-[#F5E6D3]"
            style={{
              left: star.left,
              top: star.top,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: 0.6,
              animation: `twinkle ${star.duration}s ease-in-out infinite`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}
      </div>

      {/* --- LAYER 2: 流动星云 (Flowing Nebula) --- */}
      {/* Deep Purple/Blue Drift */}
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#3d2b4a] rounded-full blur-[100px] z-0 opacity-30 mix-blend-screen"
      ></motion.div>

      {/* Golden Warmth Drift */}
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.3, 0.1], x: [0, 50, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] bg-[#4a3728] rounded-full blur-[120px] z-0 opacity-20 mix-blend-screen"
      ></motion.div>

      {/* Central Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] bg-gradient-radial from-[#C6A664]/10 to-transparent blur-3xl z-0 pointer-events-none"></div>

      {/* --- LAYER 3: 噪点纹理 (Texture) --- */}
      <div className="absolute inset-0 bg-grain opacity-15 mix-blend-overlay z-0 pointer-events-none"></div>

      {/* --- LAYER 4: 神圣几何 (Sacred Geometry) --- */}
      {/* Outer Ring */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140vmin] h-[140vmin] opacity-[0.15] pointer-events-none z-0">
        <div className="w-full h-full animate-spin-slow">
          <svg viewBox="0 0 100 100" fill="none" stroke="#D4AF37" strokeWidth="0.05">
            <circle cx="50" cy="50" r="48" />
            <path d="M50 0 L93 75 L6 75 Z" opacity="0.5" />
            <path d="M50 100 L93 25 L6 25 Z" opacity="0.5" />
          </svg>
        </div>
      </div>

      {/* Inner Intricate Ring */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vmin] h-[90vmin] opacity-[0.1] pointer-events-none z-0">
        <div className="w-full h-full animate-reverse-spin">
          <svg viewBox="0 0 100 100" fill="none" stroke="#C6A664" strokeWidth="0.1">
            <circle cx="50" cy="50" r="45" strokeDasharray="2 1" />
            <circle cx="50" cy="50" r="30" />
            <rect x="29" y="29" width="42" height="42" transform="rotate(45 50 50)" />
            <rect x="29" y="29" width="42" height="42" transform="rotate(0 50 50)" />
          </svg>
        </div>
      </div>

      {/* --- LAYER 5: 屏幕装饰边框 (Ornamental Frame) --- */}
      <div className="fixed inset-0 pointer-events-none z-50 p-4 md:p-6 border-[1px] border-[#D4AF37]/20 m-2 md:m-4 rounded-lg">
        {/* Top Left */}
        <div className="absolute top-0 left-0 w-32 h-32 border-l-2 border-t-2 border-[#D4AF37]/60 rounded-tl-3xl"></div>
        <div className="absolute top-2 left-2 w-4 h-4 border-l border-t border-[#D4AF37] rounded-tl-lg"></div>

        {/* Top Right */}
        <div className="absolute top-0 right-0 w-32 h-32 border-r-2 border-t-2 border-[#D4AF37]/60 rounded-tr-3xl"></div>
        <div className="absolute top-2 right-2 w-4 h-4 border-r border-t border-[#D4AF37] rounded-tr-lg"></div>

        {/* Bottom Left */}
        <div className="absolute bottom-0 left-0 w-32 h-32 border-l-2 border-b-2 border-[#D4AF37]/60 rounded-bl-3xl"></div>

        {/* Bottom Right */}
        <div className="absolute bottom-0 right-0 w-32 h-32 border-r-2 border-b-2 border-[#D4AF37]/60 rounded-br-3xl"></div>

        {/* Decorative Top Center Element */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-[1px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent opacity-80"></div>
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[#D4AF37]/60">
          <Star size={12} fill="#D4AF37" />
        </div>

        {/* Decorative Bottom Center Element */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-[1px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent opacity-80"></div>
      </div>


      {/* --- UI CONTENT --- */}
      <div className="relative z-20 w-full flex flex-col items-center max-w-5xl mx-auto min-h-[80vh] justify-between py-10">

        {/* Header Section - Floating Animation */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1 }}
          className="text-center"
        >
          <div className="inline-flex flex-col items-center">
            <h1 className="font-heading text-5xl md:text-7xl text-transparent bg-clip-text bg-gradient-to-b from-[#F9F2E6] via-[#D4AF37] to-[#8B5E3C] drop-shadow-[0_0_15px_rgba(212,175,55,0.4)] tracking-widest relative">
              神秘塔罗
              {/* Subtle Glint */}
              <span className="absolute -top-4 -right-6 text-[#F9F2E6] opacity-60 animate-twinkle">
                <Sparkles size={24} />
              </span>
            </h1>
            <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent mt-2 opacity-50"></div>
            <p className="font-body text-[#C6A664] text-xl tracking-[0.4em] uppercase mt-4 text-shadow-glow">
              Destiny Awaits
            </p>
          </div>
        </motion.div>

        {/* Center Stage */}
        <div className="flex-grow flex flex-col items-center justify-center w-full my-10">

          {/* Action Button: Start */}
          {appState === AppState.IDLE && (
            <motion.button
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDrawCard}
              className="group relative px-12 py-6 bg-transparent overflow-hidden"
            >
              {/* Button Border / Background */}
              <div className="absolute inset-0 border border-[#D4AF37] bg-[#1a0f0e]/60 backdrop-blur-sm transform skew-x-[-10deg] group-hover:bg-[#D4AF37]/10 transition-colors duration-500"></div>

              {/* Glowing effects */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 shadow-[0_0_30px_rgba(212,175,55,0.3)]"></div>

              {/* Text */}
              <span className="relative flex items-center gap-4 text-[#D4AF37] font-heading text-2xl tracking-[0.2em] group-hover:text-[#F9F2E6] transition-colors">
                <span className="w-8 h-[1px] bg-[#D4AF37] group-hover:w-12 transition-all"></span>
                开启占卜
                <span className="w-8 h-[1px] bg-[#D4AF37] group-hover:w-12 transition-all"></span>
              </span>
            </motion.button>
          )}

          {/* Action: Generating */}
          {appState === AppState.GENERATING && (
            <div className="relative">
              <div className="absolute inset-0 bg-[#D4AF37]/20 blur-xl rounded-full"></div>
              <div className="relative flex flex-col items-center justify-center p-8 border border-[#D4AF37]/30 bg-[#0F0A08]/80 backdrop-blur-md rounded-2xl">
                <Loader2 className="w-12 h-12 text-[#D4AF37] animate-spin mb-4" />
                <p className="font-heading text-[#F5E6D3] tracking-widest text-xl animate-pulse">
                  聆听神谕...
                </p>
              </div>
            </div>
          )}

          {/* Action: Revealed Card */}
          {(appState === AppState.READY_TO_REVEAL || appState === AppState.REVEALED) && (
            <div className="relative z-30">
              <TarotCard
                isFlipped={isFlipped}
                onFlip={handleCardClick}
                data={reading}
                isVisible={true}
              />

              {/* Floating Instruction */}
              {!isFlipped && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute -bottom-16 left-0 right-0 text-center"
                >
                  <p className="text-[#F5E6D3] font-heading text-lg tracking-widest drop-shadow-md animate-bounce">
                    点击卡牌
                  </p>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="h-16 flex items-center justify-center">
          {isFlipped && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={reset}
              className="px-8 py-3 text-[#D4AF37] hover:text-[#F9F2E6] hover:bg-[#D4AF37]/20 font-heading text-sm uppercase tracking-widest border border-[#D4AF37]/40 hover:border-[#D4AF37] rounded transition-all duration-300 backdrop-blur-sm"
            >
              再次占卜
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
