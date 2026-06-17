import { useTranslations } from 'next-intl';

export default function LogoCloudSection() {
  const t = useTranslations('HomePage.logocloud');

  return (
    <section
      id="logo-cloud"
      className="border-b border-slate-200 bg-white px-4 py-14 dark:border-white/10 dark:bg-neutral-950"
    >
      <div className="mx-auto max-w-5xl px-0 sm:px-6">
        <h2 className="text-center text-sm font-semibold uppercase text-slate-500 dark:text-white/48">
          {t('title')}
        </h2>

        <div className="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-center gap-x-12 gap-y-8 sm:gap-x-16 sm:gap-y-12">
          <div
            aria-label="独立工作者"
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-[#f8f7f2] px-5 py-3 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5"
          >
            <span className="flex size-8 items-center justify-center rounded-md bg-slate-950 text-sm font-black text-white dark:bg-white dark:text-slate-950">
              独
            </span>
            <span className="text-base font-semibold text-slate-900 dark:text-white">
              独立工作者
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
