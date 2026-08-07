import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { routing } from '@/i18n/routing';
import { getSession } from '@/lib/server';
import type { Locale } from 'next-intl';
import { redirect } from 'next/navigation';
import type { PropsWithChildren } from 'react';

interface DashboardLayoutProps extends PropsWithChildren {
  params: Promise<{ locale: Locale }>;
}

/**
 * inspired by dashboard-01
 * https://ui.shadcn.com/blocks
 */
export default async function DashboardLayout({
  children,
  params,
}: DashboardLayoutProps) {
  const session = await getSession();
  if (!session?.user?.id) {
    const { locale } = await params;
    const loginPath =
      locale === routing.defaultLocale
        ? '/auth/login'
        : `/${locale}/auth/login`;
    redirect(loginPath);
  }

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      <DashboardSidebar variant="inset" />

      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
