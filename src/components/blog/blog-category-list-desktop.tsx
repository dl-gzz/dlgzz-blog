'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LocaleLink } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { BlogCategory } from '@/types';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

export type BlogCategoryListDesktopProps = {
  categoryList: BlogCategory[];
};

export function BlogCategoryListDesktop({
  categoryList,
}: BlogCategoryListDesktopProps) {
  const { slug } = useParams() as { slug?: string };
  const t = useTranslations('BlogPage');

  return (
    <div className="relative w-full max-w-3xl px-4">
      {/* Left fade overlay */}
      <div className="absolute left-4 top-0 bottom-0 w-10 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      {/* Right fade overlay */}
      <div className="absolute right-4 top-0 bottom-0 w-10 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

      {/* Scrollable container — hide scrollbar cross-browser */}
      <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        <ToggleGroup
          size="sm"
          type="single"
          value={slug || 'All'}
          aria-label="Toggle blog category"
          className="w-max flex-nowrap gap-1 rounded-full border bg-background p-1 *:h-7 *:shrink-0 *:text-muted-foreground"
        >
          <ToggleGroupItem
            key="All"
            value="All"
            className={cn(
              'rounded-full px-2 cursor-pointer',
              'data-[state=on]:bg-foreground data-[state=on]:text-background',
              'hover:bg-accent hover:text-accent-foreground'
            )}
            aria-label="Toggle all blog categories"
          >
            <LocaleLink href="/blog" className="px-4">
              <span>{t('all')}</span>
            </LocaleLink>
          </ToggleGroupItem>

          {categoryList.map((category) => (
            <ToggleGroupItem
              key={category.slug}
              value={category.slug}
              className={cn(
                'rounded-full px-2 cursor-pointer',
                'data-[state=on]:bg-foreground data-[state=on]:text-background',
                'hover:bg-accent hover:text-accent-foreground'
              )}
              aria-label={`Toggle blog category of ${category.name}`}
            >
              <LocaleLink
                href={`/blog/category/${category.slug}`}
                className="px-4"
              >
                <span>{category.name}</span>
              </LocaleLink>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}
