import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const DEFAULT_ROOT =
  '/Users/baiyang/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dlgzz/小红书';
const DEFAULT_ASSET_DIR = '_assets/xhs-official';
const DEFAULT_MANIFEST = 'content/generated/xhs-assets-manifest.json';
const DEFAULT_PREFIX = 'obsidian/xhs-official';

type ManifestItem = {
  sourcePath: string;
  sourceRelativePath: string;
  obsidianPath: string;
  key: string;
  url: string;
  sha1: string;
  size: number;
  mtimeMs: number;
  contentType: string;
  uploadedAt: string;
};

type Manifest = {
  generatedAt: string;
  root: string;
  assetDir: string;
  prefix: string;
  publicUrl: string;
  items: Record<string, ManifestItem>;
};

type Options = {
  root: string;
  assetDir: string;
  manifestPath: string;
  prefix: string;
  concurrency: number;
  dryRun: boolean;
  force: boolean;
};

const CONTENT_TYPES: Record<string, string> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const getValue = (name: string, fallback: string) => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };

  return {
    root: getValue('--root', DEFAULT_ROOT),
    assetDir: getValue('--asset-dir', DEFAULT_ASSET_DIR),
    manifestPath: getValue('--manifest', DEFAULT_MANIFEST),
    prefix: getValue('--prefix', DEFAULT_PREFIX).replace(/^\/+|\/+$/g, ''),
    concurrency: Number(getValue('--concurrency', '4')),
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
  };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function createStorageClient() {
  const { s3mini } = await import('s3mini');
  const region = requiredEnv('STORAGE_REGION');
  const endpoint = requiredEnv('STORAGE_ENDPOINT').replace(/\/$/, '');
  const bucketName = requiredEnv('STORAGE_BUCKET_NAME');
  const accessKeyId = requiredEnv('STORAGE_ACCESS_KEY_ID');
  const secretAccessKey = requiredEnv('STORAGE_SECRET_ACCESS_KEY');
  const publicUrl = (process.env.STORAGE_PUBLIC_URL || `${endpoint}/${bucketName}`).replace(
    /\/$/,
    ''
  );

  return {
    publicUrl,
    client: new s3mini({
      accessKeyId,
      secretAccessKey,
      endpoint: `${endpoint}/${bucketName}`,
      region,
    }),
  };
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return walkFiles(fullPath);
      if (entry.isFile()) return Promise.resolve([fullPath]);
      return Promise.resolve([]);
    })
  );

  return files.flat();
}

function sha1File(filePath: string) {
  const hash = createHash('sha1');
  const fd = readFileSync(filePath);
  hash.update(fd);
  return hash.digest('hex');
}

function encodeUrlPath(key: string) {
  return key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function loadManifest(filePath: string): Manifest {
  if (!existsSync(filePath)) {
    return {
      generatedAt: new Date().toISOString(),
      root: '',
      assetDir: '',
      prefix: '',
      publicUrl: '',
      items: {},
    };
  }

  return JSON.parse(readFileSync(filePath, 'utf8')) as Manifest;
}

function saveManifest(filePath: string, manifest: Manifest) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
) {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(workers);
}

async function main() {
  const options = parseArgs();
  const assetRoot = path.join(options.root, options.assetDir);

  if (!existsSync(assetRoot)) {
    throw new Error(`Asset directory not found: ${assetRoot}`);
  }

  const allFiles = (await walkFiles(assetRoot)).filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return Boolean(CONTENT_TYPES[ext]);
  });

  const { client, publicUrl } = options.dryRun
    ? { client: null, publicUrl: process.env.STORAGE_PUBLIC_URL || 'https://cdn.example.com' }
    : await createStorageClient();

  const manifestAbs = path.resolve(process.cwd(), options.manifestPath);
  const manifest = loadManifest(manifestAbs);
  manifest.root = options.root;
  manifest.assetDir = options.assetDir;
  manifest.prefix = options.prefix;
  manifest.publicUrl = publicUrl;

  let uploaded = 0;
  let skipped = 0;

  console.log(`Found ${allFiles.length} image files in ${assetRoot}`);
  console.log(options.dryRun ? 'Dry run: no files will be uploaded.' : `Uploading to ${publicUrl}`);

  await runWithConcurrency(allFiles, options.concurrency, async (filePath) => {
    const stat = statSync(filePath);
    const sourceRelativePath = path.relative(assetRoot, filePath);
    const obsidianPath = path.posix.join(
      options.assetDir,
      sourceRelativePath.split(path.sep).join('/')
    );
    const existing = manifest.items[obsidianPath];

    if (
      existing &&
      !options.force &&
      existing.size === stat.size &&
      existing.mtimeMs === stat.mtimeMs
    ) {
      skipped += 1;
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const sha1 = sha1File(filePath);
    const key = `${options.prefix}/${sha1.slice(0, 2)}/${sha1}${ext}`;
    const url = `${publicUrl}/${encodeUrlPath(key)}`;

    if (!options.dryRun) {
      const response = await client!.putObject(key, readFileSync(filePath), contentType);
      if (!response.ok) {
        throw new Error(`Upload failed ${response.status} ${response.statusText}: ${filePath}`);
      }
    }

    manifest.items[obsidianPath] = {
      sourcePath: filePath,
      sourceRelativePath,
      obsidianPath,
      key,
      url,
      sha1,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      contentType,
      uploadedAt: new Date().toISOString(),
    };
    uploaded += 1;

    if ((uploaded + skipped) % 100 === 0) {
      if (!options.dryRun) {
        saveManifest(manifestAbs, {
          ...manifest,
          generatedAt: new Date().toISOString(),
        });
      }
      const uploadLabel = options.dryRun ? 'would upload' : 'uploaded';
      console.log(`Progress: ${uploaded} ${uploadLabel}, ${skipped} skipped`);
    }
  });

  if (!options.dryRun) {
    saveManifest(manifestAbs, {
      ...manifest,
      generatedAt: new Date().toISOString(),
    });
  }

  if (options.dryRun) {
    console.log(`Done. Would upload ${uploaded}, skipped ${skipped}.`);
  } else {
    console.log(`Done. Uploaded ${uploaded}, skipped ${skipped}.`);
    console.log(`Manifest: ${manifestAbs}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
