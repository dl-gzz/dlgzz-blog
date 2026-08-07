'use client';

import type { PricePlan } from '@/payment/types';
import { useTranslations } from 'next-intl';
import { websiteConfig } from './website';

/**
 * Get price plans with translations for client components
 *
 * NOTICE: This function should only be used in client components.
 * If you need to get the price plans in server components, use getAllPricePlans instead.
 * Use this function when showing the pricing table or the billing card to the user.
 *
 * docs:
 * https://mksaas.com/docs/config/price
 *
 * @returns The price plans with translated content
 */
export function getPricePlans(): Record<string, PricePlan> {
  const t = useTranslations('PricePlans');
  const priceConfig = websiteConfig.price;
  const plans: Record<string, PricePlan> = {};

  // Add translated content to each plan
  if (priceConfig.plans.free) {
    plans.free = {
      ...priceConfig.plans.free,
      name: t('free.name'),
      description: t('free.description'),
      features: collectIndexedMessages(t, 'free.features.feature'),
      limits: collectIndexedMessages(t, 'free.limits.limit'),
    };
  }

  if (priceConfig.plans.pro) {
    plans.pro = {
      ...priceConfig.plans.pro,
      name: t('pro.name'),
      description: t('pro.description'),
      features: collectIndexedMessages(t, 'pro.features.feature'),
      limits: collectIndexedMessages(t, 'pro.limits.limit'),
    };
  }

  return plans;
}

/**
 * 按 `<prefix>-1`、`<prefix>-2`… 依次取翻译，遇到缺失即停止。
 * 这样文案条目增减只改 messages/*.json，不必同步改这里。
 */
function collectIndexedMessages(
  t: ReturnType<typeof useTranslations<'PricePlans'>>,
  prefix: string,
  max = 12
): string[] {
  const items: string[] = [];

  for (let index = 1; index <= max; index++) {
    const key = `${prefix}-${index}`;
    // has() 避免缺失键时抛 MISSING_MESSAGE 并渲染出原始键名
    if (!t.has(key as never)) break;
    items.push(t(key as never));
  }

  return items;
}
