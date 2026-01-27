
import React from 'react';
import Card from './components/Card';
import { Sparkles } from 'lucide-react';

const App: React.FC = () => {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center overflow-hidden relative bg-[#0f1c1e]">
      
      {/* Background Ambient Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#2C7A7B] opacity-20 blur-[120px] rounded-full"></div>
        
        <div className="absolute top-10 left-10 w-2 h-2 bg-[#D69E2E] rounded-full opacity-40 animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-3 h-3 bg-[#D69E2E] rounded-full opacity-30 animate-pulse delay-700"></div>
        <div className="absolute top-1/3 right-10 w-1 h-1 bg-white rounded-full opacity-50 animate-pulse delay-300"></div>
      </div>

      <header className="absolute top-8 z-10 text-center animate-deal">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="text-[#D69E2E] w-5 h-5" />
          <h1 className="font-calligraphy text-[#F7F2E8] text-4xl tracking-widest">
            灵感 · 塔罗
          </h1>
          <Sparkles className="text-[#D69E2E] w-5 h-5" />
        </div>
        <p className="text-[#2C7A7B] font-serif text-sm tracking-[0.3em] opacity-80 mt-2">
          触碰卡牌 · 揭示命运
        </p>
      </header>

      <main className="z-10 animate-deal" style={{ animationDelay: '0.2s' }}>
        <Card />
      </main>

      <footer className="absolute bottom-4 text-[#2C7A7B] text-xs font-serif opacity-40 tracking-wider">
        AI 生成内容 · 仅供娱乐
      </footer>
    </div>
  );
};

export default App;
