import 'server-only';

import { blogSource } from '@/lib/source';
import { normalizeServiceManifest, type ServiceManifestV1 } from '@/lib/service-manifest';
import { buildServiceInstallApiPath } from '@/lib/service-routes';

export interface ServiceCatalogItem {
  locale: string;
  slug: string;
  url: string;
  title: string;
  description: string;
  image: string;
  date: string;
  premium: boolean;
  categories: string[];
  whiteboardPrompt?: string;
  manifest: ServiceManifestV1;
  installApiPath: string;
}

export function getServiceCatalog(locale: string) {
  const items: ServiceCatalogItem[] = [];

  blogSource
    .getPages(locale)
    .filter((post) => post.data.published)
    .forEach((post) => {
      const manifest = normalizeServiceManifest((post.data as any).service_manifest);
      if (!manifest) return;

      const slug = post.slugs.join('/');
      const premium = Boolean(post.data.premium) || manifest.pricing.mode === 'premium';
      const resolvedManifest: ServiceManifestV1 = premium
        ? {
            ...manifest,
            pricing: {
              ...manifest.pricing,
              mode: 'premium',
            },
          }
        : manifest;

      items.push({
        locale,
        slug,
        url: post.url,
        title: post.data.title || resolvedManifest.name,
        description: post.data.description || resolvedManifest.summary || '',
        image: post.data.image || '',
        date: post.data.date,
        premium,
        categories: Array.isArray(post.data.categories) ? post.data.categories : [],
        whiteboardPrompt:
          typeof (post.data as any).whiteboard_prompt === 'string'
            ? (post.data as any).whiteboard_prompt
            : undefined,
        manifest: resolvedManifest,
        installApiPath: buildServiceInstallApiPath(locale, slug),
      });
    });

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getServiceCatalogItem(locale: string, slug: string) {
  return getServiceCatalog(locale).find((item) => item.slug === slug) || null;
}
