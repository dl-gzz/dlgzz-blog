'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useCurrentUser } from '@/hooks/use-current-user';
import { LocaleLink, useLocalePathname } from '@/i18n/navigation';
import { formatPrice } from '@/lib/formatter';
import { cn } from '@/lib/utils';
import {
  type PaymentType,
  PaymentTypes,
  type PlanInterval,
  PlanIntervals,
  type Price,
  type PricePlan,
} from '@/payment/types';
import { CheckCircleIcon, XCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LoginWrapper } from '../auth/login-wrapper';
import { CheckoutButton } from './create-checkout-button';

interface PricingCardProps {
  plan: PricePlan;
  interval?: PlanInterval; // 'month' or 'year'
  paymentType?: PaymentType; // 'subscription' or 'one_time'
  metadata?: Record<string, string>;
  className?: string;
  isCurrentPlan?: boolean;
}

/**
 * Get the appropriate price object for the selected interval and payment type
 * @param plan The price plan
 * @param interval The selected interval (month or year)
 * @param paymentType The payment type (SUBSCRIPTION or one_time)
 * @returns The price object or undefined if not found
 */
function getPriceForPlan(
  plan: PricePlan,
  interval?: PlanInterval,
  paymentType?: PaymentType
): Price | undefined {
  if (plan.isFree) {
    // Free plan has no price
    return undefined;
  }

  // non-free plans must have a price
  return plan.prices.find((price) => {
    if (paymentType === PaymentTypes.ONE_TIME) {
      return price.type === PaymentTypes.ONE_TIME;
    }
    return (
      price.type === PaymentTypes.SUBSCRIPTION && price.interval === interval
    );
  });
}

/**
 * Pricing Card Component
 *
 * Displays a single pricing plan with features and action button
 */
export function PricingCard({
  plan,
  interval,
  paymentType,
  className,
  isCurrentPlan = false,
}: PricingCardProps) {
  const t = useTranslations('PricingPage.PricingCard');
  const price = getPriceForPlan(plan, interval, paymentType);
  const currentUser = useCurrentUser();
  const currentPath = useLocalePathname();
  // console.log('pricing card, currentPath', currentPath);

  // generate formatted price and price label
  let formattedPrice = '';
  let priceLabel = '';
  if (plan.isFree) {
    formattedPrice = t('freePrice');
  } else if (price && price.amount > 0) {
    // price is available
    formattedPrice = formatPrice(price.amount, price.currency);
    if (interval === PlanIntervals.MONTH) {
      priceLabel = t('perMonth');
    } else if (interval === PlanIntervals.YEAR) {
      priceLabel = t('perYear');
    }
  } else {
    formattedPrice = t('notAvailable');
  }

  // check if plan is not free and has a price
  const isPaidPlan = !plan.isFree && !!price;
  // check if plan has a trial period, period is greater than 0
  const hasTrialPeriod = price?.trialPeriodDays && price.trialPeriodDays > 0;

  return (
    <Card
      className={cn(
        'flex h-full flex-col rounded-lg border-slate-200 bg-white shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5',
        plan.recommended && 'relative',
        isCurrentPlan &&
          'border-sky-600 shadow-md shadow-sky-100 dark:border-sky-400 dark:shadow-sky-950/30',
        className
      )}
    >
      {/* show popular badge if plan is recommended */}
      {plan.recommended && (
        <span className="absolute inset-x-0 -top-3 mx-auto flex h-6 w-fit items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 shadow-sm dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          {t('popular')}
        </span>
      )}

      {/* show current plan badge if plan is current plan */}
      {isCurrentPlan && (
        <span className="absolute inset-x-0 -top-3 mx-auto flex h-6 w-fit items-center rounded-md border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 shadow-sm dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100">
          {t('currentPlan')}
        </span>
      )}

      <CardHeader>
        <CardTitle>
          <h3 className="font-semibold text-slate-950 dark:text-white">
            {plan.name}
          </h3>
        </CardTitle>

        {/* show price and price label */}
        <div className="flex items-baseline gap-2">
          <span className="my-4 block text-4xl font-black tracking-normal text-slate-950 dark:text-white">
            {formattedPrice}
          </span>
          {priceLabel && (
            <span className="text-xl text-slate-500 dark:text-white/50">
              {priceLabel}
            </span>
          )}
        </div>

        <CardDescription>
          <p className="text-sm leading-6 text-slate-600 dark:text-white/64">
            {plan.description}
          </p>
        </CardDescription>

        {/* show action buttons based on plans */}
        {plan.isFree ? (
          currentUser ? (
            <Button
              variant="outline"
              className="disabled mt-4 w-full rounded-lg"
            >
              {t('getStartedForFree')}
            </Button>
          ) : (
            <LoginWrapper mode="modal" asChild callbackUrl={currentPath}>
              <Button
                variant="outline"
                className="mt-4 w-full cursor-pointer rounded-lg"
              >
                {t('getStartedForFree')}
              </Button>
            </LoginWrapper>
          )
        ) : isCurrentPlan ? (
          <Button
            disabled
            className="mt-4 w-full rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100 dark:hover:bg-sky-400/10"
          >
            {t('yourCurrentPlan')}
          </Button>
        ) : isPaidPlan ? (
          currentUser ? (
            <CheckoutButton
              userId={currentUser.id}
              planId={plan.id}
              priceId={price.priceId}
              variant="default"
              size="default"
              className="mt-4 w-full rounded-lg bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-white/90"
            >
              {plan.isLifetime ? t('getLifetimeAccess') : t('getStarted')}
            </CheckoutButton>
          ) : (
            <LoginWrapper mode="modal" asChild callbackUrl={currentPath}>
              <Button
                variant="default"
                className="mt-4 w-full cursor-pointer rounded-lg bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-white/90"
              >
                {plan.isLifetime ? t('getLifetimeAccess') : t('getStarted')}
              </Button>
            </LoginWrapper>
          )
        ) : (
          <Button disabled className="mt-4 w-full rounded-lg">
            {t('notAvailable')}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <hr className="border-slate-200 border-dashed dark:border-white/10" />

        {/* show trial period if it exists */}
        {hasTrialPeriod && (
          <div className="my-4">
            <span className="inline-block rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-800 shadow-sm dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200">
              {t('daysTrial', { days: price.trialPeriodDays as number })}
            </span>
          </div>
        )}

        {/* show features of this plan */}
        <ul className="list-outside space-y-4 text-sm">
          {plan.features?.map((feature, i) => (
            <li key={i} className="flex items-center gap-2">
              <CheckCircleIcon className="size-4 text-emerald-600 dark:text-emerald-300" />
              <span className="text-slate-700 dark:text-white/72">
                {feature}
              </span>
            </li>
          ))}
        </ul>

        {/* show limits of this plan */}
        <ul className="list-outside space-y-4 text-sm">
          {plan.limits?.map((limit, i) => (
            <li key={i} className="flex items-center gap-2">
              <XCircleIcon className="size-4 text-gray-500 dark:text-gray-400" />
              <span className="text-slate-500 dark:text-white/48">{limit}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
