import { HeaderSection } from '@/components/layout/header-section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LocaleLink } from '@/i18n/navigation';
import { ChevronRight, Brain, Eye, Zap, Search, Database, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type * as React from 'react';

export default function IntegrationSection() {
  const t = useTranslations('HomePage.integration');

  return (
    <section id="integration" className="px-4 py-16 bg-gradient-to-br from-purple-50/50 to-blue-50/50 dark:from-purple-900/10 dark:to-blue-900/10">
      <div className="mx-auto max-w-5xl">
        <HeaderSection
          title={t('title')}
          subtitle={t('subtitle')}
          description={t('description')}
          subtitleAs="h2"
          descriptionAs="p"
        />

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <IntegrationCard
            title={t('items.item-1.title')}
            description={t('items.item-1.description')}
            icon={<Eye className="size-10 text-purple-600" />}
          />

          <IntegrationCard
            title={t('items.item-2.title')}
            description={t('items.item-2.description')}
            icon={<Zap className="size-10 text-blue-600" />}
          />

          <IntegrationCard
            title={t('items.item-3.title')}
            description={t('items.item-3.description')}
            icon={<Brain className="size-10 text-purple-600" />}
          />

          <IntegrationCard
            title={t('items.item-4.title')}
            description={t('items.item-4.description')}
            icon={<Zap className="size-10 text-blue-600" />}
          />

          <IntegrationCard
            title={t('items.item-5.title')}
            description={t('items.item-5.description')}
            icon={<Database className="size-10 text-purple-600" />}
          />

          <IntegrationCard
            title={t('items.item-6.title')}
            description={t('items.item-6.description')}
            icon={<TrendingUp className="size-10 text-blue-600" />}
          />
        </div>
      </div>
    </section>
  );
}

const IntegrationCard = ({
  title,
  description,
  icon,
  link = '#',
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  link?: string;
}) => {
  const t = useTranslations('HomePage.integration');

  return (
    <Card className="p-6 hover:bg-accent dark:hover:bg-accent border-purple-100 dark:border-purple-800 hover:border-purple-200 dark:hover:border-purple-700 transition-colors">
      <div className="relative">
        <div className="*:size-10">{icon}</div>

        <div className="space-y-2 py-6">
          <h3 className="text-base font-medium">{title}</h3>
          <p className="text-muted-foreground line-clamp-2 text-sm">
            {description}
          </p>
        </div>

        <div className="flex gap-3 border-t border-dashed pt-6">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-1 pr-2 shadow-none border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-900/20"
          >
            <LocaleLink href={link}>
              {t('learnMore')}
              <ChevronRight className="ml-0 !size-3.5 opacity-50" />
            </LocaleLink>
          </Button>
        </div>
      </div>
    </Card>
  );
};
