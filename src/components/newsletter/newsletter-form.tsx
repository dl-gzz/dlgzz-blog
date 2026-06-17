'use client';

import { subscribeNewsletterAction } from '@/actions/subscribe-newsletter';
import { FormError } from '@/components/shared/form-error';
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
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { PaperPlaneIcon } from '@radix-ui/react-icons';
import { Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export function NewsletterForm() {
  const t = useTranslations('Newsletter.form');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  // newsletter schema
  const NewsletterFormSchema = z.object({
    email: z.string().email({
      message: t('emailValidation'),
    }),
  });

  // newsletter form data
  type NewsletterFormData = z.infer<typeof NewsletterFormSchema>;

  // initialize the form
  const form = useForm<NewsletterFormData>({
    resolver: zodResolver(NewsletterFormSchema),
    defaultValues: {
      email: '',
    },
  });

  // handle form submission
  function onSubmit(data: NewsletterFormData) {
    startTransition(async () => {
      try {
        setError(undefined);

        const result = await subscribeNewsletterAction({
          email: data.email,
        });

        if (result?.data?.success) {
          toast.success(t('success'));
          form.reset();
        } else {
          const errorMessage = result?.data?.error || t('fail');
          setError(errorMessage);
          toast.error(errorMessage);
        }
      } catch (err) {
        console.error('Newsletter subscription error:', err);
        const errorMessage = t('fail');
        setError(errorMessage);
        toast.error(errorMessage);
      }
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mx-auto flex w-full max-w-md flex-col items-center justify-center space-y-4"
      >
        <div className="flex w-full items-center">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="relative w-full space-y-0">
                <FormLabel className="sr-only">{t('email')}</FormLabel>
                <FormControl className="rounded-r-none">
                  <Input
                    type="email"
                    className={cn(
                      'h-12 w-full rounded-l-lg rounded-r-none border-slate-300 bg-white',
                      'focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-slate-950 focus:border-2 focus:border-r-0 dark:border-white/10 dark:bg-white/5'
                    )}
                    placeholder={t('email')}
                    {...field}
                  />
                </FormControl>
                <div className="absolute -bottom-6 left-0">
                  <FormMessage className="text-sm text-destructive" />
                </div>
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="size-12 cursor-pointer rounded-l-none rounded-r-lg bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-white/90"
            disabled={isPending}
          >
            {isPending ? (
              <Loader2Icon className="size-6 animate-spin" aria-hidden="true" />
            ) : (
              <PaperPlaneIcon className="size-6" aria-hidden="true" />
            )}
            <span className="sr-only">{t('subscribe')}</span>
          </Button>
        </div>

        {error && (
          <div className="w-full">
            <FormError message={error} />
          </div>
        )}
      </form>
    </Form>
  );
}
