/**
 * 懒加载视频包装器
 * 只在用户点击时才加载完整的视频组件
 */
'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { HeroVideoDialog } from './hero-video-dialog';

interface LazyVideoWrapperProps {
  videoSrc: string;
  thumbnailSrc: string;
  thumbnailAlt?: string;
  animationStyle?: 'from-bottom' | 'from-center' | 'from-top' | 'from-left' | 'from-right' | 'fade' | 'top-in-bottom-out' | 'left-in-right-out';
  className?: string;
}

/**
 * 按需加载策略:
 * 1. 初始只显示缩略图 + 播放按钮 (轻量级)
 * 2. 用户点击后才加载完整的视频播放器组件
 * 3. 节省初始加载时间和带宽
 */
export function LazyVideoWrapper({
  videoSrc,
  thumbnailSrc,
  thumbnailAlt = 'Video thumbnail',
  animationStyle = 'from-center',
  className = '',
}: LazyVideoWrapperProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  // 如果还没加载,显示轻量级预览
  if (!isLoaded) {
    return (
      <div className={`relative ${className}`}>
        <div
          className="group relative cursor-pointer overflow-hidden rounded-2xl"
          onClick={() => setIsLoaded(true)}
        >
          <img
            src={thumbnailSrc}
            alt={thumbnailAlt}
            className="w-full transition-transform duration-300 ease-out group-hover:scale-105"
            loading="lazy"
          />

          {/* 播放按钮覆盖层 */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-all group-hover:bg-black/20">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/90 backdrop-blur-md transition-all group-hover:scale-110">
              <Play className="h-8 w-8 text-white" fill="white" />
            </div>
          </div>

          {/* 提示文字 */}
          <div className="absolute bottom-4 left-4 right-4 text-center">
            <p className="text-sm text-white drop-shadow-lg">
              点击加载视频播放器
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 用户点击后才渲染完整组件
  return (
    <HeroVideoDialog
      videoSrc={videoSrc}
      thumbnailSrc={thumbnailSrc}
      thumbnailAlt={thumbnailAlt}
      animationStyle={animationStyle}
      className={className}
    />
  );
}
