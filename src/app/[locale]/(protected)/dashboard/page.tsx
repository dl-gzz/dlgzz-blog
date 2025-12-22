import { useTranslations } from 'next-intl';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { TryOnHistoryList } from '@/components/dashboard/try-on-history-list';

/**
 * Try-on History Dashboard Page
 */
export default function DashboardPage() {
  const t = useTranslations();

  const breadcrumbs = [
    {
      label: t('Dashboard.dashboard.title'),
      isCurrentPage: true,
    },
  ];

  return (
    <>
      <DashboardHeader breadcrumbs={breadcrumbs} />

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="px-4 lg:px-6">
              <TryOnHistoryList />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
