import 'server-only';

import { promises as fs } from 'fs';
import matter from 'gray-matter';
import path from 'path';
import { authorSource } from '@/lib/source';
import { getServiceCatalogItem } from './service-catalog';

export interface AgentSpecField {
  name: string;
  type: string;
  required: boolean;
  description: string;
  defaultValue?: string;
  enum?: string[];
}

export interface AgentSpecAction {
  kind: string;
  target: string;
  method?: string;
  description?: string;
}

export interface AgentSpecV1 {
  version: 1;
  serviceId: string;
  toolId?: string;
  shapeType?: string;
  title: string;
  purpose: string;
  whenToUse: string[];
  whenNotToUse: string[];
  inputs: AgentSpecField[];
  outputs: string[];
  actions: AgentSpecAction[];
  commandExamples: string[];
  operatingNotes: string[];
}

export interface ServiceArticleBundle {
  slug: string;
  locale: string;
  title: string;
  description: string;
  image?: string;
  date: string;
  premium: boolean;
  categories: string[];
  author?: string;
  authorName?: string;
  authorAvatar?: string;
  content: string;
  agentSpec?: AgentSpecV1;
  pluginSpec?: Record<string, any>;
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAgentSpec(
  value: unknown,
  fallback: { serviceId: string; title: string; shapeType?: string }
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, any>;
  const version = Number(record.version);
  if (version !== 1) return undefined;

  const title =
    typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : fallback.title;
  const purpose =
    typeof record.purpose === 'string' && record.purpose.trim()
      ? record.purpose.trim()
      : '';

  if (!purpose) return undefined;

  const inputs: AgentSpecField[] = [];
  if (Array.isArray(record.inputs)) {
    record.inputs.forEach((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      const input = item as Record<string, any>;
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      const type = typeof input.type === 'string' ? input.type.trim() : '';
      const description =
        typeof input.description === 'string' ? input.description.trim() : '';
      if (!name || !type || !description) return;

      inputs.push({
        name,
        type,
        required: Boolean(input.required),
        description,
        defaultValue:
          typeof input.defaultValue === 'string' && input.defaultValue.trim()
            ? input.defaultValue.trim()
            : undefined,
        enum: normalizeStringList(input.enum),
      });
    });
  }

  const actions: AgentSpecAction[] = [];
  if (Array.isArray(record.actions)) {
    record.actions.forEach((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      const action = item as Record<string, any>;
      const kind = typeof action.kind === 'string' ? action.kind.trim() : '';
      const target = typeof action.target === 'string' ? action.target.trim() : '';
      if (!kind || !target) return;

      actions.push({
        kind,
        target,
        method:
          typeof action.method === 'string' && action.method.trim()
            ? action.method.trim()
            : undefined,
        description:
          typeof action.description === 'string' && action.description.trim()
            ? action.description.trim()
            : undefined,
      });
    });
  }

  return {
    version: 1,
    serviceId:
      typeof record.serviceId === 'string' && record.serviceId.trim()
        ? record.serviceId.trim()
        : fallback.serviceId,
    toolId:
      typeof record.toolId === 'string' && record.toolId.trim()
        ? record.toolId.trim()
        : undefined,
    shapeType:
      typeof record.shapeType === 'string' && record.shapeType.trim()
        ? record.shapeType.trim()
        : fallback.shapeType,
    title,
    purpose,
    whenToUse: normalizeStringList(record.whenToUse),
    whenNotToUse: normalizeStringList(record.whenNotToUse),
    inputs,
    outputs: normalizeStringList(record.outputs),
    actions,
    commandExamples: normalizeStringList(
      record.commandExamples || record.command_examples || record.usageExamples
    ),
    operatingNotes: normalizeStringList(record.operatingNotes),
  } satisfies AgentSpecV1;
}

async function resolveBlogArticlePath(locale: string, slug: string) {
  const candidates = [
    path.join(process.cwd(), 'content', 'blog', `${slug}.${locale}.mdx`),
    path.join(process.cwd(), 'content', 'blog', `${slug}.mdx`),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  return null;
}

export async function getServiceArticleBundle(locale: string, slug: string) {
  const item = getServiceCatalogItem(locale, slug);
  if (!item) return null;

  const articlePath = await resolveBlogArticlePath(locale, slug);
  if (!articlePath) return null;

  const raw = await fs.readFile(articlePath, 'utf8');
  const parsed = matter(raw);
  const authorSlug =
    typeof parsed.data.author === 'string' && parsed.data.author.trim()
      ? parsed.data.author.trim()
      : undefined;
  const author =
    authorSlug
      ? authorSource.getPage([authorSlug], locale) || authorSource.getPage([authorSlug])
      : null;
  const agentSpec = normalizeAgentSpec(parsed.data.agent_spec, {
    serviceId: item.manifest.id,
    title: item.manifest.entry.title || item.manifest.name,
    shapeType: item.manifest.entry.shape_type,
  });
  const pluginSpec =
    parsed.data.plugin_spec && typeof parsed.data.plugin_spec === 'object' && !Array.isArray(parsed.data.plugin_spec)
      ? (parsed.data.plugin_spec as Record<string, any>)
      : undefined;

  return {
    slug: item.slug,
    locale: item.locale,
    title: item.title,
    description: item.description,
    image: item.image || undefined,
    date: item.date,
    premium: item.premium,
    categories: Array.isArray(item.categories) ? item.categories : [],
    author: authorSlug,
    authorName: author?.data.name,
    authorAvatar: author?.data.avatar,
    content: parsed.content.trim(),
    agentSpec,
    pluginSpec,
  } satisfies ServiceArticleBundle;
}
