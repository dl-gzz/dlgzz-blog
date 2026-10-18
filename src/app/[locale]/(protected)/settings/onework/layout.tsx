import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { Button } from '@/components/ui/button';
import { ArrowRightIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

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
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                会员与 OneWorkOS
              </h1>
              <p className="mt-2 text-muted-foreground">
                管理统一会员权益，绑定微信小程序，并连接 WorkBuddy
                和已授权应用。
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link href="/onework/guide">
                查看接入介绍 <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
