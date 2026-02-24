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
              className="rounded-full border-4 border-background"
              src="/images/avatars/yihui.png"
              alt="Avatar"
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
        <div className="mt-12 prose prose-neutral dark:prose-invert mx-auto">
          <p className="text-base leading-relaxed text-muted-foreground">
            {t('introduction')}
          </p>
        </div>

        {/* Action buttons */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          {websiteConfig.mail.supportEmail && (
            <a
              href={`mailto:${websiteConfig.mail.supportEmail}`}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
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
