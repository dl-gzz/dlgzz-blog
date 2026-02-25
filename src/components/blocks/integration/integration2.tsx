import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

export default function Integration2Section() {
  const t = useTranslations('HomePage.integration2');

  return (
    <section>
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid items-center sm:grid-cols-2">
            <div className="dark:bg-muted/50 relative mx-auto w-fit">
              <div className="bg-radial to-muted dark:to-background absolute inset-0 z-10 from-transparent to-75%" />
              <div className="mx-auto mb-2 flex w-fit justify-center gap-2">
                <IntegrationCard>
                  <img
                    className="size-8 object-contain"
                    src="/images/marketing/one-worker-logo.png"
                    alt="独立工作者"
                  />
                </IntegrationCard>
                <IntegrationCard>
                  <img
                    className="size-8 object-contain"
                    src="/images/marketing/one-worker-logo.png"
                    alt="独立工作者"
                  />
                </IntegrationCard>
              </div>
              <div className="mx-auto my-2 flex w-fit justify-center gap-2">
                <IntegrationCard>
                  <img
                    className="size-8 object-contain"
                    src="/images/marketing/one-worker-logo.png"
                    alt="独立工作者"
                  />
                </IntegrationCard>
                <IntegrationCard
                  borderClassName="shadow-purple-500/20 shadow-xl border-purple-300 dark:border-purple-600"
                  className="dark:bg-purple-500/10 bg-gradient-to-br from-purple-100 to-blue-100"
                >
                  <Logo />
                </IntegrationCard>
                <IntegrationCard>
                  <img
                    className="size-8 object-contain"
                    src="/images/marketing/one-worker-logo.png"
                    alt="独立工作者"
                  />
                </IntegrationCard>
              </div>

              <div className="mx-auto flex w-fit justify-center gap-2">
                <IntegrationCard>
                  <img
                    className="size-8 object-contain"
                    src="/images/marketing/one-worker-logo.png"
                    alt="独立工作者"
                  />
                </IntegrationCard>
                <IntegrationCard>
                  <img
                    className="size-8 object-contain"
                    src="/images/marketing/one-worker-logo.png"
                    alt="独立工作者"
                  />
                </IntegrationCard>
              </div>
            </div>
            <div className="mx-auto mt-6 max-w-lg space-y-6 text-center sm:mt-0 sm:text-left">
              <h2 className="text-balance text-3xl font-semibold md:text-4xl bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                {t('title')}
              </h2>
              <p className="text-muted-foreground">{t('description')}</p>

              <div className="mt-12 flex flex-wrap justify-start gap-4">
                <Button asChild size="lg" className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
                  <LocaleLink href="/blog">
                    <span>{t('primaryButton')}</span>
                  </LocaleLink>
                </Button>

                <Button asChild size="lg" variant="outline" className="border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-900/20">
                  <LocaleLink href="/about">
                    <span>{t('secondaryButton')}</span>
                  </LocaleLink>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const IntegrationCard = ({
  children,
  className,
  borderClassName,
}: {
  children: React.ReactNode;
  className?: string;
  borderClassName?: string;
}) => {
  return (
    <div
      className={cn(
        'bg-background relative flex size-20 rounded-xl dark:bg-transparent',
        className
      )}
    >
      <div
        role="presentation"
        className={cn(
          'absolute inset-0 rounded-xl border border-black/20 dark:border-white/25',
          borderClassName
        )}
      />
      <div className="relative z-20 m-auto size-fit *:size-8">{children}</div>
    </div>
  );
};
