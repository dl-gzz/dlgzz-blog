'use client';

import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import { LockIcon, SparklesIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface PremiumContentGuardProps {
  children: ReactNode;
  isPremium: boolean;
  hasAccess: boolean;
  previewLength?: number;
}

/**
 * Premium Content Guard Component
 *
 * Protects premium content by showing:
 * - Full content for users with access
 * - Blurred preview + unlock prompt for users without access
 * - Full content for non-premium articles
 */
export function PremiumContentGuard({
  children,
  isPremium,
  hasAccess,
  previewLength = 300,
}: PremiumContentGuardProps) {
  const t = useTranslations('Blog');

  // If not premium content, show everything
  if (!isPremium) {
    return <>{children}</>;
  }

  // If user has access to premium content, show everything
  if (hasAccess) {
    return <>{children}</>;
  }

  // User doesn't have access - show blurred preview with unlock prompt
  return (
    <div className="relative">
      {/* Blurred content preview */}
      <div className="blur-sm select-none pointer-events-none">
        {children}
      </div>

      {/* Overlay with unlock prompt */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8 space-y-6">
          {/* Lock icon with gradient */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500 to-orange-600 blur-xl opacity-50" />
              <div className="relative bg-gradient-to-r from-amber-500 to-orange-600 p-4 rounded-full">
                <LockIcon className="size-8 text-white" />
              </div>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-2xl font-bold bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
            {t('premiumContentTitle')}
          </h3>

          {/* Description */}
          <p className="text-muted-foreground">
            {t('premiumContentDescription')}
          </p>

          {/* Benefits list */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-left">
            <div className="flex items-start gap-2">
              <SparklesIcon className="size-5 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-sm">{t('premiumBenefit1')}</span>
            </div>
            <div className="flex items-start gap-2">
              <SparklesIcon className="size-5 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-sm">{t('premiumBenefit2')}</span>
            </div>
            <div className="flex items-start gap-2">
              <SparklesIcon className="size-5 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-sm">{t('premiumBenefit3')}</span>
            </div>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <LocaleLink href="/pricing">
              <Button
                size="lg"
                className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
              >
                <LockIcon className="size-4 mr-2" />
                {t('upgradeToPremium')}
              </Button>
            </LocaleLink>
            <LocaleLink href="/auth/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                {t('signInToRead')}
              </Button>
            </LocaleLink>
          </div>
        </div>
      </div>
    </div>
  );
}
