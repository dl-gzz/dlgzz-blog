import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is not set');
const hostname = new URL(databaseUrl).hostname;
const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
const checkOnly = process.argv.includes('--check-only');
if (
  !isLocal &&
  !checkOnly &&
  process.env.ONEWORK_ALLOW_REMOTE_MIGRATION_BASELINE !== 'true'
) {
  throw new Error(
    `Refusing to baseline remote database ${hostname} without ONEWORK_ALLOW_REMOTE_MIGRATION_BASELINE=true`
  );
}

// 0002 的 try_on_history 已是下线功能，不作为基线前置条件。
// 旧生产环境漏建的 miniapp_account 会由 0020 幂等恢复，也不阻断基线。
// 不能只检查表名：缺少旧字段的半成品数据库也绝不能被标记为已完成 0006。
const requiredLegacyColumns: Record<string, readonly string[]> = {
  account: [
    'id',
    'account_id',
    'provider_id',
    'user_id',
    'access_token',
    'refresh_token',
    'id_token',
    'access_token_expires_at',
    'refresh_token_expires_at',
    'scope',
    'password',
    'created_at',
    'updated_at',
  ],
  payment: [
    'id',
    'price_id',
    'type',
    'interval',
    'user_id',
    'customer_id',
    'subscription_id',
    'status',
    'period_start',
    'period_end',
    'cancel_at_period_end',
    'trial_start',
    'trial_end',
    'created_at',
    'updated_at',
  ],
  session: [
    'id',
    'expires_at',
    'token',
    'created_at',
    'updated_at',
    'ip_address',
    'user_agent',
    'user_id',
    'impersonated_by',
  ],
  user: [
    'id',
    'name',
    'email',
    'email_verified',
    'image',
    'created_at',
    'updated_at',
    'role',
    'banned',
    'ban_reason',
    'ban_expires',
    'customer_id',
  ],
  verification: [
    'id',
    'identifier',
    'value',
    'expires_at',
    'created_at',
    'updated_at',
  ],
  custom_model: [
    'id',
    'name',
    'height',
    'weight',
    'body_type',
    'style',
    'image_url',
    'oss_key',
    'user_id',
    'is_active',
    'created_at',
    'updated_at',
  ],
  worker_employee: [
    'id',
    'name',
    'responsibility',
    'suitable_tasks',
    'solves_problem',
    'employee_dir',
    'readme_path',
    'soul_path',
    'status',
    'monthly_price_id',
    'monthly_amount',
    'currency',
    'source_hash',
    'latest_version_id',
    'synced_at',
    'created_at',
    'updated_at',
  ],
  worker_employee_version: [
    'id',
    'employee_id',
    'soul_path',
    'soul_hash',
    'readme_hash',
    'skills_hash',
    'soul_snapshot',
    'readme_snapshot',
    'skills_summary',
    'created_at',
  ],
  worker_instance: [
    'id',
    'user_id',
    'employee_id',
    'employee_version_id',
    'persona_id',
    'persona_prompt',
    'status',
    'payment_status',
    'price_id',
    'subscription_id',
    'checkout_session_id',
    'profile_name',
    'activation_id',
    'qr_payload',
    'qr_image_url',
    'activation_expires_at',
    'weixin_account_id',
    'weixin_user_id',
    'gateway_status',
    'error',
    'activated_at',
    'created_at',
    'updated_at',
  ],
  worker_sync_run: [
    'id',
    'source_root',
    'status',
    'total',
    'synced',
    'skipped',
    'errors',
    'created_by',
    'created_at',
    'completed_at',
  ],
  worker_skill: [
    'id',
    'name',
    'summary',
    'category',
    'skill_type',
    'risk_level',
    'status',
    'default_enabled',
    'requires_user_config',
    'created_at',
    'updated_at',
  ],
  worker_employee_skill: [
    'id',
    'employee_id',
    'skill_id',
    'status',
    'default_enabled',
    'created_at',
    'updated_at',
  ],
  worker_instance_skill: [
    'id',
    'instance_id',
    'skill_id',
    'enabled',
    'source',
    'created_at',
    'updated_at',
  ],
  worker_tool_run: [
    'id',
    'instance_id',
    'skill_id',
    'status',
    'input_summary',
    'output_summary',
    'error',
    'created_at',
    'completed_at',
  ],
};
const requiredLegacyTables = Object.keys(requiredLegacyColumns);
// Current production was originally created with db:push. Baseline only the
// verified legacy migrations so the additive one-worker-os migrations can run.
const baselineMillis = 1780358400000;
const baselineFile = join(
  process.cwd(),
  'src/db/migrations/0006_worker_skills.sql'
);
const baselineHash = createHash('sha256')
  .update(readFileSync(baselineFile))
  .digest('hex');

const ssl = ['false', 'disable', 'off'].includes(
  (process.env.DATABASE_SSL || '').toLowerCase()
)
  ? false
  : 'require';
const sql = postgres(databaseUrl, { ssl, max: 1, prepare: false });

async function main() {
  try {
    const tableRows = await sql<{ tablename: string }[]>`
    select tablename from pg_catalog.pg_tables where schemaname = 'public'
  `;
    const present = new Set(tableRows.map((row) => row.tablename));
    const missing = requiredLegacyTables.filter((table) => !present.has(table));
    if (missing.length > 0) {
      throw new Error(
        `Cannot baseline: legacy schema is incomplete (${missing.join(', ')})`
      );
    }

    const columnRows = await sql<{ table_name: string; column_name: string }[]>`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ${sql(requiredLegacyTables)}
  `;
    const columnsByTable = new Map<string, Set<string>>();
    for (const row of columnRows) {
      const columns = columnsByTable.get(row.table_name) ?? new Set<string>();
      columns.add(row.column_name);
      columnsByTable.set(row.table_name, columns);
    }
    const missingColumns = Object.entries(requiredLegacyColumns).flatMap(
      ([table, columns]) =>
        columns
          .filter((column) => !columnsByTable.get(table)?.has(column))
          .map((column) => `${table}.${column}`)
    );
    if (missingColumns.length > 0) {
      throw new Error(
        `Cannot baseline: legacy columns are incomplete (${missingColumns.join(', ')})`
      );
    }

    const verification = {
      success: true,
      checkOnly,
      host: hostname,
      verifiedTables: requiredLegacyTables.length,
      verifiedColumns: Object.values(requiredLegacyColumns).reduce(
        (total, columns) => total + columns.length,
        0
      ),
    };

    if (checkOnly) {
      console.log(JSON.stringify(verification));
    } else {
      const result = await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext('onework-drizzle-baseline'))`;
        await tx.unsafe('create schema if not exists drizzle');
        await tx.unsafe(`
        create table if not exists drizzle.__drizzle_migrations (
          id serial primary key,
          hash text not null,
          created_at bigint
        )
      `);
        const existing = await tx<{ created_at: string | null }[]>`
        select created_at from drizzle.__drizzle_migrations
        order by created_at desc nulls last limit 1
      `;
        if (existing.length > 0) {
          const current = Number(existing[0].created_at || 0);
          if (current < baselineMillis) {
            throw new Error(
              `Existing migration history (${current}) is older than the verified baseline`
            );
          }
          return { inserted: false, current };
        }
        await tx`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${baselineHash}, ${baselineMillis})
      `;
        return { inserted: true, current: baselineMillis };
      });

      console.log(JSON.stringify({ ...verification, ...result }));
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
