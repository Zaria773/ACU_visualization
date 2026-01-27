import React from 'react';
import { motion } from 'framer-motion';
import { CardBack } from './CardBack';
import { CardFront } from './CardFront';
import { TarotReading } from '../types';

interface TarotCardProps {
  isFlipped: boolean;
  onFlip: () => void;
  data: TarotReading | null;
  isVisible: boolean;
}

export const TarotCard: React.FC<TarotCardProps> = ({ isFlipped, onFlip, data, isVisible }) => {
  return (
    <div className="relative w-[320px] h-[560px] cursor-pointer perspective-1000" onClick={onFlip}>
      <motion.div
        className="w-full h-full relative transform-style-3d"
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ 
          opacity: isVisible ? 1 : 0, 
          y: isVisible ? 0 : 50,
          scale: isVisible ? 1 : 0.9,
          rotateY: isFlipped ? 180 : 0
        }}
        transition={{ 
          opacity: { duration: 0.8 },
          y: { duration: 0.8, type: "spring" },
          rotateY: { duration: 0.8, ease: "easeInOut" }
        }}
      >
        {/* Front of card (The Back Image initially) */}
        <div 
          className="absolute inset-0 backface-hidden w-full h-full"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Floating animation wrapper for the idle state */}
          <motion.div
            className="w-full h-full"
            animate={{ y: isFlipped ? 0 : [0, -10, 0] }}
            transition={{ 
              repeat: Infinity, 
              duration: 4, 
              ease: "easeInOut",
              repeatType: "mirror" 
            }}
          >
             <CardBack />
          </motion.div>
        </div>

        {/* Back of card (The Reveal) */}
        <div 
          className="absolute inset-0 w-full h-full backface-hidden rotate-y-180"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
           {data && <CardFront data={data} />}
        </div>
      </motion.div>
    </div>
  );
};