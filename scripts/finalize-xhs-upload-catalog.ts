/** Add the already-uploaded COS location to a catalog without uploading again. */
import { readFileSync, writeFileSync } from 'node:fs';

const input = process.argv[2] || '/tmp/xhs-open-shop-safe.catalog.json';
const output = process.argv[3] || '/tmp/xhs-open-shop-uploaded.catalog.json';
const catalog = JSON.parse(readFileSync(input, 'utf8')) as {
  packId: string;
  defaults?: Record<string, unknown>;
  assets: Array<Record<string, any>>;
};

for (const asset of catalog.assets) {
  const extension = asset.sourceRef.slice(asset.sourceRef.lastIndexOf('.'));
  const objectKey = `knowledge/${catalog.packId}/${asset.contentHash}${extension}`;
  asset.objectKey = objectKey;
  asset.storageProvider = 'cos';
  asset.storageBucket = 'onework-knowledge-1251991248';
  asset.publicUrl = `https://img.dlgzz.com/${objectKey}`;
  // The local source is no longer needed for this DB-only finalize step.
  delete asset.sourceFile;
}

writeFileSync(output, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Finalized ${catalog.assets.length} uploaded assets: ${output}`);
