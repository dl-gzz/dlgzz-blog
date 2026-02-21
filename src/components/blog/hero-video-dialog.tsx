'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Play, X } from 'lucide-react';

type AnimationStyle =
  | 'from-bottom'
  | 'from-center'
  | 'from-top'
  | 'from-left'
  | 'from-right'
  | 'fade'
  | 'top-in-bottom-out'
  | 'left-in-right-out';

interface HeroVideoDialogProps {
  animationStyle?: AnimationStyle;
  videoSrc: string;
  thumbnailSrc: string;
  thumbnailAlt?: string;
  className?: string;
}

export function HeroVideoDialog({
  animationStyle = 'from-center',
  videoSrc,
  thumbnailSrc,
  thumbnailAlt = 'Video thumbnail',
  className = '',
}: HeroVideoDialogProps) {
  const [isVideoOpen, setIsVideoOpen] = useState(false);

  const openVideo = () => setIsVideoOpen(true);
  const closeVideo = () => setIsVideoOpen(false);

  return (
    <div className={`relative ${className}`}>
      {/* Thumbnail */}
      <div
        className="group relative cursor-pointer overflow-hidden rounded-2xl"
        onClick={openVideo}
      >
        <img
          src={thumbnailSrc}
          alt={thumbnailAlt}
          className="w-full transition-transform duration-300 ease-out group-hover:scale-105"
        />

        {/* Play Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-all group-hover:bg-black/20">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/90 backdrop-blur-md transition-all group-hover:scale-110">
            <Play className="h-8 w-8 text-white" fill="white" />
          </div>
        </div>
      </div>

      {/* Video Dialog */}
      <AnimatePresence>
        {isVideoOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeVideo}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
            />

            {/* Video Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={closeVideo}
            >
              <div
                className="relative w-full max-w-4xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Close Button */}
                <button
                  onClick={closeVideo}
                  className="absolute -top-12 right-0 rounded-full bg-white/10 p-2 text-white backdrop-blur-md transition-colors hover:bg-white/20"
                >
                  <X className="h-6 w-6" />
                </button>

                {/* Video Iframe */}
                <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
                  <iframe
                    src={videoSrc}
                    className="h-full w-full"
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
