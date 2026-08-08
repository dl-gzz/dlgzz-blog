'use client';

import { Routes } from '@/routes';
import type { NestedMenuItem } from '@/types';
import {
  BellIcon,
  BotIcon,
  CircleUserRoundIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  LockKeyholeIcon,
  NetworkIcon,
  Settings2Icon,
  SettingsIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Get sidebar config with translations
 *
 * NOTICE: used in client components only
 *
 * docs:
 * https://mksaas.com/docs/config/sidebar
 *
 * @returns The sidebar config with translated titles and descriptions
 */
export function getSidebarLinks(): NestedMenuItem[] {
  const t = useTranslations('Dashboard');

  // if is demo website, allow user to access admin and user pages, but data is fake
  const isDemo = process.env.NEXT_PUBLIC_DEMO_WEBSITE === 'true';

  return [
    {
      title: t('dashboard.title'),
      icon: <LayoutDashboardIcon className="size-4 shrink-0" />,
      href: Routes.Dashboard,
      external: false,
    },
    // 已冻结：三高健康管家（代码与 /health 路由保留，仅收起入口）。
    // 主线聚焦知识包 + 会员；跑出付费用户后再决定是否激活这条垂直。
    {
      title: t('admin.title'),
      icon: <SettingsIcon className="size-4 shrink-0" />,
      authorizeOnly: isDemo ? ['admin', 'user'] : ['admin'],
      items: [
        {
          title: t('bots.title'),
          icon: <BotIcon className="size-4 shrink-0" />,
          href: Routes.AdminBots,
          external: false,
        },
        {
          title: t('admin.users.title'),
          icon: <UsersRoundIcon className="size-4 shrink-0" />,
          href: Routes.AdminUsers,
          external: false,
        },
        {
          title: 'OneWorkOS 授权',
          icon: <NetworkIcon className="size-4 shrink-0" />,
          href: Routes.AdminOneWork,
          external: false,
        },
      ],
    },
    {
      title: t('settings.title'),
      icon: <Settings2Icon className="size-4 shrink-0" />,
      items: [
        {
          title: t('settings.profile.title'),
          icon: <CircleUserRoundIcon className="size-4 shrink-0" />,
          href: Routes.SettingsProfile,
          external: false,
        },
        {
          title: t('settings.billing.title'),
          icon: <CreditCardIcon className="size-4 shrink-0" />,
          href: Routes.SettingsBilling,
          external: false,
        },
        {
          title: t('settings.security.title'),
          icon: <LockKeyholeIcon className="size-4 shrink-0" />,
          href: Routes.SettingsSecurity,
          external: false,
        },
        {
          title: t('settings.notification.title'),
          icon: <BellIcon className="size-4 shrink-0" />,
          href: Routes.SettingsNotifications,
          external: false,
        },
        {
          title: 'OneWorkOS',
          icon: <NetworkIcon className="size-4 shrink-0" />,
          href: Routes.SettingsOneWork,
          external: false,
        },
      ],
    },
  ];
}
