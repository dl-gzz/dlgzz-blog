import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-label="OneWorkOS"
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 text-[10px] font-black tracking-[-0.08em] text-white shadow-sm shadow-blue-500/40',
        className
      )}
    >
      OW
    </span>
  );
}
