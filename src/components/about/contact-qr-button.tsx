'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { MailIcon } from 'lucide-react';
import Image from 'next/image';

export function ContactQrButton({ label }: { label: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <MailIcon className="size-4" />
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
