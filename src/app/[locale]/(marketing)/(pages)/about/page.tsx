import Container from '@/components/layout/container';
import { BlurFadeDemo } from '@/components/magicui/example/blur-fade-example';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { websiteConfig } from '@/config/website';
import { constructMetadata } from '@/lib/metadata';
import { getUrlWithLocale } from '@/lib/urls/urls';
import { MailIcon, TwitterIcon } from 'lucide-react';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({ locale, namespace: 'AboutPage' });

  return constructMetadata({
    title: pt('title') + ' | ' + t('title'),
    description: pt('description'),
    canonicalUrl: getUrlWithLocale('/about', locale),
  });
}

/**
 * inspired by https://astro-nomy.vercel.app/about
 */
export default async function AboutPage() {
  const t = await getTranslations('AboutPage');

  return (
    <Container className="py-16 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Avatar and name - centered */}
        <div className="flex flex-col items-center text-center">
          <Avatar className="size-32">
            <AvatarImage
              className="rounded-full border-4 border-background object-cover object-[center_42%]"
              src="/images/avatars/xiaobai.png"
              alt="小白"
            />
            <AvatarFallback>
              <div className="size-32 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>

          <h1 className="mt-6 text-3xl font-bold">{t('authorName')}</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {t('authorBio')}
          </p>
        </div>

        {/* Introduction */}
        <div className="mt-12">
          <div className="relative rounded-2xl border border-stone-200 bg-stone-50/70 px-6 py-7 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <span
              aria-hidden="true"
              className="absolute left-0 top-7 h-12 w-1 rounded-r-full bg-blue-600"
            />
            <p className="whitespace-pre-line pl-4 font-serif text-base leading-8 text-slate-700">
              {t('introduction')}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          {websiteConfig.mail.supportEmail && (
            <a
              href={`mailto:${websiteConfig.mail.supportEmail}`}
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <MailIcon className="size-4" />
              {t('talkWithMe')}
            </a>
          )}
          {websiteConfig.metadata.social?.twitter && (
            <a
              href={websiteConfig.metadata.social.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border px-6 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <TwitterIcon className="size-4" />
              {t('followMe')}
            </a>
          )}
        </div>

        {/* Image gallery section */}
        <div className="mt-16">
          <BlurFadeDemo />
        </div>
      </div>
    </Container>
  );
}
