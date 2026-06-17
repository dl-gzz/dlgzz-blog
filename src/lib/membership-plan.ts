import 'server-only';

import { findPlanByPlanId } from '@/lib/price-plan';
import { PaymentTypes, PlanIntervals, type Price } from '@/payment/types';

export function getDefaultMembershipPrice(): { planId: string; price: Price } {
  const plan = findPlanByPlanId('pro');
  const yearly = plan?.prices.find(
    (price) =>
      price.type === PaymentTypes.SUBSCRIPTION &&
      price.interval === PlanIntervals.YEAR
  );
  const monthly = plan?.prices.find(
    (price) =>
      price.type === PaymentTypes.SUBSCRIPTION &&
      price.interval === PlanIntervals.MONTH
  );
  const price = yearly || monthly;

  if (!plan || !price) {
    throw new Error('Membership plan is not configured');
  }

  return { planId: plan.id, price };
}

export function formatPriceText(
  amount: number,
  currency: string,
  interval?: string
) {
  const symbol = currency === 'CNY' ? '¥' : currency;
  const unit = interval === 'year' ? '/年' : interval === 'month' ? '/月' : '';
  return `${symbol}${(amount / 100).toFixed(2)}${unit}`;
}
