'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import Image from 'next/image';

function WechatIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M10 4C5.58 4 2 6.75 2 10.14c0 1.9 1.12 3.64 2.92 4.75L4 18l3.35-1.78c.84.21 1.72.32 2.65.32 4.42 0 8-2.75 8-6.14S14.42 4 10 4Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M14.5 9.5c4.14 0 7.5 2.29 7.5 5.12 0 1.43-.79 2.73-2.08 3.67L21 21l-2.82-1.48c-.97.3-2.04.47-3.18.47-2.04 0-3.87-.58-5.16-1.51"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <circle cx="7.5" cy="10" fill="currentColor" r=".8" />
      <circle cx="12.5" cy="10" fill="currentColor" r=".8" />
      <circle cx="16.5" cy="14.5" fill="currentColor" r=".75" />
      <circle cx="19.5" cy="14.5" fill="currentColor" r=".75" />
    </svg>
  );
}

export function ContactQrButton({ label }: { label: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <WechatIcon />
          {label}
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-sm text-center">
        <DialogHeader>
          <DialogTitle>加我为微信好友</DialogTitle>
          <DialogDescription>
            扫一扫二维码，和我交个朋友
          </DialogDescription>
        </DialogHeader>
        <div className="mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <Image
            src="/images/qr-wechat-xiaobai-2.jpg"
            alt="小白的微信二维码"
            width={640}
            height={800}
            className="h-auto w-full"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
