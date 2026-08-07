/**
 * Import model-neutral knowledge media and document/chunk links.
 *
 * The catalog may be produced by Codex, Gemini, Qwen, Claude, or any other
 * vision-capable model. This script never calls a vision model itself.
 *
 * Run:
 *   pnpm knowledge:assets:import -- --catalog /path/to/catalog.json --dry-run
 *   pnpm knowledge:assets:import -- --catalog /path/to/catalog.json
 *   pnpm knowledge:assets:import -- --catalog /path/to/catalog.json --upload
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { extname, isAbsolute, join, resolve } from 'node:path';
import * as dotenv from 'dotenv';
import postgres from 'postgres';
import {
  KNOWLEDGE_ASSET_EMBEDDING_TEXT_VERSION,
  buildKnowledgeAssetEmbeddingText,
} from '../src/lib/knowledge-asset-embedding-text';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

const MEDIA_MIME_TYPES: Record<string, string> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const SUPPORTED_ASSET_TYPES = new Set(['image', 'video', 'link']);

const BLOCKING_RISK_FLAGS = new Set([
  'api_key',
  'app_secret',
  'contact',
  'email',
  'local_user_path',
  'personal_memory',
  'phone',
  'qr_code',
  'qrcode',
  'secret',
  'session_query',
  'token',
  'unmasked_secret',
]);

const REQUIRED_PUBLISH_CHECKS = [
  'licenseOk',
  'noQr',
  'noContact',
  'noLocalUserPath',
  'noUnmaskedSecret',
  'noSessionQuery',
  'noPersonalMemory',
  'identitySafe',
] as const;
const IMAGE_REQUIRED_PUBLISH_CHECKS = [
  ...REQUIRED_PUBLISH_CHECKS,
  'allFramesInspected',
] as const;

type JsonObject = Record<string, unknown>;

type PublishChecks = Partial<
  Record<(typeof IMAGE_REQUIRED_PUBLISH_CHECKS)[number], boolean>
>;

type CatalogLink = {
  documentId?: string;
  documentPath?: string;
  chunkId?: string;
  heading?: string;
  chunkIndex?: number;
  role?: string;
  relation?: string;
  context?: string;
  stepNumber?: number;
  sortOrder?: number;
  occurrenceIndex?: number;
  metadata?: JsonObject;
};

type AnalysisMeta = {
  provider?: string;
  model?: string;
  version?: string;
  analyzedAt?: string;
};

type CatalogAsset = {
  id?: string;
  contentHash?: string;
  sourceRef: string;
  sourceFile?: string;
  assetType?: string;
  type?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  title?: string;
  platform?: string;
  thumbnailUrl?: string;
  embedUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
  official?: boolean;
  publisher?: string;
  sourceType?: string;
  caption?: string;
  altText?: string;
  ocrText?: string;
  visualFacts?: JsonObject;
  analysis?: AnalysisMeta;
  analysisMeta?: AnalysisMeta;
  riskFlags?: string[];
  publishChecks?: PublishChecks;
  visibility?: 'private' | 'public';
  safeToPublish?: boolean;
  storageProvider?: string;
  storageBucket?: string;
  objectKey?: string;
  publicUrl?: string;
  metadata?: JsonObject;
  links: CatalogLink[];
};

type CatalogDefaults = {
  visibility?: 'private' | 'public';
  safeToPublish?: boolean;
  objectPrefix?: string;
  role?: string;
  metadata?: JsonObject;
  publishChecks?: PublishChecks;
  official?: boolean;
  publisher?: string;
  sourceType?: string;
};

type KnowledgeAssetCatalog = {
  version: number;
  packId: string;
  defaults?: CatalogDefaults;
  assets: CatalogAsset[];
};

type CliOptions = {
  catalogPath: string;
  dryRun: boolean;
  upload: boolean;
  preflight: boolean;
  skipUrlCheck: boolean;
  skipLinkPreflight: boolean;
};

type StorageClient = {
  client: {
    putObject: (
      key: string,
      data: Buffer,
      contentType: string
    ) => Promise<Response>;
  };
  bucket: string;
  publicBaseUrl: string;
};

type PreparedAsset = {
  catalogAsset: CatalogAsset;
  id: string;
  contentHash: string;
  assetType: string;
  mimeType: string;
  sourceRef: string;
  sourceFile?: string;
  width: number | null;
  height: number | null;
  title: string | null;
  platform: string | null;
  thumbnailUrl: string | null;
  embedUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  official: boolean;
  publisher: string | null;
  sourceType: string;
  caption: string | null;
  altText: string | null;
  ocrText: string | null;
  visualFacts: JsonObject;
  analysis: AnalysisMeta;
  riskFlags: string[];
  publishChecks: PublishChecks;
  visibility: 'private' | 'public';
  safeToPublish: boolean;
  storageProvider: string;
  storageBucket: string | null;
  objectKey: string | null;
  publicUrl: string | null;
  status: 'active' | 'pending';
  metadata: JsonObject;
  links: CatalogLink[];
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const catalogIndex = args.indexOf('--catalog');
  const catalogPath =
    catalogIndex >= 0 && args[catalogIndex + 1]
      ? resolve(args[catalogIndex + 1])
      : '';

  if (!catalogPath) {
    throw new Error('Missing --catalog <catalog.json>');
  }

  return {
    catalogPath,
    dryRun: args.includes('--dry-run'),
    upload: args.includes('--upload'),
    preflight: args.includes('--preflight'),
    skipUrlCheck: args.includes('--skip-url-check'),
    skipLinkPreflight: args.includes('--skip-link-preflight'),
  };
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function sanitizeText(value: unknown) {
  const text = readString(value);
  if (!text) return '';
  return text
    .replaceAll('白杨', '独立工作者')
    .replace(/baiyang/gi, '独立工作者')
    .replace(/\/Users\/[^\s/]+/g, '<用户目录>')
    .replace(/\/home\/[^\s/]+/g, '<用户目录>')
    .replace(/[A-Z]:\\Users\\[^\s\\]+/gi, '<用户目录>');
}

function sanitizeJson(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeJson(item)])
    );
  }
  return value;
}

function asJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return sanitizeJson(value) as JsonObject;
}

function normalizeRiskFlag(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function validateLogicalSourceRef(sourceRef: string) {
  if (!sourceRef) throw new Error('Every asset requires sourceRef');
  if (/白杨|baiyang|\/Users\/|[A-Z]:\\Users\\/i.test(sourceRef)) {
    throw new Error('sourceRef contains a private identity or path');
  }
  if (/^https:\/\//i.test(sourceRef)) return;
  if (
    isAbsolute(sourceRef) ||
    /^file:/i.test(sourceRef) ||
    /^[a-z]:[\\/]/i.test(sourceRef) ||
    sourceRef.split(/[\\/]/).includes('..')
  ) {
    throw new Error(`sourceRef must be logical and relative: ${sourceRef}`);
  }
}

function validatePublicUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error(`publicUrl must use HTTPS: ${value}`);
  }
  url.hash = '';
  for (const name of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(name)) url.searchParams.delete(name);
  }
  url.searchParams.sort();
  return url.toString();
}

function validateEmbedUrl(value: string, publicUrl: string | null) {
  const embedUrl = validatePublicUrl(value);
  const embedHost = new URL(embedUrl).hostname.toLowerCase();
  const publicHost = publicUrl ? new URL(publicUrl).hostname.toLowerCase() : '';
  const configuredHosts = (process.env.KNOWLEDGE_ASSET_EMBED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const trustedSuffixes = [
    'bilibili.com',
    'youtube.com',
    'youtube-nocookie.com',
    'v.qq.com',
    ...configuredHosts,
  ];
  const isTrusted =
    embedHost === publicHost ||
    trustedSuffixes.some(
      (host) => embedHost === host || embedHost.endsWith(`.${host}`)
    );
  if (!isTrusted) {
    throw new Error(`embedUrl host is not trusted: ${embedHost}`);
  }
  return embedUrl;
}

function validateObjectKey(value: string) {
  const key = value.replace(/^\/+|\/+$/g, '');
  if (!key || key.split('/').includes('..')) {
    throw new Error(`Invalid objectKey: ${value}`);
  }
  if (/白杨|baiyang|\/Users\/|[A-Z]:\\Users\\/i.test(key)) {
    throw new Error('objectKey contains a private identity or path');
  }
  return key;
}

function inferAssetType(asset: CatalogAsset) {
  const explicit = sanitizeText(asset.assetType || asset.type).toLowerCase();
  if (explicit) {
    if (!SUPPORTED_ASSET_TYPES.has(explicit)) {
      throw new Error(`Unsupported assetType: ${explicit}`);
    }
    return explicit;
  }

  const candidate =
    asset.sourceFile || asset.sourceRef || asset.publicUrl || '';
  const mimeType =
    readString(asset.mimeType) ||
    MEDIA_MIME_TYPES[extname(candidate).toLowerCase()] ||
    '';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  if (/^https:\/\//i.test(candidate)) return 'link';
  return 'image';
}

function inferMimeType(asset: CatalogAsset, assetType: string) {
  const explicit = readString(asset.mimeType);
  if (explicit) return explicit;
  const candidate =
    asset.sourceFile || asset.sourceRef || asset.publicUrl || '';
  return (
    MEDIA_MIME_TYPES[extname(candidate).toLowerCase()] ||
    (assetType === 'link' || (assetType === 'video' && !asset.sourceFile)
      ? 'text/html'
      : '')
  );
}

function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function buildPublicUrl(baseUrl: string, key: string) {
  const encodedKey = key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${baseUrl.replace(/\/$/, '')}/${encodedKey}`;
}

function hasAllPublishChecks(checks: PublishChecks, assetType: string) {
  const required =
    assetType === 'image'
      ? IMAGE_REQUIRED_PUBLISH_CHECKS
      : REQUIRED_PUBLISH_CHECKS;
  return required.every((name) => checks[name] === true);
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

async function createStorageClient(): Promise<StorageClient> {
  if (
    (process.env.KNOWLEDGE_ASSET_FORCE_PATH_STYLE || '').toLowerCase() ===
    'true'
  ) {
    throw new Error(
      'Tencent COS requires virtual-hosted-style for this bucket'
    );
  }

  const { s3mini } = await import('s3mini');
  const region = requiredEnv('KNOWLEDGE_ASSET_REGION');
  const bucket = requiredEnv('KNOWLEDGE_ASSET_BUCKET_NAME');
  const endpoint = requiredEnv('KNOWLEDGE_ASSET_ENDPOINT').replace(/\/$/, '');
  const publicBaseUrl = requiredEnv('KNOWLEDGE_ASSET_PUBLIC_URL').replace(
    /\/$/,
    ''
  );
  const endpointUrl = new URL(endpoint);
  if (!endpointUrl.hostname.startsWith(`${bucket}.`)) {
    throw new Error(
      'KNOWLEDGE_ASSET_ENDPOINT must be the complete virtual-hosted bucket endpoint'
    );
  }

  return {
    bucket,
    publicBaseUrl,
    client: new s3mini({
      accessKeyId:
        process.env.KNOWLEDGE_ASSET_ACCESS_KEY_ID?.trim() ||
        requiredEnv('STORAGE_ACCESS_KEY_ID'),
      secretAccessKey:
        process.env.KNOWLEDGE_ASSET_SECRET_ACCESS_KEY?.trim() ||
        requiredEnv('STORAGE_SECRET_ACCESS_KEY'),
      endpoint,
      region,
    }),
  };
}

async function verifyAssetUrl(asset: PreparedAsset) {
  if (!asset.publicUrl) return false;

  const hasExpectedMimeType = (response: Response) => {
    const contentType = (response.headers.get('content-type') || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    if (asset.assetType === 'image') return contentType.startsWith('image/');
    if (asset.assetType === 'video') {
      return asset.mimeType === 'text/html'
        ? contentType === 'text/html'
        : contentType.startsWith('video/');
    }
    return true;
  };

  try {
    const headResponse = await fetch(asset.publicUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    if (headResponse.ok && hasExpectedMimeType(headResponse)) return true;
  } catch {
    // Some official CDNs reject HEAD even though a ranged GET is available.
  }

  try {
    const rangeResponse = await fetch(asset.publicUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    try {
      return rangeResponse.ok && hasExpectedMimeType(rangeResponse);
    } finally {
      await rangeResponse.body?.cancel().catch(() => {});
    }
  } catch {
    return false;
  }
}

function loadCatalog(filePath: string): KnowledgeAssetCatalog {
  if (!existsSync(filePath)) throw new Error('Catalog file does not exist');
  const catalog = JSON.parse(
    readFileSync(filePath, 'utf8')
  ) as KnowledgeAssetCatalog;
  if (catalog.version !== 1) throw new Error('Catalog version must be 1');
  if (!readString(catalog.packId))
    throw new Error('Catalog packId is required');
  if (!Array.isArray(catalog.assets) || catalog.assets.length === 0) {
    throw new Error('Catalog assets must be a non-empty array');
  }
  return catalog;
}

function prepareAsset(
  asset: CatalogAsset,
  defaults: CatalogDefaults,
  packId: string
): PreparedAsset {
  const sourceRef = sanitizeText(asset.sourceRef);
  validateLogicalSourceRef(sourceRef);

  const assetType = inferAssetType(asset);
  const sourceRefUrl = /^https:\/\//i.test(sourceRef) ? sourceRef : '';
  const publicUrl = asset.publicUrl
    ? validatePublicUrl(asset.publicUrl)
    : sourceRefUrl
      ? validatePublicUrl(sourceRefUrl)
      : null;
  const thumbnailUrl = asset.thumbnailUrl
    ? validatePublicUrl(asset.thumbnailUrl)
    : null;
  const embedUrl = asset.embedUrl
    ? validateEmbedUrl(asset.embedUrl, publicUrl)
    : null;

  const sourceFile = asset.sourceFile ? resolve(asset.sourceFile) : undefined;
  if (assetType === 'link' && sourceFile) {
    throw new Error(`Link assets cannot use sourceFile: ${sourceRef}`);
  }
  const fileBuffer = sourceFile
    ? (() => {
        if (!existsSync(sourceFile)) {
          throw new Error(`sourceFile is missing for ${sourceRef}`);
        }
        return readFileSync(sourceFile);
      })()
    : null;
  const computedHash = fileBuffer ? sha256(fileBuffer) : '';
  const explicitHash = readString(asset.contentHash).toLowerCase();
  if (explicitHash && !/^[a-f0-9]{64}$/.test(explicitHash)) {
    throw new Error(`contentHash must be SHA-256 for ${sourceRef}`);
  }
  if (explicitHash && computedHash && explicitHash !== computedHash) {
    throw new Error(`contentHash does not match sourceFile for ${sourceRef}`);
  }
  const urlHash = publicUrl
    ? sha256(Buffer.from(`${assetType}:${publicUrl}`, 'utf8'))
    : '';
  const contentHash = explicitHash || computedHash || urlHash;
  if (!contentHash) {
    throw new Error(
      `contentHash, sourceFile, or publicUrl is required for ${sourceRef}`
    );
  }

  const mimeType = inferMimeType(asset, assetType);
  const validMimeType =
    (assetType === 'image' && mimeType.startsWith('image/')) ||
    (assetType === 'video' &&
      (mimeType.startsWith('video/') || mimeType === 'text/html')) ||
    (assetType === 'link' && mimeType === 'text/html');
  if (!validMimeType) {
    throw new Error(
      `mimeType ${mimeType || '(missing)'} does not match ${assetType}: ${sourceRef}`
    );
  }
  const riskFlags = (asset.riskFlags || []).map(normalizeRiskFlag);
  const blockingRisks = riskFlags.filter((flag) =>
    BLOCKING_RISK_FLAGS.has(flag)
  );
  if (blockingRisks.length) {
    throw new Error(
      `Blocked risk flags for ${sourceRef}: ${blockingRisks.join(', ')}`
    );
  }

  const publishChecks = {
    ...(defaults.publishChecks || {}),
    ...(asset.publishChecks || {}),
  };
  const visibility = asset.visibility || defaults.visibility || 'private';
  const safeToPublish = asset.safeToPublish ?? defaults.safeToPublish ?? false;
  if (
    visibility === 'public' &&
    assetType === 'image' &&
    (asset.safeToPublish !== true ||
      !hasAllPublishChecks(asset.publishChecks || {}, assetType) ||
      riskFlags.length > 0)
  ) {
    throw new Error(
      `Public image ${sourceRef} requires per-asset approval, checks, and empty riskFlags`
    );
  }
  if (
    visibility === 'public' &&
    (!safeToPublish || !hasAllPublishChecks(publishChecks, assetType))
  ) {
    throw new Error(
      `Public asset ${sourceRef} is missing safeToPublish or publishChecks`
    );
  }

  const links = Array.isArray(asset.links)
    ? asset.links.map((link) => ({
        ...link,
        role: link.role || link.relation || defaults.role,
      }))
    : [];
  if (links.length === 0) {
    throw new Error(`At least one link is required for ${sourceRef}`);
  }
  for (const link of links) {
    if (!readString(link.documentId) && !readString(link.documentPath)) {
      throw new Error(`Link requires documentId or documentPath: ${sourceRef}`);
    }
    for (const [field, value] of [
      ['chunkIndex', link.chunkIndex],
      ['sortOrder', link.sortOrder],
      ['occurrenceIndex', link.occurrenceIndex],
    ] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        throw new Error(
          `${field} must be a non-negative integer: ${sourceRef}`
        );
      }
    }
  }

  const analysis = asset.analysis || asset.analysisMeta || {};
  const id =
    sanitizeText(asset.id) || `knowledge-asset-${contentHash.slice(0, 20)}`;
  const objectKey = asset.objectKey
    ? validateObjectKey(asset.objectKey)
    : sourceFile && defaults.objectPrefix
      ? validateObjectKey(
          `${defaults.objectPrefix}/${contentHash}${extname(sourceRef).toLowerCase()}`
        )
      : sourceFile
        ? validateObjectKey(
            `knowledge/${packId}/${contentHash}${extname(sourceRef).toLowerCase()}`
          )
        : null;
  const official = asset.official ?? defaults.official ?? false;
  const publisher =
    sanitizeText(asset.publisher || defaults.publisher) ||
    (official ? '独立工作者' : null);
  const sourceType =
    sanitizeText(asset.sourceType || defaults.sourceType) || 'catalog';
  const publishedAt = sanitizeText(asset.publishedAt) || null;
  if (publishedAt && !parseOptionalDate(publishedAt)) {
    throw new Error(`publishedAt is invalid for ${sourceRef}`);
  }

  return {
    catalogAsset: asset,
    id,
    contentHash,
    assetType,
    mimeType,
    sourceRef,
    sourceFile,
    width:
      typeof asset.width === 'number' && asset.width > 0
        ? Math.floor(asset.width)
        : null,
    height:
      typeof asset.height === 'number' && asset.height > 0
        ? Math.floor(asset.height)
        : null,
    title: sanitizeText(asset.title) || null,
    platform: sanitizeText(asset.platform) || null,
    thumbnailUrl,
    embedUrl,
    durationSeconds:
      typeof asset.durationSeconds === 'number' &&
      Number.isInteger(asset.durationSeconds) &&
      asset.durationSeconds >= 0
        ? asset.durationSeconds
        : null,
    publishedAt,
    official,
    publisher,
    sourceType,
    caption: sanitizeText(asset.caption) || null,
    altText: sanitizeText(asset.altText) || null,
    ocrText: sanitizeText(asset.ocrText) || null,
    visualFacts: asJsonObject(asset.visualFacts),
    analysis: {
      provider: sanitizeText(analysis.provider),
      model: sanitizeText(analysis.model),
      version: sanitizeText(analysis.version),
      analyzedAt: sanitizeText(analysis.analyzedAt),
    },
    riskFlags,
    publishChecks,
    visibility,
    safeToPublish,
    storageProvider:
      sanitizeText(asset.storageProvider) ||
      (sourceFile || objectKey ? 'cos' : 'external'),
    storageBucket: sanitizeText(asset.storageBucket) || null,
    objectKey,
    publicUrl,
    status: 'pending',
    metadata: {
      ...asJsonObject(defaults.metadata),
      ...asJsonObject(asset.metadata),
      safeToPublish,
      official,
      ...(publisher ? { publisher } : {}),
      publishChecks,
      riskFlags,
    },
    links,
  };
}

async function prepareStorage(assets: PreparedAsset[], options: CliOptions) {
  const activatable = assets.filter(
    (asset) =>
      asset.visibility === 'public' &&
      asset.safeToPublish &&
      hasAllPublishChecks(asset.publishChecks, asset.assetType)
  );
  const urlCandidates: PreparedAsset[] = [];
  const uploadable = options.upload
    ? activatable.filter((asset) => asset.sourceFile)
    : [];
  const storage = uploadable.length ? await createStorageClient() : null;

  // COS uploads are independent. Use a small bounded worker pool so a large
  // official-document catalog does not take several minutes serially.
  let nextUpload = 0;
  const uploadWorker = async () => {
    while (nextUpload < uploadable.length) {
      const asset = uploadable[nextUpload++];
      if (!asset.objectKey || !storage) {
        throw new Error(`Missing storage configuration for ${asset.sourceRef}`);
      }
      const response = await storage.client.putObject(
        asset.objectKey,
        readFileSync(asset.sourceFile!),
        asset.mimeType
      );
      if (!response.ok) {
        throw new Error(`COS upload failed for ${asset.sourceRef}`);
      }
      // Consume the response body so Node's fetch agent can reuse the socket.
      await response.body?.cancel().catch(() => {});
      asset.storageBucket = storage.bucket;
      asset.publicUrl = buildPublicUrl(storage.publicBaseUrl, asset.objectKey);
    }
  };
  if (uploadable.length) {
    await Promise.all(
      Array.from(
        { length: Math.min(6, uploadable.length) },
        uploadWorker
      )
    );
  }

  for (const asset of activatable) {
    if (asset.publicUrl) urlCandidates.push(asset);
  }

  // Official documentation batches can contain hundreds of external images.
  // Verify a small bounded group in parallel instead of waiting for every CDN
  // HEAD/Range fallback serially. Uploads above remain sequential and explicit.
  let nextIndex = 0;
  const verifyWorker = async () => {
    while (nextIndex < urlCandidates.length) {
      const asset = urlCandidates[nextIndex++];
      const urlReady = options.skipUrlCheck
        ? true
        : await verifyAssetUrl(asset);
      asset.status = urlReady ? 'active' : 'pending';
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(6, Math.max(1, urlCandidates.length)) },
      verifyWorker
    )
  );
}

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const ssl = ['false', 'disable', 'off'].includes(
    (process.env.DATABASE_SSL || '').toLowerCase()
  )
    ? false
    : 'require';
  return postgres(url, {
    ssl,
    max: 1,
    prepare: false,
    connect_timeout: 15,
  });
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function assertSchema(sql: ReturnType<typeof postgres>) {
  const rows = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('knowledge_assets', 'knowledge_asset_links')
  `;
  if (rows.length !== 2) {
    throw new Error(
      'Knowledge asset tables are missing. Run db:apply-knowledge-assets first.'
    );
  }

  const mediaColumns = await sql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_assets'
      and column_name in (
        'title', 'platform', 'thumbnail_url', 'embed_url',
        'duration_seconds', 'published_at', 'embedding_text',
        'embedding_text_hash', 'embedding', 'embedding_model',
        'embedding_dimensions', 'embedded_at'
      )
  `;
  if (mediaColumns.length !== 12) {
    throw new Error(
      'Knowledge media columns are missing. Run db:apply-knowledge-assets first.'
    );
  }
}

async function resolveLink(
  sql: ReturnType<typeof postgres>,
  packId: string,
  sourceRef: string,
  link: CatalogLink
) {
  const documentId = sanitizeText(link.documentId);
  const documentPath = sanitizeText(link.documentPath);
  const documents = documentId
    ? await sql<{ id: string; file_path: string }[]>`
        select kd.id, kd.file_path
        from knowledge_documents kd
        where kd.id = ${documentId}
          and exists (
            select 1 from knowledge_pack_documents kpd
            where kpd.document_id = kd.id
              and kpd.knowledge_pack_id = ${packId}
          )
      `
    : await sql<{ id: string; file_path: string }[]>`
        select kd.id, kd.file_path
        from knowledge_documents kd
        where kd.file_path = ${documentPath}
          and exists (
            select 1 from knowledge_pack_documents kpd
            where kpd.document_id = kd.id
              and kpd.knowledge_pack_id = ${packId}
          )
      `;
  if (documents.length !== 1) {
    throw new Error(`Document link did not resolve uniquely: ${sourceRef}`);
  }

  let chunkId: string | null = null;
  const requestedChunkId = sanitizeText(link.chunkId);
  const heading = sanitizeText(link.heading);
  if (requestedChunkId) {
    const chunks = await sql<{ id: string }[]>`
      select id from knowledge_chunks
      where id = ${requestedChunkId}
        and document_id = ${documents[0].id}
    `;
    if (chunks.length !== 1) {
      throw new Error(`chunkId did not resolve for ${sourceRef}`);
    }
    chunkId = chunks[0].id;
  } else if (heading || link.chunkIndex !== undefined) {
    const chunks = await sql<{ id: string; chunk_index: number }[]>`
      select id, chunk_index from knowledge_chunks
      where document_id = ${documents[0].id}
        and (${heading || null}::text is null or heading = ${heading || null})
        and (${link.chunkIndex ?? null}::int is null or chunk_index = ${
          link.chunkIndex ?? null
        })
      order by chunk_index
    `;
    if (chunks.length !== 1) {
      throw new Error(`Chunk link did not resolve uniquely: ${sourceRef}`);
    }
    chunkId = chunks[0].id;
  }

  const role = sanitizeText(link.role || link.relation) || 'inline';
  if (!chunkId && role !== 'cover') {
    throw new Error(`Non-cover asset requires a chunk selector: ${sourceRef}`);
  }

  return {
    documentId: documents[0].id,
    chunkId,
    role,
    context: sanitizeText(link.context) || null,
    sortOrder: link.sortOrder ?? 0,
    occurrenceIndex: link.occurrenceIndex ?? 0,
    metadata: {
      ...asJsonObject(link.metadata),
      ...(link.stepNumber === undefined ? {} : { stepNumber: link.stepNumber }),
    },
  };
}

async function preflightAssetLinks(
  catalog: KnowledgeAssetCatalog,
  assets: PreparedAsset[]
) {
  const sql = getSql();
  let resolvedLinks = 0;
  try {
    await assertSchema(sql);
    for (const asset of assets) {
      for (const link of asset.links) {
        await resolveLink(sql, catalog.packId, asset.sourceRef, link);
        resolvedLinks += 1;
      }
    }
  } finally {
    await sql.end();
  }
  return resolvedLinks;
}

async function importAssets(
  catalog: KnowledgeAssetCatalog,
  assets: PreparedAsset[]
) {
  const sql = getSql();
  try {
    await assertSchema(sql);
    for (const asset of assets) {
        const resolvedLinks = [];
        for (const link of asset.links) {
          resolvedLinks.push(
            await resolveLink(
              sql,
              catalog.packId,
              asset.sourceRef,
              link
            )
          );
        }

        const storedAssets = await sql<{ id: string }[]>`
          insert into knowledge_assets (
            id, content_hash, asset_type, mime_type, storage_provider,
            storage_bucket, object_key, public_url, title, platform,
            thumbnail_url, embed_url, width, height, duration_seconds,
            published_at, caption, ocr_text, visual_facts, analysis_provider,
            analysis_model, analysis_version, analyzed_at, source_type,
            source_locator, status, visibility, metadata, updated_at
          ) values (
            ${asset.id}, ${asset.contentHash}, ${asset.assetType},
            ${asset.mimeType}, ${asset.storageProvider},
            ${asset.storageBucket}, ${asset.objectKey}, ${asset.publicUrl},
            ${asset.title}, ${asset.platform}, ${asset.thumbnailUrl},
            ${asset.embedUrl}, ${asset.width}, ${asset.height},
            ${asset.durationSeconds}, ${parseOptionalDate(asset.publishedAt)},
            ${asset.caption}, ${asset.ocrText},
            ${sql.json(asset.visualFacts as never)},
            ${asset.analysis.provider || null}, ${asset.analysis.model || null},
            ${asset.analysis.version || null},
            ${parseOptionalDate(asset.analysis.analyzedAt)},
            ${asset.sourceType}, ${asset.sourceRef}, ${asset.status},
            ${asset.visibility}, ${sql.json(asset.metadata as never)},
            now()
          )
          on conflict (content_hash) do update set
            asset_type = excluded.asset_type,
            mime_type = excluded.mime_type,
            storage_provider = excluded.storage_provider,
            storage_bucket = excluded.storage_bucket,
            object_key = excluded.object_key,
            public_url = excluded.public_url,
            title = excluded.title,
            platform = excluded.platform,
            thumbnail_url = excluded.thumbnail_url,
            embed_url = excluded.embed_url,
            width = excluded.width,
            height = excluded.height,
            duration_seconds = excluded.duration_seconds,
            published_at = excluded.published_at,
            caption = excluded.caption,
            ocr_text = excluded.ocr_text,
            visual_facts = excluded.visual_facts,
            analysis_provider = excluded.analysis_provider,
            analysis_model = excluded.analysis_model,
            analysis_version = excluded.analysis_version,
            analyzed_at = excluded.analyzed_at,
            source_type = excluded.source_type,
            source_locator = excluded.source_locator,
            status = excluded.status,
            visibility = excluded.visibility,
            metadata = excluded.metadata,
            updated_at = now()
          returning id
        `;
        const storedAssetId = storedAssets[0].id;

        // The catalog is authoritative for this logical sourceRef. Removing
        // stale rows keeps a corrected manifest occurrence list idempotent.
        await sql`
          delete from knowledge_asset_links
          where asset_id = ${storedAssetId}
            and source_ref = ${asset.sourceRef}
        `;

        for (const link of resolvedLinks) {
          const linkId = `knowledge-asset-link-${createHash('sha1')
            .update(
              `${link.documentId}:${asset.sourceRef}:${link.occurrenceIndex}`
            )
            .digest('hex')
            .slice(0, 20)}`;
          await sql`
            insert into knowledge_asset_links (
              id, asset_id, document_id, chunk_id, role, source_ref,
              occurrence_index, alt_text, context, sort_order, metadata,
              updated_at
            ) values (
              ${linkId}, ${storedAssetId}, ${link.documentId}, ${link.chunkId},
              ${link.role}, ${asset.sourceRef}, ${link.occurrenceIndex},
              ${asset.altText}, ${link.context}, ${link.sortOrder},
              ${sql.json(link.metadata as never)}, now()
            )
            on conflict (document_id, source_ref, occurrence_index) do update set
              asset_id = excluded.asset_id,
              chunk_id = excluded.chunk_id,
              role = excluded.role,
              alt_text = excluded.alt_text,
              context = excluded.context,
              sort_order = excluded.sort_order,
              metadata = excluded.metadata,
              updated_at = now()
          `;
        }

        const altRows = await sql<{ alt_text: string }[]>`
          select distinct alt_text
          from knowledge_asset_links
          where asset_id = ${storedAssetId}
            and alt_text is not null
            and btrim(alt_text) <> ''
          order by alt_text
        `;
        const embeddingText = buildKnowledgeAssetEmbeddingText({
          title: asset.title,
          altTexts: altRows.map((row) => row.alt_text),
          caption: asset.caption,
          ocrText: asset.ocrText,
          platform: asset.platform,
          publisher: asset.publisher,
          sourceType: asset.sourceType,
          visualFacts: asset.visualFacts,
          metadata: asset.metadata,
        });
        const embeddingTextHash = createHash('sha256')
          .update(`${KNOWLEDGE_ASSET_EMBEDDING_TEXT_VERSION}\0${embeddingText}`)
          .digest('hex');

        await sql`
          update knowledge_assets
          set
            embedding_text = ${embeddingText},
            embedding = case
              when embedding_text_hash = ${embeddingTextHash} then embedding
              else null
            end,
            embedding_model = case
              when embedding_text_hash = ${embeddingTextHash}
                then embedding_model
              else null
            end,
            embedding_dimensions = case
              when embedding_text_hash = ${embeddingTextHash}
                then embedding_dimensions
              else null
            end,
            embedded_at = case
              when embedding_text_hash = ${embeddingTextHash}
                then embedded_at
              else null
            end,
            embedding_text_hash = ${embeddingTextHash},
            updated_at = now()
          where id = ${storedAssetId}
        `;
    }
  } finally {
    await sql.end();
  }
}

async function main() {
  const options = parseArgs();
  const catalog = loadCatalog(options.catalogPath);
  const defaults = catalog.defaults || {};
  const assets = catalog.assets.map((asset) =>
    prepareAsset(asset, defaults, catalog.packId)
  );

  if (options.dryRun && options.upload) {
    throw new Error('--dry-run and --upload cannot be used together');
  }
  let preflightLinks = 0;
  if ((options.preflight || !options.dryRun) && !options.skipLinkPreflight) {
    preflightLinks = await preflightAssetLinks(catalog, assets);
  }
  if (!options.dryRun) {
    await prepareStorage(assets, options);
    await importAssets(catalog, assets);
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        dryRun: options.dryRun,
        preflight: options.preflight || !options.dryRun,
        preflightLinks,
        packId: catalog.packId,
        assets: assets.map((asset) => ({
          sourceRef: asset.sourceRef,
          type: asset.assetType,
          title: asset.title,
          platform: asset.platform,
          official: asset.official,
          publisher: asset.publisher,
          sourceType: asset.sourceType,
          status: asset.status,
          visibility: asset.visibility,
          links: asset.links.length,
          publicUrl: asset.publicUrl,
          sourceFileUsed: Boolean(asset.sourceFile),
        })),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
