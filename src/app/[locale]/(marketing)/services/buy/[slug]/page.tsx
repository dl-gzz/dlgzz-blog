import { InstallToLocalButton } from '@/components/blog/InstallToLocalButton';
import { ServiceCheckoutButton } from '@/components/services/ServiceCheckoutButton';
import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import { formatDate } from '@/lib/formatter';
import { constructMetadata } from '@/lib/metadata';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getServiceAccessState, getServiceLicenseOrderState } from '@/lib/service-access';
import { getServiceCatalogItem } from '@/lib/service-catalog';
import { getSession } from '@/lib/server';
import { findPlanByPriceId } from '@/lib/price-plan';
import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';

export async function generateMetadata(): Promise<Metadata> {
  return constructMetadata({
    title: '组件购买',
    description: '购买并安装单独授权的组件。',
    canonicalUrl: '/services/buy',
  });
}

function getOrderStatusLabel(status?: string | null) {
  if (status === 'completed') return '授权已写入';
  if (status === 'active') return '支付已成功';
  if (status === 'processing') return '等待支付回调';
  if (!status) return '等待授权校验';
  return `状态：${status}`;
}

export default async function ServiceBuyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ checkout?: string; session_id?: string; aoid?: string }>;
}) {
  const { locale, slug } = await params;
  const query = await searchParams;
  const item = getServiceCatalogItem(locale, slug);
  if (!item || item.manifest.pricing.mode !== 'license') {
    notFound();
  }

  const session = await getSession();
  const userId = session?.user?.id || null;
  const hasPremium = userId ? await hasAccessToPremiumContent() : false;
  const access = await getServiceAccessState({
    locale,
    manifest: item.manifest,
    userId,
    hasPremium,
  });
  const priceId = item.manifest.pricing.price_id || '';
  const pricePlan = priceId ? findPlanByPriceId(priceId) : null;
  const servicePrice = pricePlan?.prices.find((price) => price.priceId === priceId);
  const checkoutReturned = query.checkout === 'success';
  const orderId = (query.aoid || query.session_id || '').trim();
  const orderState = userId && priceId && orderId
    ? await getServiceLicenseOrderState({
        userId,
        priceId,
        subscriptionId: orderId,
      })
    : null;
  const orderVerified = Boolean(orderState?.granted || (checkoutReturned && access.granted));
  const orderPending = Boolean(checkoutReturned && !orderVerified);
  const refreshHref = `/${locale}/services/buy/${item.slug}?checkout=success${orderId ? `&aoid=${encodeURIComponent(orderId)}&session_id=${encodeURIComponent(orderId)}` : ''}`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 md:px-6">
      <div className="rounded-[32px] border bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-8 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-700">
              {checkoutReturned ? 'Deal Confirmed' : 'License Checkout'}
            </div>
            <h1 className="text-4xl font-black tracking-tight">
              {checkoutReturned ? '组件成交确认' : '购买组件授权'}
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              {checkoutReturned
                ? '你已经回到这个组件的成交页。这里会继续做一次正向授权校验，确认这次订单是否已经写入可安装权限。'
                : '这是组件的独立购买页。购买成功后，这个组件就可以安装到本地客户端，并成为你工作台里的固定能力入口。'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <LocaleLink
              href={`/blog/${item.slug}`}
              className="inline-flex items-center rounded-2xl border bg-white px-5 py-3 text-sm font-semibold hover:bg-accent"
            >
              返回组件文章
            </LocaleLink>
            <LocaleLink
              href="/services/purchases"
              className="inline-flex items-center rounded-2xl border bg-white px-5 py-3 text-sm font-semibold hover:bg-accent"
            >
              我的已购组件
            </LocaleLink>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-[28px] border bg-card shadow-sm">
          <div className="relative aspect-[16/9] overflow-hidden bg-muted">
            {item.image ? (
              <Image src={item.image} alt={item.title} fill className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-6xl">
                {item.manifest.icon || item.manifest.entry.icon || '🧩'}
              </div>
            )}
          </div>
          <div className="space-y-5 p-6">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                单独购买组件
              </span>
              <span className="rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">
                v{item.manifest.version}
              </span>
              <span className="rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">
                发布：{formatDate(new Date(item.date))}
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-bold">{item.manifest.name}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {item.description || item.manifest.summary}
              </p>
            </div>

            <div className="rounded-2xl border bg-muted/30 p-4 text-sm leading-7 text-muted-foreground">
              {access.helperText}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className={`rounded-2xl border px-4 py-4 ${checkoutReturned ? 'border-emerald-200 bg-emerald-50' : 'bg-muted/20'}`}>
                <div className="text-xs font-semibold text-muted-foreground">01 下单支付</div>
                <div className="mt-2 text-sm font-semibold text-foreground">
                  {checkoutReturned ? '已回到成交页' : '等待支付'}
                </div>
              </div>
              <div className={`rounded-2xl border px-4 py-4 ${orderVerified ? 'border-emerald-200 bg-emerald-50' : orderPending ? 'border-amber-200 bg-amber-50' : 'bg-muted/20'}`}>
                <div className="text-xs font-semibold text-muted-foreground">02 授权写入</div>
                <div className="mt-2 text-sm font-semibold text-foreground">
                  {orderVerified ? '授权已通过' : orderPending ? '等待回调' : '尚未授权'}
                </div>
              </div>
              <div className={`rounded-2xl border px-4 py-4 ${access.granted ? 'border-emerald-200 bg-emerald-50' : 'bg-muted/20'}`}>
                <div className="text-xs font-semibold text-muted-foreground">03 本地安装</div>
                <div className="mt-2 text-sm font-semibold text-foreground">
                  {access.granted ? '可以安装' : '等待授权'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border bg-card p-6 shadow-sm">
          <div className="space-y-5">
            <div>
              <div className="text-sm font-semibold text-muted-foreground">当前状态</div>
              <div className="mt-2 text-2xl font-bold">{access.statusLabel}</div>
            </div>

            {checkoutReturned && (
              <div
                className={`rounded-[24px] border px-5 py-5 ${
                  orderVerified
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50'
                }`}
              >
                <div className="text-sm font-semibold text-muted-foreground">成交结果</div>
                <div className="mt-2 text-xl font-bold text-foreground">
                  {orderVerified ? '支付成功，授权验证通过' : '支付已返回，等待授权完成'}
                </div>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {orderVerified
                    ? '这次订单已经被系统识别为当前组件的有效授权，你现在可以直接安装到本地客户端。'
                    : '订单已经回到成交页，但授权记录还在处理或还未同步。通常刷新页面后，就会变成“已购买授权”。'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border bg-white px-3 py-1">订单号：{orderId || '未返回'}</span>
                  <span className="rounded-full border bg-white px-3 py-1">
                    校验结果：{getOrderStatusLabel(orderState?.status || null)}
                  </span>
                </div>
              </div>
            )}

            <div className="rounded-2xl border bg-muted/30 px-4 py-4">
              <div className="text-sm font-semibold text-muted-foreground">成交信息</div>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <div>组件：{item.manifest.name}</div>
                <div>授权方式：单独购买</div>
                <div>价格：{servicePrice ? `${(servicePrice.amount / 100).toFixed(2)} ${servicePrice.currency}` : '待配置'}</div>
                <div>授权范围：当前账号可安装到本地客户端</div>
                <div>订单追踪：{orderId || '支付前暂无订单号'}</div>
              </div>
            </div>

            {!userId ? (
              <a
                href={access.loginHref || `/${locale}/auth/login`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 hover:bg-sky-100"
              >
                先登录再购买
              </a>
            ) : access.granted ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  当前账号已经拥有这个组件的授权，可以直接安装到客户端。
                </div>
                <InstallToLocalButton
                  title={item.title}
                  description={item.description}
                  slug={item.slug}
                  locale={locale}
                  whiteboardPrompt={item.whiteboardPrompt}
                  serviceManifest={item.manifest}
                />
              </div>
            ) : priceId ? (
              <div className="space-y-3">
                <ServiceCheckoutButton
                  userId={userId}
                  slug={item.slug}
                  serviceId={item.manifest.id}
                  serviceName={item.manifest.name}
                  priceId={priceId}
                  className="w-full"
                >
                  立即购买这个组件
                </ServiceCheckoutButton>
                {checkoutReturned && (
                  <a
                    href={refreshHref}
                    className="inline-flex w-full items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold hover:bg-accent"
                  >
                    刷新授权状态
                  </a>
                )}
              </div>
            ) : (
              <Button disabled className="w-full">
                当前组件缺少价格配置
              </Button>
            )}

            <div className="rounded-2xl border bg-muted/30 px-4 py-3 text-sm leading-7 text-muted-foreground">
              购买成功后，客户端安装仍会再做一次授权校验，所以这条链路是可控的，不会被绕过。你也可以在“我的已购组件”页统一查看自己买过的组件。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
