import { InstallToLocalButton } from '@/components/blog/InstallToLocalButton';
import { LocaleLink } from '@/i18n/navigation';
import { formatDate } from '@/lib/formatter';
import { getLocalClientOrigin } from '@/lib/local-client-origin';
import { constructMetadata } from '@/lib/metadata';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getSession } from '@/lib/server';
import { getOwnedLicenseServices, getPremiumServices } from '@/lib/service-ownership';
import type { Metadata } from 'next';
import Image from 'next/image';

export async function generateMetadata(): Promise<Metadata> {
  return constructMetadata({
    title: '我的已购组件',
    description: '查看当前账号已经购买或已解锁的组件。',
    canonicalUrl: '/services/purchases',
  });
}

export default async function PurchasedServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const localClientOrigin = getLocalClientOrigin();
  const session = await getSession();
  const userId = session?.user?.id || null;

  if (!userId) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-12 md:px-6">
        <div className="rounded-[32px] border bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-8 shadow-sm">
          <div className="inline-flex rounded-full border bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            My Purchases
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight">我的已购组件</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            登录后可以查看当前账号已经购买的单组件授权，以及因为会员而可用的组件列表。
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={`/${locale}/auth/login`}
              className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              先登录查看
            </a>
            <LocaleLink
              href="/services"
              className="rounded-2xl border bg-white px-5 py-3 text-sm font-semibold hover:bg-accent"
            >
              返回组件市场
            </LocaleLink>
          </div>
        </div>
      </div>
    );
  }

  const hasPremium = await hasAccessToPremiumContent();
  const ownedLicenseServices = await getOwnedLicenseServices(locale, userId);
  const premiumServices = hasPremium ? getPremiumServices(locale) : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 md:px-6">
      <div className="rounded-[32px] border bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-8 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-700">
              My Purchases
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight">我的已购组件</h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              这里展示当前账号已经拥有的组件权益。单独购买的授权会长期保留，会员组件则跟随你的会员状态解锁。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <LocaleLink
              href="/services"
              className="rounded-2xl border bg-white px-5 py-3 text-sm font-semibold hover:bg-accent"
            >
              返回组件市场
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
          <span className="rounded-full border bg-white px-3 py-1">已购授权：{ownedLicenseServices.length}</span>
          <span className="rounded-full border bg-white px-3 py-1">会员可用：{premiumServices.length}</span>
          <span className="rounded-full border bg-white px-3 py-1">当前会员：{hasPremium ? '已开通' : '未开通'}</span>
        </div>
      </div>

      <section className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold">已购授权组件</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            这些组件来自你的单独购买记录，和会员状态无关。
          </p>
        </div>

        {ownedLicenseServices.length ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {ownedLicenseServices.map(({ item, purchasedAt }) => (
              <div key={item.slug} className="overflow-hidden rounded-[28px] border bg-card shadow-sm">
                <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                  {item.image ? (
                    <Image src={item.image} alt={item.title} fill className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl">
                      {item.manifest.entry.icon || item.manifest.icon || '🧩'}
                    </div>
                  )}
                </div>
                <div className="space-y-4 p-5">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                      单买已授权
                    </span>
                    <span className="rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">
                      v{item.manifest.version}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{item.manifest.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {item.description || item.manifest.summary}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    购买时间：{purchasedAt ? formatDate(new Date(purchasedAt)) : '已授权'}
                  </div>
                  <div className="flex flex-wrap gap-3 pt-2">
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
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[28px] border bg-card p-6 text-sm leading-7 text-muted-foreground">
            当前账号还没有单独购买的组件。你可以去组件市场挑一个爆款组件先买下来试跑。
          </div>
        )}
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold">会员可用组件</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            这部分来自你的会员权限，不是单独购买记录。
          </p>
        </div>

        {hasPremium && premiumServices.length ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {premiumServices.map((item) => (
              <div key={item.slug} className="overflow-hidden rounded-[28px] border bg-card shadow-sm">
                <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                  {item.image ? (
                    <Image src={item.image} alt={item.title} fill className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl">
                      {item.manifest.entry.icon || item.manifest.icon || '🧩'}
                    </div>
                  )}
                </div>
                <div className="space-y-4 p-5">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                      会员已解锁
                    </span>
                    <span className="rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">
                      v{item.manifest.version}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{item.manifest.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {item.description || item.manifest.summary}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">权限来源：会员订阅</div>
                  <div className="flex flex-wrap gap-3 pt-2">
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
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[28px] border bg-card p-6 text-sm leading-7 text-muted-foreground">
            {hasPremium
              ? '当前还没有配置会员组件。'
              : '当前账号还没有开通会员，所以这里暂时没有会员可用组件。'}
          </div>
        )}
      </section>
    </div>
  );
}
