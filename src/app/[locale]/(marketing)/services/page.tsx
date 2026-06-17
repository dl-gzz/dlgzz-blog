import ServicesMarketClient from '@/components/services/ServicesMarketClient';
import { LocaleLink } from '@/i18n/navigation';
import { getLocalClientOrigin } from '@/lib/local-client-origin';
import { constructMetadata } from '@/lib/metadata';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getSession } from '@/lib/server';
import { getServiceAccessState } from '@/lib/service-access';
import { getServiceCatalog } from '@/lib/service-catalog';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return constructMetadata({
    title: '组件市场',
    description: '浏览可安装到本地客户端的组件、工具和服务。',
    canonicalUrl: '/services',
  });
}

export default async function ServicesMarketPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const items = getServiceCatalog(locale);
  const premiumCount = items.filter(
    (item) => item.manifest.pricing.mode === 'premium'
  ).length;
  const licenseCount = items.filter(
    (item) => item.manifest.pricing.mode === 'license'
  ).length;
  const localClientOrigin = getLocalClientOrigin();
  const session = await getSession();
  const userId = session?.user?.id || null;
  const isLoggedIn = Boolean(userId);
  const hasPremium = isLoggedIn ? await hasAccessToPremiumContent() : false;
  const itemsWithAccess = await Promise.all(
    items.map(async (item) => ({
      item,
      access: await getServiceAccessState({
        locale,
        manifest: item.manifest,
        userId,
        hasPremium,
      }),
    }))
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-5 py-10 sm:px-8 lg:px-10">
      <div className="border border-slate-200 bg-[#faf9f5] p-6 dark:border-white/10 dark:bg-neutral-950">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
              Service Market
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-normal">
              组件市场
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-600 dark:text-white/64">
              这里是商店端。用户先看文章和服务，再把组件安装到本地客户端，最后在客户端母体里运行。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <LocaleLink
              href="/services/purchases"
              className="rounded-lg border bg-white px-5 py-3 text-sm font-semibold hover:bg-accent dark:bg-white/5"
            >
              我的已购组件
            </LocaleLink>
            <LocaleLink
              href="/services/installed"
              className="rounded-lg border bg-white px-5 py-3 text-sm font-semibold hover:bg-accent dark:bg-white/5"
            >
              查看已安装说明
            </LocaleLink>
            <a
              href={`${localClientOrigin}/${locale}/services/installed`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white dark:bg-white dark:text-slate-950"
            >
              打开客户端已安装
            </a>
          </div>
        </div>

        <div className="mt-6 grid border-y border-slate-200 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4 dark:border-white/10 dark:text-white/64">
          <span className="border-slate-200 py-3 lg:border-r dark:border-white/10">
            服务数：{items.length}
          </span>
          <span className="border-slate-200 py-3 lg:border-r lg:pl-4 dark:border-white/10">
            会员组件：{premiumCount}
          </span>
          <span className="border-slate-200 py-3 lg:border-r lg:pl-4 dark:border-white/10">
            单买组件：{licenseCount}
          </span>
          <span className="py-3 lg:pl-4">
            当前状态：
            {!isLoggedIn ? '未登录' : hasPremium ? '会员已解锁' : '已登录'}
          </span>
        </div>
      </div>

      <ServicesMarketClient
        locale={locale}
        items={itemsWithAccess}
        userId={userId}
      />
    </div>
  );
}
