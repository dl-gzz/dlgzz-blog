import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { getTranslations } from 'next-intl/server';

interface BotsLayoutProps {
  children: React.ReactNode;
}

export default async function BotsLayout({ children }: BotsLayoutProps) {
  const t = await getTranslations('Dashboard');

  const breadcrumbs = [
    {
      label: t('bots.title'),
      isCurrentPage: true,
    },
  ];

  return (
    <>
      <DashboardHeader breadcrumbs={breadcrumbs} />

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
