import AllPostsButton from '@/components/blog/all-posts-button';
import { InstallToLocalButton } from '@/components/blog/InstallToLocalButton';
import { ServiceCheckoutButton } from '@/components/services/ServiceCheckoutButton';
import ArticleCircleToSearch from '@/components/blog/ArticleCircleToSearch';
import { ArticleChat } from '@/components/blog/article-chat';
import BlogGrid from '@/components/blog/blog-grid';
import { PremiumBadge } from '@/components/blog/premium-badge';
import { PremiumContentGuard } from '@/components/blog/premium-content-guard';
import { getMDXComponents } from '@/components/docs/mdx-components';
import { NewsletterCard } from '@/components/newsletter/newsletter-card';
import { websiteConfig } from '@/config/website';
import { LocaleLink } from '@/i18n/navigation';
import { formatDate } from '@/lib/formatter';
import { constructMetadata } from '@/lib/metadata';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getServiceAccessState } from '@/lib/service-access';
import { getSession } from '@/lib/server';
import { normalizeServiceManifest } from '@/lib/service-manifest';
import {
  type BlogType,
  authorSource,
  blogSource,
  categorySource,
} from '@/lib/source';
import { getUrlWithLocale } from '@/lib/urls/urls';
import { CalendarIcon, FileTextIcon } from 'lucide-react';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { notFound } from 'next/navigation';

import '@/styles/mdx.css';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';

async function getRelatedPosts(post: BlogType) {
  const relatedPosts = blogSource
    .getPages(post.locale)
    .filter((p) => p.data.published)
    .filter((p) => p.slugs.join('/') !== post.slugs.join('/'))
    .sort(() => Math.random() - 0.5)
    .slice(0, websiteConfig.blog.relatedPostsSize);

  return relatedPosts;
}

export function generateStaticParams() {
  return blogSource
    .getPages()
    .filter((post) => post.data.published)
    .flatMap((post) => {
      return {
        locale: post.locale,
        slug: post.slugs,
      };
    });
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata | undefined> {
  const { locale, slug } = await params;
  const post = blogSource.getPage(slug, locale);
  if (!post) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return constructMetadata({
    title: `${post.data.title} | ${t('title')}`,
    description: post.data.description,
    canonicalUrl: getUrlWithLocale(`/blog/${slug}`, locale),
    image: post.data.image,
  });
}

interface BlogPostPageProps {
  params: Promise<{
    locale: Locale;
    slug: string[];
  }>;
}

export default async function BlogPostPage(props: BlogPostPageProps) {
  const { locale, slug } = await props.params;
  const post = blogSource.getPage(slug, locale);
  if (!post) {
    notFound();
  }

  const { date, title, description, image, author, categories, premium = false, whiteboard_prompt } = post.data;
  const serviceManifest = normalizeServiceManifest((post.data as any).service_manifest);
  const publishDate = formatDate(new Date(date));

  const blogAuthor = authorSource.getPage([author], locale);
  const blogCategories = categorySource
    .getPages(locale)
    .filter((category) => categories.includes(category.slugs[0] ?? ''));

  const MDX = post.data.body;
  const t = await getTranslations('BlogPage');
  const session = await getSession();
  const userId = session?.user?.id || null;
  const hasAccess = await hasAccessToPremiumContent();
  const access = serviceManifest
    ? await getServiceAccessState({
        locale,
        manifest: serviceManifest,
        userId,
        hasPremium: hasAccess,
      })
    : null;
  const serviceMode = serviceManifest?.pricing.mode || 'free';
  const relatedPosts = await getRelatedPosts(post);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col">
          <div className="space-y-8">
            <div className="group overflow-hidden relative aspect-16/9 rounded-lg transition-all border">
              {image && (
                <Image
                  src={image}
                  alt={title || 'image for blog post'}
                  title={title || 'image for blog post'}
                  loading="eager"
                  fill
                  className="object-cover"
                />
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarIcon className="size-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground leading-none my-auto">
                  {publishDate}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {premium && !hasAccess && <PremiumBadge />}
              </div>
            </div>

            <h1 className="text-4xl font-bold">{title}</h1>
            <p className="text-lg text-muted-foreground">{description}</p>

            {(serviceManifest || whiteboard_prompt) && (
              <div className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    本地安装入口
                  </span>
                  <span className="rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {serviceManifest ? `v${serviceManifest.version}` : 'Prompt 安装'}
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      serviceMode === 'premium'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : serviceMode === 'license'
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {serviceMode === 'premium' ? '会员组件' : serviceMode === 'license' ? '单买组件' : '免费组件'}
                  </span>
                  <span className="rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">
                    当前状态：{access?.statusLabel || (!userId ? '未登录' : '已登录可安装')}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {access?.helperText || '这篇文章对应的是可直接安装到本地客户端的组件入口。'}
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <InstallToLocalButton
                    title={title}
                    description={description ?? ''}
                    slug={slug.join('/')}
                    locale={locale}
                    whiteboardPrompt={whiteboard_prompt}
                    serviceManifest={serviceManifest}
                  />
                  {access?.actionLabel && access.actionHref && (
                    access.code === 'LICENSE_REQUIRED' && userId && serviceManifest?.pricing.price_id ? (
                      <ServiceCheckoutButton
                        userId={userId}
                        slug={slug.join('/')}
                        serviceId={serviceManifest.id}
                        serviceName={serviceManifest.name}
                        priceId={serviceManifest.pricing.price_id}
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
            )}
          </div>

          <PremiumContentGuard isPremium={premium} hasAccess={hasAccess}>
            <div className="mt-8 relative">
              <div className="absolute right-0 top-0 z-10 h-full pointer-events-none">
                <div className="sticky top-24 pointer-events-auto">
                  <ArticleCircleToSearch />
                </div>
              </div>

              <div className="max-w-none prose prose-neutral dark:prose-invert prose-img:rounded-lg">
                <MDX components={getMDXComponents()} />
              </div>
            </div>
          </PremiumContentGuard>

          <div className="flex items-center justify-start my-16">
            <AllPostsButton />
          </div>
        </div>

        <div>
          <div className="space-y-4 lg:sticky lg:top-24">
            {blogAuthor && (
              <div className="bg-card rounded-xl border p-6">
                <h2 className="text-lg font-semibold mb-4">{t('author')}</h2>
                <div className="flex items-center gap-4">
                  <div className="relative h-8 w-8 shrink-0">
                    {blogAuthor.data.avatar && (
                      <Image
                        src={blogAuthor.data.avatar}
                        alt={`avatar for ${blogAuthor.data.name}`}
                        className="rounded-full object-cover border"
                        fill
                      />
                    )}
                  </div>
                  <span className="line-clamp-1">{blogAuthor.data.name}</span>
                </div>
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">{t('categories')}</h2>
              <ul className="flex flex-wrap gap-4">
                {blogCategories.map(
                  (category) =>
                    category && (
                      <li key={category.slugs[0]}>
                        <LocaleLink
                          href={`/blog/category/${category.slugs[0]}`}
                          className="text-sm font-medium text-muted-foreground hover:text-primary"
                        >
                          {category.data.name}
                        </LocaleLink>
                      </li>
                    )
                )}
              </ul>
            </div>

            <div className="max-h-[calc(100vh-18rem)] overflow-y-auto">
              {post.data.toc && (
                <InlineTOC
                  items={post.data.toc}
                  open={true}
                  defaultOpen={true}
                  className="bg-card rounded-xl border"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {relatedPosts && relatedPosts.length > 0 && (
        <div className="flex flex-col gap-8 mt-8">
          <div className="flex items-center gap-2">
            <FileTextIcon className="size-4 text-muted-foreground" />
            <h2 className="text-lg tracking-wider font-semibold">
              {t('morePosts')}
            </h2>
          </div>

          <BlogGrid posts={relatedPosts} locale={locale} />
        </div>
      )}

      <div className="flex items-center justify-start my-8">
        <NewsletterCard />
      </div>

      <ArticleChat slug={slug.join('/')} locale={locale} articleTitle={title} />
    </div>
  );
}
