/**
 * Build and backfill text embeddings for public knowledge images.
 *
 * The image bytes are not sent to a model. Only the approved title, alt text,
 * caption, platform, usage context, and visual facts are embedded.
 *
 * Run:
 *   pnpm knowledge:assets:embed -- --pack onework-workbuddy-v1 --dry-run
 *   pnpm knowledge:assets:embed -- --pack onework-workbuddy-v1
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import * as dotenv from 'dotenv';
import postgres from 'postgres';
import {
  KNOWLEDGE_ASSET_EMBEDDING_TEXT_VERSION,
  buildKnowledgeAssetEmbeddingText,
} from '../src/lib/knowledge-asset-embedding-text';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

const EMBEDDING_MODEL = 'embedding-3';
const EMBEDDING_DIMENSIONS = 2048;
const DEFAULT_BATCH_SIZE = 32;
const MAX_BATCH_SIZE = 64;
const ADVISORY_LOCK_NAME = 'knowledge-asset-embedding-v1';

type JsonObject = Record<string, unknown>;

type AssetRow = {
  id: string;
  content_hash: string;
  title: string | null;
  caption: string | null;
  ocr_text: string | null;
  platform: string | null;
  source_type: string | null;
  visual_facts: JsonObject;
  metadata: JsonObject;
  alt_texts: string[];
  embedding_text: string | null;
  embedding_text_hash: string | null;
  has_embedding: boolean;
  embedding_model: string | null;
  embedding_dimensions: number | null;
};

type PreparedAsset = AssetRow & {
  nextEmbeddingText: string;
  nextEmbeddingTextHash: string;
  needsEmbedding: boolean;
};

type Options = {
  packId: string;
  all: boolean;
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  batchSize: number;
};

function parsePositiveInteger(value: string, name: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} 必须是正整数`);
  }
  return parsed;
}

function parseArgs(): Options {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const valueAfter = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] || '' : '';
  };
  const packId = valueAfter('--pack').trim();
  const all = args.includes('--all');
  if ((!packId && !all) || (packId && all)) {
    throw new Error('必须且只能指定 --pack <知识包ID> 或 --all');
  }

  const rawLimit = valueAfter('--limit');
  const rawBatchSize = valueAfter('--batch-size');
  const batchSize = rawBatchSize
    ? parsePositiveInteger(rawBatchSize, '--batch-size')
    : DEFAULT_BATCH_SIZE;
  if (batchSize > MAX_BATCH_SIZE) {
    throw new Error(`--batch-size 不能超过 ${MAX_BATCH_SIZE}`);
  }

  return {
    packId,
    all,
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    limit: rawLimit ? parsePositiveInteger(rawLimit, '--limit') : null,
    batchSize,
  };
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

function embeddingTextHash(text: string) {
  return createHash('sha256')
    .update(`${KNOWLEDGE_ASSET_EMBEDDING_TEXT_VERSION}\0${text}`)
    .digest('hex');
}

function publisherFromMetadata(metadata: JsonObject) {
  return typeof metadata.publisher === 'string' ? metadata.publisher : null;
}

function prepareAsset(row: AssetRow, force: boolean): PreparedAsset {
  const nextEmbeddingText = buildKnowledgeAssetEmbeddingText({
    title: row.title,
    altTexts: row.alt_texts,
    caption: row.caption,
    ocrText: row.ocr_text,
    platform: row.platform,
    publisher: publisherFromMetadata(row.metadata),
    sourceType: row.source_type,
    visualFacts: row.visual_facts,
    metadata: row.metadata,
  });
  if (!nextEmbeddingText) {
    throw new Error(`资产没有可用的检索文本：${row.id}`);
  }
  const nextEmbeddingTextHash = embeddingTextHash(nextEmbeddingText);
  const needsEmbedding =
    force ||
    row.embedding_text !== nextEmbeddingText ||
    row.embedding_text_hash !== nextEmbeddingTextHash ||
    !row.has_embedding ||
    row.embedding_model !== EMBEDDING_MODEL ||
    row.embedding_dimensions !== EMBEDDING_DIMENSIONS;

  return {
    ...row,
    nextEmbeddingText,
    nextEmbeddingTextHash,
    needsEmbedding,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestEmbeddings(texts: string[]) {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) throw new Error('ZHIPU_API_KEY is not set');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(
      'https://open.bigmodel.cn/api/paas/v4/embeddings',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
          input: texts.map((text) => text.slice(0, 8000)),
        }),
        signal: AbortSignal.timeout(45_000),
      }
    );

    if (response.ok) {
      const payload = (await response.json()) as {
        data?: Array<{ index?: number; embedding?: number[] }>;
        usage?: { total_tokens?: number };
      };
      const data = payload.data || [];
      if (data.length !== texts.length) {
        throw new Error(
          `智谱返回向量数量不匹配：期待 ${texts.length}，实际 ${data.length}`
        );
      }
      const ordered = data.every((item) => Number.isInteger(item.index))
        ? [...data].sort((a, b) => (a.index || 0) - (b.index || 0))
        : data;
      const embeddings = ordered.map((item) => item.embedding || []);
      for (const embedding of embeddings) {
        if (
          embedding.length !== EMBEDDING_DIMENSIONS ||
          embedding.some((value) => !Number.isFinite(value))
        ) {
          throw new Error('智谱返回了无效的 2048 维向量');
        }
      }
      return {
        embeddings,
        totalTokens: Number(payload.usage?.total_tokens) || 0,
      };
    }

    const errorBody = await response.text().catch(() => '');
    const retryable =
      response.status === 408 ||
      response.status === 429 ||
      response.status >= 500;
    if (!retryable || attempt === 2) {
      throw new Error(
        `智谱 Embedding 失败：${response.status} ${errorBody.slice(0, 240)}`
      );
    }
    await wait(500 * 2 ** attempt);
  }

  throw new Error('智谱 Embedding 失败');
}

async function readAssets(sql: ReturnType<typeof postgres>, options: Options) {
  const limit = options.limit || 2_147_483_647;
  return sql<AssetRow[]>`
    select
      ka.id,
      ka.content_hash,
      ka.title,
      ka.caption,
      ka.ocr_text,
      ka.platform,
      ka.source_type,
      ka.visual_facts,
      ka.metadata,
      coalesce(
        array(
          select distinct btrim(kal.alt_text)
          from knowledge_asset_links kal
          where kal.asset_id = ka.id
            and kal.alt_text is not null
            and btrim(kal.alt_text) <> ''
          order by btrim(kal.alt_text)
        ),
        array[]::text[]
      ) as alt_texts,
      ka.embedding_text,
      ka.embedding_text_hash,
      ka.embedding is not null as has_embedding,
      ka.embedding_model,
      ka.embedding_dimensions
    from knowledge_assets ka
    where ka.asset_type = 'image'
      and ka.status = 'active'
      and ka.visibility = 'public'
      and ka.public_url is not null
      and ka.public_url <> ''
      and (
        ${options.all}
        or exists (
        select 1
        from knowledge_asset_links kal
        join knowledge_pack_documents kpd
          on kpd.document_id = kal.document_id
        where kal.asset_id = ka.id
          and kpd.knowledge_pack_id = ${options.packId}
        )
      )
    order by ka.id
    limit ${limit}
  `;
}

async function main() {
  const options = parseArgs();
  const sql = getSql();
  let lockAcquired = false;

  try {
    if (!options.dryRun) {
      const lockRows = await sql<{ acquired: boolean }[]>`
        select pg_try_advisory_lock(hashtext(${ADVISORY_LOCK_NAME})::bigint)
          as acquired
      `;
      lockAcquired = lockRows[0]?.acquired === true;
      if (!lockAcquired) {
        throw new Error('已有另一个知识资产向量任务正在运行');
      }
    }

    const rows = await readAssets(sql, options);
    const prepared = rows.map((row) => prepareAsset(row, options.force));
    const pending = prepared.filter((asset) => asset.needsEmbedding);

    if (options.dryRun) {
      console.log(
        JSON.stringify(
          {
            success: true,
            dryRun: true,
            packId: options.all ? null : options.packId,
            selected: prepared.length,
            pending: pending.length,
            skipped: prepared.length - pending.length,
            model: EMBEDDING_MODEL,
            dimensions: EMBEDDING_DIMENSIONS,
          },
          null,
          2
        )
      );
      return;
    }

    for (const asset of prepared) {
      if (
        asset.embedding_text === asset.nextEmbeddingText &&
        asset.embedding_text_hash === asset.nextEmbeddingTextHash
      ) {
        continue;
      }
      await sql`
        update knowledge_assets
        set
          embedding_text = ${asset.nextEmbeddingText},
          embedding = case
            when embedding_text_hash = ${asset.nextEmbeddingTextHash}
              then embedding
            else null
          end,
          embedding_model = case
            when embedding_text_hash = ${asset.nextEmbeddingTextHash}
              then embedding_model
            else null
          end,
          embedding_dimensions = case
            when embedding_text_hash = ${asset.nextEmbeddingTextHash}
              then embedding_dimensions
            else null
          end,
          embedded_at = case
            when embedding_text_hash = ${asset.nextEmbeddingTextHash}
              then embedded_at
            else null
          end,
          embedding_text_hash = ${asset.nextEmbeddingTextHash},
          updated_at = now()
        where id = ${asset.id}
      `;
    }

    let embedded = 0;
    let staleDiscarded = 0;
    let totalTokens = 0;
    for (let offset = 0; offset < pending.length; offset += options.batchSize) {
      const batch = pending.slice(offset, offset + options.batchSize);
      const response = await requestEmbeddings(
        batch.map((asset) => asset.nextEmbeddingText)
      );
      totalTokens += response.totalTokens;

      await sql.begin(async (transaction) => {
        for (let index = 0; index < batch.length; index += 1) {
          const asset = batch[index];
          const vector = JSON.stringify(response.embeddings[index]);
          const updated = await transaction<{ id: string }[]>`
            update knowledge_assets
            set
              embedding = ${vector}::vector,
              embedding_model = ${EMBEDDING_MODEL},
              embedding_dimensions = ${EMBEDDING_DIMENSIONS},
              embedded_at = now(),
              updated_at = now()
            where id = ${asset.id}
              and content_hash = ${asset.content_hash}
              and embedding_text_hash = ${asset.nextEmbeddingTextHash}
            returning id
          `;
          if (updated.length) embedded += 1;
          else staleDiscarded += 1;
        }
      });
    }

    console.log(
      JSON.stringify(
        {
          success: true,
          dryRun: false,
          packId: options.all ? null : options.packId,
          selected: prepared.length,
          embedded,
          skipped: prepared.length - pending.length,
          staleDiscarded,
          totalTokens,
          model: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
        },
        null,
        2
      )
    );
  } finally {
    if (lockAcquired) {
      await sql`
        select pg_advisory_unlock(hashtext(${ADVISORY_LOCK_NAME})::bigint)
      `.catch(() => {});
    }
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
