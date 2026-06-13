'use client';

import dynamic from 'next/dynamic';

const OwnWhiteboard = dynamic(
  () => import('@/components/own-whiteboard/OwnWhiteboard'),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 flex items-center justify-center bg-[#f6f7f9] text-[#111827]">
        <div className="text-sm font-medium">正在加载自研白板...</div>
      </div>
    ),
  }
);

export default function OwnWhiteboardPage() {
  return <OwnWhiteboard />;
}
