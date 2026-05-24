import 'server-only';

import {
  type AgentSpecV1,
  getServiceArticleBundle,
} from '@/lib/service-article';
import { getServiceCatalogItem } from '@/lib/service-catalog';
import type { ServiceManifestV1 } from '@/lib/service-manifest';

export interface ShapePackageV1 {
  schema_version: '1';
  package_kind: 'shape' | 'plugin' | 'skill';
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
  skill_spec?: SkillPackageSpecV1;
  shape_hint?: ShapeHintV1;
  plugin_spec?: Record<string, any>;
  source?: {
    package_url?: string;
    store_origin?: string;
  };
}

export interface ShapeHintV1 {
  shape_type: 'skill_shape' | 'plugin_shape' | string;
  title: string;
  icon?: string;
  description?: string;
  default_props?: Record<string, any>;
}

export interface SkillPackageSpecV1 {
  schema_version: '1';
  skill_id: string;
  title: string;
  summary?: string;
  instructions: string;
  inputs: AgentSpecV1['inputs'];
  outputs: AgentSpecV1['outputs'];
  actions: AgentSpecV1['actions'];
  command_examples: string[];
  operating_notes: string[];
}

function buildSkillSpec(
  item: NonNullable<ReturnType<typeof getServiceCatalogItem>>,
  agentSpec?: AgentSpecV1
) {
  const title =
    agentSpec?.title || item.manifest.entry.title || item.manifest.name;

  return {
    schema_version: '1',
    skill_id: item.manifest.id,
    title,
    summary: item.manifest.summary || item.description,
    instructions:
      agentSpec?.purpose ||
      item.manifest.compatibility?.fallback_prompt ||
      item.manifest.summary ||
      item.description,
    inputs: agentSpec?.inputs || [],
    outputs: agentSpec?.outputs || item.manifest.outputs?.primary || [],
    actions: agentSpec?.actions || [],
    command_examples: agentSpec?.commandExamples || [],
    operating_notes: agentSpec?.operatingNotes || [],
  } satisfies SkillPackageSpecV1;
}

function buildShapeHint(
  item: NonNullable<ReturnType<typeof getServiceCatalogItem>>
) {
  return {
    shape_type: item.manifest.entry.shape_type,
    title: item.manifest.entry.title || item.manifest.name,
    icon: item.manifest.entry.icon || item.manifest.icon,
    description: item.manifest.summary || item.description,
    default_props: item.manifest.entry.props || undefined,
  } satisfies ShapeHintV1;
}

export async function buildShapePackage(
  locale: string,
  slug: string,
  storeOrigin?: string
) {
  const item = getServiceCatalogItem(locale, slug);
  if (!item) return null;

  const articleBundle = await getServiceArticleBundle(locale, slug);
  const pluginSpec = articleBundle?.pluginSpec;
  const isPluginPackage = Boolean(pluginSpec);
  const skillSpec = buildSkillSpec(item, articleBundle?.agentSpec);
  const shapeHint = buildShapeHint(item);

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
    skill_spec: skillSpec,
    shape_hint: shapeHint,
    plugin_spec: pluginSpec,
    source: storeOrigin
      ? {
          store_origin: storeOrigin,
          package_url: `${storeOrigin}/api/services/package?locale=${encodeURIComponent(locale)}&slug=${encodeURIComponent(slug)}`,
        }
      : undefined,
  } satisfies ShapePackageV1;
}
