import ArticleCircleToSearch from '@/components/blog/ArticleCircleToSearch';
import { ArticleToolPanel } from '@/components/blog/ArticleToolPanel';
import AllPostsButton from '@/components/blog/all-posts-button';
import { ArticleChat } from '@/components/blog/article-chat';
import BlogGrid from '@/components/blog/blog-grid';
import { BlogImageCarousel } from '@/components/blog/blog-image-carousel';
import { PremiumBadge } from '@/components/blog/premium-badge';
import { PremiumContentGuard } from '@/components/blog/premium-content-guard';
import { getMDXComponents } from '@/components/docs/mdx-components';
import { NewsletterCard } from '@/components/newsletter/newsletter-card';
import { websiteConfig } from '@/config/website';
import {
  getArticleToolActions,
  getToolActionAccessState,
  toArticleToolActionAccessState,
} from '@/lib/article-tool-actions';
import { formatDate } from '@/lib/formatter';
import {
  type DatabaseCoursewarePost,
  getDatabaseCoursewarePost,
} from '@/lib/edu-content';
import { constructMetadata } from '@/lib/metadata';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getSession } from '@/lib/server';
import { getServiceAccessState } from '@/lib/service-access';
import { normalizeServiceManifest } from '@/lib/service-manifest';
import { type BlogType, authorSource, blogSource } from '@/lib/source';
import { getUrlWithLocale } from '@/lib/urls/urls';
import { CalendarIcon, FileTextIcon } from 'lucide-react';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

import '@/styles/mdx.css';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';

export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;

async function getRelatedPosts(post: BlogType) {
  const relatedPosts = blogSource
    .getPages(post.locale)
    .filter((p) => p.data.published)
    .filter((p) => p.slugs.join('/') !== post.slugs.join('/'))
    .sort(() => Math.random() - 0.5)
    .slice(0, websiteConfig.blog.relatedPostsSize);

  return relatedPosts;
}

async function getDatabasePostFromSlug(slug: string[], locale: Locale) {
  if (slug.length !== 1) return null;
  return getDatabaseCoursewarePost(slug[0], locale);
}

function stripSavedHtmlFromMdxBody(body: string) {
  return body
    .replace(
      /\{\/\*\s*dlgzz-courseware-html:start\s*\*\/\}[\s\S]*?\{\/\*\s*dlgzz-courseware-html:end\s*\*\/\}/g,
      ''
    )
    .trim();
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
    const dbPost = await getDatabasePostFromSlug(slug, locale);
    if (!dbPost) {
      notFound();
    }

    const t = await getTranslations({ locale, namespace: 'Metadata' });
    return constructMetadata({
      title: `${dbPost.title} | ${t('title')}`,
      description: dbPost.description,
      canonicalUrl: getUrlWithLocale(`/blog/${slug.join('/')}`, locale),
      image: '/images/blog/interactive-math-game.png',
    });
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
    const dbPost = await getDatabasePostFromSlug(slug, locale);
    if (!dbPost) {
      notFound();
    }

    return <DatabaseCoursewareBlogPage post={dbPost} locale={locale} />;
  }

  const {
    date,
    title,
    description,
    image,
    images,
    author,
    premium = false,
    whiteboard_prompt,
  } = post.data;
  const heroImages = images?.length ? images : image ? [image] : [];
  const serviceManifest = normalizeServiceManifest(
    (post.data as any).service_manifest
  );
  const toolActions = getArticleToolActions({
    rawActions: (post.data as any).tool_actions,
    serviceManifest,
    whiteboardPrompt: whiteboard_prompt,
  });
  const publishDate = formatDate(new Date(date));

  const blogAuthor = authorSource.getPage([author], locale);

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
  const toolActionViews = toolActions.map((action) => ({
    ...action,
    accessState:
      action.type === 'install' && action.serviceManifest && access
        ? toArticleToolActionAccessState(access)
        : getToolActionAccessState({
            action,
            locale,
            userId,
            hasPremium: hasAccess,
          }),
  }));
  const relatedPosts = await getRelatedPosts(post);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col">
          <div className="space-y-8">
            <BlogImageCarousel images={heroImages} title={title} />

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

            <ArticleToolPanel
              actions={toolActionViews}
              title={title}
              description={description ?? ''}
              slug={slug.join('/')}
              locale={locale}
              userId={userId}
            />
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

function DatabaseCoursewareBlogPage({
  post,
  locale,
}: {
  post: DatabaseCoursewarePost;
  locale: Locale;
}) {
  const publishDate = formatDate(new Date(post.date));
  const body = stripSavedHtmlFromMdxBody(post.body);
  const whiteboardUrl = `/${locale}/whiteboard?${new URLSearchParams({
    loadCoursewareSlug: post.slug,
    title: post.title,
  }).toString()}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <article className="lg:col-span-2 flex flex-col">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <CalendarIcon className="size-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground leading-none my-auto">
                {publishDate}
              </span>
            </div>

            <h1 className="text-4xl font-bold">{post.title}</h1>
            <p className="text-lg text-muted-foreground">{post.description}</p>

            <div className="flex flex-wrap gap-3">
              <Link
                href={whiteboardUrl}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                打开白板使用
              </Link>
              <Link
                href={`/${locale}/teacher/courseware`}
                className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
              >
                返回课件后台
              </Link>
            </div>
          </div>

          {post.htmlContent && (
            <div className="mt-8 overflow-hidden rounded-xl border bg-card">
              <div className="border-b px-4 py-3 text-sm font-medium">互动课件预览</div>
              <iframe
                title={post.title}
                srcDoc={post.htmlContent}
                sandbox="allow-scripts allow-same-origin"
                className="h-[720px] w-full bg-white"
              />
            </div>
          )}

          {body && (
            <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none prose-img:rounded-lg">
              <ReactMarkdown>{body}</ReactMarkdown>
            </div>
          )}

          <div className="flex items-center justify-start my-16">
            <AllPostsButton />
          </div>
        </article>
      </div>

      <div className="flex items-center justify-start my-8">
        <NewsletterCard />
      </div>

      <ArticleChat slug={post.slug} locale={locale} articleTitle={post.title} />
    </div>
  );
}
