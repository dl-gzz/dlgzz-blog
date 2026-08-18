/**
 * Isolated one-worker-os public/local API E2E test.
 *
 * The target app must use the same DATABASE_URL as this process. Remote API
 * calls or remote database writes are refused unless the operator explicitly
 * sets ONEWORK_ALLOW_REMOTE_E2E=true.
 *
 * Local example:
 *   ONEWORK_API_TEST_URL=http://127.0.0.1:3000 pnpm test:onework:public-api
 *
 * Remote example (deliberately requires an explicit write opt-in):
 *   ONEWORK_ALLOW_REMOTE_E2E=true \
 *   ONEWORK_API_TEST_URL=https://www.dlgzz.com \
 *   pnpm test:onework:public-api
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

const GOAL = '小红书店铺怎么设置发货';
const PACK_ID = 'xhs-open-shop-v1';
const REQUEST_TIMEOUT_MS = 30_000;

function isLocalHostname(hostname: string) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(
    hostname.toLowerCase()
  );
}

function remoteE2EIsAllowed() {
  return process.env.ONEWORK_ALLOW_REMOTE_E2E === 'true';
}

function assertRemoteAccessAllowed(kind: string, hostname: string) {
  if (!isLocalHostname(hostname) && !remoteE2EIsAllowed()) {
    throw new Error(
      `Refusing ${kind} against remote host ${hostname}; set ONEWORK_ALLOW_REMOTE_E2E=true explicitly`
    );
  }
}

function getApiEndpoints() {
  const baseUrl = process.env.ONEWORK_API_TEST_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      'ONEWORK_API_TEST_URL is required (for example http://127.0.0.1:3000)'
    );
  }

  const parsedBaseUrl = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
    throw new Error('ONEWORK_API_TEST_URL must use http or https');
  }
  assertRemoteAccessAllowed('API E2E calls', parsedBaseUrl.hostname);

  return {
    resolve: new URL('/api/capabilities/resolve', parsedBaseUrl),
    knowledge: new URL('/api/knowledge/query', parsedBaseUrl),
  };
}

function getSql() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const parsedDatabaseUrl = new URL(databaseUrl);
  assertRemoteAccessAllowed(
    'temporary database writes',
    parsedDatabaseUrl.hostname
  );

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
    idle_timeout: 10,
  });
}

function hashKey(rawKey: string) {
  return createHash('sha256').update(rawKey).digest('hex');
}

/** Keep this byte-for-byte compatible with hashOneWorkDeviceId in api-key.ts. */
function hashDeviceId(deviceId: string) {
  return createHash('sha256')
    .update(`onework-device-v1:${deviceId.trim()}`)
    .digest('hex');
}

async function fetchWithTimeout(url: URL, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonObject(label: string, response: Response) {
  const contentType = response.headers.get('content-type') || '';
  const rawBody = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error(
      `${label}: expected JSON, received HTTP ${response.status} (${contentType || 'unknown content type'}): ${rawBody.slice(0, 300)}`
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label}: response JSON must be an object`);
  }
  return parsed as Record<string, unknown>;
}

async function expectJsonResponse({
  label,
  response,
  status,
  code,
}: {
  label: string;
  response: Response;
  status: number;
  code?: string;
}) {
  const body = await readJsonObject(label, response);
  if (response.status !== status) {
    throw new Error(
      `${label}: expected HTTP ${status}, received ${response.status}: ${JSON.stringify(body)}`
    );
  }
  if (code && body.code !== code) {
    throw new Error(
      `${label}: expected code ${code}, received ${String(body.code)}`
    );
  }
  return body;
}

function authenticatedHeaders(rawKey: string, deviceId?: string) {
  return {
    authorization: `Bearer ${rawKey}`,
    'content-type': 'application/json',
    ...(deviceId ? { 'x-onework-device-id': deviceId } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function main() {
  const endpoints = getApiEndpoints();
  const sql = getSql();
  const suffix = randomUUID();
  const userId = `onework-public-api-e2e-user-${suffix}`;
  const apiKeyId = `apikey_public_api_e2e_${suffix}`;
  const entitlementId = `entitlement_public_api_e2e_${suffix}`;
  const deviceRecordId = `device_public_api_e2e_${suffix}`;
  const capabilityRecordId = `capability_public_api_e2e_${suffix}`;
  const capabilityKey = `knowledge.search.e2e.${suffix}`;
  const rawKey = `dk_live_${randomBytes(24).toString('base64url')}`;
  const rawDeviceId = `onework-e2e-device-${randomBytes(18).toString('base64url')}`;
  let userWasCreated = false;

  try {
    const [packState] = await sql<
      Array<{ pack_exists: boolean; chunk_count: number }>
    >`
      select
        exists(
          select 1 from knowledge_packs where id = ${PACK_ID}
        ) as pack_exists,
        (
          select count(*)::int
          from knowledge_pack_documents kpd
          join knowledge_chunks kc on kc.document_id = kpd.document_id
          where kpd.knowledge_pack_id = ${PACK_ID}
        ) as chunk_count
    `;
    if (!packState?.pack_exists || packState.chunk_count < 1) {
      throw new Error(
        `Knowledge pack ${PACK_ID} is unavailable or contains no searchable chunks`
      );
    }

    await sql.begin(async (transaction) => {
      await transaction`
        insert into "user" (
          id, name, email, email_verified, created_at, updated_at
        ) values (
          ${userId},
          'one-worker-os Public API E2E',
          ${`onework-public-api-e2e-${suffix}@invalid.example`},
          true,
          now(),
          now()
        )
      `;
      userWasCreated = true;

      await transaction`
        insert into onework_entitlement (
          id, user_id, knowledge_pack_id, source, status, monthly_quota,
          starts_at, expires_at, created_at, updated_at
        ) values (
          ${entitlementId}, ${userId}, ${ALL_PACKS_GRANT}, 'e2e', 'active', 20,
          now() - interval '1 minute', now() + interval '1 hour', now(), now()
        )
      `;

      await transaction`
        insert into api_key (
          id, user_id, name, key_hash, key_prefix, status, monthly_quota,
          created_at, updated_at
        ) values (
          ${apiKeyId}, ${userId}, 'one-worker-os Public API E2E',
          ${hashKey(rawKey)}, 'dk_live_e2e…', 'active', 20, now(), now()
        )
      `;

      await transaction`
        insert into onework_device (
          id, user_id, api_key_id, device_hash, device_name, platform,
          status, created_at, updated_at
        ) values (
          ${deviceRecordId}, ${userId}, ${apiKeyId}, ${hashDeviceId(rawDeviceId)},
          'one-worker-os Public API E2E', 'test', 'active', now(), now()
        )
      `;

      // A private, test-owned exact intent makes resolver verification
      // deterministic without modifying or depending on production registry rows.
      await transaction`
        insert into onework_capability (
          id, capability_key, name, description, owner_user_id, scope,
          provider, kind, intents, input_schema, output_schema, runtime,
          risk_level, requires_confirmation, status, version, metadata,
          created_at, updated_at
        ) values (
          ${capabilityRecordId}, ${capabilityKey}, '小红书发货知识检索',
          '检索小红书店铺发货设置的受治理知识库', ${userId}, 'private',
          'onework-e2e', 'knowledge', ${sql.json([GOAL, '小红书发货设置'])},
          ${sql.json({ type: 'object' })}, ${sql.json({ type: 'object' })},
          ${sql.json({ operation: 'search', packId: PACK_ID })}, 'low', false,
          'active', '1.0.0', ${sql.json({ e2e: true })}, now(), now()
        )
      `;
    });

    const missingDeviceResolve = await expectJsonResponse({
      label: 'resolver missing device header',
      response: await fetchWithTimeout(endpoints.resolve, {
        method: 'POST',
        headers: authenticatedHeaders(rawKey),
        body: JSON.stringify({ goal: GOAL }),
      }),
      status: 403,
      code: 'DEVICE_MISMATCH',
    });
    if (missingDeviceResolve.success !== false) {
      throw new Error('resolver missing-device rejection reported success');
    }

    const missingDeviceKnowledge = await expectJsonResponse({
      label: 'knowledge missing device header',
      response: await fetchWithTimeout(endpoints.knowledge, {
        method: 'POST',
        headers: authenticatedHeaders(rawKey),
        body: JSON.stringify({ query: GOAL, packId: PACK_ID, limit: 4 }),
      }),
      status: 403,
      code: 'DEVICE_MISMATCH',
    });
    if (missingDeviceKnowledge.success !== false) {
      throw new Error('knowledge missing-device rejection reported success');
    }

    const resolved = await expectJsonResponse({
      label: 'resolver authenticated request',
      response: await fetchWithTimeout(endpoints.resolve, {
        method: 'POST',
        headers: authenticatedHeaders(rawKey, rawDeviceId),
        body: JSON.stringify({ goal: GOAL, limit: 8 }),
      }),
      status: 200,
    });
    const resolution = asRecord(resolved.resolution);
    const resolvedCapabilities = Array.isArray(resolution?.capabilities)
      ? resolution.capabilities
      : [];
    if (
      resolved.success !== true ||
      !resolution ||
      resolution.intent === 'unresolved' ||
      resolution.route === 'human_required' ||
      resolvedCapabilities.length < 1
    ) {
      throw new Error(
        `resolver returned an unresolved result: ${JSON.stringify(resolved)}`
      );
    }
    const resolverQuota = asRecord(resolved.quota);
    if (resolverQuota?.usedThisMonth !== 0) {
      throw new Error(
        `resolver unexpectedly consumed monthly quota: ${JSON.stringify(resolverQuota)}`
      );
    }

    const [usageAfterResolve] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from api_usage_event
      where user_id = ${userId}
    `;
    if (usageAfterResolve?.count !== 0) {
      throw new Error(
        'resolver or rejected device requests consumed monthly quota'
      );
    }

    const knowledge = await expectJsonResponse({
      label: 'knowledge authenticated request',
      response: await fetchWithTimeout(endpoints.knowledge, {
        method: 'POST',
        headers: authenticatedHeaders(rawKey, rawDeviceId),
        body: JSON.stringify({
          query: GOAL,
          packId: PACK_ID,
          limit: 4,
          includeAssets: true,
          includeResources: true,
        }),
      }),
      status: 200,
    });
    if (
      knowledge.success !== true ||
      !Array.isArray(knowledge.results) ||
      knowledge.results.length < 1
    ) {
      throw new Error(
        `knowledge query did not return results: ${JSON.stringify(knowledge)}`
      );
    }
    const knowledgeQuota = asRecord(knowledge.quota);
    if (knowledgeQuota?.usedThisMonth !== 1) {
      throw new Error(
        `knowledge query should consume exactly one request: ${JSON.stringify(knowledgeQuota)}`
      );
    }

    const [usageAfterKnowledge] = await sql<
      Array<{
        total_count: number;
        knowledge_ok_count: number;
        resolver_count: number;
      }>
    >`
      select
        count(*)::int as total_count,
        count(*) filter (
          where kind = 'knowledge_query' and status = 'ok'
        )::int as knowledge_ok_count,
        count(*) filter (
          where kind = 'capability_resolve'
        )::int as resolver_count
      from api_usage_event
      where user_id = ${userId}
    `;
    if (
      usageAfterKnowledge?.total_count !== 1 ||
      usageAfterKnowledge.knowledge_ok_count !== 1 ||
      usageAfterKnowledge.resolver_count !== 0
    ) {
      throw new Error(
        `unexpected billing rows: ${JSON.stringify(usageAfterKnowledge)}`
      );
    }

    console.log('✅ one-worker-os public API E2E passed', {
      resolverRoute: resolution.route,
      resolverCapabilities: resolvedCapabilities.length,
      knowledgeResults: knowledge.results.length,
      monthlyUsage: usageAfterKnowledge.total_count,
    });
  } finally {
    try {
      // These audit/usage relations use SET NULL foreign keys, so they must be
      // removed explicitly before deleting the temporary user.
      await sql.begin(async (transaction) => {
        await transaction`
          delete from semantic_query_run
          where user_id = ${userId} or capability_id = ${capabilityRecordId}
        `;
        await transaction`
          delete from api_usage_event
          where user_id = ${userId} or api_key_id = ${apiKeyId}
        `;
        await transaction`
          delete from onework_capability where id = ${capabilityRecordId}
        `;
        if (userWasCreated) {
          await transaction`delete from "user" where id = ${userId}`;
        }
      });
    } finally {
      await sql.end();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
