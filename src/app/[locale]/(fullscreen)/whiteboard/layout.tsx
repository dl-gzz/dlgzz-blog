import type { PropsWithChildren } from 'react';

export default function WhiteboardLayout({ children }: PropsWithChildren) {
  return (
    <div className="fixed inset-0 w-full h-full">
      {children}
    </div>
  );
}
