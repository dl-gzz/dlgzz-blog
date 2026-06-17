import { AnimatedGroup } from '@/components/tailark/motion/animated-group';
import { TextEffect } from '@/components/tailark/motion/text-effect';
import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

const transitionVariants = {
  item: {
    hidden: {
      opacity: 0,
      filter: 'blur(12px)',
      y: 12,
    },
    visible: {
      opacity: 1,
      filter: 'blur(0px)',
      y: 0,
      transition: {
        type: 'spring',
        bounce: 0.3,
        duration: 1.5,
      },
    },
  },
};

export default function HeroSection() {
  const t = useTranslations('HomePage.hero');
  const linkIntroduction = '/bots';
  const linkPrimary = '/bots';
  const linkSecondary = '/blog';

  return (
    <>
      <main
        id="hero"
        className="overflow-hidden border-b border-slate-200 bg-[#f8f7f2] text-slate-950 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
      >
        <section>
          <div className="relative px-4 pt-24 sm:px-6 lg:pt-28">
            <div
              aria-hidden
              className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.06)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40 dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)]"
            />
            <div className="relative mx-auto max-w-7xl">
              <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
                {/* introduction */}
                <AnimatedGroup variants={transitionVariants}>
                  <LocaleLink
                    href={linkIntroduction}
                    className="group mx-auto flex w-fit items-center gap-3 rounded-lg border border-slate-300 bg-white/80 p-1 pl-4 shadow-sm shadow-slate-950/5 backdrop-blur transition-colors duration-300 hover:border-slate-400 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <span className="text-sm font-medium text-slate-700 dark:text-white/78">
                      {t('introduction')}
                    </span>

                    <div className="size-7 overflow-hidden rounded-md bg-slate-950 text-white duration-500 group-hover:bg-emerald-700 dark:bg-white dark:text-slate-950">
                      <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3" />
                        </span>
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3" />
                        </span>
                      </div>
                    </div>
                  </LocaleLink>
                </AnimatedGroup>

                {/* title */}
                <TextEffect
                  per="line"
                  preset="fade-in-blur"
                  speedSegment={0.3}
                  as="h1"
                  className="mx-auto mt-8 max-w-5xl text-balance text-5xl font-black leading-[1.04] text-slate-950 sm:text-6xl lg:mt-14 xl:text-[5rem] dark:text-white"
                >
                  {t('title')}
                </TextEffect>

                {/* description */}
                <TextEffect
                  per="line"
                  preset="fade-in-blur"
                  speedSegment={0.3}
                  delay={0.5}
                  as="p"
                  className="mx-auto mt-7 max-w-3xl text-balance text-base leading-8 text-slate-600 sm:text-lg dark:text-white/66"
                >
                  {t('description')}
                </TextEffect>

                {/* action buttons */}
                <AnimatedGroup
                  variants={{
                    container: {
                      visible: {
                        transition: {
                          staggerChildren: 0.05,
                          delayChildren: 0.75,
                        },
                      },
                    },
                    ...transitionVariants,
                  }}
                  className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center"
                >
                  <div
                    key={1}
                    className="rounded-lg border border-slate-950/10 bg-slate-950/10 p-0.5 dark:border-white/15 dark:bg-white/10"
                  >
                    <Button
                      asChild
                      size="lg"
                      className="w-full rounded-lg bg-slate-950 px-5 text-base text-white shadow-none hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-white/90 sm:w-auto"
                    >
                      <LocaleLink href={linkPrimary}>
                        <span className="text-nowrap">{t('primary')}</span>
                      </LocaleLink>
                    </Button>
                  </div>
                  <Button
                    key={2}
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-10.5 rounded-lg border-slate-300 bg-white/70 px-5 text-slate-800 shadow-sm shadow-slate-950/5 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  >
                    <LocaleLink href={linkSecondary}>
                      <span className="text-nowrap">{t('secondary')}</span>
                    </LocaleLink>
                  </Button>
                </AnimatedGroup>
              </div>
            </div>

            {/* images */}
            <AnimatedGroup
              variants={{
                container: {
                  visible: {
                    transition: {
                      staggerChildren: 0.05,
                      delayChildren: 0.75,
                    },
                  },
                },
                ...transitionVariants,
              }}
            >
              <div className="relative -mr-32 mt-10 overflow-hidden px-2 pb-14 sm:mr-0 sm:mt-14 md:mt-20 lg:pb-20">
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 z-10 h-32 bg-linear-to-b from-transparent to-[#f8f7f2] dark:to-neutral-950"
                />
                <div className="relative mx-auto max-w-6xl overflow-hidden rounded-lg border border-slate-300 bg-white p-2 shadow-xl shadow-slate-950/10 ring-1 ring-white/80 dark:border-white/10 dark:bg-white/5 dark:shadow-black/30 dark:ring-white/10 sm:p-3">
                  <Image
                    className="relative hidden rounded-md bg-white dark:block"
                    src="/images/marketing/hero.png"
                    alt="独立工作者平台界面"
                    width={2796}
                    height={2008}
                  />
                  <Image
                    className="z-2 relative rounded-md border border-slate-200 dark:hidden"
                    src="/images/marketing/hero.png"
                    alt="独立工作者平台界面"
                    width={2796}
                    height={2008}
                  />
                </div>
              </div>
            </AnimatedGroup>
          </div>
        </section>
      </main>
    </>
  );
}
