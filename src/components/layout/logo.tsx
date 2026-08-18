import Image from 'next/image';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-label="独立工作者"
      className={cn(
        'relative inline-flex size-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-blue-500/20',
        className
      )}
    >
      <Image
        src="/brand/one-worker-brand-blue.png"
        alt="独立工作者"
        fill
        sizes="40px"
        className="object-contain"
        priority
      />
    </span>
  );
}
