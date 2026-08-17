import { Logo } from '@/components/layout/logo';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function BuiltWithButton() {
  return (
    <Link
      href="/"
      className={cn(
        buttonVariants({ variant: 'outline', size: 'sm' }),
        'border border-border px-4 rounded-md'
      )}
    >
      <Logo className="size-5 rounded-md" />
      <span className="font-semibold">OneWorkerOS</span>
    </Link>
  );
}
