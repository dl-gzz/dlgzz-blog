import ServicesMarketClient from '@/components/services/ServicesMarketClient';
import { LocaleLink } from '@/i18n/navigation';
import { getServiceAccessState } from '@/lib/service-access';
import { getServiceCatalog } from '@/lib/service-catalog';
import { getLocalClientOrigin } from '@/lib/local-client-origin';
import { constructMetadata } from '@/lib/metadata';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getSession } from '@/lib/server';
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
  const premiumCount = items.filter((item) => item.manifest.pricing.mode === 'premium').length;
  const licenseCount = items.filter((item) => item.manifest.pricing.mode === 'license').length;
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 md:px-6">
      <div className="rounded-[32px] border bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-8 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
              Service Market
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight">组件市场</h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              这里是商店端。用户先看文章和服务，再把组件安装到本地客户端，最后在客户端母体里运行。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <LocaleLink
              href="/services/purchases"
              className="rounded-2xl border bg-white px-5 py-3 text-sm font-semibold hover:bg-accent"
            >
              我的已购组件
            </LocaleLink>
            <LocaleLink
              href="/services/installed"
              className="rounded-2xl border bg-white px-5 py-3 text-sm font-semibold hover:bg-accent"
            >
              查看已安装说明
            </LocaleLink>
            <a
              href={`${localClientOrigin}/${locale}/services/installed`}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              打开客户端已安装
            </a>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span className="rounded-full border bg-white px-3 py-1">服务数：{items.length}</span>
          <span className="rounded-full border bg-white px-3 py-1">会员组件：{premiumCount}</span>
          <span className="rounded-full border bg-white px-3 py-1">单买组件：{licenseCount}</span>
          <span className="rounded-full border bg-white px-3 py-1">角色：商店端</span>
          <span className="rounded-full border bg-white px-3 py-1">
            当前状态：{!isLoggedIn ? '未登录' : hasPremium ? '会员已解锁' : '已登录'}
          </span>
          <span className="rounded-full border bg-white px-3 py-1">动作：看文章 → 安装到客户端</span>
          <span className="rounded-full border bg-white px-3 py-1">筛选：全部 / 未安装 / 可升级 / 已安装</span>
        </div>
      </div>

      <ServicesMarketClient locale={locale} items={itemsWithAccess} userId={userId} />
    </div>
  );
}
