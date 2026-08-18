/** Apply the additive one-worker-os device de-duplication migration. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const ssl = ['false', 'disable', 'off'].includes(
  (process.env.DATABASE_SSL || '').toLowerCase()
)
  ? false
  : 'require';
const sql = postgres(url, {
  ssl,
  max: 1,
  prepare: false,
  connect_timeout: 15,
  onnotice: () => {},
});

async function main() {
  const migrationPath = join(
    process.cwd(),
    'src/db/migrations/0018_onework_device_dedup.sql'
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

    const [summary] = await sql<
      { devices: number; duplicate_groups: number }[]
    >`
      SELECT
        count(*)::int AS devices,
        count(*) FILTER (WHERE duplicate_count > 1)::int AS duplicate_groups
      FROM (
        SELECT user_id, device_hash, count(*)::int AS duplicate_count
        FROM onework_device
        GROUP BY user_id, device_hash
      ) grouped
    `;
    console.log(
      `one-worker-os device de-duplication ready: ${summary.devices} device rows, ${summary.duplicate_groups} duplicate groups`
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
