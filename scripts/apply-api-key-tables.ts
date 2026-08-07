/**
 * 幂等建表：API Key 层三张表（api_key / api_key_pack_grant / api_usage_event）。
 * 与 src/db/schema.ts 的定义一致。drizzle-kit 因删表歧义走交互式，这里直接建。
 * Run: pnpm tsx scripts/apply-api-key-tables.ts
 */
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import { join } from 'node:path';

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
  return postgres(url, { ssl, max: 1, prepare: false, connect_timeout: 15 });
}

async function main() {
  const sql = getSql();
  try {
    await sql`
      create table if not exists api_key (
        id text primary key,
        user_id text not null references "user"(id) on delete cascade,
        name text not null default '',
        key_hash text not null,
        key_prefix text not null,
        status text not null default 'active',
        monthly_quota integer not null default 1000,
        last_used_at timestamp,
        revoked_at timestamp,
        created_at timestamp not null default now(),
        updated_at timestamp not null default now()
      )
    `;
    await sql`create unique index if not exists api_key_key_hash_unique_idx on api_key (key_hash)`;
    await sql`create index if not exists api_key_user_id_idx on api_key (user_id)`;

    await sql`
      create table if not exists api_key_pack_grant (
        id text primary key,
        api_key_id text not null references api_key(id) on delete cascade,
        knowledge_pack_id text not null,
        source text not null default 'purchase',
        expires_at timestamp,
        created_at timestamp not null default now()
      )
    `;
    await sql`create unique index if not exists api_key_pack_grant_unique_idx on api_key_pack_grant (api_key_id, knowledge_pack_id)`;
    await sql`create index if not exists api_key_pack_grant_pack_idx on api_key_pack_grant (knowledge_pack_id)`;

    await sql`
      create table if not exists api_usage_event (
        id text primary key,
        api_key_id text references api_key(id) on delete set null,
        user_id text references "user"(id) on delete set null,
        kind text not null,
        knowledge_pack_id text,
        service_id text,
        query text not null default '',
        result_count integer not null default 0,
        embedding_tokens integer not null default 0,
        latency_ms integer not null default 0,
        status text not null default 'ok',
        created_at timestamp not null default now()
      )
    `;
    await sql`create index if not exists api_usage_event_key_created_idx on api_usage_event (api_key_id, created_at)`;
    await sql`create index if not exists api_usage_event_user_created_idx on api_usage_event (user_id, created_at)`;
    await sql`create index if not exists api_usage_event_pack_idx on api_usage_event (knowledge_pack_id)`;

    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_name in ('api_key','api_key_pack_grant','api_usage_event')
      order by table_name
    `;
    console.log('✅ 已就绪:', tables.map((t) => t.table_name).join(', '));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
