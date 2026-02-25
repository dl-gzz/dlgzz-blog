import { Navbar } from '@/components/layout/navbar';
import type { ReactNode } from 'react';

/** Chat layout: navbar only, no footer, full-height */
export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-svh">
      <Navbar scroll={false} />
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
