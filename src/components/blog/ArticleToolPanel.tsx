'use client';

import { InstallToLocalButton } from '@/components/blog/InstallToLocalButton';
import { ServiceCheckoutButton } from '@/components/services/ServiceCheckoutButton';
import { Button } from '@/components/ui/button';
import type { ArticleToolActionView } from '@/lib/article-tool-actions';
import { cn } from '@/lib/utils';
import {
  DownloadIcon,
  LockKeyholeIcon,
  MessageCircleIcon,
  SparklesIcon,
  WrenchIcon,
} from 'lucide-react';

interface ArticleToolPanelProps {
  actions: ArticleToolActionView[];
  title: string;
  description: string;
  slug: string;
  locale: string;
  userId?: string | null;
  className?: string;
}

function getActionIcon(type: ArticleToolActionView['type']) {
  if (type === 'download') return DownloadIcon;
  if (type === 'chat') return MessageCircleIcon;
  return WrenchIcon;
}

function getActionClassName(type: ArticleToolActionView['type']) {
  if (type === 'download') {
    return {
      icon: 'bg-sky-50 text-sky-700 ring-sky-100',
      badge: 'border-sky-200 bg-sky-50 text-sky-700',
    };
  }

  if (type === 'chat') {
    return {
      icon: 'bg-violet-50 text-violet-700 ring-violet-100',
      badge: 'border-violet-200 bg-violet-50 text-violet-700',
    };
  }

  return {
    icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
}

function getAccessBadgeClassName(
  accessState: ArticleToolActionView['accessState']
) {
  if (accessState.granted) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (accessState.code === 'PREMIUM_REQUIRED') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function openArticleChat(question?: string) {
  window.dispatchEvent(
    new CustomEvent('article-chat:open', {
      detail: { question },
    })
  );
}

function ActionButton({
  action,
  title,
  description,
  slug,
  locale,
  userId,
}: {
  action: ArticleToolActionView;
  title: string;
  description: string;
  slug: string;
  locale: string;
  userId?: string | null;
}) {
  const { accessState } = action;

  if (!accessState.granted) {
    const manifest = action.serviceManifest;
    if (
      accessState.code === 'LICENSE_REQUIRED' &&
      userId &&
      manifest?.pricing.price_id
    ) {
      return (
        <ServiceCheckoutButton
          userId={userId}
          slug={slug}
          serviceId={manifest.id}
          serviceName={manifest.name}
          priceId={manifest.pricing.price_id}
          variant="outline"
          className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
        >
          {accessState.actionLabel || '购买此工具'}
        </ServiceCheckoutButton>
      );
    }

    return (
      <Button
        asChild
        variant="outline"
        className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
      >
        <a href={accessState.actionHref || `/${locale}/pricing`}>
          <LockKeyholeIcon className="mr-2 size-4" />
          {accessState.actionLabel || '加入会员'}
        </a>
      </Button>
    );
  }

  if (action.type === 'install') {
    return (
      <InstallToLocalButton
        title={title}
        description={description}
        slug={slug}
        locale={locale}
        whiteboardPrompt={action.whiteboardPrompt}
        serviceManifest={action.serviceManifest}
      />
    );
  }

  if (action.type === 'download') {
    if (!action.href) {
      return (
        <Button variant="outline" disabled>
          暂无文件
        </Button>
      );
    }

    return (
      <Button asChild>
        <a href={action.href} download>
          <DownloadIcon className="mr-2 size-4" />
          下载
        </a>
      </Button>
    );
  }

  return (
    <Button type="button" onClick={() => openArticleChat(action.prompt)}>
      <MessageCircleIcon className="mr-2 size-4" />
      开始对话
    </Button>
  );
}

export function ArticleToolPanel({
  actions,
  title,
  description,
  slug,
  locale,
  userId,
  className,
}: ArticleToolPanelProps) {
  if (!actions.length) return null;
  const hasMemberAction = actions.some(
    (action) => action.access === 'premium' || action.access === 'license'
  );

  return (
    <section
      className={cn(
        'not-prose overflow-hidden rounded-2xl border bg-card shadow-sm',
        className
      )}
      aria-label="文章工具动作"
    >
      <div className="border-b bg-muted/30 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-background px-3 py-1 text-xs font-semibold text-slate-700">
            <SparklesIcon className="mr-1.5 size-3.5" />
            工具入口
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            {hasMemberAction ? '会员工具包' : '内容工具'}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">
          这篇内容可以直接使用
        </h2>
      </div>

      <div className="divide-y">
        {actions.map((action) => {
          const Icon = getActionIcon(action.type);
          const tone = getActionClassName(action.type);

          return (
            <div
              key={action.id}
              className="grid gap-4 px-5 py-5 md:grid-cols-[1fr_auto] md:items-center"
            >
              <div className="flex min-w-0 gap-4">
                <div
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-xl ring-1',
                    tone.icon
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold leading-6">{action.label}</h3>
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                        tone.badge
                      )}
                    >
                      {action.type === 'install'
                        ? action.package === 'skill'
                          ? 'Skill'
                          : 'Install'
                        : action.type === 'download'
                          ? action.fileType || 'Download'
                          : 'Chat'}
                    </span>
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                        getAccessBadgeClassName(action.accessState)
                      )}
                    >
                      {action.accessState.statusLabel}
                    </span>
                  </div>
                  {action.description ? (
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {action.description}
                    </p>
                  ) : null}
                  {action.type === 'download' &&
                  (action.fileName || action.size) ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {[action.fileName, action.size]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                  {!action.accessState.granted ? (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {action.accessState.helperText}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center md:justify-end">
                <ActionButton
                  action={action}
                  title={title}
                  description={description}
                  slug={slug}
                  locale={locale}
                  userId={userId}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
