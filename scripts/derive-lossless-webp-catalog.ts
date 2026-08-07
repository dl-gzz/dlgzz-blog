/**
 * Replace selected catalog PNG assets with already-generated, pixel-equivalent
 * lossless WebP derivatives. The new content hash is always verified against
 * the bytes on disk before the catalog is written.
 *
 * Run:
 *   pnpm exec tsx scripts/derive-lossless-webp-catalog.ts \
 *     --catalog /private/catalog.json \
 *     --webp-dir /private/webp \
 *     --out /private/catalog-webp.json \
 *     --public-base-url https://img.example.com \
 *     --pixel-equivalent \
 *     --map <original-sha256>=<webp-sha256>
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

type JsonObject = Record<string, unknown>;

type CatalogAsset = JsonObject & {
  contentHash?: string;
  sourceRef?: string;
  sourceFile?: string;
  objectKey?: string;
  publicUrl?: string;
  mimeType?: string;
  metadata?: JsonObject;
};

type Catalog = JsonObject & {
  version: number;
  packId: string;
  assets: CatalogAsset[];
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function valuesAfter(name: string) {
  const args = process.argv.slice(2);
  return args.flatMap((value, index) =>
    value === name && args[index + 1] ? [args[index + 1]] : []
  );
}

function valueAfter(name: string) {
  return valuesAfter(name)[0] || '';
}

function replaceBasename(value: string, basename: string) {
  const slashIndex = value.lastIndexOf('/');
  return slashIndex >= 0
    ? `${value.slice(0, slashIndex + 1)}${basename}`
    : basename;
}

function buildPublicUrl(baseUrl: string, objectKey: string) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:')
    throw new Error('public base URL 必须使用 HTTPS');
  const encodedKey = objectKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return new URL(
    encodedKey,
    `${base.toString().replace(/\/+$/, '')}/`
  ).toString();
}

function assertWebp(bytes: Buffer, filePath: string) {
  if (
    bytes.length < 12 ||
    bytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    throw new Error(`不是有效的 WebP 文件：${filePath}`);
  }
}

function main() {
  const rawCatalogPath = valueAfter('--catalog');
  const rawWebpDir = valueAfter('--webp-dir');
  const rawOutputPath = valueAfter('--out');
  const publicBaseUrl = valueAfter('--public-base-url').replace(/\/+$/, '');
  const pixelEquivalent = process.argv.includes('--pixel-equivalent');
  const rawMappings = valuesAfter('--map');

  if (!rawCatalogPath || !rawWebpDir || !rawOutputPath || !publicBaseUrl) {
    throw new Error('需要 --catalog、--webp-dir、--out 和 --public-base-url');
  }
  const catalogPath = resolve(rawCatalogPath);
  const webpDir = resolve(rawWebpDir);
  const outputPath = resolve(rawOutputPath);
  if (!pixelEquivalent) {
    throw new Error('只有完成像素等价验证后才能传入 --pixel-equivalent');
  }
  if (!rawMappings.length)
    throw new Error('至少需要一个 --map oldHash=newHash');
  if (!existsSync(catalogPath))
    throw new Error(`catalog 不存在：${catalogPath}`);
  if (!existsSync(webpDir)) throw new Error(`WebP 目录不存在：${webpDir}`);

  const mappings = new Map<string, string>();
  for (const rawMapping of rawMappings) {
    const [originalHash, derivedHash, ...rest] = rawMapping.split('=');
    if (
      rest.length ||
      !SHA256_PATTERN.test(originalHash || '') ||
      !SHA256_PATTERN.test(derivedHash || '')
    ) {
      throw new Error(`无效的 --map：${rawMapping}`);
    }
    if (mappings.has(originalHash))
      throw new Error(`重复映射：${originalHash}`);
    mappings.set(originalHash, derivedHash);
  }

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as Catalog;
  if (catalog.version !== 1 || !Array.isArray(catalog.assets)) {
    throw new Error('catalog 必须是 version=1 且包含 assets');
  }

  const replaced = new Set<string>();
  const assets = catalog.assets.map((asset) => {
    const originalHash = asset.contentHash || '';
    const derivedHash = mappings.get(originalHash);
    if (!derivedHash) return asset;

    const sourceFile = join(webpDir, `${derivedHash}.webp`);
    if (!existsSync(sourceFile))
      throw new Error(`WebP 文件不存在：${sourceFile}`);
    const bytes = readFileSync(sourceFile);
    assertWebp(bytes, sourceFile);
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== derivedHash) {
      throw new Error(`WebP 哈希不匹配：${sourceFile}`);
    }
    if (!asset.sourceRef || !asset.objectKey) {
      throw new Error(`资产缺少 sourceRef 或 objectKey：${originalHash}`);
    }

    const filename = `${derivedHash}.webp`;
    const objectKey = replaceBasename(asset.objectKey, filename);
    replaced.add(originalHash);
    return {
      ...asset,
      contentHash: derivedHash,
      sourceRef: replaceBasename(asset.sourceRef, filename),
      sourceFile,
      objectKey,
      publicUrl: buildPublicUrl(publicBaseUrl, objectKey),
      mimeType: 'image/webp',
      metadata: {
        ...(asset.metadata || {}),
        derivedFromContentHash: originalHash,
        originalMimeType: asset.mimeType || 'image/png',
        transform: 'cwebp-lossless-1.6.0-z9-metadata-none',
        pixelEquivalent: true,
        pixelVerification: 'decoded-rgba-sha256-match',
      },
    };
  });

  for (const originalHash of mappings.keys()) {
    if (!replaced.has(originalHash)) {
      throw new Error(`catalog 中找不到映射源：${originalHash}`);
    }
  }

  writeFileSync(
    outputPath,
    `${JSON.stringify({ ...catalog, assets }, null, 2)}\n`
  );
  console.log(`Pack: ${catalog.packId}`);
  console.log(`Derived assets: ${replaced.size}`);
  console.log(`Catalog: ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
