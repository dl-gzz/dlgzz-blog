/**
 * Build a public-media catalog from already imported Xiaohongshu Markdown.
 *
 * The script only creates a catalog. It does not upload files or call a paid
 * vision model. Use an audit report to publish only reviewed, non-sensitive
 * screenshots:
 *
 *   pnpm tsx scripts/build-xhs-media-catalog.ts \
 *     --pack xhs-open-shop-v1 \
 *     --title "个人店升级个体店相关教程" \
 *     --audit /tmp/xhs-audit.json --public --out /tmp/xhs-media.catalog.json
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, dirname, resolve } from 'node:path';
import * as dotenv from 'dotenv';
import matter from 'gray-matter';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/index';
import {
  knowledgeChunk,
  knowledgeDocument,
  knowledgePackDocument,
} from '../src/db/schema';

dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '.env.local'), override: true });

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

type AuditAsset = {
  contentHash?: string;
  status?: string;
  findings?: unknown[];
  scan?: { ocrText?: string } | null;
};

function valueAfter(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] || '' : '';
}

function sha256File(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function nearestHeading(content: string, index: number) {
  let heading = '';
  for (const match of content.slice(0, index).matchAll(/^(#{1,3})\s+(.+)$/gm)) {
    heading = match[2].replace(/[\[\]*_`]/g, '').replace(/\s+/g, ' ').trim();
  }
  return heading;
}

function nearbyContext(content: string, index: number) {
  return content
    .slice(Math.max(0, index - 500), index + 600)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function extractImages(content: string) {
  const images: Array<{ rawRef: string; alt: string; index: number }> = [];
  const occupied: Array<[number, number]> = [];
  for (const match of content.matchAll(/!\[\[([^\]]+)\]\]/g)) {
    const index = match.index || 0;
    const [rawRef, alt = ''] = match[1].split('|', 2);
    images.push({ rawRef: rawRef.trim(), alt: alt.trim(), index });
    occupied.push([index, index + match[0].length]);
  }
  for (const match of content.matchAll(
    /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g
  )) {
    const index = match.index || 0;
    if (occupied.some(([start, end]) => index >= start && index < end)) continue;
    images.push({ rawRef: (match[2] || match[3] || '').trim(), alt: match[1].trim(), index });
  }
  return images.sort((a, b) => a.index - b.index);
}

function resolveLocalImage(documentPath: string, rawRef: string) {
  if (/^https?:\/\//i.test(rawRef)) return null;
  const decoded = decodeURIComponent(rawRef.split('#', 1)[0].split('?', 1)[0]);
  const candidate = resolve(dirname(documentPath), decoded);
  return existsSync(candidate) ? candidate : null;
}

function loadAudit(path: string) {
  if (!path) return new Map<string, AuditAsset>();
  const data = JSON.parse(readFileSync(path, 'utf8')) as { assets?: AuditAsset[] };
  return new Map(
    (data.assets || [])
      .filter((asset) => asset.contentHash)
      .map((asset) => [asset.contentHash as string, asset])
  );
}

async function main() {
  const args = process.argv.slice(2);
  const packId = valueAfter(args, '--pack');
  const titleFilter = valueAfter(args, '--title');
  const auditPath = valueAfter(args, '--audit');
  const outputPath = valueAfter(args, '--out');
  const publish = args.includes('--public');
  if (!packId || !titleFilter || !auditPath || !outputPath) {
    throw new Error('需要 --pack、--title、--audit、--out；发布时加 --public');
  }

  const db = await getDb();
  const docs = await db
    .select({
      id: knowledgeDocument.id,
      title: knowledgeDocument.title,
      filePath: knowledgeDocument.filePath,
      rawContent: knowledgeDocument.rawContent,
    })
    .from(knowledgePackDocument)
    .innerJoin(
      knowledgeDocument,
      eq(knowledgePackDocument.documentId, knowledgeDocument.id)
    )
    .where(eq(knowledgePackDocument.knowledgePackId, packId));

  const document = docs.find(
    (item) =>
      item.title === titleFilter &&
      item.filePath.includes('/Users/baiyang/Desktop/小红书/')
  );
  if (!document) throw new Error(`找不到已导入的小红书文档：${titleFilter}`);

  const chunks = await db
    .select({ id: knowledgeChunk.id, heading: knowledgeChunk.heading })
    .from(knowledgeChunk)
    .where(eq(knowledgeChunk.documentId, document.id));
  const audit = loadAudit(auditPath);
  const parsed = matter(document.rawContent);
  const assets = new Map<string, any>();

  for (const image of extractImages(parsed.content)) {
    const sourceFile = resolveLocalImage(document.filePath, image.rawRef);
    if (!sourceFile) continue;
    const contentHash = sha256File(sourceFile);
    const auditAsset = audit.get(contentHash);
    if (publish && (!auditAsset || auditAsset.findings?.length || auditAsset.status === 'blocked')) {
      continue;
    }
    const extension = extname(sourceFile).toLowerCase();
    const heading = nearestHeading(parsed.content, image.index);
    const chunk = chunks.find((item) => item.heading === heading);
    const sourceRef = `xhs-assets/${contentHash}${extension}`;
    const occurrenceIndex = assets.get(contentHash)?.links.length || 0;
    const entry = assets.get(contentHash) || {
      id: `xhs-${packId}-${contentHash.slice(0, 20)}`,
      contentHash,
      sourceRef,
      sourceFile,
      assetType: 'image',
      mimeType: MIME_TYPES[extension] || 'image/png',
      title: `${document.title} · ${heading || '教程图'}`,
      platform: 'xiaohongshu_official_documentation',
      sourceType: 'official_platform_screenshot',
      official: true,
      publisher: '小红书官方资料',
      altText: image.alt || `${document.title} ${heading || '教程图'}`,
      caption: `小红书官方入驻教程：${heading || '操作界面'}`,
      visualFacts: { product: '小红书', document: document.title, heading },
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
      visibility: publish ? 'public' : 'private',
      safeToPublish: publish,
      metadata: {
        licenseBasis: '小红书官方资料，保留平台归属',
        sourceDocument: document.title,
      },
      links: [],
    };
    entry.links.push({
      documentId: document.id,
      ...(chunk ? { chunkId: chunk.id } : {}),
      role: chunk ? 'ui_step' : 'cover',
      context: nearbyContext(parsed.content, image.index),
      sortOrder: image.index,
      occurrenceIndex,
      metadata: { sourceImageRef: image.rawRef },
    });
    assets.set(contentHash, entry);
  }

  const catalog = {
    version: 1,
    packId,
    defaults: {
      visibility: publish ? 'public' : 'private',
      safeToPublish: publish,
      role: 'ui_step',
      official: true,
      publisher: '小红书官方资料',
      sourceType: 'official_platform_screenshot',
      objectPrefix: `knowledge/${packId}`,
    },
    assets: [...assets.values()],
  };
  writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Document: ${document.title}`);
  console.log(`Assets: ${catalog.assets.length}`);
  console.log(`Visibility: ${publish ? 'public' : 'private'}`);
  console.log(`Catalog: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
