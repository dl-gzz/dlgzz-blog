'use client';

import { HeaderSection } from '@/components/layout/header-section';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { IconName } from 'lucide-react/dynamic';
import { useLocale, useTranslations } from 'next-intl';

type FAQItem = {
  id: string;
  icon: IconName;
  question: string;
  answer: string;
};

export default function FaqSection() {
  const locale = useLocale();
  const t = useTranslations('HomePage.faqs');

  const faqItems: FAQItem[] = [
    {
      id: 'item-1',
      icon: 'calendar-clock',
      question: t('items.item-1.question'),
      answer: t('items.item-1.answer'),
    },
    {
      id: 'item-2',
      icon: 'wallet',
      question: t('items.item-2.question'),
      answer: t('items.item-2.answer'),
    },
    {
      id: 'item-3',
      icon: 'refresh-cw',
      question: t('items.item-3.question'),
      answer: t('items.item-3.answer'),
    },
    {
      id: 'item-4',
      icon: 'hand-coins',
      question: t('items.item-4.question'),
      answer: t('items.item-4.answer'),
    },
    {
      id: 'item-5',
      icon: 'mail',
      question: t('items.item-5.question'),
      answer: t('items.item-5.answer'),
    },
  ];

  return (
    <section
      id="faqs"
      className="border-b border-slate-200 bg-white px-4 py-20 dark:border-white/10 dark:bg-neutral-950"
    >
      <div className="mx-auto max-w-4xl">
        <HeaderSection
          title={t('title')}
          titleAs="h2"
          subtitle={t('subtitle')}
          subtitleAs="p"
          titleClassName="text-sm text-emerald-700 dark:text-emerald-300"
          subtitleClassName="text-3xl font-black tracking-normal text-slate-950 sm:text-4xl dark:text-white"
        />

        <div className="mx-auto mt-10 max-w-4xl">
          <Accordion
            type="single"
            collapsible
            className="w-full rounded-lg border border-slate-200 bg-[#f8f7f2] px-4 py-2 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5"
          >
            {faqItems.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="border-slate-200 last:border-b-0 dark:border-white/10"
              >
                <AccordionTrigger className="cursor-pointer text-left text-base font-semibold text-slate-900 hover:no-underline dark:text-white">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-base leading-7 text-slate-600 dark:text-white/64">
                    {item.answer}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
