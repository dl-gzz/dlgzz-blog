import { useTranslations } from 'next-intl';

export default function LogoCloudSection() {
  const t = useTranslations('HomePage.logocloud');

  return (
    <section id="logo-cloud" className="bg-background px-4 py-16">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-center text-xl font-medium">{t('title')}</h2>

        <div className="mx-auto mt-20 flex max-w-4xl flex-wrap items-center justify-center gap-x-12 gap-y-8 sm:gap-x-16 sm:gap-y-12">
          <img
            className="h-8 w-fit dark:invert"
            src="/images/marketing/lululemon-logo.png"
            alt="Lululemon Logo"
            height="20"
            width="auto"
          />
          <img
            className="h-8 w-fit dark:invert"
            src="/images/marketing/lv-logo.png"
            alt="LV Logo"
            height="20"
            width="auto"
          />

          <img
            className="h-8 w-fit dark:invert"
            src="/images/marketing/nike-logo.png"
            alt="Nike Logo"
            height="20"
            width="auto"
          />
          <img
            className="h-8 w-fit dark:invert"
            src="/images/marketing/muji-logo.png"
            alt="Muji Logo"
            height="20"
            width="auto"
          />
          <img
            className="h-8 w-fit dark:invert"
            src="/images/marketing/patagonia-logo.png"
            alt="Patagonia Logo"
            height="20"
            width="auto"
          />
          <img
            className="h-8 w-fit dark:invert"
            src="/images/marketing/supreme-logo.png"
            alt="Supreme Logo"
            height="20"
            width="auto"
          />
           <img
            className="h-8 w-fit dark:invert"
            src="/images/marketing/uniqlo-logo.png"
            alt="Uniqlo Logo"
            height="20"
            width="auto"
          />
           <img
            className="h-8 w-fit dark:invert"
            src="/images/marketing/zara-logo.webp"
            alt="Zara Logo"
            height="20"
            width="auto"
          />
        </div>
      </div>
    </section>
  );
}
