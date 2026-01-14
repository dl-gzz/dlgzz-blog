import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

export default function CallToActionSection() {
  const t = useTranslations('HomePage.calltoaction');

  return (
    <section id="call-to-action" className="px-4 py-24 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="text-balance text-4xl font-semibold lg:text-5xl bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            {t('title')}
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">{t('description')}</p>

          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
              <LocaleLink href="/outfit">
                <span>{t('primaryButton')}</span>
              </LocaleLink>
            </Button>

            <Button asChild size="lg" variant="outline" className="border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-900/20">
              <LocaleLink href="https://demo.outfitai.com">
                <span>{t('secondaryButton')}</span>
              </LocaleLink>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
