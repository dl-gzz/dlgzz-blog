'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

// 动态导入 Tldraw 组件（避免 SSR 问题）
const TldrawBoard = dynamic(
  () => import('@/components/whiteboard/TldrawBoard'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <div className="text-lg text-white mb-4">加载白板中...</div>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
        </div>
      </div>
    )
  }
);

export default function WhiteboardPage() {
  return (
    <div className="h-screen w-full">
      <Suspense fallback={<div className="flex items-center justify-center h-screen">加载中...</div>}>
        <TldrawBoard />
      </Suspense>
    </div>
  );
}
