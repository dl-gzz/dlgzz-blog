import { BlogCategoryFilter } from '@/components/blog/blog-category-filter';
import Container from '@/components/layout/container';
import { categorySource } from '@/lib/source';
import { getTranslations } from 'next-intl/server';
import type { PropsWithChildren } from 'react';

interface BlogListLayoutProps extends PropsWithChildren {
  params: Promise<{ locale: string }>;
}

export default async function BlogListLayout({
  children,
  params,
}: BlogListLayoutProps) {
  const { locale } = await params;
  const t = await getTranslations('BlogPage');

  // Filter categories by locale
  const language = locale as string;

  // Desired display order
  const categoryOrder = [
    'indie-work-log',
    'north-star',
    'ballast',
    'ai-arsenal',
    'taste-plan',
    'blind-box',
  ];

  const categoryList = categorySource
    .getPages(language)
    .map((category) => ({
      slug: category.slugs[0],
      name: category.data.name,
      description: category.data.description || '',
    }))
    .sort((a, b) => {
      const ai = categoryOrder.indexOf(a.slug ?? '');
      const bi = categoryOrder.indexOf(b.slug ?? '');
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  return (
    <div className="mb-16">
      <div className="mt-12 w-full flex flex-col items-center justify-center gap-8">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-center text-3xl font-bold tracking-tight">
            {t('title')}
          </h1>
          <h2 className="text-center text-base text-muted-foreground max-w-2xl mx-auto">
            {t('subtitle')}
          </h2>
        </div>

        <BlogCategoryFilter categoryList={categoryList} />
      </div>

      <Container className="mt-8 px-4">{children}</Container>
    </div>
  );
}
