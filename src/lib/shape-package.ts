import 'server-only';

import type { ServiceManifestV1 } from '@/lib/service-manifest';
import { getServiceArticleBundle } from '@/lib/service-article';
import { getServiceCatalogItem } from '@/lib/service-catalog';

export interface ShapePackageV1 {
  schema_version: '1';
  package_kind: 'shape' | 'plugin';
  package_id: string;
  service_id: string;
  slug: string;
  locale: string;
  packaged_at: string;
  runtime: {
    mode: 'native_shape' | 'plugin_shape';
    shape_type: string;
    entry_props?: Record<string, any>;
  };
  manifest: ServiceManifestV1;
  article_bundle?: Record<string, any>;
  agent_spec?: Record<string, any>;
  plugin_spec?: Record<string, any>;
  source?: {
    package_url?: string;
    store_origin?: string;
  };
}

export async function buildShapePackage(locale: string, slug: string, storeOrigin?: string) {
  const item = getServiceCatalogItem(locale, slug);
  if (!item) return null;

  const articleBundle = await getServiceArticleBundle(locale, slug);
  const pluginSpec = articleBundle?.pluginSpec;
  const isPluginPackage = Boolean(pluginSpec);

  return {
    schema_version: '1',
    package_kind: isPluginPackage ? 'plugin' : 'shape',
    package_id: item.manifest.id,
    service_id: item.manifest.id,
    slug: item.slug,
    locale: item.locale,
    packaged_at: new Date().toISOString(),
    runtime: {
      mode: isPluginPackage ? 'plugin_shape' : 'native_shape',
      shape_type: item.manifest.entry.shape_type,
      entry_props: item.manifest.entry.props || undefined,
    },
    manifest: item.manifest,
    article_bundle: articleBundle || undefined,
    agent_spec: articleBundle?.agentSpec,
    plugin_spec: pluginSpec,
    source: storeOrigin
      ? {
          store_origin: storeOrigin,
          package_url: `${storeOrigin}/api/services/package?locale=${encodeURIComponent(locale)}&slug=${encodeURIComponent(slug)}`,
        }
      : undefined,
  } satisfies ShapePackageV1;
}
