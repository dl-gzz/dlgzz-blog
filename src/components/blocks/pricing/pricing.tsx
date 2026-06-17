import { HeaderSection } from '@/components/layout/header-section';
import { PricingTable } from '@/components/pricing/pricing-table';
import { useTranslations } from 'next-intl';

export default function PricingSection() {
  const t = useTranslations('HomePage.pricing');

  return (
    <section
      id="pricing"
      className="border-b border-slate-200 bg-[#f8f7f2] px-4 py-20 dark:border-white/10 dark:bg-neutral-950"
    >
      <div className="mx-auto max-w-6xl space-y-12 px-0 sm:px-6">
        <HeaderSection
          subtitle={t('subtitle')}
          subtitleAs="h2"
          subtitleClassName="max-w-3xl text-3xl font-black tracking-normal text-slate-950 sm:text-4xl dark:text-white"
          description={t('description')}
          descriptionAs="p"
          descriptionClassName="max-w-3xl text-base leading-8 text-slate-600 dark:text-white/64"
        />

        <PricingTable />
      </div>
    </section>
  );
}
