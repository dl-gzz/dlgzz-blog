'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const OwnWhiteboard = dynamic(
  () => import('@/components/own-whiteboard/OwnWhiteboard'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-[#f6f7f9] text-[#111827]">
        <div className="text-sm font-medium">正在加载自研白板...</div>
      </div>
    ),
  }
);

export default function WhiteboardPage() {
  return (
    <div className="h-screen w-full">
      <Suspense fallback={<div className="flex items-center justify-center h-screen">加载中...</div>}>
        <OwnWhiteboard />
      </Suspense>
    </div>
  );
}
