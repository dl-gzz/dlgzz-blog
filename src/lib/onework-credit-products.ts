import 'server-only';
import { findPlanByPriceId } from '@/lib/price-plan';
import { PaymentTypes } from '@/payment/types';

/** Look up the server-owned One Worker OS credit-pack configuration. */
export function getOneWorkUsageCreditsForPrice(priceId: string): number | null {
  const plan = findPlanByPriceId(priceId);
  if (plan?.id !== 'onework_credits') return null;

  const price = plan.prices.find((candidate) => candidate.priceId === priceId);
  if (price?.type !== PaymentTypes.ONE_TIME) {
    return null;
  }
  const credits = price.usageCredits;
  if (
    !Number.isSafeInteger(credits) ||
    !credits ||
    credits < 1 ||
    credits > 10_000_000
  ) {
    throw new Error(`Invalid One Worker OS credit count for price ${priceId}`);
  }
  return credits;
}
