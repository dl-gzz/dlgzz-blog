/**
 * Apply the idempotent knowledge-asset migration to databases whose existing
 * schema predates Drizzle's migration journal.
 *
 * Run: pnpm tsx scripts/apply-knowledge-asset-tables.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

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
    onnotice: () => {},
  });
}

async function main() {
  const sql = getSql();
  const migrationPaths = [
    'src/db/migrations/0014_knowledge_assets.sql',
    'src/db/migrations/0015_knowledge_media_assets.sql',
    'src/db/migrations/0016_knowledge_asset_embeddings.sql',
  ];
  const statements = migrationPaths.flatMap((migrationPath) =>
    readFileSync(join(process.cwd(), migrationPath), 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean)
  );

  try {
    await sql.begin(async (transaction) => {
      for (const statement of statements) {
        await transaction.unsafe(statement);
      }
    });

    const tables = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('knowledge_assets', 'knowledge_asset_links')
      order by table_name
    `;
    if (tables.length !== 2) {
      throw new Error('knowledge asset tables were not created');
    }

    const mediaColumns = await sql<{ column_name: string }[]>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'knowledge_assets'
        and column_name in (
          'title', 'platform', 'thumbnail_url', 'embed_url',
          'duration_seconds', 'published_at'
        )
    `;
    if (mediaColumns.length !== 6) {
      throw new Error('knowledge media columns were not created');
    }

    const embeddingColumns = await sql<{ column_name: string }[]>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'knowledge_assets'
        and column_name in (
          'embedding_text', 'embedding_text_hash', 'embedding',
          'embedding_model', 'embedding_dimensions', 'embedded_at'
        )
    `;
    if (embeddingColumns.length !== 6) {
      throw new Error('knowledge asset embedding columns were not created');
    }

    const audit = await sql<
      {
        asset_count: number;
        link_count: number;
        identity_matches: number;
        absolute_path_matches: number;
      }[]
    >`
			select
				(select count(*)::int from knowledge_assets) as asset_count,
				(select count(*)::int from knowledge_asset_links) as link_count,
			(
				(select count(*)::int from knowledge_assets
				 where concat_ws(' ', caption, ocr_text, visual_facts::text, metadata::text)
					 ~* '(白杨|baiyang)')
				+
				(select count(*)::int from knowledge_asset_links
				 where concat_ws(' ', source_ref, alt_text, context, metadata::text)
					 ~* '(白杨|baiyang)')
			) as identity_matches,
			(
				(select count(*)::int from knowledge_assets
				 where concat_ws(' ', source_locator, metadata::text)
					 ~* '(/Users/|[A-Z]:\\\\Users\\\\)')
				+
				(select count(*)::int from knowledge_asset_links
				 where concat_ws(' ', source_ref, context, metadata::text)
					 ~* '(/Users/|[A-Z]:\\\\Users\\\\)')
			) as absolute_path_matches
		`;
    if (audit[0].identity_matches || audit[0].absolute_path_matches) {
      throw new Error('knowledge asset privacy audit failed');
    }

    console.log(
      `Knowledge media tables ready: ${tables
        .map((table) => table.table_name)
        .join(', ')}`
    );
    console.log(
      `Privacy audit passed: ${audit[0].asset_count} assets, ${audit[0].link_count} links`
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
