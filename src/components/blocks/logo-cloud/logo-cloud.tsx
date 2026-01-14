import { useTranslations } from 'next-intl';

export default function LogoCloudSection() {
  const t = useTranslations('HomePage.logocloud');

  return (
    <section id="logo-cloud" className="bg-background px-4 py-16">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-center text-xl font-medium">{t('title')}</h2>

        <div className="mx-auto mt-20 flex max-w-4xl flex-wrap items-center justify-center gap-x-12 gap-y-8 sm:gap-x-16 sm:gap-y-12">
          <img
            className="h-16 w-fit"
            src="/images/marketing/独立沉思录头像.png"
            alt="独立沉思录"
            height="64"
            width="auto"
          />
        </div>
      </div>
    </section>
  );
}
