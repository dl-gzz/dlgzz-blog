/**
 * Copy an approved catalog's local media into a flat upload folder using the
 * exact COS object basenames. Existing matching files are kept; mismatches are
 * rejected instead of overwritten.
 *
 * Run:
 *   pnpm knowledge:assets:stage -- --catalog /private/catalog.json \
 *     --out-dir /private/upload-batch
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

type CatalogAsset = {
  contentHash: string;
  sourceFile: string;
  objectKey: string;
  visibility: string;
  safeToPublish: boolean;
};

type Catalog = {
  version: number;
  packId: string;
  assets: CatalogAsset[];
};

function parseArgs() {
  const args = process.argv.slice(2);
  const valueAfter = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] || '' : '';
  };
  const catalogPath = valueAfter('--catalog');
  const outputDir = valueAfter('--out-dir');
  if (!catalogPath || !outputDir) {
    throw new Error('需要 --catalog 和 --out-dir');
  }
  return { catalogPath: resolve(catalogPath), outputDir: resolve(outputDir) };
}

function sha256(filePath: string) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function main() {
  const options = parseArgs();
  const catalog = JSON.parse(
    readFileSync(options.catalogPath, 'utf8')
  ) as Catalog;
  if (catalog.version !== 1 || !Array.isArray(catalog.assets)) {
    throw new Error('catalog 格式无效');
  }
  mkdirSync(options.outputDir, { recursive: true });

  const staged: Array<{ file: string; objectKey: string }> = [];
  for (const asset of catalog.assets) {
    if (asset.visibility !== 'public' || asset.safeToPublish !== true) {
      throw new Error(`资产未批准公开：${asset.contentHash}`);
    }
    if (!existsSync(asset.sourceFile)) {
      throw new Error(`本地源文件不存在：${asset.contentHash}`);
    }
    if (sha256(asset.sourceFile) !== asset.contentHash) {
      throw new Error(`源文件哈希不一致：${asset.contentHash}`);
    }
    const fileName = basename(asset.objectKey);
    const destination = resolve(options.outputDir, fileName);
    if (existsSync(destination)) {
      if (sha256(destination) !== asset.contentHash) {
        throw new Error(`目标文件已存在但内容不同：${fileName}`);
      }
    } else {
      copyFileSync(asset.sourceFile, destination);
    }
    staged.push({ file: fileName, objectKey: asset.objectKey });
  }

  console.log(`Pack: ${catalog.packId}`);
  console.log(`Staged files: ${staged.length}`);
  console.log(`Upload folder: ${options.outputDir}`);
  console.log('COS target prefix: knowledge/workbuddy/');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
