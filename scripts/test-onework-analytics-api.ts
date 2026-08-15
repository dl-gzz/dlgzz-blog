/**
 * Isolated analytics API E2E test.
 *
 * It creates dedicated temporary users and rejects remote targets unless the
 * caller explicitly opts in. Start the app against the same DATABASE_URL, then:
 * ONEWORK_ANALYTICS_TEST_URL=http://127.0.0.1:3000 pnpm tsx scripts/test-onework-analytics-api.ts
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

function hashKey(rawKey: string) {
  return createHash('sha256').update(rawKey).digest('hex');
}

function isLocalHostname(hostname: string) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
}

function allowRemoteTestWrites() {
  return process.env.ONEWORK_ALLOW_REMOTE_E2E === 'true';
}

function getTestEndpoint() {
  const base = process.env.ONEWORK_ANALYTICS_TEST_URL?.trim();
  if (!base) {
    throw new Error(
      'ONEWORK_ANALYTICS_TEST_URL is required (for example http://127.0.0.1:3000)'
    );
  }
  const url = new URL('/api/analytics/query', base);
  if (!isLocalHostname(url.hostname) && !allowRemoteTestWrites()) {
    throw new Error(
      'Refusing to call a remote E2E API; set ONEWORK_ALLOW_REMOTE_E2E=true explicitly'
    );
  }
  return url;
}

function getSql() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const databaseHostname = new URL(databaseUrl).hostname;
  if (!isLocalHostname(databaseHostname) && !allowRemoteTestWrites()) {
    throw new Error(
      `Refusing temporary writes to remote database ${databaseHostname}; set ONEWORK_ALLOW_REMOTE_E2E=true explicitly`
    );
  }
  const ssl = ['false', 'disable', 'off'].includes(
    (process.env.DATABASE_SSL || '').toLowerCase()
  )
    ? false
    : 'require';
  return postgres(databaseUrl, {
    ssl,
    max: 1,
    prepare: false,
    connect_timeout: 15,
  });
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    throw new Error(`Expected JSON response, received HTTP ${response.status}`);
  }
  return data as Record<string, unknown>;
}

async function expectResponse(
  label: string,
  response: Response,
  expectedStatus: number,
  expectedCode?: string
) {
  const data = await readJson(response);
  if (response.status !== expectedStatus) {
    throw new Error(
      `${label}: expected HTTP ${expectedStatus}, received ${response.status}: ${JSON.stringify(data)}`
    );
  }
  if (expectedCode && data.code !== expectedCode) {
    throw new Error(
      `${label}: expected code ${expectedCode}, received ${String(data.code)}`
    );
  }
  return data;
}

async function main() {
  const endpoint = getTestEndpoint();
  const sql = getSql();
  const suffix = randomUUID();
  const activeUserId = `onework-analytics-active-${suffix}`;
  const expiredUserId = `onework-analytics-expired-${suffix}`;
  const activeKeyId = `apikey_analytics_active_${suffix}`;
  const expiredKeyId = `apikey_analytics_expired_${suffix}`;
  const activeRawKey = `dk_live_${randomBytes(24).toString('base64url')}`;
  const expiredRawKey = `dk_live_${randomBytes(24).toString('base64url')}`;
  const modelId = `semantic_model_test_${suffix}`;
  const modelKey = `onework_analytics_test_${suffix.replaceAll('-', '_')}`;
  const decoyUsageId = `usage_analytics_decoy_${suffix}`;
  const definition = {
    source: { schema: 'public', table: 'api_usage_event' },
    metrics: {
      event_count: {
        aggregation: 'count',
        label: '调用次数',
        description: '当前临时用户的 API 用量事件数',
        type: 'number',
      },
    },
    dimensions: {
      kind: { column: 'kind', type: 'string', label: '调用类型' },
    },
    filters: {
      kind: { column: 'kind', type: 'string', operators: ['eq', 'in'] },
    },
    userScope: { column: 'user_id' },
    defaultLimit: 20,
    maxLimit: 50,
  };

  try {
    await sql`
      insert into "user" (
        id, name, email, email_verified, created_at, updated_at
      ) values
        (${activeUserId}, 'Analytics E2E Active', ${`analytics-active-${suffix}@invalid.example`}, true, now(), now()),
        (${expiredUserId}, 'Analytics E2E Expired', ${`analytics-expired-${suffix}@invalid.example`}, true, now(), now())
    `;
    await sql`
      insert into onework_entitlement (
        id, user_id, knowledge_pack_id, source, status, monthly_quota,
        starts_at, expires_at, created_at, updated_at
      ) values
        (${`entitlement_active_${suffix}`}, ${activeUserId}, ${ALL_PACKS_GRANT}, 'test', 'active', 100, now() - interval '1 hour', now() + interval '1 hour', now(), now()),
        (${`entitlement_expired_${suffix}`}, ${expiredUserId}, ${ALL_PACKS_GRANT}, 'test', 'active', 100, now() - interval '2 hours', now() - interval '1 hour', now(), now())
    `;
    await sql`
      insert into api_key (
        id, user_id, name, key_hash, key_prefix, status, monthly_quota,
        created_at, updated_at
      ) values
        (${activeKeyId}, ${activeUserId}, 'Analytics E2E', ${hashKey(activeRawKey)}, 'dk_live_test…', 'active', 100, now(), now()),
        (${expiredKeyId}, ${expiredUserId}, 'Analytics E2E expired', ${hashKey(expiredRawKey)}, 'dk_live_test…', 'active', 100, now(), now())
    `;
    await sql`
      insert into api_key_pack_grant (
        id, api_key_id, knowledge_pack_id, source, expires_at, created_at
      ) values
        (${`grant_active_${suffix}`}, ${activeKeyId}, ${ALL_PACKS_GRANT}, 'test', now() + interval '1 hour', now()),
        (${`grant_expired_${suffix}`}, ${expiredKeyId}, ${ALL_PACKS_GRANT}, 'test', now() - interval '1 hour', now())
    `;
    await sql`
      insert into semantic_model (
        id, model_key, name, description, owner_user_id, scope, provider,
        definition, status, version, metadata, created_at, updated_at
      ) values (
        ${modelId}, ${modelKey}, 'Analytics API E2E', 'Temporary isolated model',
        null, 'global', 'postgres', ${sql.json(definition)}, 'published',
        '1.0.0', ${sql.json({ test: true })}, now(), now()
      )
    `;
    await sql`
      insert into api_usage_event (
        id, user_id, kind, query, status, created_at
      ) values (
        ${decoyUsageId}, ${expiredUserId}, 'analytics_query', 'decoy', 'ok', now()
      )
    `;

    await expectResponse(
      'missing auth',
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ semanticQuery: {} }),
      }),
      401,
      'MISSING'
    );

    await expectResponse(
      'expired entitlement',
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${expiredRawKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ semanticQuery: {} }),
      }),
      403,
      'ENTITLEMENT_EXPIRED'
    );

    await expectResponse(
      'invalid mode',
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${activeRawKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ semanticQuery: {}, mode: 'unsafe' }),
      }),
      400,
      'BAD_REQUEST'
    );

    await expectResponse(
      'raw SQL rejection',
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${activeRawKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          semanticQuery: {
            contract: 'onework.semantic-query.v1',
            model: modelKey,
            metrics: ['event_count'],
            dimensions: ['kind'],
            sql: 'select * from "user"',
          },
          mode: 'execute',
        }),
      }),
      400,
      'INVALID_QUERY'
    );

    const executed = await expectResponse(
      'governed execute',
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${activeRawKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          semanticQuery: {
            contract: 'onework.semantic-query.v1',
            model: modelKey,
            metrics: ['event_count'],
            dimensions: ['kind'],
            limit: 10,
          },
          mode: 'execute',
        }),
      }),
      200
    );
    if (executed.success !== true) throw new Error('governed execute failed');

    const [ownUsage] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from api_usage_event
      where user_id = ${activeUserId}
    `;
    const returnedRows = (
      executed.result as { rows?: Array<Record<string, unknown>> } | undefined
    )?.rows;
    const returnedCount = (returnedRows || []).reduce(
      (total, row) => total + Number(row.event_count || 0),
      0
    );
    if (returnedCount !== ownUsage?.count) {
      throw new Error(
        `user scope failed: API returned ${returnedCount}, own rows are ${ownUsage?.count}`
      );
    }

    const validated = await expectResponse(
      'validate only',
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${activeRawKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          semanticQuery: {
            contract: 'onework.semantic-query.v1',
            model: modelKey,
            metrics: ['event_count'],
            dimensions: [],
            limit: 10,
          },
          mode: 'validate',
        }),
      }),
      200
    );
    if (validated.mode !== 'validate') {
      throw new Error('validate mode was not preserved');
    }

    console.log('✅ Analytics API E2E passed with isolated temporary users');
  } finally {
    await sql`delete from semantic_query_run where user_id in (${activeUserId}, ${expiredUserId}) or semantic_model_id = ${modelId}`;
    await sql`delete from api_usage_event where user_id in (${activeUserId}, ${expiredUserId})`;
    await sql`delete from semantic_model where id = ${modelId}`;
    await sql`delete from "user" where id in (${activeUserId}, ${expiredUserId})`;
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
