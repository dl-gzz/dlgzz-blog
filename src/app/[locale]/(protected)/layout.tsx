import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import type { PropsWithChildren } from 'react';

/**
 * inspired by dashboard-01
 * https://ui.shadcn.com/blocks
 */
export default async function DashboardLayout({ children }: PropsWithChildren) {
  const isAdmin = canAccessHermesAdmin((await getSession())?.user);
  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      <DashboardSidebar variant="inset" isAdmin={isAdmin} />

      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
