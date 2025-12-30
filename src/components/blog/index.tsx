/**
 * 博客组件统一导出
 * 使用动态导入优化性能
 */
'use client';

import dynamic from 'next/dynamic';

/**
 * 视频对话框组件 - 动态导入
 *
 * 优化点:
 * 1. 懒加载: 只在需要时才下载代码
 * 2. 禁用 SSR: 减少首屏渲染时间
 * 3. 自定义 loading: 提供更好的用户体验
 */
export const HeroVideoDialog = dynamic(
  () => import('./hero-video-dialog').then(mod => mod.HeroVideoDialog),
  {
    ssr: false,
    loading: () => (
      <div className="relative w-full aspect-video rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-20 w-20 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <div className="h-8 w-8 border-4 border-gray-300 border-t-primary rounded-full animate-spin" />
          </div>
        </div>
      </div>
    ),
  }
);

/**
 * 按需加载的视频组件
 * 只在用户交互后才加载完整组件
 */
export const LazyVideoDialog = dynamic(
  () => import('./lazy-video-wrapper').then(mod => mod.LazyVideoWrapper),
  { ssr: false }
);

/**
 * 文章 AI 问答组件
 * 浮动聊天窗口,基于文章内容回答问题
 */
export const ArticleChat = dynamic(
  () => import('./article-chat').then(mod => mod.ArticleChat),
  { ssr: false }
);

// 未来可以添加更多组件
// export const InteractiveChart = dynamic(() => import('./interactive-chart'));
// export const PricingCalculator = dynamic(() => import('./pricing-calculator'));
