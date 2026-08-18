import { join } from 'node:path';
import * as dotenv from 'dotenv';
/**
 * 幂等创建 one-worker-os 会员授权层。
 *
 * 这组表不修改现有知识向量数据，只负责：兑换码、用户权益、设备 Key、安装会话。
 * Run: pnpm db:apply-onework-access
 */
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
  return postgres(url, { ssl, max: 1, prepare: false, connect_timeout: 15 });
}

async function main() {
  const sql = getSql();
  try {
    await sql`
      create table if not exists onework_activation_code (
        id text primary key,
        code_hash text not null,
        code_prefix text not null,
        label text not null default '',
        source text not null default 'manual',
        pack_ids jsonb not null,
        trial_days integer not null default 30,
        monthly_quota integer not null default 1000,
        max_redemptions integer not null default 1,
        redeemed_count integer not null default 0,
        status text not null default 'active',
        redeemed_by_user_id text references "user"(id) on delete set null,
        redeemed_at timestamp,
        expires_at timestamp,
        created_by_user_id text references "user"(id) on delete set null,
        created_at timestamp not null default now(),
        updated_at timestamp not null default now()
      )
    `;
    await sql`create unique index if not exists onework_activation_code_hash_unique_idx on onework_activation_code (code_hash)`;
    await sql`create index if not exists onework_activation_code_status_idx on onework_activation_code (status)`;
    await sql`create index if not exists onework_activation_code_redeemed_user_idx on onework_activation_code (redeemed_by_user_id)`;

    await sql`
      create table if not exists onework_entitlement (
        id text primary key,
        user_id text not null references "user"(id) on delete cascade,
        knowledge_pack_id text not null,
        source text not null default 'activation',
        status text not null default 'active',
        monthly_quota integer not null default 1000,
        starts_at timestamp not null default now(),
        expires_at timestamp,
        external_order_id text,
        created_at timestamp not null default now(),
        updated_at timestamp not null default now()
      )
    `;
    await sql`create unique index if not exists onework_entitlement_user_pack_unique_idx on onework_entitlement (user_id, knowledge_pack_id)`;
    await sql`create index if not exists onework_entitlement_user_status_idx on onework_entitlement (user_id, status)`;
    await sql`create index if not exists onework_entitlement_expires_idx on onework_entitlement (expires_at)`;

    await sql`
      create table if not exists onework_device (
        id text primary key,
        user_id text not null references "user"(id) on delete cascade,
        api_key_id text not null references api_key(id) on delete cascade,
        device_hash text not null,
        device_name text not null default '',
        platform text not null default 'unknown',
        status text not null default 'active',
        last_seen_at timestamp,
        created_at timestamp not null default now(),
        updated_at timestamp not null default now()
      )
    `;
    // 同一台电脑重新安装时会生成新 Key，设备哈希允许有历史记录，不做唯一约束。
    await sql`drop index if exists onework_device_hash_unique_idx`;
    await sql`create index if not exists onework_device_hash_idx on onework_device (device_hash)`;
    await sql`create index if not exists onework_device_user_status_idx on onework_device (user_id, status)`;

    await sql`
      create table if not exists onework_install_token (
        id text primary key,
        token_hash text not null,
        user_id text not null references "user"(id) on delete cascade,
        platform text not null default 'unknown',
        device_name text not null default '',
        expires_at timestamp not null,
        consumed_at timestamp,
        created_at timestamp not null default now()
      )
    `;
    await sql`create unique index if not exists onework_install_token_hash_unique_idx on onework_install_token (token_hash)`;
    await sql`create index if not exists onework_install_token_user_idx on onework_install_token (user_id)`;
    await sql`create index if not exists onework_install_token_expires_idx on onework_install_token (expires_at)`;

    // 兼容已提前创建过授权表的环境。
    await sql`alter table onework_entitlement add column if not exists monthly_quota integer not null default 1000`;

    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_name in ('onework_activation_code','onework_entitlement','onework_device','onework_install_token')
      order by table_name
    `;
    console.log(
      '✅ one-worker-os 授权层已就绪:',
      tables.map((t) => t.table_name).join(', ')
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
