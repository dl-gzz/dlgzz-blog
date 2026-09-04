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
          { label: '会员与 OneWorkOS', isCurrentPage: true },
        ]}
      />
      <div className="px-4 py-16 lg:px-6">
        <div className="mx-auto max-w-6xl space-y-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              会员与 OneWorkOS
            </h1>
            <p className="mt-2 text-muted-foreground">
              管理统一会员权益，绑定微信小程序，并连接 WorkBuddy 和已授权应用。
            </p>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
