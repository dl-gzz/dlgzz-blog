import { InstallToLocalButton } from '@/components/blog/InstallToLocalButton';
import { ServiceCheckoutButton } from '@/components/services/ServiceCheckoutButton';
import { getServiceAccessState } from '@/lib/service-access';
import { LocaleLink } from '@/i18n/navigation';
import { getServiceCatalog } from '@/lib/service-catalog';
import { formatDate } from '@/lib/formatter';
import { constructMetadata } from '@/lib/metadata';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getSession } from '@/lib/server';
import type { Metadata } from 'next';
import Image from 'next/image';

export async function generateMetadata(): Promise<Metadata> {
  return constructMetadata({
    title: '组件市场',
    description: '浏览可安装到本地客户端的组件、工具和服务。',
    canonicalUrl: '/services',
  });
}

function getPricingLabel(mode: string) {
  if (mode === 'premium') return '会员专享';
  if (mode === 'license') return '单独购买';
  return '免费安装';
}

function getPricingClassName(mode: string) {
  if (mode === 'premium') {
    return 'rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700';
  }
  if (mode === 'license') {
    return 'rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700';
  }
  return 'rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700';
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
              href={`http://localhost:3001/${locale}/services/installed`}
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
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {itemsWithAccess.map(({ item, access }) => (
          <div
            key={item.slug}
            className="group overflow-hidden rounded-[28px] border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="relative aspect-[16/9] overflow-hidden bg-muted">
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.title}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-5xl">
                  {item.manifest.entry.icon || item.manifest.icon || '🧩'}
                </div>
              )}
            </div>

            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {item.manifest.category}
                </span>
                <span className="rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">
                  v{item.manifest.version}
                </span>
                <span className={getPricingClassName(item.manifest.pricing.mode)}>
                  {getPricingLabel(item.manifest.pricing.mode)}
                </span>
              </div>

              <div>
                <h2 className="text-xl font-bold">{item.manifest.entry.title || item.manifest.name}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {item.description || item.manifest.summary}
                </p>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>文章：{item.slug}</span>
                <span>发布：{formatDate(new Date(item.date))}</span>
                <span>{access.statusLabel}</span>
              </div>

              <div className="rounded-2xl border bg-muted/30 px-4 py-3 text-sm leading-6 text-muted-foreground">
                {access.helperText}
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap gap-3">
                  <InstallToLocalButton
                    title={item.title}
                    description={item.description}
                    slug={item.slug}
                    locale={locale}
                    whiteboardPrompt={item.whiteboardPrompt}
                    serviceManifest={item.manifest}
                  />
                  <LocaleLink
                    href={`/blog/${item.slug}`}
                    className="inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent"
                  >
                    查看文章
                  </LocaleLink>
                  {access.actionLabel && access.actionHref && (
                    access.code === 'LICENSE_REQUIRED' && userId && item.manifest.pricing.price_id ? (
                      <ServiceCheckoutButton
                        userId={userId}
                        slug={item.slug}
                        serviceId={item.manifest.id}
                        serviceName={item.manifest.name}
                        priceId={item.manifest.pricing.price_id}
                        className="border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                        variant="outline"
                      >
                        {access.actionLabel}
                      </ServiceCheckoutButton>
                    ) : (
                      <a
                        href={access.actionHref}
                        className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100"
                      >
                        {access.actionLabel}
                      </a>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
