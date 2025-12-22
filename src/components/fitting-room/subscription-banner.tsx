'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, Lock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface SubscriptionBannerProps {
  hasAccess: boolean;
  isLoading: boolean;
  isLifetime?: boolean;
  subscriptionStatus?: string | null;
  onUpgrade?: () => void;
}

export function SubscriptionBanner({
  hasAccess,
  isLoading,
  isLifetime,
  subscriptionStatus,
  onUpgrade
}: SubscriptionBannerProps) {
  const t = useTranslations('Dashboard.fittingRoom');
  if (isLoading) {
    return (
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-sm text-blue-700">{t('checkingSubscription')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (hasAccess) {
    return (
      <Card className="bg-green-50 border-green-200">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isLifetime ? (
                <Crown className="h-4 w-4 text-yellow-600" />
              ) : (
                <div className="w-2 h-2 bg-green-500 rounded-full" />
              )}
              <span className="text-sm font-medium text-green-800">
                {isLifetime ? t('lifetimeMember') : t('subscriptionActive')}
              </span>
            </div>
            {subscriptionStatus && (
              <Badge variant="outline" className="text-xs">
                {subscriptionStatus === 'active' ? t('statusActive') : subscriptionStatus === 'trialing' ? t('statusTrialing') : subscriptionStatus}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-purple-50 border-purple-200">
      <CardContent className="p-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-800">
              {t('aiVirtualTryonPremium')}
            </span>
          </div>
          <p className="text-xs text-purple-600">
            {t('subscriptionRequiredDescription')}
          </p>
          {onUpgrade && (
            <Button 
              onClick={onUpgrade}
              size="sm"
              className="h-7 text-xs bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
            >
              {t('upgradeNow')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 