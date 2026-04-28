import Container from '@/components/layout/container';
import { getTranslations } from 'next-intl/server';
import type { PropsWithChildren } from 'react';

interface BlogListLayoutProps extends PropsWithChildren {
  params: Promise<{ locale: string }>;
}

export default async function BlogListLayout({
  children,
  params,
}: BlogListLayoutProps) {
  await params;
  const t = await getTranslations('BlogPage');

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
      </div>

      <Container className="mt-8 px-4">{children}</Container>
    </div>
  );
}
