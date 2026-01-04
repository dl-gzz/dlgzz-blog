import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getUserSubscription } from '@/actions/get-user-subscription';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Routes } from '@/routes';

export async function SubscriptionStatusCard() {
  const subscription = await getUserSubscription();
  const t = await getTranslations('Dashboard');

  if (!subscription) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center space-y-4 py-8">
          <h3 className="text-xl font-semibold">{t('noSubscription')}</h3>
          <p className="text-center text-sm text-muted-foreground">
            {t('noSubscriptionDesc')}
          </p>
          <Link href={Routes.Pricing}>
            <Button>{t('viewPricing')}</Button>
          </Link>
        </div>
      </Card>
    );
  }

  // Format dates
  const startDate = subscription.periodStart.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const endDate = subscription.periodEnd.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Format amount
  const formattedAmount = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: subscription.currency,
  }).format(subscription.amount / 100);

  // Get interval text
  const intervalText =
    subscription.interval === 'month' ? t('monthly') : t('yearly');

  // Determine badge color based on days remaining
  const getBadgeVariant = () => {
    if (subscription.daysRemaining <= 7) return 'destructive';
    if (subscription.daysRemaining <= 30) return 'secondary';
    return 'default';
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold">{t('subscriptionStatus')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('subscriptionStatusDesc')}
            </p>
          </div>
          <Badge variant={getBadgeVariant()}>
            {subscription.status === 'active' ? t('active') : t('expired')}
          </Badge>
        </div>

        {/* Subscription Details */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t('plan')}</p>
            <p className="font-medium">
              {subscription.planName} (<span className="text-muted-foreground">{intervalText}</span>)
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t('amount')}</p>
            <p className="font-medium">{formattedAmount}</p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t('startDate')}</p>
            <p className="font-medium">{startDate}</p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t('expiryDate')}</p>
            <p className="font-medium">{endDate}</p>
          </div>
        </div>

        {/* Days Remaining Alert */}
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('daysRemaining')}</p>
              <p className="text-sm text-muted-foreground">
                {t('daysRemainingDesc')}
              </p>
            </div>
            <div className="text-3xl font-bold">
              {subscription.daysRemaining}
            </div>
          </div>
        </div>

        {/* Renewal Button */}
        <div className="flex gap-3">
          <Link href={Routes.Pricing} className="flex-1">
            <Button className="w-full" variant="default">
              {t('renewNow')}
            </Button>
          </Link>
          <Link href={Routes.Pricing}>
            <Button variant="outline">{t('viewAllPlans')}</Button>
          </Link>
        </div>

        {/* Info Note */}
        {subscription.daysRemaining <= 30 && (
          <p className="text-sm text-muted-foreground">
            {t('renewalReminder')}
          </p>
        )}
      </div>
    </Card>
  );
}
