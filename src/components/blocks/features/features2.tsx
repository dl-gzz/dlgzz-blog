import { HeaderSection } from '@/components/layout/header-section';
import {
  Brain,
  Scan,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

/**
 * 独立工作者 Features2 Section - Advanced AI Capabilities
 */
export default function Features2Section() {
  const t = useTranslations('HomePage.features2');

  return (
    <section id="features2" className="px-4 py-16">
      <div className="mx-auto max-w-6xl space-y-8 lg:space-y-20">
        <HeaderSection
          title={t('title')}
          subtitle={t('subtitle')}
          subtitleAs="h2"
          description={t('description')}
          descriptionAs="p"
        />

        <div className="grid items-center gap-12 lg:grid-cols-5 lg:gap-24">
          <div className="lg:col-span-2">
            <div className="lg:pr-0">
              <h2 className="text-4xl font-semibold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                {t('title')}
              </h2>
              <p className="mt-6 text-muted-foreground">{t('description')}</p>
            </div>

            <ul className="mt-8 divide-y border-y *:flex *:items-center *:gap-3 *:py-3">
              <li>
                <Brain className="size-5 text-purple-600" />
                {t('feature-1')}
              </li>
              <li>
                <Scan className="size-5 text-blue-600" />
                {t('feature-2')}
              </li>
              <li>
                <Sparkles className="size-5 text-purple-600" />
                {t('feature-3')}
              </li>
              <li>
                <TrendingUp className="size-5 text-blue-600" />
                {t('feature-4')}
              </li>
            </ul>
          </div>

          <div className="border-border/50 relative rounded-3xl border p-3 lg:col-span-3 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
            <div className="bg-linear-to-b aspect-76/59 relative rounded-2xl from-zinc-300 to-transparent p-px dark:from-zinc-700">
              <Image
                src="/images/marketing/ai-tech.png"
                className="hidden rounded-[15px] dark:block"
                alt="独立工作者 advanced features interface"
                width={1207}
                height={929}
              />
              <Image
                src="/images/marketing/ai-tech.png"
                className="rounded-[15px] shadow dark:hidden"
                alt="独立工作者 advanced features interface"
                width={1207}
                height={929}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
