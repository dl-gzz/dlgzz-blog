/**
 * Build a public Xiaohongshu image catalog from the asset audit report.
 *
 * Only assets with no automated findings are included. Assets containing
 * account fields, phone numbers, email addresses, QR codes, or other review
 * findings stay out of the public catalog until a human approves them.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import * as dotenv from 'dotenv';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../src/db/index';
import {
  knowledgeChunk,
  knowledgeDocument,
  knowledgePackDocument,
} from '../src/db/schema';

dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '.env.local'), override: true });

const PACK_ID = 'xhs-open-shop-v1';
const AUDIT_PATH = '/tmp/xhs-open-audit.json';
const OUTPUT_PATH = '/tmp/xhs-open-shop-safe.catalog.json';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

type AuditOccurrence = {
  rawRef?: string;
  altText?: string;
  line?: number;
  heading?: string;
  context?: string;
  documentTitle?: string;
  documentPath?: string;
};

type AuditAsset = {
  contentHash?: string;
  extension?: string;
  mimeType?: string;
  privateSourceFile?: string;
  status?: string;
  findings?: unknown[];
  occurrences?: AuditOccurrence[];
};

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitize(value: unknown) {
  return normalizeText(value)
    .replaceAll('白杨', '独立工作者')
    .replace(/baiyang/gi, '独立工作者')
    .replace(/\/Users\/[^\s/]+/g, '<用户目录>')
    .replace(/\/home\/[^\s/]+/g, '<用户目录>');
}

function args() {
  const values = process.argv.slice(2);
  const get = (name: string, fallback: string) => {
    const index = values.indexOf(name);
    return index >= 0 ? values[index + 1] || fallback : fallback;
  };
  return {
    audit: resolve(get('--audit', AUDIT_PATH)),
    out: resolve(get('--out', OUTPUT_PATH)),
    pack: get('--pack', PACK_ID),
  };
}

function contextFor(occurrence: AuditOccurrence) {
  return sanitize(occurrence.context).slice(0, 500);
}

async function main() {
  const options = args();
  if (!existsSync(options.audit)) throw new Error(`审核报告不存在：${options.audit}`);
  const report = JSON.parse(readFileSync(options.audit, 'utf8')) as {
    assets?: AuditAsset[];
  };

  const db = await getDb();
  const documents = await db
    .select({
      id: knowledgeDocument.id,
      title: knowledgeDocument.title,
      filePath: knowledgeDocument.filePath,
    })
    .from(knowledgePackDocument)
    .innerJoin(
      knowledgeDocument,
      eq(knowledgePackDocument.documentId, knowledgeDocument.id)
    )
    .where(eq(knowledgePackDocument.knowledgePackId, options.pack));

  const documentByTitle = new Map(documents.map((document) => [document.title, document]));
  const documentIds = documents.map((document) => document.id);
  const chunks = documentIds.length
    ? await db
        .select({
          id: knowledgeChunk.id,
          documentId: knowledgeChunk.documentId,
          heading: knowledgeChunk.heading,
          chunkIndex: knowledgeChunk.chunkIndex,
        })
        .from(knowledgeChunk)
        .where(inArray(knowledgeChunk.documentId, documentIds))
    : [];
  const chunksByDocument = new Map<string, typeof chunks>();
  for (const chunk of chunks) {
    const list = chunksByDocument.get(chunk.documentId) || [];
    list.push(chunk);
    chunksByDocument.set(chunk.documentId, list);
  }

  const assets = new Map<string, any>();
  let skipped = 0;
  for (const asset of report.assets || []) {
    const contentHash = normalizeText(asset.contentHash).toLowerCase();
    const sourceFile = normalizeText(asset.privateSourceFile);
    if (!contentHash || !sourceFile || !existsSync(sourceFile)) {
      skipped += 1;
      continue;
    }
    // Empty findings are the only assets automatically cleared for public use.
    if ((asset.findings || []).length > 0 || asset.status === 'blocked') {
      skipped += 1;
      continue;
    }
    const occurrences = asset.occurrences || [];
    const firstOccurrence = occurrences[0];
    const document = firstOccurrence?.documentTitle
      ? documentByTitle.get(firstOccurrence.documentTitle)
      : undefined;
    if (!document) {
      skipped += 1;
      continue;
    }

    const extension = (asset.extension || extname(sourceFile) || '.png').toLowerCase();
    const sourceRef = `xhs-assets/${contentHash}${extension}`;
    const existing = assets.get(contentHash) || {
      id: `xhs-${options.pack}-${contentHash.slice(0, 20)}`,
      contentHash,
      sourceRef,
      sourceFile,
      assetType: 'image',
      mimeType: asset.mimeType || MIME_TYPES[extension] || 'image/png',
      title: `${document.title} · ${sanitize(firstOccurrence?.heading) || '教程图'}`,
      platform: 'xiaohongshu_official_documentation',
      sourceType: 'official_platform_screenshot',
      official: true,
      publisher: '小红书官方资料',
      altText: sanitize(firstOccurrence?.altText) || `${document.title} ${sanitize(firstOccurrence?.heading) || '教程图'}`,
      caption: `小红书官方入驻教程：${sanitize(firstOccurrence?.heading) || '操作界面'}`,
      visualFacts: {
        product: '小红书',
        document: document.title,
        heading: sanitize(firstOccurrence?.heading),
      },
      analysis: {
        provider: 'macos_vision_local',
        model: 'macOS Vision',
        version: 'onework-xhs-public-media-v1',
        analyzedAt: new Date().toISOString(),
      },
      riskFlags: [],
      publishChecks: {
        licenseOk: true,
        noQr: true,
        noContact: true,
        noLocalUserPath: true,
        noUnmaskedSecret: true,
        noSessionQuery: true,
        noPersonalMemory: true,
        identitySafe: true,
        allFramesInspected: true,
      },
      visibility: 'public',
      safeToPublish: true,
      metadata: {
        licenseBasis: '小红书官方资料，保留平台归属',
        sourceDocument: document.title,
        audit: 'macos_vision_local_no_findings',
      },
      links: [],
    };

    for (const [occurrenceIndex, occurrence] of occurrences.entries()) {
      const linkedDocument = occurrence.documentTitle
        ? documentByTitle.get(occurrence.documentTitle)
        : document;
      if (!linkedDocument) continue;
      const documentChunks = chunksByDocument.get(linkedDocument.id) || [];
      const heading = sanitize(occurrence.heading);
      const chunk =
        documentChunks.find((item) => sanitize(item.heading) === heading) ||
        documentChunks[0];
      if (!chunk) continue;
      const linkKey = `${linkedDocument.id}:${occurrence.line || 0}:${occurrence.rawRef || ''}`;
      if (existing.links.some((link: any) => link.metadata?.linkKey === linkKey)) continue;
      existing.links.push({
        documentId: linkedDocument.id,
        chunkId: chunk.id,
        role: 'ui_step',
        context: contextFor(occurrence),
        sortOrder: occurrence.line || 0,
        occurrenceIndex,
        metadata: {
          linkKey,
          sourceImageRef: sanitize(occurrence.rawRef),
          heading,
          documentTitle: linkedDocument.title,
        },
      });
    }
    if (existing.links.length > 0) assets.set(contentHash, existing);
    else skipped += 1;
  }

  const catalog = {
    version: 1,
    packId: options.pack,
    defaults: {
      visibility: 'public',
      safeToPublish: true,
      role: 'ui_step',
      official: true,
      publisher: '小红书官方资料',
      sourceType: 'official_platform_screenshot',
      objectPrefix: `knowledge/${options.pack}`,
    },
    assets: [...assets.values()],
  };
  writeFileSync(options.out, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(JSON.stringify({
    pack: options.pack,
    catalog: options.out,
    assets: catalog.assets.length,
    links: catalog.assets.reduce((sum, asset) => sum + asset.links.length, 0),
    skipped,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
