'use client';

import { NewsletterForm } from '@/components/newsletter/newsletter-form';
import { useTranslations } from 'next-intl';
import { HeaderSection } from '../layout/header-section';

export function NewsletterCard() {
  const t = useTranslations('Newsletter');

  return (
    <section className="w-full bg-[#f8f7f2] px-4 py-20 dark:bg-neutral-950">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5 sm:p-10">
        {/* Header */}
        <HeaderSection
          title={t('title')}
          subtitle={t('subtitle')}
          description={t('description')}
          titleClassName="text-sm text-emerald-700 dark:text-emerald-300"
          subtitleClassName="text-3xl font-black tracking-normal text-slate-950 dark:text-white"
          descriptionClassName="max-w-2xl text-base leading-8 text-slate-600 dark:text-white/64"
        />

        <NewsletterForm />
      </div>
    </section>
  );
}
