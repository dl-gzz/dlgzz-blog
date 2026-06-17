'use client';

import { HeaderSection } from '@/components/layout/header-section';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Palette, Search, Sparkles, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useState } from 'react';

/**
 * 独立工作者 Features Section - AI-powered virtual try-on features
 */
export default function FeaturesSection() {
  const t = useTranslations('HomePage.features');
  type ImageKey = 'item-1' | 'item-2' | 'item-3' | 'item-4';
  const [activeItem, setActiveItem] = useState<ImageKey>('item-1');

  const images = {
    'item-1': {
      image: '/images/marketing/feature1.png',
      darkImage: '/images/marketing/feature1.png',
      alt: 'AI问答功能界面',
    },
    'item-2': {
      image: '/images/marketing/feature2.png',
      darkImage: '/images/marketing/feature2.png',
      alt: '内容交互功能界面',
    },
    'item-3': {
      image: '/images/marketing/feature3.png',
      darkImage: '/images/marketing/feature3.png',
      alt: '文档下载功能界面',
    },
    'item-4': {
      image: '/images/marketing/feature4.png',
      darkImage: '/images/marketing/feature4.png',
      alt: '多模态体验功能界面',
    },
  };

  return (
    <section
      id="features"
      className="border-b border-slate-200 bg-white px-4 py-20 dark:border-white/10 dark:bg-neutral-950"
    >
      <div className="mx-auto max-w-6xl space-y-10 lg:space-y-16">
        <HeaderSection
          title={t('title')}
          subtitle={t('subtitle')}
          subtitleAs="h2"
          subtitleClassName="max-w-3xl text-3xl font-black tracking-normal text-slate-950 sm:text-4xl dark:text-white"
          description={t('description')}
          descriptionAs="p"
          descriptionClassName="max-w-3xl text-base leading-8 text-slate-600 dark:text-white/64"
        />

        <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="flex flex-col gap-6 lg:col-span-5">
            <div className="border border-slate-200 bg-[#f8f7f2] p-6 text-left dark:border-white/10 dark:bg-white/5">
              <h3 className="text-2xl font-black leading-tight text-slate-950 sm:text-3xl dark:text-white">
                {t('title')}
              </h3>
              <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-white/64">
                {t('description')}
              </p>
            </div>
            <Accordion
              type="single"
              value={activeItem}
              onValueChange={(value) => setActiveItem(value as ImageKey)}
              className="w-full space-y-3"
            >
              <AccordionItem
                value="item-1"
                className="rounded-lg border border-slate-200 bg-white px-4 dark:border-white/10 dark:bg-white/5"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2 text-base">
                    <Sparkles className="size-4 text-emerald-700 dark:text-emerald-300" />
                    {t('items.item-1.title')}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="leading-7 text-slate-600 dark:text-white/64">
                  {t('items.item-1.description')}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem
                value="item-2"
                className="rounded-lg border border-slate-200 bg-white px-4 dark:border-white/10 dark:bg-white/5"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2 text-base">
                    <Search className="size-4 text-sky-700 dark:text-sky-300" />
                    {t('items.item-2.title')}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="leading-7 text-slate-600 dark:text-white/64">
                  {t('items.item-2.description')}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem
                value="item-3"
                className="rounded-lg border border-slate-200 bg-white px-4 dark:border-white/10 dark:bg-white/5"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2 text-base">
                    <Palette className="size-4 text-amber-700 dark:text-amber-300" />
                    {t('items.item-3.title')}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="leading-7 text-slate-600 dark:text-white/64">
                  {t('items.item-3.description')}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem
                value="item-4"
                className="rounded-lg border border-slate-200 bg-white px-4 dark:border-white/10 dark:bg-white/5"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2 text-base">
                    <Zap className="size-4 text-rose-700 dark:text-rose-300" />
                    {t('items.item-4.title')}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="leading-7 text-slate-600 dark:text-white/64">
                  {t('items.item-4.description')}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <div className="relative flex w-full overflow-hidden rounded-lg border border-slate-200 bg-[#f8f7f2] p-2 shadow-sm dark:border-white/10 dark:bg-white/5 lg:col-span-7 lg:h-auto">
            <div className="aspect-76/59 relative w-full rounded-md bg-white dark:bg-neutral-950">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeItem}-id`}
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="size-full overflow-hidden rounded-md border border-slate-200 bg-zinc-900 shadow-md shadow-slate-950/10 dark:border-white/10 dark:shadow-black/30"
                >
                  <Image
                    src={images[activeItem].image}
                    className="size-full object-cover object-left-top dark:hidden"
                    alt={images[activeItem].alt}
                    width={1207}
                    height={929}
                  />
                  <Image
                    src={images[activeItem].darkImage}
                    className="size-full object-cover object-left-top dark:block hidden"
                    alt={images[activeItem].alt}
                    width={1207}
                    height={929}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
