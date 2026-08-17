/** Apply the additive OneWorkerOS capability and semantic-layer migration. */
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
  const migrationPath = join(
    process.cwd(),
    'src/db/migrations/0017_onework_semantic_layer.sql'
  );
  const statements = readFileSync(migrationPath, 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);

  try {
    await sql.begin(async (transaction) => {
      for (const statement of statements) {
        await transaction.unsafe(statement);
      }
    });

    const rows = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'onework_capability',
          'worker_skill_capability',
          'semantic_model',
          'semantic_query_run'
        )
      order by table_name
    `;
    if (rows.length !== 4) {
      throw new Error('OneWorkerOS semantic-layer tables were not created');
    }
    console.log(
      `OneWorkerOS semantic layer ready: ${rows
        .map((row) => row.table_name)
        .join(', ')}`
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
