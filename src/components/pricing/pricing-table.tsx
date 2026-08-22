'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { getPricePlans } from '@/config/price-config';
import { useOneWorkEntitlement } from '@/hooks/use-onework-entitlement';
import { cn } from '@/lib/utils';
import {
  PaymentTypes,
  type PlanInterval,
  PlanIntervals,
  type PricePlan,
} from '@/payment/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PricingCard } from './pricing-card';

interface PricingTableProps {
  metadata?: Record<string, string>;
  currentPlan?: PricePlan | null;
  className?: string;
}

/**
 * Pricing Table Component
 *
 * 1. Displays all pricing plans with interval selection tabs for subscription plans,
 * free plans and one-time purchase plans are always displayed
 * 2. If a plan is disabled, it will not be displayed in the pricing table
 * 3. If a price is disabled, it will not be displayed in the pricing table
 */
export function PricingTable({
  metadata,
  currentPlan,
  className,
}: PricingTableProps) {
  const t = useTranslations('PricingPage');
  const [interval, setInterval] = useState<PlanInterval>(PlanIntervals.MONTH);
  const {
    hasActiveOneWorkEntitlement,
    isLoading: isLoadingOneWorkEntitlement,
  } = useOneWorkEntitlement();

  // Get price plans with translations
  const pricePlans = getPricePlans();
  const plans = Object.values(pricePlans);

  // Treat an active OneWork entitlement as the current plan so members do not
  // see a second upgrade path or accidentally purchase the same access again.
  const currentPlanId =
    currentPlan?.id || (hasActiveOneWorkEntitlement ? 'pro' : null);

  if (isLoadingOneWorkEntitlement) {
    return <div className="min-h-48" aria-busy="true" />;
  }

  // Filter plans into free, subscription and one-time plans
  const freePlans = plans.filter((plan) => plan.isFree && !plan.disabled);

  const subscriptionPlans = plans.filter(
    (plan) =>
      !plan.isFree &&
      !plan.disabled &&
      plan.prices.some(
        (price) => !price.disabled && price.type === PaymentTypes.SUBSCRIPTION
      )
  );

  const oneTimePlans = plans.filter(
    (plan) =>
      !plan.isFree &&
      !plan.disabled &&
      plan.prices.some(
        (price) => !price.disabled && price.type === PaymentTypes.ONE_TIME
      )
  );

  // Check if any plan has a monthly price option
  const hasMonthlyOption = subscriptionPlans.some((plan) =>
    plan.prices.some(
      (price) =>
        !price.disabled &&
        price.type === PaymentTypes.SUBSCRIPTION &&
        price.interval === PlanIntervals.MONTH
    )
  );

  // Check if any plan has a yearly price option
  const hasYearlyOption = subscriptionPlans.some((plan) =>
    plan.prices.some(
      (price) =>
        !price.disabled &&
        price.type === PaymentTypes.SUBSCRIPTION &&
        price.interval === PlanIntervals.YEAR
    )
  );

  const handleIntervalChange = (value: string) => {
    setInterval(value as PlanInterval);
  };

  return (
    <div className={cn('flex flex-col gap-12', className)}>
      {/* Show interval toggle if there are subscription plans */}
      {(hasMonthlyOption || hasYearlyOption) &&
        subscriptionPlans.length > 0 && (
          <div className="flex justify-center">
            <ToggleGroup
              size="sm"
              type="single"
              value={interval}
              onValueChange={(value) => value && handleIntervalChange(value)}
              className="border rounded-lg p-1"
            >
              {hasMonthlyOption && (
                <ToggleGroupItem
                  value="month"
                  className={cn(
                    'px-3 py-0 cursor-pointer text-sm rounded-md',
                    'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'
                  )}
                >
                  {t('monthly')}
                </ToggleGroupItem>
              )}
              {hasYearlyOption && (
                <ToggleGroupItem
                  value="year"
                  className={cn(
                    'px-3 py-0 cursor-pointer text-sm rounded-md',
                    'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'
                  )}
                >
                  {t('yearly')}
                </ToggleGroupItem>
              )}
            </ToggleGroup>
          </div>
        )}

      {/* Calculate total number of visible plans */}
      {(() => {
        const totalVisiblePlans =
          freePlans.length + subscriptionPlans.length + oneTimePlans.length;
        return (
          <div
            className={cn(
              'grid gap-6',
              // Universal solution that handles any number of cards
              totalVisiblePlans === 1 && 'grid-cols-1 max-w-md mx-auto w-full',
              totalVisiblePlans === 2 &&
                'grid-cols-1 md:grid-cols-2 max-w-2xl mx-auto w-full',
              totalVisiblePlans >= 3 &&
                'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
            )}
          >
            {/* Render free plans (always visible) */}
            {freePlans.map((plan) => (
              <PricingCard
                key={plan.id}
                plan={plan}
                metadata={metadata}
                isCurrentPlan={currentPlanId === plan.id}
              />
            ))}

            {/* Render subscription plans with the selected interval */}
            {subscriptionPlans.map((plan) => (
              <PricingCard
                key={plan.id}
                plan={plan}
                interval={interval}
                paymentType={PaymentTypes.SUBSCRIPTION}
                metadata={metadata}
                isCurrentPlan={currentPlanId === plan.id}
              />
            ))}

            {/* Render one-time plans (always visible) */}
            {oneTimePlans.map((plan) => (
              <PricingCard
                key={plan.id}
                plan={plan}
                paymentType={PaymentTypes.ONE_TIME}
                metadata={metadata}
                isCurrentPlan={currentPlanId === plan.id}
              />
            ))}
          </div>
        );
      })()}
    </div>
  );
}
