'use client';

import { Routes } from '@/routes';
import type { NestedMenuItem } from '@/types';
import { useTranslations } from 'next-intl';

/**
 * Get navbar config with translations
 *
 * NOTICE: used in client components only
 *
 * 主线导航：内容（博客）→ 商品（组件商店）→ 白板（组件的承接物）→ 会员。
 * 已冻结但保留代码的入口（托管数字员工 /bots、站内 AI 聊天）不再出现在导航，
 * 仍可通过直链访问。
 *
 * @returns The navbar config with translated titles for navigation
 */
export function getNavbarLinks(): NestedMenuItem[] {
  const t = useTranslations('Marketing.navbar');

  return [
    {
      title: t('home.title'),
      href: Routes.Root,
      external: false,
    },
    {
      title: t('blog.title'),
      href: Routes.Blog,
      external: false,
    },
    {
      title: t('services.title'),
      href: Routes.Services,
      external: false,
    },
    {
      title: t('whiteboard.title'),
      href: Routes.Whiteboard,
      external: false,
    },
    {
      title: t('pricing.title'),
      href: Routes.Pricing,
      external: false,
    },
    {
      title: t('docs.title'),
      href: Routes.Docs,
      external: false,
    },
    {
      title: t('pages.items.about.title'),
      href: Routes.About,
      external: false,
    },
  ];
}
