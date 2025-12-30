'use client';

import { AuthCard } from '@/components/auth/auth-card';
import { DividerWithText } from '@/components/auth/divider-with-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { websiteConfig } from '@/config/website';
import { authClient } from '@/lib/auth-client';
import { DEFAULT_LOGIN_REDIRECT, Routes } from '@/routes';
import { Loader2Icon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { SocialLoginButton } from './social-login-button';

interface RegisterFormProps {
  callbackUrl?: string;
}

export const RegisterForm = ({
  callbackUrl: propCallbackUrl,
}: RegisterFormProps) => {
  const t = useTranslations('AuthPage.register');
  const searchParams = useSearchParams();
  const paramCallbackUrl = searchParams.get('callbackUrl');
  const locale = useLocale();
  const callbackUrl = propCallbackUrl || paramCallbackUrl || DEFAULT_LOGIN_REDIRECT;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error(t('passwordMismatch') || '两次输入的密码不一致');
      return;
    }

    if (password.length < 8) {
      toast.error(t('passwordTooShort') || '密码至少需要8个字符');
      return;
    }

    setIsLoading(true);

    try {
      await authClient.signUp.email(
        {
          email,
          password,
          name,
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
            toast.success(t('registerSuccess') || '注册成功！请查收验证邮件。');
            setIsLoading(false);
          },
          onError: (ctx) => {
            console.error('Register error:', ctx.error);
            const errorMessage =
              ctx.error?.message ||
              ctx.error?.body?.message ||
              (ctx.error?.status === 'UNPROCESSABLE_ENTITY' ? '该邮箱已被注册，请使用其他邮箱或直接登录' : null) ||
              t('registerError') ||
              '注册失败，请稍后重试';
            toast.error(errorMessage);
            setIsLoading(false);
          },
        }
      );
    } catch (error) {
      console.error('Register error:', error);
      toast.error(t('registerError') || '注册失败，请稍后重试');
      setIsLoading(false);
    }
  };

  const showEmailRegister = websiteConfig.auth.enableEmailLogin !== false;
  const showSocialLogin = websiteConfig.auth.enableGoogleLogin || websiteConfig.auth.enableGithubLogin;

  return (
    <AuthCard
      headerLabel={t('createAccount')}
      bottomButtonLabel={t('signInHint')}
      bottomButtonHref={`${Routes.Login}`}
    >
      <div className="space-y-6">
        {showEmailRegister && (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('name') || '姓名'}</Label>
              <Input
                id="name"
                type="text"
                placeholder={t('namePlaceholder') || '请输入姓名'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
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
                placeholder={t('passwordPlaceholder') || '至少8个字符'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('confirmPassword') || '确认密码'}</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder={t('confirmPasswordPlaceholder') || '请再次输入密码'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {t('signUp') || '注册'}
            </Button>
          </form>
        )}

        {showEmailRegister && showSocialLogin && (
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
