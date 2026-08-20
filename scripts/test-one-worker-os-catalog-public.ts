/**
 * Public OAuth -> MCP catalog boundary E2E for one-worker-os.
 *
 * This test deliberately does not call knowledge search, read source content,
 * import documents, or create embeddings. It creates an isolated user and
 * OAuth client, exchanges a PKCE authorization code through the deployed token
 * endpoint, then verifies the deployed MCP catalog and an unavailable-source
 * fail-closed response. All temporary database rows are removed in `finally`.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import {
  apiRateLimitBucket,
  apiUsageEvent,
  knowledgeDocument,
  knowledgePack,
  oneworkEntitlement,
  oneworkOauthAccessToken,
  oneworkOauthAuthorizationCode,
  oneworkOauthClient,
  oneworkOauthConsent,
  oneworkOauthDeviceCode,
  oneworkOauthRefreshToken,
  user,
} from '@/db/schema';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';
import {
  issueOneWorkAuthorizationCode,
  prepareOneWorkAuthorizationRequest,
} from '@/lib/onework-oauth';
import { and, asc, count, eq } from 'drizzle-orm';

const PROTOCOL_VERSION = '2025-06-18';
const EXPECTED_TOOLS = [
  'onework_resolve_capability',
  'onework_list_knowledge_catalog',
  'onework_search_knowledge',
  'onework_get_knowledge_source',
  'onework_query_analytics',
  'onework_get_entitlements',
  'onework_get_usage',
];
const REQUIRED_BASELINE_PACKS = [
  'onework-workbuddy-v1',
  'xhs-open-shop-v1',
  'xhs-operations-v1',
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asRecord(value: unknown, message: string) {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    message
  );
  return value as Record<string, unknown>;
}

function issuerOrigin() {
  const value =
    process.env.ONEWORK_PUBLIC_E2E_ISSUER ||
    process.env.ONEWORK_OAUTH_ISSUER ||
    'https://www.dlgzz.com';
  const url = new URL(value);
  assert(url.protocol === 'https:', 'public E2E issuer must use HTTPS');
  assert(
    !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === '/' || url.pathname === ''),
    'public E2E issuer must be an HTTPS origin'
  );
  return url.origin;
}

function assertRemoteE2EAllowed() {
  assert(
    process.env.ONEWORK_ALLOW_REMOTE_E2E === 'true',
    'Refusing public catalog E2E without ONEWORK_ALLOW_REMOTE_E2E=true'
  );
  assert(
    typeof process.env.ONEWORK_EXPECTED_BUILD_COMMIT === 'string' &&
      /^[a-f0-9]{40}$/.test(process.env.ONEWORK_EXPECTED_BUILD_COMMIT),
    'ONEWORK_EXPECTED_BUILD_COMMIT must be the deployed 40-character commit'
  );
  assert(
    ['absent', 'active'].includes(
      process.env.ONEWORK_EXPECT_INDEPENDENT_PACK_STATUS || 'absent'
    ),
    'ONEWORK_EXPECT_INDEPENDENT_PACK_STATUS must be absent or active'
  );
}

function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

async function safeJson(response: Response, stage: string) {
  const payload: unknown = await response.json().catch(() => null);
  return asRecord(payload, `${stage} must return a JSON object`);
}

async function mcpRequest(input: {
  issuer: string;
  accessToken: string;
  id: number;
  method: string;
  params?: Record<string, unknown>;
}) {
  const response = await fetch(`${input.issuer}/mcp`, {
    method: 'POST',
    redirect: 'manual',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
      'mcp-protocol-version': PROTOCOL_VERSION,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: input.id,
      method: input.method,
      ...(input.params ? { params: input.params } : {}),
    }),
  });
  assert(response.status === 200, `${input.method} must return HTTP 200`);
  const payload = await safeJson(response, input.method);
  assert(
    payload.jsonrpc === '2.0',
    `${input.method} JSON-RPC version mismatch`
  );
  assert(payload.id === input.id, `${input.method} JSON-RPC id mismatch`);
  assert(!('error' in payload), `${input.method} returned a JSON-RPC error`);
  return asRecord(payload.result, `${input.method} result must be an object`);
}

async function usageIds(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: apiUsageEvent.id })
    .from(apiUsageEvent)
    .where(eq(apiUsageEvent.userId, userId))
    .orderBy(asc(apiUsageEvent.id));
  return rows.map((row) => row.id);
}

async function countRowsForUserOrClient(input: {
  userId: string;
  clientId: string;
}) {
  const db = await getDb();
  const [userRows, entitlementRows, usageRows, rateLimitRows, clientRows] =
    await Promise.all([
      db.select({ value: count() }).from(user).where(eq(user.id, input.userId)),
      db
        .select({ value: count() })
        .from(oneworkEntitlement)
        .where(eq(oneworkEntitlement.userId, input.userId)),
      db
        .select({ value: count() })
        .from(apiUsageEvent)
        .where(eq(apiUsageEvent.userId, input.userId)),
      db
        .select({ value: count() })
        .from(apiRateLimitBucket)
        .where(eq(apiRateLimitBucket.userId, input.userId)),
      db
        .select({ value: count() })
        .from(oneworkOauthClient)
        .where(eq(oneworkOauthClient.clientId, input.clientId)),
    ]);

  const oauthTables = [
    oneworkOauthAuthorizationCode,
    oneworkOauthAccessToken,
    oneworkOauthRefreshToken,
    oneworkOauthConsent,
    oneworkOauthDeviceCode,
  ] as const;
  let oauthRows = 0;
  for (const table of oauthTables) {
    const [row] = await db
      .select({ value: count() })
      .from(table)
      .where(eq(table.clientId, input.clientId));
    oauthRows += Number(row?.value || 0);
  }

  return {
    users: Number(userRows[0]?.value || 0),
    entitlements: Number(entitlementRows[0]?.value || 0),
    usage: Number(usageRows[0]?.value || 0),
    rateLimits: Number(rateLimitRows[0]?.value || 0),
    clients: Number(clientRows[0]?.value || 0),
    oauthRows,
  };
}

async function main() {
  assertRemoteE2EAllowed();
  const issuer = issuerOrigin();
  const expectedCommit = process.env.ONEWORK_EXPECTED_BUILD_COMMIT!;
  const expectedIndependentPackStatus =
    process.env.ONEWORK_EXPECT_INDEPENDENT_PACK_STATUS || 'absent';
  const resource = `${issuer}/mcp`;
  const suffix = randomUUID();
  const userId = `catalog_public_e2e_user_${suffix}`;
  const email = `catalog-public-e2e-${suffix}@invalid.example`;
  const entitlementId = `catalog_public_e2e_entitlement_${suffix}`;
  const clientId = `catalog_public_e2e_client_${suffix}`;
  const clientName = `one-worker-os Catalog Public E2E ${suffix}`;
  const redirectUri = `http://127.0.0.1:43129/catalog-e2e/${suffix}/callback`;
  const missingDocumentId = `catalog_public_e2e_missing_${suffix}`;
  const db = await getDb();
  let observedPackCount = 0;

  try {
    const healthResponse = await fetch(`${issuer}/api/health/build`, {
      redirect: 'manual',
      cache: 'no-store',
    });
    assert(healthResponse.status === 200, 'production health must return 200');
    const health = await safeJson(healthResponse, 'production health');
    assert(
      health.commit === expectedCommit && health.branch === 'main',
      'production build does not match the expected main commit'
    );

    const metadataResponse = await fetch(
      `${issuer}/.well-known/oauth-protected-resource`,
      { redirect: 'manual', cache: 'no-store' }
    );
    assert(
      metadataResponse.status === 200,
      'resource metadata must return 200'
    );
    const metadata = await safeJson(metadataResponse, 'resource metadata');
    assert(metadata.resource === resource, 'resource metadata mismatch');

    const [existingUser, existingClient, existingDocument] = await Promise.all([
      db.select({ value: count() }).from(user).where(eq(user.id, userId)),
      db
        .select({ value: count() })
        .from(oneworkOauthClient)
        .where(eq(oneworkOauthClient.clientId, clientId)),
      db
        .select({ value: count() })
        .from(knowledgeDocument)
        .where(eq(knowledgeDocument.id, missingDocumentId)),
    ]);
    assert(
      Number(existingUser[0]?.value || 0) === 0 &&
        Number(existingClient[0]?.value || 0) === 0 &&
        Number(existingDocument[0]?.value || 0) === 0,
      'random E2E identifiers unexpectedly already exist'
    );

    const now = new Date();
    await db.insert(user).values({
      id: userId,
      name: 'one-worker-os Catalog Public E2E',
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(oneworkEntitlement).values({
      id: entitlementId,
      userId,
      knowledgePackId: ALL_PACKS_GRANT,
      source: 'e2e',
      status: 'active',
      monthlyQuota: 1000,
      startsAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(oneworkOauthClient).values({
      clientId,
      clientName,
      redirectUris: [redirectUri],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      scopes: ['onework:knowledge', 'onework:account'],
      tokenEndpointAuthMethod: 'none',
      status: 'active',
      dynamicallyRegistered: false,
      createdAt: now,
      updatedAt: now,
    });

    const verifier = randomBytes(48).toString('base64url');
    const authorizationRequest = await prepareOneWorkAuthorizationRequest(
      new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'onework:knowledge onework:account',
        state: `catalog-public-e2e-${suffix}`,
        code_challenge: pkceChallenge(verifier),
        code_challenge_method: 'S256',
        resource,
      })
    );
    const issued = await issueOneWorkAuthorizationCode({
      userId,
      request: authorizationRequest,
    });

    const tokenResponse = await fetch(`${issuer}/oauth/token`, {
      method: 'POST',
      redirect: 'manual',
      cache: 'no-store',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: issued.code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource,
      }),
    });
    assert(tokenResponse.status === 200, 'public token exchange must succeed');
    assert(
      tokenResponse.headers.get('cache-control')?.includes('no-store'),
      'public token response must not be cached'
    );
    const tokenPayload = await safeJson(tokenResponse, 'public token exchange');
    assert(
      typeof tokenPayload.access_token === 'string' &&
        tokenPayload.access_token.length > 20 &&
        typeof tokenPayload.refresh_token === 'string' &&
        tokenPayload.refresh_token.length > 20,
      'public token exchange did not return a token pair'
    );
    const accessToken = tokenPayload.access_token;

    const initialized = await mcpRequest({
      issuer,
      accessToken,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'catalog-public-e2e', version: '1.0.0' },
      },
    });
    assert(
      initialized.protocolVersion === PROTOCOL_VERSION,
      'MCP protocol negotiation mismatch'
    );

    const listed = await mcpRequest({
      issuer,
      accessToken,
      id: 2,
      method: 'tools/list',
      params: {},
    });
    assert(Array.isArray(listed.tools), 'tools/list must return tools');
    const toolNames = listed.tools
      .map((tool) => asRecord(tool, 'tool entry must be an object').name)
      .filter((name): name is string => typeof name === 'string');
    assert(
      JSON.stringify(toolNames) === JSON.stringify(EXPECTED_TOOLS),
      'public MCP tool set mismatch'
    );

    const catalogTool = await mcpRequest({
      issuer,
      accessToken,
      id: 3,
      method: 'tools/call',
      params: {
        name: 'onework_list_knowledge_catalog',
        arguments: {},
      },
    });
    const catalog = asRecord(
      catalogTool.structuredContent,
      'catalog structuredContent must be an object'
    );
    assert(catalog.success === true, 'catalog tool must succeed');
    assert(Array.isArray(catalog.packs), 'catalog packs must be an array');
    const packIds = catalog.packs
      .map((pack) => asRecord(pack, 'catalog pack must be an object').id)
      .filter((id): id is string => typeof id === 'string')
      .sort();
    observedPackCount = packIds.length;
    assert(
      REQUIRED_BASELINE_PACKS.every((packId) => packIds.includes(packId)),
      'catalog is missing a required baseline pack'
    );
    const activeIndependentRows = await db
      .select({ id: knowledgePack.id, metadata: knowledgePack.metadata })
      .from(knowledgePack)
      .where(eq(knowledgePack.status, 'active'));
    const activeIndependentReleases = activeIndependentRows
      .map((pack) => {
        const metadata = asRecord(pack.metadata || {}, 'pack metadata invalid');
        const match = /^independent-worker-core-v(\d+)$/.exec(pack.id);
        const version = match ? Number(match[1]) : Number.NaN;
        return {
          id: pack.id,
          version,
          valid:
            metadata.seriesId === 'independent-worker-core' &&
            metadata.versionPolicy === 'immutable' &&
            metadata.version === version &&
            Number.isSafeInteger(version) &&
            version > 0,
        };
      })
      .filter((pack) => pack.valid)
      .sort((left, right) => right.version - left.version);
    const expectedCurrentIndependentId =
      activeIndependentReleases[0]?.id || null;
    const visibleIndependentIds = packIds.filter((packId) =>
      /^independent-worker-core-v\d+$/.test(packId)
    );
    assert(
      (expectedIndependentPackStatus === 'active' &&
        expectedCurrentIndependentId !== null &&
        JSON.stringify(visibleIndependentIds) ===
          JSON.stringify([expectedCurrentIndependentId])) ||
        (expectedIndependentPackStatus === 'absent' &&
          expectedCurrentIndependentId === null &&
          visibleIndependentIds.length === 0),
      'independent-worker pack visibility does not match the expected state'
    );
    assert(Array.isArray(catalog.collections), 'catalog collections invalid');
    const independentCollection = catalog.collections
      .map((collection) =>
        asRecord(collection, 'catalog collection must be an object')
      )
      .find((collection) => collection.id === 'independent-worker');
    if (expectedIndependentPackStatus === 'active') {
      assert(
        independentCollection && Array.isArray(independentCollection.packs),
        'active independent-worker pack must belong to its collection'
      );
      const collectionPackIds = independentCollection.packs
        .map((pack) => asRecord(pack, 'collection pack must be an object').id)
        .filter((id): id is string => typeof id === 'string');
      assert(
        expectedCurrentIndependentId !== null &&
          JSON.stringify(
            collectionPackIds.filter((packId) =>
              /^independent-worker-core-v\d+$/.test(packId)
            )
          ) === JSON.stringify([expectedCurrentIndependentId]),
        'independent-worker collection is missing its current active release'
      );
    } else {
      assert(
        !independentCollection,
        'an unpublished independent-worker collection must not expose packs'
      );
    }

    const usageBefore = await usageIds(userId);
    const unavailableTool = await mcpRequest({
      issuer,
      accessToken,
      id: 4,
      method: 'tools/call',
      params: {
        name: 'onework_get_knowledge_source',
        arguments: { documentId: missingDocumentId },
      },
    });
    assert(unavailableTool.isError === true, 'missing source must be an error');
    const unavailable = asRecord(
      unavailableTool.structuredContent,
      'missing source structuredContent must be an object'
    );
    assert(
      unavailable.success === false &&
        unavailable.code === 'KNOWLEDGE_SOURCE_UNAVAILABLE',
      'missing source must fail closed with the expected code'
    );
    const usageAfter = await usageIds(userId);
    assert(
      JSON.stringify(usageAfter) === JSON.stringify(usageBefore) &&
        usageAfter.length === 0,
      'catalog/source boundary E2E must not create usage events'
    );
  } finally {
    const cleanupFailures: string[] = [];
    const cleanup = async (
      label: string,
      operation: () => Promise<unknown>
    ) => {
      try {
        await operation();
      } catch {
        cleanupFailures.push(label);
      }
    };
    await cleanup('usage', () =>
      db.delete(apiUsageEvent).where(eq(apiUsageEvent.userId, userId))
    );
    await cleanup('rate-limit', () =>
      db.delete(apiRateLimitBucket).where(eq(apiRateLimitBucket.userId, userId))
    );
    await cleanup('user', () =>
      db.delete(user).where(and(eq(user.id, userId), eq(user.email, email)))
    );
    await cleanup('client', () =>
      db
        .delete(oneworkOauthClient)
        .where(
          and(
            eq(oneworkOauthClient.clientId, clientId),
            eq(oneworkOauthClient.clientName, clientName),
            eq(oneworkOauthClient.dynamicallyRegistered, false)
          )
        )
    );
    await cleanup('verification', async () => {
      const remaining = await countRowsForUserOrClient({ userId, clientId });
      assert(
        Object.values(remaining).every((value) => value === 0),
        'temporary rows remain'
      );
    });
    assert(
      cleanupFailures.length === 0,
      `public catalog E2E cleanup failed: ${cleanupFailures.join(', ')}`
    );
  }

  console.log(
    JSON.stringify({
      success: true,
      productionBuildMatched: true,
      oauthTokenExchange: true,
      publicMcpInitialize: true,
      tools: EXPECTED_TOOLS.length,
      activePacks: observedPackCount,
      independentWorkerContentPublished:
        expectedIndependentPackStatus === 'active',
      sourceUnavailableNotBilled: true,
      temporaryRowsRemaining: 0,
      secretsPrinted: false,
    })
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(
      error instanceof Error ? error.message : 'public catalog E2E failed'
    );
    process.exit(1);
  }
);
