'use client';

import { AuthCard } from '@/components/auth/auth-card';
import { FormError } from '@/components/shared/form-error';
import { FormSuccess } from '@/components/shared/form-success';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useLocaleRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Routes } from '@/routes';
import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeOffIcon, Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

/**
 * https://www.better-auth.com/docs/authentication/email-password#forget-password
 */
export const ResetPasswordForm = () => {
  const t = useTranslations('AuthPage.resetPassword');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const invalidToken = !token || searchParams.get('error') === 'invalid_token';

  const router = useLocaleRouter();
  const [error, setError] = useState<string | undefined>('');
  const [success, setSuccess] = useState<string | undefined>('');
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [needsNewLink, setNeedsNewLink] = useState(false);

  const ResetPasswordSchema = z.object({
    password: z.string().min(8, {
      message: t('minLength'),
    }),
  });

  const form = useForm<z.infer<typeof ResetPasswordSchema>>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: {
      password: '',
    },
  });

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  const onSubmit = async (values: z.infer<typeof ResetPasswordSchema>) => {
    if (!token) {
      setError('重置链接无效或已过期，请重新发送一封重置邮件。');
      return;
    }

    await authClient.resetPassword(
      {
        newPassword: values.password,
        token,
      },
      {
        onRequest: (ctx) => {
          // console.log("resetPassword, request:", ctx.url);
          setIsPending(true);
          setError('');
          setSuccess('');
          setNeedsNewLink(false);
        },
        onResponse: (ctx) => {
          // console.log("resetPassword, response:", ctx.response);
          setIsPending(false);
        },
        onSuccess: (ctx) => {
          // console.log("resetPassword, success:", ctx.data);
          // setSuccess("Password reset successfully");
          router.push(`${Routes.Login}`);
        },
        onError: (ctx) => {
          console.error('resetPassword, error:', ctx.error);
          setIsPending(false);
          const errorMessage = ctx.error.message || '';
          const tokenFailed =
            ctx.error.status === 400 ||
            /token|expired|invalid|过期|无效/i.test(errorMessage);
          setNeedsNewLink(tokenFailed);
          setError(
            tokenFailed
              ? '重置链接无效或已过期，请重新发送一封重置邮件。'
              : errorMessage || '密码重置失败，请稍后重试。'
          );
        },
      }
    );
  };

  if (invalidToken) {
    return (
      <AuthCard
        headerLabel="重置链接已失效"
        bottomButtonLabel={t('backToLogin')}
        bottomButtonHref={`${Routes.Login}`}
      >
        <div className="space-y-4">
          <FormError message="这封邮件中的重置链接无效、已使用或已经过期。请重新申请重置密码。" />
          <Button asChild className="w-full" size="lg">
            <Link href={Routes.ForgotPassword}>重新发送重置邮件</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      headerLabel={t('title')}
      bottomButtonLabel={t('backToLogin')}
      bottomButtonHref={`${Routes.Login}`}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('password')}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        disabled={isPending}
                        placeholder="******"
                        type={showPassword ? 'text' : 'password'}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={togglePasswordVisibility}
                        disabled={isPending}
                      >
                        {showPassword ? (
                          <EyeOffIcon className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <EyeIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="sr-only">
                          {showPassword ? t('hidePassword') : t('showPassword')}
                        </span>
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormError message={error} />
          {needsNewLink && (
            <Button asChild className="w-full" variant="outline">
              <Link href={Routes.ForgotPassword}>重新发送重置邮件</Link>
            </Button>
          )}
          <FormSuccess message={success} />
          <Button
            disabled={isPending}
            size="lg"
            type="submit"
            className="w-full cursor-pointer"
          >
            {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            <span>{t('reset')}</span>
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
};
