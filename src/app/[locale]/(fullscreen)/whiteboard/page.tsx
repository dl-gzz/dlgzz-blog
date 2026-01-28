'use client';

import dynamic from 'next/dynamic';
import '@/styles/globals.css';
import { Suspense } from 'react';

// 动态导入 Tldraw 组件（避免 SSR 问题）
const TldrawBoard = dynamic(
  () => import('@/components/whiteboard/TldrawBoard').catch(err => {
    console.error('Failed to load TldrawBoard:', err);
    return { default: () => <div>Failed to load whiteboard: {err.message}</div> };
  }),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="text-center">
          <div className="text-xl text-white mb-4 font-medium">正在加载 AI 白板...</div>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
        </div>
      </div>
    )
  }
);

export default function WhiteboardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TldrawBoard />
    </Suspense>
  );
}
