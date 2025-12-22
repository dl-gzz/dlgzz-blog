'use client';

import { AuthCard } from '@/components/auth/auth-card';
import { Routes } from '@/routes';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { SocialLoginButton } from './social-login-button';

export interface LoginFormProps {
  className?: string;
  callbackUrl?: string;
}

export const LoginForm = ({
  className,
  callbackUrl,
}: LoginFormProps) => {
  const t = useTranslations('AuthPage.login');

  return (
    <AuthCard
      headerLabel={t('welcomeBack')}
      bottomButtonLabel={t('signUpHint')}
      bottomButtonHref={`${Routes.Register}`}
      className={cn('', className)}
    >
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {t('loginWithGoogle')}
          </p>
        </div>
        <SocialLoginButton callbackUrl={callbackUrl} />
      </div>
    </AuthCard>
  );
};
