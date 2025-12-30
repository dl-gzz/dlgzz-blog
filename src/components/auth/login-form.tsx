'use client';

import { AuthCard } from '@/components/auth/auth-card';
import { DividerWithText } from '@/components/auth/divider-with-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { websiteConfig } from '@/config/website';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { DEFAULT_LOGIN_REDIRECT, Routes } from '@/routes';
import { Loader2Icon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { SocialLoginButton } from './social-login-button';

export interface LoginFormProps {
  className?: string;
  callbackUrl?: string;
}

export const LoginForm = ({
  className,
  callbackUrl: propCallbackUrl,
}: LoginFormProps) => {
  const t = useTranslations('AuthPage.login');
  const searchParams = useSearchParams();
  const paramCallbackUrl = searchParams.get('callbackUrl');
  const locale = useLocale();
  const callbackUrl = propCallbackUrl || paramCallbackUrl || DEFAULT_LOGIN_REDIRECT;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await authClient.signIn.email(
        {
          email,
          password,
          callbackURL: callbackUrl,
        },
        {
          onRequest: () => {
            setIsLoading(true);
          },
          onResponse: () => {
            setIsLoading(false);
          },
          onSuccess: () => {
            toast.success(t('loginSuccess') || '登录成功');
            setIsLoading(false);
          },
          onError: (ctx) => {
            console.error('Login error:', ctx.error);
            const errorMessage =
              ctx.error?.message ||
              ctx.error?.body?.message ||
              t('loginError') ||
              '登录失败，请检查邮箱和密码';
            toast.error(errorMessage);
            setIsLoading(false);
          },
        }
      );
    } catch (error) {
      console.error('Login error:', error);
      toast.error(t('loginError') || '登录失败，请稍后重试');
      setIsLoading(false);
    }
  };

  const showEmailLogin = websiteConfig.auth.enableEmailLogin !== false;
  const showSocialLogin = websiteConfig.auth.enableGoogleLogin || websiteConfig.auth.enableGithubLogin;

  return (
    <AuthCard
      headerLabel={t('welcomeBack')}
      bottomButtonLabel={t('signUpHint')}
      bottomButtonHref={`${Routes.Register}`}
      className={cn('', className)}
    >
      <div className="space-y-6">
        {showEmailLogin && (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('email') || '邮箱'}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('emailPlaceholder') || '请输入邮箱'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('password') || '密码'}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t('passwordPlaceholder') || '请输入密码'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {t('signIn') || '登录'}
            </Button>
            <div className="text-center">
              <a
                href={Routes.ForgotPassword}
                className="text-sm text-muted-foreground hover:text-primary underline underline-offset-4"
              >
                {t('forgotPassword') || '忘记密码？'}
              </a>
            </div>
          </form>
        )}

        {showEmailLogin && showSocialLogin && (
          <DividerWithText text={t('orContinueWith') || '或'} />
        )}

        {showSocialLogin && (
          <div className="space-y-4">
            <SocialLoginButton callbackUrl={callbackUrl} />
          </div>
        )}
      </div>
    </AuthCard>
  );
};
