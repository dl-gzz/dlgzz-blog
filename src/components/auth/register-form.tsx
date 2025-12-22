'use client';

import { AuthCard } from '@/components/auth/auth-card';
import { Routes } from '@/routes';
import { useTranslations } from 'next-intl';
import { SocialLoginButton } from './social-login-button';

interface RegisterFormProps {
  callbackUrl?: string;
}

export const RegisterForm = ({
  callbackUrl,
}: RegisterFormProps) => {
  const t = useTranslations('AuthPage.register');

  return (
    <AuthCard
      headerLabel={t('createAccount')}
      bottomButtonLabel={t('signInHint')}
      bottomButtonHref={`${Routes.Login}`}
    >
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {t('registerWithGoogle')}
          </p>
        </div>
        <SocialLoginButton callbackUrl={callbackUrl} />
      </div>
    </AuthCard>
  );
};
