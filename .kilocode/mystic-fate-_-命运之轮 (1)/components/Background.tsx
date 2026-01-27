import React from 'react';

const Background: React.FC = () => {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[#050b14]">
       {/* Gradient Spotlights */}
       <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-900/20 rounded-full blur-[100px]"></div>
       <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-amber-900/10 rounded-full blur-[120px]"></div>
       
       {/* Stars (Static for performance, could use canvas for more) */}
       <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-white rounded-full opacity-60 animate-pulse"></div>
       <div className="absolute top-1/3 right-1/4 w-1.5 h-1.5 bg-amber-200 rounded-full opacity-40 animate-pulse delay-75"></div>
       <div className="absolute bottom-1/4 left-1/3 w-1 h-1 bg-indigo-200 rounded-full opacity-50 animate-pulse delay-150"></div>
       <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full opacity-30"></div>
       <div className="absolute top-[10%] right-[10%] w-2 h-2 bg-indigo-300 rounded-full opacity-20 blur-[1px]"></div>
       
       {/* Dust / Noise Overlay */}
       <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 brightness-150 contrast-150"></div>
    </div>
  );
};

export default Background;