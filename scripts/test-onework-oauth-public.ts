/**
 * Public-network OneWorkOS OAuth security E2E.
 *
 * It exercises the deployed HTTP endpoints but uses the database only to
 * assert persistence and to restore the exact DCR rows/buckets created by this
 * run. No authorization code, access token, refresh token, or secret is logged.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import {
  oneworkOauthAccessToken,
  oneworkOauthAuthorizationCode,
  oneworkOauthClient,
  oneworkOauthConsent,
  oneworkOauthDeviceCode,
  oneworkOauthRateLimitBucket,
  oneworkOauthRefreshToken,
} from '@/db/schema';
import { hashOneWorkOAuthRateLimitSubject } from '@/lib/onework-oauth';
import { and, count, eq, inArray } from 'drizzle-orm';

type BucketRow = typeof oneworkOauthRateLimitBucket.$inferSelect;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function publicIssuer() {
  const raw =
    process.env.ONEWORK_PUBLIC_E2E_ISSUER ||
    process.env.ONEWORK_OAUTH_ISSUER ||
    'https://www.dlgzz.com';
  const url = new URL(raw);
  assert(url.protocol === 'https:', 'public OAuth E2E issuer must use HTTPS');
  assert(
    !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === '/' || url.pathname === ''),
    'public OAuth E2E issuer must be an origin'
  );
  return url.origin;
}

function assertRemoteE2EAllowed() {
  assert(
    process.env.ONEWORK_ALLOW_REMOTE_E2E === 'true',
    'Refusing public OAuth E2E without ONEWORK_ALLOW_REMOTE_E2E=true'
  );
}

async function jsonObject(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  assert(
    payload !== null && typeof payload === 'object' && !Array.isArray(payload),
    `expected JSON object from ${new URL(response.url).pathname}`
  );
  return payload as Record<string, unknown>;
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : [];
}

function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function sameDate(left: Date, right: Date) {
  return left.getTime() === right.getTime();
}

function sameBucket(left: BucketRow, right: BucketRow) {
  return (
    left.id === right.id &&
    left.subjectHash === right.subjectHash &&
    left.kind === right.kind &&
    left.requestCount === right.requestCount &&
    sameDate(left.windowStart, right.windowStart) &&
    sameDate(left.updatedAt, right.updatedAt)
  );
}

function bucketIdentity(row: BucketRow) {
  return and(
    eq(oneworkOauthRateLimitBucket.id, row.id),
    eq(oneworkOauthRateLimitBucket.subjectHash, row.subjectHash),
    eq(oneworkOauthRateLimitBucket.kind, row.kind),
    eq(oneworkOauthRateLimitBucket.windowStart, row.windowStart),
    eq(oneworkOauthRateLimitBucket.requestCount, row.requestCount),
    eq(oneworkOauthRateLimitBucket.updatedAt, row.updatedAt)
  );
}

async function dcrBuckets() {
  const db = await getDb();
  return db
    .select()
    .from(oneworkOauthRateLimitBucket)
    .where(eq(oneworkOauthRateLimitBucket.kind, 'dynamic_client_registration'));
}

async function restoreDcrBuckets(
  beforeRows: BucketRow[],
  expectedAfterRows: BucketRow[]
) {
  const db = await getDb();
  const before = new Map(beforeRows.map((row) => [row.id, row]));
  const changed = expectedAfterRows.filter((row) => {
    const previous = before.get(row.id);
    return !previous || !sameBucket(previous, row);
  });
  const globalHash = hashOneWorkOAuthRateLimitSubject(
    'dynamic_client_registration',
    'global'
  );
  assert(
    changed.filter((row) => row.subjectHash === globalHash).length === 1,
    'could not isolate the global DCR bucket created by this run'
  );
  assert(
    changed.filter((row) => row.subjectHash !== globalHash).length === 1,
    'could not isolate the network DCR bucket created by this run'
  );

  for (const expected of changed) {
    const previous = before.get(expected.id);
    if (!previous) {
      const deleted = await db
        .delete(oneworkOauthRateLimitBucket)
        .where(bucketIdentity(expected))
        .returning({ id: oneworkOauthRateLimitBucket.id });
      assert(
        deleted.length === 1,
        'DCR bucket changed concurrently; refusing destructive cleanup'
      );
      continue;
    }
    const restored = await db
      .update(oneworkOauthRateLimitBucket)
      .set({
        windowStart: previous.windowStart,
        requestCount: previous.requestCount,
        updatedAt: previous.updatedAt,
      })
      .where(bucketIdentity(expected))
      .returning({ id: oneworkOauthRateLimitBucket.id });
    assert(
      restored.length === 1,
      'DCR bucket changed concurrently; refusing to overwrite real traffic'
    );
  }
}

async function countClientRows(clientIds: string[]) {
  if (clientIds.length === 0) return 0;
  const db = await getDb();
  const tables = [
    oneworkOauthAuthorizationCode,
    oneworkOauthAccessToken,
    oneworkOauthRefreshToken,
    oneworkOauthConsent,
    oneworkOauthDeviceCode,
  ] as const;
  let total = 0;
  for (const table of tables) {
    const [row] = await db
      .select({ value: count() })
      .from(table)
      .where(inArray(table.clientId, clientIds));
    total += Number(row?.value || 0);
  }
  return total;
}

async function main() {
  assertRemoteE2EAllowed();
  const issuer = publicIssuer();
  const db = await getDb();
  const suffix = randomUUID();
  const clientName = `OneWorkOS Public OAuth E2E ${suffix}`;
  const workBuddyRedirect = `workbuddy://workbuddy/mcp/public-e2e%3A${suffix}/oauth/callback`;
  const loopbackRedirect = 'http://127.0.0.1:43123/oauth/callback';
  const beforeBuckets = await dcrBuckets();
  let expectedAfterBuckets: BucketRow[] | null = null;
  const clientIds: string[] = [];

  try {
    const authorizationMetadataResponse = await fetch(
      `${issuer}/.well-known/oauth-authorization-server`,
      { redirect: 'manual', cache: 'no-store' }
    );
    assert(
      authorizationMetadataResponse.status === 200,
      'authorization metadata must return 200'
    );
    const authorizationMetadata = await jsonObject(
      authorizationMetadataResponse
    );
    assert(authorizationMetadata.issuer === issuer, 'metadata issuer mismatch');
    assert(
      authorizationMetadata.authorization_endpoint ===
        `${issuer}/oauth/authorize` &&
        authorizationMetadata.token_endpoint === `${issuer}/oauth/token` &&
        authorizationMetadata.registration_endpoint ===
          `${issuer}/oauth/register`,
      'authorization metadata endpoints mismatch'
    );
    assert(
      stringArray(
        authorizationMetadata.code_challenge_methods_supported
      ).includes('S256'),
      'metadata must advertise PKCE S256'
    );

    for (const path of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ]) {
      const response = await fetch(`${issuer}${path}`, {
        redirect: 'manual',
        cache: 'no-store',
      });
      assert(response.status === 200, `${path} must return 200`);
      const metadata = await jsonObject(response);
      assert(
        metadata.resource === `${issuer}/mcp`,
        `${path} resource mismatch`
      );
      assert(
        stringArray(metadata.authorization_servers).includes(issuer),
        `${path} authorization server mismatch`
      );
    }

    const registrationResponse = await fetch(`${issuer}/oauth/register`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: clientName,
        redirect_uris: [workBuddyRedirect, loopbackRedirect],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        scope: 'onework:resolve onework:knowledge',
        token_endpoint_auth_method: 'none',
      }),
    });
    expectedAfterBuckets = await dcrBuckets();
    assert(registrationResponse.status === 201, 'public DCR must return 201');
    assert(
      registrationResponse.headers.get('cache-control')?.includes('no-store'),
      'DCR response must not be cached'
    );
    const registration = await jsonObject(registrationResponse);
    assert(
      typeof registration.client_id === 'string' && registration.client_id,
      'DCR response must include client_id'
    );
    const clientId = registration.client_id as string;
    clientIds.push(clientId);
    const responseGrants = stringArray(registration.grant_types);
    assert(
      responseGrants.includes('authorization_code') &&
        responseGrants.includes('refresh_token'),
      'DCR must normalize the WorkBuddy grant to include refresh_token'
    );
    const responseRedirects = stringArray(registration.redirect_uris);
    assert(
      responseRedirects.includes(workBuddyRedirect) &&
        responseRedirects.includes(loopbackRedirect),
      'DCR must preserve WorkBuddy and loopback callbacks'
    );

    const [storedClient] = await db
      .select({
        dynamicallyRegistered: oneworkOauthClient.dynamicallyRegistered,
        grantTypes: oneworkOauthClient.grantTypes,
        redirectUris: oneworkOauthClient.redirectUris,
      })
      .from(oneworkOauthClient)
      .where(eq(oneworkOauthClient.clientId, clientId))
      .limit(1);
    assert(
      storedClient?.dynamicallyRegistered &&
        storedClient.grantTypes.includes('authorization_code') &&
        storedClient.grantTypes.includes('refresh_token') &&
        storedClient.redirectUris.includes(workBuddyRedirect) &&
        storedClient.redirectUris.includes(loopbackRedirect),
      'public DCR persistence mismatch'
    );

    const verifier = randomBytes(48).toString('base64url');
    const authorizeUrl = new URL('/oauth/authorize', issuer);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', workBuddyRedirect);
    authorizeUrl.searchParams.set('scope', 'onework:resolve onework:knowledge');
    authorizeUrl.searchParams.set('state', `public-e2e-${suffix}`);
    authorizeUrl.searchParams.set('code_challenge', pkceChallenge(verifier));
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    const anonymousAuthorize = await fetch(authorizeUrl, {
      redirect: 'manual',
      cache: 'no-store',
    });
    assert(
      [302, 303, 307, 308].includes(anonymousAuthorize.status),
      'anonymous authorize must redirect to login'
    );
    const loginLocation = anonymousAuthorize.headers.get('location');
    assert(loginLocation, 'anonymous authorize redirect must include location');
    const loginUrl = new URL(loginLocation, issuer);
    assert(
      loginUrl.origin === issuer && loginUrl.pathname === '/auth/login',
      'anonymous authorize must redirect only to the local login page'
    );
    assert(
      loginUrl.searchParams.get('callbackUrl')?.startsWith('/oauth/authorize?'),
      'login redirect must preserve the authorize request as callbackUrl'
    );

    const tokenCases: Array<{
      name: string;
      init: RequestInit;
      status: number;
      error: string;
    }> = [
      {
        name: 'wrong content type',
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
        status: 415,
        error: 'invalid_request',
      },
      {
        name: 'client authentication forbidden',
        init: {
          method: 'POST',
          headers: {
            authorization: 'Basic public-client-must-not-use-a-secret',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
          }),
        },
        status: 401,
        error: 'invalid_client',
      },
      {
        name: 'unsupported grant',
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'password',
            client_id: clientId,
          }),
        },
        status: 400,
        error: 'unsupported_grant_type',
      },
      {
        name: 'missing refresh token',
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
          }),
        },
        status: 400,
        error: 'invalid_grant',
      },
    ];
    for (const testCase of tokenCases) {
      const response = await fetch(`${issuer}/oauth/token`, {
        ...testCase.init,
        redirect: 'manual',
      });
      assert(
        response.status === testCase.status,
        `${testCase.name} returned an unexpected status`
      );
      assert(
        response.headers.get('cache-control')?.includes('no-store'),
        `${testCase.name} response must not be cached`
      );
      const payload = await jsonObject(response);
      assert(
        payload.error === testCase.error,
        `${testCase.name} returned an unexpected OAuth error`
      );
      assert(
        !('access_token' in payload) &&
          !('refresh_token' in payload) &&
          !('code' in payload),
        `${testCase.name} must not return credentials`
      );
    }

    assert(
      (await countClientRows(clientIds)) === 0,
      'public security E2E must not create codes, tokens, consents, or devices'
    );
  } finally {
    const discoveredClients = await db
      .select({ id: oneworkOauthClient.clientId })
      .from(oneworkOauthClient)
      .where(
        and(
          eq(oneworkOauthClient.clientName, clientName),
          eq(oneworkOauthClient.dynamicallyRegistered, true)
        )
      );
    const cleanupClientIds = [
      ...new Set([...clientIds, ...discoveredClients.map((row) => row.id)]),
    ];
    if (cleanupClientIds.length > 0) {
      await db
        .delete(oneworkOauthClient)
        .where(inArray(oneworkOauthClient.clientId, cleanupClientIds));
    }
    const afterBuckets = expectedAfterBuckets || (await dcrBuckets());
    await restoreDcrBuckets(beforeBuckets, afterBuckets);

    const [remainingClients] = await db
      .select({ value: count() })
      .from(oneworkOauthClient)
      .where(eq(oneworkOauthClient.clientName, clientName));
    assert(
      Number(remainingClients?.value || 0) === 0,
      'public OAuth E2E client cleanup failed'
    );
    assert(
      (await countClientRows(cleanupClientIds)) === 0,
      'public OAuth E2E OAuth-row cleanup failed'
    );
  }

  console.log(
    JSON.stringify({
      success: true,
      publicMetadata: true,
      workBuddyAndLoopbackDcr: true,
      anonymousAuthorizeRedirect: true,
      tokenErrorSemantics: true,
      secretsPrinted: false,
      temporaryRowsRemaining: 0,
    })
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(
      error instanceof Error ? error.message : 'public OAuth E2E failed'
    );
    process.exit(1);
  }
);
