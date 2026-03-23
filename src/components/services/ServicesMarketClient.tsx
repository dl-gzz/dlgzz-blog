'use client';

import { InstallToLocalButton } from '@/components/blog/InstallToLocalButton';
import { ServiceCheckoutButton } from '@/components/services/ServiceCheckoutButton';
import { LocaleLink } from '@/i18n/navigation';
import { formatDate } from '@/lib/formatter';
import { getLocalClientOrigin } from '@/lib/local-client-origin';
import type { ServiceManifestV1 } from '@/lib/service-manifest';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';

interface AccessStateSnapshot {
  granted: boolean;
  code: string;
  statusLabel: string;
  helperText: string;
  actionLabel?: string;
  actionHref?: string;
}

interface ServiceMarketItem {
  locale: string;
  slug: string;
  title: string;
  description: string;
  image: string;
  date: string;
  whiteboardPrompt?: string;
  manifest: ServiceManifestV1;
}

interface ServiceMarketCardData {
  item: ServiceMarketItem;
  access: AccessStateSnapshot;
}

type LocalInstallState = 'checking' | 'not_installed' | 'installed' | 'upgrade_available' | 'local_unreachable';
type FilterMode = 'all' | 'not_installed' | 'upgrade_available' | 'installed';

interface InstalledShapeItem {
  manifest?: {
    id?: string;
    version?: string;
  };
}

function compareVersions(a: string, b: string) {
  const left = a
    .trim()
    .split('.')
    .map((segment) => Number(segment.match(/\d+/)?.[0] || 0));
  const right = b
    .trim()
    .split('.')
    .map((segment) => Number(segment.match(/\d+/)?.[0] || 0));
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }

  return 0;
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

function getLocalStateBadge(state: LocalInstallState, localVersion?: string | null) {
  switch (state) {
    case 'installed':
      return {
        label: localVersion ? `线下已安装 v${localVersion}` : '线下已安装',
        className: 'rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700',
      };
    case 'upgrade_available':
      return {
        label: localVersion ? `可升级，当前 v${localVersion}` : '可升级',
        className: 'rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700',
      };
    case 'local_unreachable':
      return {
        label: '未连接线下',
        className: 'rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700',
      };
    case 'checking':
      return {
        label: '检查线下中',
        className: 'rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600',
      };
    default:
      return {
        label: '线下未安装',
        className: 'rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700',
      };
  }
}

export default function ServicesMarketClient({
  locale,
  items,
  userId,
}: {
  locale: string;
  items: ServiceMarketCardData[];
  userId?: string | null;
}) {
  const localOrigin = useMemo(() => getLocalClientOrigin(), []);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [localStates, setLocalStates] = useState<Record<string, { state: LocalInstallState; version?: string | null }>>(
    {}
  );

  useEffect(() => {
    let cancelled = false;

    const loadLocalStates = async () => {
      try {
        const response = await fetch(`${localOrigin}/api/shape-packages/installed`, {
          method: 'GET',
          cache: 'no-store',
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data?.items)) {
          throw new Error('LOCAL_STATUS_FAILED');
        }

        const installedMap = new Map<string, InstalledShapeItem>();
        data.items.forEach((item: InstalledShapeItem) => {
          const id = item?.manifest?.id;
          if (typeof id === 'string' && id.trim()) {
            installedMap.set(id, item);
          }
        });

        const nextStates: Record<string, { state: LocalInstallState; version?: string | null }> = {};
        items.forEach(({ item }) => {
          const matched = installedMap.get(item.manifest.id);
          const installedVersion = typeof matched?.manifest?.version === 'string' ? matched.manifest.version : null;

          if (!installedVersion) {
            nextStates[item.manifest.id] = { state: 'not_installed', version: null };
            return;
          }

          nextStates[item.manifest.id] = {
            state: compareVersions(item.manifest.version, installedVersion) > 0 ? 'upgrade_available' : 'installed',
            version: installedVersion,
          };
        });

        if (!cancelled) {
          setLocalStates(nextStates);
        }
      } catch {
        if (cancelled) return;
        const fallbackStates: Record<string, { state: LocalInstallState; version?: string | null }> = {};
        items.forEach(({ item }) => {
          fallbackStates[item.manifest.id] = { state: 'local_unreachable', version: null };
        });
        setLocalStates(fallbackStates);
      }
    };

    void loadLocalStates();

    return () => {
      cancelled = true;
    };
  }, [items, localOrigin]);

  const counts = useMemo(() => {
    const summary = {
      all: items.length,
      not_installed: 0,
      upgrade_available: 0,
      installed: 0,
    };

    items.forEach(({ item }) => {
      const state = localStates[item.manifest.id]?.state || 'checking';
      if (state === 'upgrade_available') summary.upgrade_available += 1;
      if (state === 'installed') summary.installed += 1;
      if (state === 'not_installed') summary.not_installed += 1;
    });

    return summary;
  }, [items, localStates]);

  const filteredItems = useMemo(() => {
    return items.filter(({ item }) => {
      if (filterMode === 'all') return true;
      const state = localStates[item.manifest.id]?.state || 'checking';
      return state === filterMode;
    });
  }, [filterMode, items, localStates]);

  const filterTabs: Array<{ id: FilterMode; label: string; count: number }> = [
    { id: 'all', label: '全部', count: counts.all },
    { id: 'not_installed', label: '未安装', count: counts.not_installed },
    { id: 'upgrade_available', label: '可升级', count: counts.upgrade_available },
    { id: 'installed', label: '已安装', count: counts.installed },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        {filterTabs.map((tab) => {
          const active = tab.id === filterMode;
          return (
            <button
              key={tab.id}
              onClick={() => setFilterMode(tab.id)}
              className={active
                ? 'rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white'
                : 'rounded-full border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-accent'}
            >
              {tab.label} {tab.count}
            </button>
          );
        })}
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-[28px] border bg-card p-6 text-sm leading-7 text-muted-foreground">
          这一组里现在没有组件。你可以切换筛选，或者先启动线下客户端让商店读取本地安装状态。
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map(({ item, access }) => {
            const localState = localStates[item.manifest.id]?.state || 'checking';
            const localVersion = localStates[item.manifest.id]?.version || null;
            const localBadge = getLocalStateBadge(localState, localVersion);

            return (
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
                    <span className={localBadge.className}>{localBadge.label}</span>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
