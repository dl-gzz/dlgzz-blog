/**
 * Finalize a catalog whose COS objects are already uploaded.
 * Uses node-postgres instead of the S3/import helper's postgres client because
 * some pooled Supabase connections can leave the latter waiting after a write.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

type Asset = Record<string, any>;
type Catalog = { packId: string; assets: Asset[] };

function sha1(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 20);
}

function embeddingText(asset: Asset) {
  return [
    asset.title,
    asset.altText,
    asset.caption,
    asset.platform,
    asset.publisher,
    asset.sourceType,
    asset.visualFacts?.product,
    asset.visualFacts?.document,
    asset.visualFacts?.heading,
  ]
    .filter((item) => typeof item === 'string' && item.trim())
    .join(' | ');
}

async function main() {
  const catalogPath = process.argv[2] || '/tmp/xhs-open-shop-uploaded.catalog.json';
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as Catalog;
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  let completed = 0;
  try {
    for (const asset of catalog.assets) {
      const metadata = { ...(asset.metadata || {}), safeToPublish: true, official: true };
      const visualFacts = asset.visualFacts || {};
      const analysis = asset.analysis || {};
      const text = embeddingText(asset);
      const textHash = createHash('sha256').update(`onework-knowledge-asset-embedding-text-v1\0${text}`).digest('hex');
      const result = await client.query<{ id: string }>(
        `insert into knowledge_assets (
          id, content_hash, asset_type, mime_type, storage_provider,
          storage_bucket, object_key, public_url, title, platform,
          thumbnail_url, embed_url, width, height, duration_seconds,
          published_at, caption, ocr_text, visual_facts, analysis_provider,
          analysis_model, analysis_version, analyzed_at, source_type,
          source_locator, status, visibility, metadata, embedding_text,
          embedding_text_hash, updated_at
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
          $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,now()
        )
        on conflict (content_hash) do update set
          asset_type=excluded.asset_type, mime_type=excluded.mime_type,
          storage_provider=excluded.storage_provider, storage_bucket=excluded.storage_bucket,
          object_key=excluded.object_key, public_url=excluded.public_url,
          title=excluded.title, platform=excluded.platform,
          thumbnail_url=excluded.thumbnail_url, embed_url=excluded.embed_url,
          width=excluded.width, height=excluded.height,
          duration_seconds=excluded.duration_seconds, published_at=excluded.published_at,
          caption=excluded.caption, ocr_text=excluded.ocr_text,
          visual_facts=excluded.visual_facts, analysis_provider=excluded.analysis_provider,
          analysis_model=excluded.analysis_model, analysis_version=excluded.analysis_version,
          analyzed_at=excluded.analyzed_at, source_type=excluded.source_type,
          source_locator=excluded.source_locator, status=excluded.status,
          visibility=excluded.visibility, metadata=excluded.metadata,
          embedding_text=excluded.embedding_text, embedding_text_hash=excluded.embedding_text_hash,
          updated_at=now()
        returning id`,
        [
          asset.id, asset.contentHash, asset.assetType || 'image', asset.mimeType || 'image/png',
          asset.storageProvider || 'cos', asset.storageBucket || null, asset.objectKey || null,
          asset.publicUrl || null, asset.title || null, asset.platform || null,
          asset.thumbnailUrl || null, asset.embedUrl || null, asset.width || null, asset.height || null,
          asset.durationSeconds || null, asset.publishedAt || null, asset.caption || null,
          asset.ocrText || null, JSON.stringify(visualFacts), analysis.provider || null,
          analysis.model || null, analysis.version || null, analysis.analyzedAt || null,
          asset.sourceType || 'official_platform_screenshot', asset.sourceRef, 'active',
          'public', JSON.stringify(metadata), text, textHash,
        ]
      );
      const assetId = result.rows[0].id;
      await client.query('delete from knowledge_asset_links where asset_id=$1 and source_ref=$2', [assetId, asset.sourceRef]);
      for (const link of asset.links || []) {
        const linkId = `knowledge-asset-link-${sha1(`${link.documentId}:${asset.sourceRef}:${link.occurrenceIndex ?? 0}`)}`;
        await client.query(
          `insert into knowledge_asset_links (
            id, asset_id, document_id, chunk_id, role, source_ref,
            occurrence_index, alt_text, context, sort_order, metadata, updated_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
          on conflict (document_id, source_ref, occurrence_index) do update set
            asset_id=excluded.asset_id, chunk_id=excluded.chunk_id, role=excluded.role,
            alt_text=excluded.alt_text, context=excluded.context,
            sort_order=excluded.sort_order, metadata=excluded.metadata, updated_at=now()`,
          [
            linkId, assetId, link.documentId, link.chunkId || null, link.role || 'ui_step',
            asset.sourceRef, link.occurrenceIndex || 0, asset.altText || null,
            link.context || null, link.sortOrder || 0, JSON.stringify(link.metadata || {}),
          ]
        );
      }
      completed += 1;
      if (completed % 25 === 0) console.log(`finalized ${completed}/${catalog.assets.length}`);
    }
  } finally {
    await client.end();
  }
  console.log(`finalized ${completed} assets`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
