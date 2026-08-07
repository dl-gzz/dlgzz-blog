import { AnimatedGroup } from '@/components/tailark/motion/animated-group';
import { TextEffect } from '@/components/tailark/motion/text-effect';
import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import {
  ArrowRight,
  Bot,
  Check,
  Database,
  KeyRound,
  Sparkles,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

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
  // 主线：先免费试用知识库（最强转化钩子）→ 开通会员 → 读博客。
  // /bots 已冻结，不再作为入口。
  const linkIntroduction = '/ai-chat';
  const linkPrimary = '/ai-chat';
  const linkSecondary = '/pricing';

  return (
    <>
      <main
        id="hero"
        className="overflow-hidden border-b border-slate-200 bg-[#f8f7f2] text-slate-950 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
      >
        <section>
          <div className="relative px-4 pt-20 sm:px-6 lg:pt-24">
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.16),transparent_62%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.2),transparent_62%)]"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.055)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_74%)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)]"
            />
            <div className="relative mx-auto max-w-7xl">
              <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
                {/* introduction */}
                <AnimatedGroup variants={transitionVariants}>
                  <LocaleLink
                    href={linkIntroduction}
                    className="group mx-auto flex w-fit items-center gap-3 rounded-full border border-violet-200 bg-white/80 p-1 pl-4 shadow-sm shadow-violet-950/5 backdrop-blur transition-colors duration-300 hover:border-violet-300 hover:bg-white dark:border-violet-400/20 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <span className="text-sm font-semibold text-slate-700 dark:text-white/78">
                      {t('introduction')}
                    </span>

                    <div className="size-7 overflow-hidden rounded-full bg-violet-600 text-white duration-500 group-hover:bg-violet-700 dark:bg-violet-400 dark:text-slate-950">
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
                  className="mx-auto mt-8 max-w-5xl text-balance text-5xl font-black leading-[1.02] tracking-[-0.055em] text-slate-950 sm:text-6xl lg:mt-12 lg:text-7xl xl:text-[5.25rem] dark:text-white"
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
                  className="mx-auto mt-7 max-w-2xl text-balance text-base leading-8 text-slate-600 sm:text-lg dark:text-white/66"
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
                  className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center"
                >
                  <div
                    key={1}
                    className="rounded-xl bg-linear-to-r from-violet-500 to-blue-500 p-px shadow-lg shadow-violet-500/20"
                  >
                    <Button
                      asChild
                      size="lg"
                      className="w-full rounded-[0.7rem] bg-slate-950 px-5 text-base text-white shadow-none hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-white/90 sm:w-auto"
                    >
                      <LocaleLink href={linkPrimary}>
                        <span className="text-nowrap">{t('primary')}</span>
                        <ArrowRight className="size-4" />
                      </LocaleLink>
                    </Button>
                  </div>
                  <Button
                    key={2}
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-10.5 rounded-xl border-slate-300 bg-white/70 px-5 text-slate-800 shadow-sm shadow-slate-950/5 hover:border-slate-400 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  >
                    <LocaleLink href={linkSecondary}>
                      <span className="text-nowrap">{t('secondary')}</span>
                    </LocaleLink>
                  </Button>
                </AnimatedGroup>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500 dark:text-white/48">
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    {t('trust.daily')}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    {t('trust.api')}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    {t('trust.noCard')}
                  </span>
                </div>
              </div>
            </div>

            {/* Product preview */}
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
              <div className="relative mx-auto mt-12 max-w-6xl px-1 pb-14 sm:mt-16 sm:px-2 lg:pb-20">
                <div
                  aria-hidden
                  className="absolute inset-x-16 -top-10 h-40 rounded-full bg-violet-400/25 blur-3xl dark:bg-violet-500/20"
                />
                <div className="relative overflow-hidden rounded-[1.6rem] border border-slate-700/80 bg-slate-950 p-2 shadow-2xl shadow-slate-950/25 ring-1 ring-white/10 sm:p-3">
                  <div className="overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#101827] text-slate-100">
                    <div className="flex h-12 items-center justify-between border-b border-white/10 px-4 sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-rose-400/90" />
                        <span className="size-2 rounded-full bg-amber-300/90" />
                        <span className="size-2 rounded-full bg-emerald-400/90" />
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                        {t('preview.status')}
                      </div>
                    </div>

                    <div className="grid min-h-[27rem] sm:min-h-[32rem] md:grid-cols-[13rem_1fr]">
                      <aside className="hidden border-r border-white/10 bg-[#0c1320] p-4 md:block">
                        <div className="flex items-center gap-2 px-2 text-sm font-semibold text-white">
                          <span className="flex size-7 items-center justify-center rounded-lg bg-linear-to-br from-violet-400 to-indigo-500 shadow-lg shadow-violet-500/20">
                            <Database className="size-4" />
                          </span>
                          {t('preview.workspace')}
                        </div>
                        <div className="mt-7 space-y-1.5 text-sm text-slate-400">
                          <div className="rounded-lg bg-white/8 px-3 py-2.5 font-medium text-white">
                            {t('preview.library')}
                          </div>
                          <div className="px-3 py-2">
                            {t('preview.updates')}
                          </div>
                          <div className="px-3 py-2">
                            {t('preview.apiKeys')}
                          </div>
                        </div>
                        <div className="mt-8 rounded-xl border border-violet-400/20 bg-violet-400/8 p-3">
                          <div className="flex items-center gap-2 text-xs font-medium text-violet-200">
                            <Sparkles className="size-3.5" />
                            {t('preview.dailyUpdate')}
                          </div>
                          <p className="mt-2 text-[11px] leading-5 text-slate-400">
                            {t('preview.updateDescription')}
                          </p>
                        </div>
                      </aside>

                      <div className="relative overflow-hidden p-4 sm:p-6">
                        <div
                          aria-hidden
                          className="absolute -right-24 -top-24 size-72 rounded-full bg-violet-500/20 blur-3xl"
                        />
                        <div className="relative mx-auto max-w-2xl">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-300">
                                {t('preview.eyebrow')}
                              </p>
                              <h2 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
                                {t('preview.title')}
                              </h2>
                            </div>
                            <div className="hidden rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-right sm:block">
                              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                                {t('preview.sources')}
                              </p>
                              <p className="mt-0.5 text-sm font-semibold text-white">
                                724
                              </p>
                            </div>
                          </div>

                          <div className="mt-6 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <Database className="size-3.5 text-violet-300" />
                                {t('preview.index')}
                              </div>
                              <p className="mt-3 text-lg font-semibold text-white">
                                724 {t('preview.documents')}
                              </p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <KeyRound className="size-3.5 text-emerald-300" />
                                {t('preview.connection')}
                              </div>
                              <p className="mt-3 flex items-center gap-2 text-lg font-semibold text-white">
                                <span className="size-2 rounded-full bg-emerald-400" />
                                {t('preview.connected')}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/65 p-4 shadow-xl shadow-black/10 backdrop-blur sm:p-5">
                            <div className="flex items-center gap-3">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500 text-white">
                                <Bot className="size-4" />
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {t('preview.chatTitle')}
                                </p>
                                <p className="text-xs text-slate-400">
                                  {t('preview.chatSubtitle')}
                                </p>
                              </div>
                            </div>
                            <div className="mt-5 ml-11 max-w-md rounded-xl rounded-tl-sm bg-white/8 px-4 py-3 text-sm leading-6 text-slate-200">
                              {t('preview.answer')}
                            </div>
                            <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-500">
                              <Sparkles className="size-4 text-violet-300" />
                              <span>{t('preview.placeholder')}</span>
                              <ArrowRight className="ml-auto size-4 text-slate-300" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </AnimatedGroup>
          </div>
        </section>
      </main>
    </>
  );
}
