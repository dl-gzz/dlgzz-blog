import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AdminMembershipSection } from '@/components/dashboard/admin-membership-section';
import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import { Routes } from '@/routes';
import { ArrowUpRightIcon, ShieldCheckIcon } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { SubscriptionStatusCard } from '@/components/dashboard/subscription-status-card';

/**
 * Dashboard Page
 */
export default async function DashboardPage() {
  const [t, session] = await Promise.all([getTranslations(), getSession()]);
  const isAdmin = canAccessHermesAdmin(session?.user);

  const breadcrumbs = [
    {
      label: isAdmin ? '管理工作台' : t('Dashboard.dashboard.title'),
      isCurrentPage: true,
    },
  ];

  return (
    <>
      <DashboardHeader breadcrumbs={breadcrumbs} />

      {isAdmin ? (
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 lg:px-6 lg:py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <ShieldCheckIcon className="size-4" />
                仅管理员可见 · 网站运营
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                管理工作台
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                发会员码、查兑换记录、管理用户，都从这里开始。
              </p>
            </div>
            <Button variant="outline" asChild>
              <LocaleLink href={Routes.Root}>
                查看网站
                <ArrowUpRightIcon />
              </LocaleLink>
            </Button>
          </div>
          <Suspense
            fallback={
              <p
                role="status"
                className="rounded-xl border p-8 text-sm text-muted-foreground"
              >
                正在读取会员运营数据…
              </p>
            }
          >
            <AdminMembershipSection />
          </Suspense>
          <p className="text-xs leading-5 text-muted-foreground">
            普通用户登录同一个地址，只看到自己的个人中心。管理员权限由账号角色或服务器管理员白名单决定，不是由网址决定。
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <div className="px-4 lg:px-6">
                {/* Subscription Status Section */}
                <SubscriptionStatusCard />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
