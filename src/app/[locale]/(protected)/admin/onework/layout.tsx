import { DashboardHeader } from '@/components/dashboard/dashboard-header';

export default function OneWorkAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DashboardHeader breadcrumbs={[{ label: 'OneWorkOS 授权', isCurrentPage: true }]} />
      <div className="flex flex-1 flex-col py-4">{children}</div>
    </>
  );
}

