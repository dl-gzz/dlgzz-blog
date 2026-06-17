import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

export default function CallToActionSection() {
  const t = useTranslations('HomePage.calltoaction');

  return (
    <section
      id="call-to-action"
      className="border-b border-slate-200 bg-slate-950 px-4 py-20 text-white dark:border-white/10"
    >
      <div className="mx-auto max-w-5xl px-0 sm:px-6">
        <div className="text-center">
          <h2 className="text-balance text-3xl font-black tracking-normal sm:text-4xl lg:text-5xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-white/68 sm:text-lg">
            {t('description')}
          </p>

          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="rounded-lg bg-white text-slate-950 shadow-none hover:bg-white/90"
            >
              <LocaleLink href="/bots">
                <span>{t('primaryButton')}</span>
              </LocaleLink>
            </Button>

            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-lg border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <LocaleLink href="/blog">
                <span>{t('secondaryButton')}</span>
              </LocaleLink>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
