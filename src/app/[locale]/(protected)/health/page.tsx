import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { HealthDashboard } from '@/components/health/health-dashboard';
import { Badge } from '@/components/ui/badge';
import { getHealthDashboardForUser } from '@/lib/health';
import { constructMetadata } from '@/lib/metadata';
import { getSession } from '@/lib/server';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return constructMetadata({
    title: '三高健康管家',
    description: '浏览器端三高数据记录与 Hermes 健康管家连接。',
    canonicalUrl: '/health',
  });
}

export default async function HealthPage() {
  const session = await getSession();
  const initialDashboard = session?.user?.id
    ? await safeGetDashboard(session.user.id)
    : null;

  return (
    <>
      <DashboardHeader
        breadcrumbs={[
          {
            label: '三高健康管家',
            isCurrentPage: true,
          },
        ]}
        actions={<Badge variant="outline">浏览器模式</Badge>}
      />

      <HealthDashboard initialDashboard={initialDashboard} />
    </>
  );
}

async function safeGetDashboard(userId: string) {
  try {
    return await getHealthDashboardForUser(userId);
  } catch {
    return null;
  }
}
