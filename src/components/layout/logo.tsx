'use client';

import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-label="独立工作者"
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-lg border border-slate-300 bg-slate-950 text-sm font-black text-white shadow-sm dark:border-white/20 dark:bg-white dark:text-slate-950',
        className
      )}
    >
      独
    </span>
  );
}
