import 'server-only';

import { extname } from 'node:path';
import { getDb } from '@/db';
import {
  knowledgeDocument,
  knowledgePack,
  knowledgePackDocument,
} from '@/db/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

const ALL_PACKS_GRANT = '*';
const DEFAULT_PAGE_CHARS = 12_000;
const MAX_PAGE_CHARS = 40_000;

const SAFE_SOURCE_METADATA_KEYS = new Set([
  'author',
  'version',
  'summary',
  'topics',
  'intents',
  'audience',
  'contentKinds',
  'authority',
  'licenseStatus',
  'language',
  'mimeType',
  'contentType',
  'contentRole',
  'documentType',
  'documentStatus',
  'license',
  'publishedAt',
  'publisher',
  'sourceKind',
  'sourceAccess',
  'lastUpdated',
  'updated',
]);

export interface GetKnowledgeSourceOptions {
  documentId: string;
  /** Pass `*` only for an explicitly resolved all-packs entitlement. */
  allowedPackIds: string[];
  cursor: number;
  maxChars: number;
}

export interface KnowledgeSourcePage {
  documentId: string;
  packIds: string[];
  title: string;
  source: string;
  category: string;
  relativePath: string | null;
  contentHash: string;
  contentType: string;
  language: string | null;
  sourceUrl: string | null;
  metadata: Record<string, unknown>;
  content: string;
  cursor: number;
  nextCursor: number | null;
  complete: boolean;
  totalChars: number;
  updatedAt: string;
}

function normalizeAllowedPackIds(allowedPackIds?: string[]) {
  if (allowedPackIds === undefined) return [];

  const normalized = [
    ...new Set(
      allowedPackIds
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
  return normalized.includes(ALL_PACKS_GRANT) ? null : normalized;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function looksLikeLocalAbsolutePath(value: string) {
  return (
    value.startsWith('/') ||
    value.startsWith('~/') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^\\\\/.test(value)
  );
}

function isSafeMetadataValue(value: unknown, depth = 0): boolean {
  if (value === null) return true;
  if (typeof value === 'string') return !looksLikeLocalAbsolutePath(value);
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (depth >= 3) return false;
  if (Array.isArray(value)) {
    return (
      value.length <= 100 &&
      value.every((item) => isSafeMetadataValue(item, depth + 1))
    );
  }
  if (!value || typeof value !== 'object') return false;

  const entries = Object.entries(value as Record<string, unknown>);
  return (
    entries.length <= 50 &&
    entries.every(
      ([key, nested]) =>
        !/(?:path|root|directory|filename|locator|bucket|objectKey)/i.test(
          key
        ) && isSafeMetadataValue(nested, depth + 1)
    )
  );
}

function safeSourceMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, nested]) =>
        SAFE_SOURCE_METADATA_KEYS.has(key) && isSafeMetadataValue(nested)
    )
  );
}

function safeRelativePath(metadata: Record<string, unknown>) {
  const value = stringValue(metadata.relativePath);
  if (!value || value.includes('\0') || looksLikeLocalAbsolutePath(value)) {
    return null;
  }

  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized) ||
    normalized.split('/').some((part) => part === '..')
  ) {
    return null;
  }
  return normalized;
}

function safeSourceUrl(metadata: Record<string, unknown>) {
  const value =
    stringValue(metadata.sourceUrl) ?? stringValue(metadata.source_url);
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password
    ) {
      return null;
    }
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) {
      if (
        /^utm_/i.test(name) ||
        /(?:^|[-_])(?:access[-_]?token|api[-_]?key|auth|authorization|code|credential|key|password|secret|sig|signature|token)(?:$|[-_])/i.test(
          name
        )
      ) {
        url.searchParams.delete(name);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function inferLanguage(relativePath: string | null) {
  if (!relativePath) return null;
  const extension = extname(relativePath).toLowerCase();
  return (
    {
      '.md': 'markdown',
      '.mdx': 'mdx',
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.py': 'python',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.sql': 'sql',
      '.sh': 'shell',
    }[extension] ?? null
  );
}

function inferContentType(relativePath: string | null) {
  if (!relativePath) return 'text/plain';
  const extension = extname(relativePath).toLowerCase();
  return (
    {
      '.md': 'text/markdown',
      '.mdx': 'text/mdx',
      '.json': 'application/json',
      '.yaml': 'application/yaml',
      '.yml': 'application/yaml',
      '.ts': 'text/typescript',
      '.tsx': 'text/typescript',
      '.js': 'text/javascript',
      '.jsx': 'text/javascript',
      '.mjs': 'text/javascript',
      '.cjs': 'text/javascript',
      '.py': 'text/x-python',
      '.sql': 'application/sql',
      '.sh': 'application/x-sh',
    }[extension] ?? 'text/plain'
  );
}

function normalizeCursor(value: number, totalChars: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.floor(value), totalChars));
}

function normalizeMaxChars(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_CHARS;
  return Math.max(1, Math.min(Math.floor(value), MAX_PAGE_CHARS));
}

/**
 * Read one page of a full source document, constrained to active packs inside
 * the caller's already-resolved entitlement boundary. Storage file paths are
 * never selected; only a validated manifest-relative path can leave this API.
 */
export async function getKnowledgeSource(
  options: GetKnowledgeSourceOptions
): Promise<KnowledgeSourcePage | null> {
  const documentId = options.documentId.trim();
  if (!documentId || documentId.length > 240) return null;

  const allowedPackIds = normalizeAllowedPackIds(options.allowedPackIds);
  if (allowedPackIds?.length === 0) return null;

  const db = await getDb();
  const rows = await db
    .select({
      documentId: knowledgeDocument.id,
      title: knowledgeDocument.title,
      source: knowledgeDocument.source,
      category: knowledgeDocument.category,
      contentHash: knowledgeDocument.contentHash,
      rawContent: knowledgeDocument.rawContent,
      metadata: knowledgeDocument.metadata,
      updatedAt: knowledgeDocument.updatedAt,
      packId: knowledgePack.id,
    })
    .from(knowledgeDocument)
    .innerJoin(
      knowledgePackDocument,
      eq(knowledgePackDocument.documentId, knowledgeDocument.id)
    )
    .innerJoin(
      knowledgePack,
      and(
        eq(knowledgePack.id, knowledgePackDocument.knowledgePackId),
        eq(knowledgePack.status, 'active')
      )
    )
    .where(
      and(
        eq(knowledgeDocument.id, documentId),
        eq(knowledgeDocument.status, 'active'),
        sql`${knowledgeDocument.metadata}->>'sourceAccess' = 'full'`,
        allowedPackIds ? inArray(knowledgePack.id, allowedPackIds) : undefined
      )
    )
    .orderBy(asc(knowledgePack.id));

  const first = rows[0];
  if (!first) return null;

  const relativePath = safeRelativePath(first.metadata);
  const metadataLanguage = stringValue(first.metadata.language);
  const metadataContentType = stringValue(first.metadata.mimeType);
  const totalChars = first.rawContent.length;
  const cursor = normalizeCursor(options.cursor, totalChars);
  const maxChars = normalizeMaxChars(options.maxChars);
  const end = Math.min(totalChars, cursor + maxChars);
  const complete = end >= totalChars;

  return {
    documentId: first.documentId,
    packIds: [...new Set(rows.map((row) => row.packId))],
    title: first.title,
    source: first.source,
    category: first.category,
    relativePath,
    contentHash: first.contentHash,
    contentType: metadataContentType ?? inferContentType(relativePath),
    language: metadataLanguage ?? inferLanguage(relativePath),
    sourceUrl: safeSourceUrl(first.metadata),
    metadata: safeSourceMetadata(first.metadata),
    content: first.rawContent.slice(cursor, end),
    cursor,
    nextCursor: complete ? null : end,
    complete,
    totalChars,
    updatedAt: first.updatedAt.toISOString(),
  };
}
