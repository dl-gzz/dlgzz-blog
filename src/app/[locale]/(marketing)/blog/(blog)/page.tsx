import BlogGridWithPagination from '@/components/blog/blog-grid-with-pagination';
import { BlogColumnNav } from '@/components/blog/blog-column-nav';
import { websiteConfig } from '@/config/website';
import { LOCALES } from '@/i18n/routing';
import { constructMetadata } from '@/lib/metadata';
import { blogSource } from '@/lib/source';
import { isBlogColumnId, isBlogSubcategory } from '@/lib/blog-columns';
import { notFound } from 'next/navigation';
import { getUrlWithLocale } from '@/lib/urls/urls';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: BlogPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({ locale, namespace: 'BlogPage' });

  return constructMetadata({
    title: `${pt('title')} | ${t('title')}`,
    description: pt('description'),
    canonicalUrl: getUrlWithLocale('/blog', locale),
  });
}

interface BlogPageProps {
  params: Promise<{
    locale: Locale;
  }>;
  searchParams: Promise<{
    column?: string;
    subcategory?: string;
  }>;
}

export default async function BlogPage({ params, searchParams }: BlogPageProps) {
  const { locale } = await params;
  const { column: requestedColumn, subcategory } = await searchParams;
  const activeColumn = isBlogColumnId(requestedColumn)
    ? requestedColumn
    : undefined;
  if ((requestedColumn && !activeColumn) || (subcategory && !isBlogSubcategory(activeColumn, subcategory))) notFound();
  const localePosts = blogSource.getPages(locale);
  const publishedPosts = localePosts
    .filter((post) => post.data.published)
    .filter((post) => !activeColumn || post.data.column === activeColumn)
    .filter((post) => !subcategory || post.data.subcategory === subcategory);
  const sortedPosts = publishedPosts.sort((a, b) => {
    return new Date(b.data.date).getTime() - new Date(a.data.date).getTime();
  });
  const currentPage = 1;
  const blogPageSize = websiteConfig.blog.paginationSize;
  const paginatedLocalePosts = sortedPosts.slice(
    (currentPage - 1) * blogPageSize,
    currentPage * blogPageSize
  );
  const totalPages = activeColumn
    ? 1
    : Math.ceil(sortedPosts.length / blogPageSize);

  return (
    <>
      <BlogColumnNav active={activeColumn} subcategory={subcategory} />
      <BlogGridWithPagination
        locale={locale}
        posts={activeColumn ? sortedPosts : paginatedLocalePosts}
        totalPages={totalPages}
        routePrefix={'/blog'}
      />
    </>
  );
}
