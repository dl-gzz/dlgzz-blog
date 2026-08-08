import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { getTranslations } from 'next-intl/server';

export default async function OneWorkSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations('Dashboard.settings');
  return (
    <>
      <DashboardHeader
        breadcrumbs={[
          { label: t('title'), isCurrentPage: false },
          { label: 'OneWorkOS', isCurrentPage: true },
        ]}
      />
      <div className="px-4 py-16 lg:px-6">
        <div className="mx-auto max-w-6xl space-y-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">OneWorkOS</h1>
            <p className="mt-2 text-muted-foreground">管理知识包权益、设备和 WorkBuddy 安装授权。</p>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}

