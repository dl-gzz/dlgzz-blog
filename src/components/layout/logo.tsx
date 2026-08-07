'use client';

import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-label="独立沉思录"
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-lg border border-blue-500 bg-blue-600 text-sm font-black text-white shadow-sm dark:border-blue-400 dark:bg-blue-600 dark:text-white',
        className
      )}
    >
      独
    </span>
  );
}
