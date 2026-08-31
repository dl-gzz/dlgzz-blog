/**
 * one-worker-os OAuth integration test.
 *
 * The script creates an isolated user/client/token family and removes every
 * row in finally. Remote databases require ONEWORK_ALLOW_REMOTE_E2E=true.
 *
 * Run:
 *   node --require ./tests/register-server-only.cjs --import tsx scripts/test-onework-oauth.ts
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import {
  oneworkEntitlement,
  oneworkOauthAccessToken,
  oneworkOauthActiveSession,
  oneworkOauthClient,
  oneworkOauthRateLimitBucket,
  oneworkOauthRefreshToken,
  user,
} from '@/db/schema';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';
import {
  ONEWORK_TRUSTED_DEVICE_CLIENT_ID,
  OneWorkOAuthError,
  createS256CodeChallenge,
  decideOneWorkDeviceAuthorization,
  exchangeOneWorkAuthorizationCode,
  hashOneWorkOAuthRateLimitSubject,
  isOneWorkOAuthRedirectUriAllowed,
  issueOneWorkAuthorizationCode,
  issueOneWorkDeviceCode,
  listOneWorkOAuthConnections,
  oneWorkerOsOAuthClientIdentity,
  pollOneWorkDeviceToken,
  prepareOneWorkAuthorizationRequest,
  registerOneWorkOAuthClient,
  revokeOneWorkOAuthConnection,
  revokeOneWorkOAuthToken,
  rotateOneWorkRefreshToken,
  verifyOneWorkOAuthAccessToken,
} from '@/lib/onework-oauth';
import { eq, inArray } from 'drizzle-orm';

const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectOAuthError(
  operation: () => Promise<unknown>,
  code: string
) {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof OneWorkOAuthError, 'expected OneWorkOAuthError');
    assert(error.code === code, `expected ${code}, received ${error.code}`);
    return;
  }
  throw new Error(`expected OAuth error ${code}`);
}

async function expectAccessFailure(
  accessToken: string,
  expectedReason: 'revoked' | 'replaced' | 'entitlement_expired'
) {
  const result = await verifyOneWorkOAuthAccessToken(`Bearer ${accessToken}`);
  assert(!result.ok, `access token should fail with ${expectedReason}`);
  assert(
    result.reason === expectedReason,
    `expected access failure ${expectedReason}, received ${result.reason}`
  );
}

function assertRemoteE2EAllowed() {
  const databaseUrl = process.env.DATABASE_URL || '';
  const remote =
    databaseUrl.includes('supabase.com') ||
    databaseUrl.includes('neon.tech') ||
    databaseUrl.includes('pooler.');
  if (remote && process.env.ONEWORK_ALLOW_REMOTE_E2E !== 'true') {
    throw new Error(
      'Refusing remote OAuth E2E without ONEWORK_ALLOW_REMOTE_E2E=true'
    );
  }
}

async function main() {
  assertRemoteE2EAllowed();
  assert(
    isOneWorkOAuthRedirectUriAllowed('https://client.example/callback'),
    'HTTPS redirect should be accepted'
  );
  assert(
    isOneWorkOAuthRedirectUriAllowed('http://127.0.0.1:3210/callback'),
    'loopback HTTP redirect should be accepted'
  );
  assert(
    !isOneWorkOAuthRedirectUriAllowed('http://client.example/callback'),
    'non-loopback HTTP redirect must be rejected'
  );
  assert(
    !isOneWorkOAuthRedirectUriAllowed(
      'https://client.example/callback#fragment'
    ),
    'redirect fragment must be rejected'
  );
  const realWorkBuddyRedirect =
    'workbuddy://workbuddy/mcp/custom-mcp%3Aone-worker-os/oauth/callback';
  assert(
    isOneWorkOAuthRedirectUriAllowed(realWorkBuddyRedirect),
    'the exact WorkBuddy 5.3.13 native callback shape should be accepted'
  );
  assert(
    oneWorkerOsOAuthClientIdentity('Generic WorkBuddy', [
      realWorkBuddyRedirect,
    ]) === 'current',
    'the exact one-worker-os redirect must identify the current client'
  );
  assert(
    oneWorkerOsOAuthClientIdentity('one-worker-os MCP Client', [
      'workbuddy://workbuddy/mcp/custom-mcp%3Aone-work-os/oauth/callback',
    ]) === 'legacy',
    'a legacy redirect must override a self-asserted current client name'
  );
  assert(
    oneWorkerOsOAuthClientIdentity('one-worker-os MCP Client', [
      'http://127.0.0.1:3210/mcp/oauth/callback',
    ]) === 'other',
    'a self-asserted client name must not identify an unrelated redirect'
  );
  for (const maliciousRedirect of [
    'workbuddy://evil.example/mcp/config-1/oauth/callback',
    'workbuddy://workbuddy/mcp/config-1/extra/oauth/callback',
    'other-app://workbuddy/mcp/config-1/oauth/callback',
    'workbuddy://user@workbuddy/mcp/config-1/oauth/callback',
    'workbuddy://@workbuddy/mcp/config-1/oauth/callback',
    'workbuddy://workbuddy/mcp/config-1/oauth/callback?next=https://evil.example',
    'workbuddy://workbuddy/mcp/config-1/oauth/callback?',
    'workbuddy://workbuddy/mcp/config-1/oauth/callback#fragment',
    'workbuddy://workbuddy/mcp/config-1/oauth/callback#',
    'workbuddy://workbuddy/mcp/%2e%2e/oauth/callback',
    'workbuddy://workbuddy/mcp/%252e%252e%252fadmin/oauth/callback',
    'workbuddy://workbuddy/mcp/config%2f..%2fadmin/oauth/callback',
  ]) {
    assert(
      !isOneWorkOAuthRedirectUriAllowed(maliciousRedirect),
      `malicious WorkBuddy redirect must be rejected: ${maliciousRedirect}`
    );
  }

  const suffix = `${Date.now()}-${randomUUID()}`;
  const userId = `oauth_e2e_user_${suffix}`;
  const entitlementId = `oauth_e2e_entitlement_${suffix}`;
  const encodedConfigId = encodeURIComponent('custom-mcp:one-worker-os');
  const redirectUri = `workbuddy://workbuddy/mcp/${encodedConfigId}/oauth/callback`;
  const secondaryRedirectUri = `https://client-b.invalid/${encodeURIComponent(suffix)}/callback`;
  const deviceRedirectUri = `http://127.0.0.1/${suffix}/callback`;
  const trustedDeviceClientId = `onework-e2e-device-${suffix}`;
  const clientIds: string[] = [];
  const db = await getDb();

  try {
    const now = new Date();
    await db.insert(user).values({
      id: userId,
      name: 'one-worker-os OAuth E2E',
      email: `onework-oauth-${suffix}@invalid.example`,
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
      clientId: trustedDeviceClientId,
      clientName: 'one-worker-os OAuth E2E Trusted Device Client',
      redirectUris: [],
      grantTypes: [DEVICE_GRANT_TYPE, 'refresh_token'],
      responseTypes: [],
      scopes: ['onework:resolve', 'onework:account'],
      tokenEndpointAuthMethod: 'none',
      status: 'active',
      dynamicallyRegistered: false,
      createdAt: now,
      updatedAt: now,
    });
    clientIds.push(trustedDeviceClientId);

    const registered = await registerOneWorkOAuthClient({
      clientName: 'OAuth E2E Client',
      redirectUris: [redirectUri, deviceRedirectUri],
      // WorkBuddy 5.3.13 的真实 DCR 形状：只声明 authorization_code。
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scope: 'onework:resolve onework:knowledge',
      tokenEndpointAuthMethod: 'none',
    });
    assert(
      registered.grant_types.length === 2 &&
        registered.grant_types.includes('authorization_code') &&
        registered.grant_types.includes('refresh_token'),
      'DCR response must normalize authorization_code to include refresh_token'
    );
    clientIds.push(registered.client_id);
    const [dynamicRegistration] = await db
      .select({
        dynamicallyRegistered: oneworkOauthClient.dynamicallyRegistered,
        grantTypes: oneworkOauthClient.grantTypes,
      })
      .from(oneworkOauthClient)
      .where(eq(oneworkOauthClient.clientId, registered.client_id))
      .limit(1);
    assert(
      dynamicRegistration?.dynamicallyRegistered === true,
      'DCR clients must be marked unverified/dynamically registered'
    );
    assert(
      dynamicRegistration.grantTypes.includes('authorization_code') &&
        dynamicRegistration.grantTypes.includes('refresh_token'),
      'stored DCR grants must include refresh_token for actual rotation'
    );

    const secondaryRegistered = await registerOneWorkOAuthClient({
      clientName: 'OAuth E2E Secondary Client',
      redirectUris: [secondaryRedirectUri],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scope: 'onework:resolve onework:knowledge',
      tokenEndpointAuthMethod: 'none',
    });
    clientIds.push(secondaryRegistered.client_id);
    assert(
      secondaryRegistered.client_id !== registered.client_id,
      'different DCR redirect metadata must create a distinct client'
    );

    async function activeSessions() {
      return db
        .select({
          clientId: oneworkOauthActiveSession.clientId,
          familyId: oneworkOauthActiveSession.familyId,
          resource: oneworkOauthActiveSession.resource,
        })
        .from(oneworkOauthActiveSession)
        .where(eq(oneworkOauthActiveSession.userId, userId));
    }

    async function issueAuthorization(
      label: string,
      clientId = registered.client_id,
      callbackUri = redirectUri
    ) {
      const verifier = randomBytes(48).toString('base64url');
      const request = await prepareOneWorkAuthorizationRequest(
        new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: callbackUri,
          scope: 'onework:resolve onework:knowledge',
          state: `${label}-${suffix}`,
          code_challenge: createS256CodeChallenge(verifier),
          code_challenge_method: 'S256',
        })
      );
      const issued = await issueOneWorkAuthorizationCode({ userId, request });
      return { verifier, issued, clientId, callbackUri };
    }

    async function exchangeAuthorization(
      authorization: Awaited<ReturnType<typeof issueAuthorization>>
    ) {
      return exchangeOneWorkAuthorizationCode({
        clientId: authorization.clientId,
        code: authorization.issued.code,
        redirectUri: authorization.callbackUri,
        codeVerifier: authorization.verifier,
      });
    }

    const verifier = randomBytes(48).toString('base64url');
    await expectOAuthError(
      () =>
        prepareOneWorkAuthorizationRequest(
          new URLSearchParams({
            response_type: 'code',
            client_id: registered.client_id,
            redirect_uri: redirectUri,
            code_challenge: createS256CodeChallenge(verifier),
            code_challenge_method: 'S256',
            resource: 'https://attacker.invalid/mcp',
          })
        ),
      'invalid_target'
    );

    // A failed exchange is not a successful authorization and must not replace
    // the connection that is already active.
    const firstAuthorization = await issueAuthorization('first');
    const firstPair = await exchangeAuthorization(firstAuthorization);
    const firstVerified = await verifyOneWorkOAuthAccessToken(
      `Bearer ${firstPair.access_token}`
    );
    assert(firstVerified.ok, 'authorization-code access token should verify');
    assert(
      firstVerified.principal.scopes.has('onework:knowledge'),
      'knowledge scope should be present'
    );
    const [firstSession] = await activeSessions();
    assert(firstSession, 'successful exchange must create an active session');

    const replacementAuthorization = await issueAuthorization('replacement');
    assert(
      (await activeSessions())[0]?.familyId === firstSession.familyId,
      'issuing an authorization code alone must not replace the active session'
    );
    await expectOAuthError(
      () =>
        exchangeOneWorkAuthorizationCode({
          clientId: registered.client_id,
          code: replacementAuthorization.issued.code,
          redirectUri,
          codeVerifier: randomBytes(48).toString('base64url'),
        }),
      'invalid_grant'
    );
    assert(
      (await verifyOneWorkOAuthAccessToken(`Bearer ${firstPair.access_token}`))
        .ok,
      'PKCE failure must leave the previous access token active'
    );
    assert(
      (await activeSessions())[0]?.familyId === firstSession.familyId,
      'PKCE failure must leave the previous session active'
    );

    const replacementPair = await exchangeAuthorization(
      replacementAuthorization
    );
    const [replacementSession] = await activeSessions();
    assert(
      replacementSession &&
        replacementSession.familyId !== firstSession.familyId,
      'a successful new authorization must atomically replace the old family'
    );
    assert(
      (
        await verifyOneWorkOAuthAccessToken(
          `Bearer ${replacementPair.access_token}`
        )
      ).ok,
      'the newly authorized access token must verify'
    );
    await expectAccessFailure(firstPair.access_token, 'replaced');
    await expectOAuthError(
      () =>
        rotateOneWorkRefreshToken({
          clientId: registered.client_id,
          refreshToken: firstPair.refresh_token,
        }),
      'invalid_grant'
    );
    await expectOAuthError(
      () =>
        exchangeOneWorkAuthorizationCode({
          clientId: registered.client_id,
          code: replacementAuthorization.issued.code,
          redirectUri,
          codeVerifier: replacementAuthorization.verifier,
        }),
      'invalid_grant'
    );

    // Refresh rotation stays inside the current family. It must not kick its
    // own access tokens or create a second active session.
    const rotated = await rotateOneWorkRefreshToken({
      clientId: registered.client_id,
      refreshToken: replacementPair.refresh_token,
      scope: 'onework:knowledge',
    });
    assert(
      (await verifyOneWorkOAuthAccessToken(`Bearer ${rotated.access_token}`))
        .ok,
      'rotated access token should verify'
    );
    assert(
      (
        await verifyOneWorkOAuthAccessToken(
          `Bearer ${replacementPair.access_token}`
        )
      ).ok,
      'refresh rotation must not replace access tokens in its own family'
    );
    const sessionsAfterRotation = await activeSessions();
    assert(
      sessionsAfterRotation.length === 1 &&
        sessionsAfterRotation[0].familyId === replacementSession.familyId,
      'refresh rotation must preserve exactly one active family'
    );

    // A denied device flow must also leave the current connection untouched.
    const deniedDevice = await issueOneWorkDeviceCode({
      clientId: trustedDeviceClientId,
      scope: 'onework:account',
    });
    await decideOneWorkDeviceAuthorization({
      userId,
      userCode: deniedDevice.user_code,
      decision: 'deny',
    });
    await expectOAuthError(
      () =>
        pollOneWorkDeviceToken({
          clientId: trustedDeviceClientId,
          deviceCode: deniedDevice.device_code,
        }),
      'access_denied'
    );
    assert(
      (await verifyOneWorkOAuthAccessToken(`Bearer ${rotated.access_token}`))
        .ok,
      'denied device authorization must not kick the current session'
    );
    assert(
      (await activeSessions())[0]?.familyId === replacementSession.familyId,
      'denied device authorization must not change the active family'
    );

    // Two computers may finish their code exchange at almost the same time.
    // Both requests may return a token pair, but only the transaction that
    // commits last is allowed to remain active.
    const concurrentA = await issueAuthorization('concurrent-a');
    const concurrentB = await issueAuthorization('concurrent-b');
    const concurrentResults = await Promise.allSettled([
      exchangeAuthorization(concurrentA),
      exchangeAuthorization(concurrentB),
    ]);
    assert(
      concurrentResults.some((result) => result.status === 'fulfilled'),
      'at least one concurrent exchange must succeed'
    );
    for (const result of concurrentResults) {
      if (result.status === 'rejected') {
        assert(
          result.reason instanceof OneWorkOAuthError &&
            result.reason.code === 'invalid_grant',
          'a superseded concurrent authorization code may only fail as invalid_grant'
        );
      }
    }
    const concurrentPairs = concurrentResults.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : []
    );
    const concurrentVerification = await Promise.all(
      concurrentPairs.map(async (pair) => ({
        pair,
        verification: await verifyOneWorkOAuthAccessToken(
          `Bearer ${pair.access_token}`
        ),
      }))
    );
    const activeConcurrentPairs = concurrentVerification.filter(
      ({ verification }) => verification.ok
    );
    assert(
      activeConcurrentPairs.length === 1,
      'concurrent authorization must leave exactly one usable access family'
    );
    for (const { pair, verification } of concurrentVerification) {
      if (!verification.ok) {
        assert(
          verification.reason === 'replaced',
          `concurrent loser must be replaced, received ${verification.reason}`
        );
        await expectOAuthError(
          () =>
            rotateOneWorkRefreshToken({
              clientId: registered.client_id,
              refreshToken: pair.refresh_token,
            }),
          'invalid_grant'
        );
      }
    }
    await expectAccessFailure(rotated.access_token, 'replaced');
    const concurrentSessions = await activeSessions();
    assert(
      concurrentSessions.length === 1 &&
        concurrentSessions[0].clientId === registered.client_id,
      'concurrent exchange must persist one active-session row'
    );

    const concurrentWinner = activeConcurrentPairs[0].pair;
    assert(
      await revokeOneWorkOAuthConnection({
        userId,
        clientId: registered.client_id,
      }),
      'the current WorkBuddy connection should be revocable'
    );
    assert(
      (await activeSessions()).length === 0,
      'connection revoke must clear the active-session row'
    );
    await expectAccessFailure(concurrentWinner.access_token, 'revoked');
    assert(
      !(await listOneWorkOAuthConnections(userId)).some(
        (connection) => connection.clientId === registered.client_id
      ),
      'revoked WorkBuddy client must disappear from active connections'
    );

    // The single-active invariant is account/resource scoped, not client
    // scoped. Two distinct dynamically registered clients must therefore
    // serialize against the same slot.
    const crossClientAuthorizations = [
      await issueAuthorization(
        'cross-client-a',
        registered.client_id,
        redirectUri
      ),
      await issueAuthorization(
        'cross-client-b',
        secondaryRegistered.client_id,
        secondaryRedirectUri
      ),
    ];
    const crossClientResults = await Promise.allSettled(
      crossClientAuthorizations.map(exchangeAuthorization)
    );
    assert(
      crossClientResults.some((result) => result.status === 'fulfilled'),
      'at least one cross-client exchange must succeed'
    );
    for (const result of crossClientResults) {
      if (result.status === 'rejected') {
        assert(
          result.reason instanceof OneWorkOAuthError &&
            result.reason.code === 'invalid_grant',
          'a cross-client exchange may only lose as invalid_grant'
        );
      }
    }
    const crossClientPairs = crossClientResults.flatMap((result, index) =>
      result.status === 'fulfilled'
        ? [
            {
              pair: result.value,
              clientId: crossClientAuthorizations[index].clientId,
            },
          ]
        : []
    );
    const crossClientVerification = await Promise.all(
      crossClientPairs.map(async (entry) => ({
        ...entry,
        verification: await verifyOneWorkOAuthAccessToken(
          `Bearer ${entry.pair.access_token}`
        ),
      }))
    );
    const activeCrossClientPairs = crossClientVerification.filter(
      ({ verification }) => verification.ok
    );
    assert(
      activeCrossClientPairs.length === 1,
      'two DCR clients racing must leave exactly one usable token family'
    );
    for (const { verification } of crossClientVerification) {
      if (!verification.ok) {
        assert(
          verification.reason === 'replaced',
          `cross-client loser must be replaced, received ${verification.reason}`
        );
      }
    }
    const crossClientWinner = activeCrossClientPairs[0];
    const [crossClientSession] = await activeSessions();
    assert(
      crossClientSession &&
        crossClientSession.clientId === crossClientWinner.clientId &&
        (await activeSessions()).length === 1,
      'cross-client race must persist one matching active-session row'
    );

    // Establish the other DCR client as current, then revoke the stale access
    // token. Revoking an already replaced family must never delete the new
    // active-session pointer.
    const nextClientId =
      crossClientWinner.clientId === registered.client_id
        ? secondaryRegistered.client_id
        : registered.client_id;
    const nextCallbackUri =
      nextClientId === registered.client_id
        ? redirectUri
        : secondaryRedirectUri;
    const nextAuthorization = await issueAuthorization(
      'cross-client-replacement',
      nextClientId,
      nextCallbackUri
    );
    const nextPair = await exchangeAuthorization(nextAuthorization);
    await expectAccessFailure(crossClientWinner.pair.access_token, 'replaced');
    const [nextSession] = await activeSessions();
    await revokeOneWorkOAuthToken({
      clientId: crossClientWinner.clientId,
      token: crossClientWinner.pair.access_token,
    });
    const sessionsAfterStaleAccessRevoke = await activeSessions();
    assert(
      sessionsAfterStaleAccessRevoke.length === 1 &&
        sessionsAfterStaleAccessRevoke[0].familyId === nextSession.familyId,
      'revoking a replaced access token must not clear the new active session'
    );
    assert(
      (await verifyOneWorkOAuthAccessToken(`Bearer ${nextPair.access_token}`))
        .ok,
      'the new active token must survive stale access-token revocation'
    );

    // If the old connection refreshes while another client completes a new
    // authorization, the active-session lock must prevent both families from
    // remaining usable.
    const refreshRaceClientId = crossClientWinner.clientId;
    const refreshRaceCallbackUri =
      refreshRaceClientId === registered.client_id
        ? redirectUri
        : secondaryRedirectUri;
    const refreshRaceAuthorization = await issueAuthorization(
      'refresh-vs-new-auth',
      refreshRaceClientId,
      refreshRaceCallbackUri
    );
    const [staleRefreshRace, newAuthorizationRace] = await Promise.allSettled([
      rotateOneWorkRefreshToken({
        clientId: nextClientId,
        refreshToken: nextPair.refresh_token,
      }),
      exchangeAuthorization(refreshRaceAuthorization),
    ]);
    assert(
      newAuthorizationRace.status === 'fulfilled',
      'the new cross-client authorization must complete successfully'
    );
    if (staleRefreshRace.status === 'fulfilled') {
      await expectAccessFailure(
        staleRefreshRace.value.access_token,
        'replaced'
      );
    } else {
      assert(
        staleRefreshRace.reason instanceof OneWorkOAuthError &&
          staleRefreshRace.reason.code === 'invalid_grant',
        'refresh losing to new authorization must fail with invalid_grant'
      );
    }
    assert(
      (
        await verifyOneWorkOAuthAccessToken(
          `Bearer ${newAuthorizationRace.value.access_token}`
        )
      ).ok,
      'new authorization must be the sole usable family after refresh race'
    );
    const [refreshRaceSession] = await activeSessions();
    assert(
      refreshRaceSession &&
        refreshRaceSession.clientId === refreshRaceClientId &&
        (await activeSessions()).length === 1,
      'refresh/new-authorization race must leave one matching active row'
    );

    await revokeOneWorkOAuthToken({
      clientId: nextClientId,
      token: nextPair.refresh_token,
    });
    const sessionsAfterStaleRefreshRevoke = await activeSessions();
    assert(
      sessionsAfterStaleRefreshRevoke.length === 1 &&
        sessionsAfterStaleRefreshRevoke[0].familyId ===
          refreshRaceSession.familyId,
      'revoking a replaced refresh token must not clear the new active session'
    );
    assert(
      (
        await verifyOneWorkOAuthAccessToken(
          `Bearer ${newAuthorizationRace.value.access_token}`
        )
      ).ok,
      'new active token must survive stale refresh-token revocation'
    );
    assert(
      await revokeOneWorkOAuthConnection({
        userId,
        clientId: refreshRaceClientId,
      }),
      'cross-client race winner should be revocable'
    );
    assert(
      (await activeSessions()).length === 0,
      'cross-client winner revoke must clear the active-session row'
    );

    await expectOAuthError(
      () =>
        registerOneWorkOAuthClient({
          clientName: 'Untrusted Device E2E Client',
          redirectUris: [deviceRedirectUri],
          grantTypes: [
            'authorization_code',
            'refresh_token',
            DEVICE_GRANT_TYPE,
          ],
          responseTypes: ['code'],
          scope: 'onework:resolve onework:account',
          tokenEndpointAuthMethod: 'none',
        }),
      'invalid_client_metadata'
    );
    const [trustedDeviceClient] = await db
      .select({
        dynamicallyRegistered: oneworkOauthClient.dynamicallyRegistered,
        grantTypes: oneworkOauthClient.grantTypes,
        status: oneworkOauthClient.status,
      })
      .from(oneworkOauthClient)
      .where(eq(oneworkOauthClient.clientId, ONEWORK_TRUSTED_DEVICE_CLIENT_ID))
      .limit(1);
    assert(
      trustedDeviceClient?.status === 'active' &&
        trustedDeviceClient.dynamicallyRegistered === false &&
        trustedDeviceClient.grantTypes.includes(DEVICE_GRANT_TYPE),
      '0021 must pre-register the trusted device client'
    );

    // Approving the browser page is still not enough to replace the old
    // computer. Replacement happens only when the device successfully polls
    // and receives its token pair.
    const beforeDeviceAuthorization = await issueAuthorization('before-device');
    const beforeDevicePair = await exchangeAuthorization(
      beforeDeviceAuthorization
    );
    const [beforeDeviceSession] = await activeSessions();
    const approvedDevice = await issueOneWorkDeviceCode({
      clientId: trustedDeviceClientId,
      scope: 'onework:account',
    });
    await decideOneWorkDeviceAuthorization({
      userId,
      userCode: approvedDevice.user_code,
      decision: 'approve',
    });
    assert(
      (
        await verifyOneWorkOAuthAccessToken(
          `Bearer ${beforeDevicePair.access_token}`
        )
      ).ok,
      'device approval must not replace the old session before token issuance'
    );
    assert(
      (await activeSessions())[0]?.familyId === beforeDeviceSession.familyId,
      'approved but unpolled device code must not change the active family'
    );
    const devicePair = await pollOneWorkDeviceToken({
      clientId: trustedDeviceClientId,
      deviceCode: approvedDevice.device_code,
    });
    assert(
      (await verifyOneWorkOAuthAccessToken(`Bearer ${devicePair.access_token}`))
        .ok,
      'device access token should verify'
    );
    await expectAccessFailure(beforeDevicePair.access_token, 'replaced');
    await expectOAuthError(
      () =>
        rotateOneWorkRefreshToken({
          clientId: registered.client_id,
          refreshToken: beforeDevicePair.refresh_token,
        }),
      'invalid_grant'
    );
    const deviceSessions = await activeSessions();
    assert(
      deviceSessions.length === 1 &&
        deviceSessions[0].clientId === trustedDeviceClientId &&
        deviceSessions[0].familyId !== beforeDeviceSession.familyId,
      'device-code token issuance must replace the prior active family'
    );
    const connections = await listOneWorkOAuthConnections(userId);
    assert(
      connections.length === 1 &&
        connections[0].clientId === trustedDeviceClientId,
      'the connection list must expose only the active device client'
    );

    await db
      .update(oneworkEntitlement)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(eq(oneworkEntitlement.id, entitlementId));
    await expectAccessFailure(devicePair.access_token, 'entitlement_expired');
    await db
      .update(oneworkEntitlement)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(oneworkEntitlement.id, entitlementId));

    await revokeOneWorkOAuthToken({
      clientId: trustedDeviceClientId,
      token: devicePair.refresh_token,
    });
    await expectAccessFailure(devicePair.access_token, 'revoked');
    assert(
      (await activeSessions()).length === 0,
      'refresh-token revoke must clear the active-session row'
    );
    await expectOAuthError(
      () =>
        rotateOneWorkRefreshToken({
          clientId: trustedDeviceClientId,
          refreshToken: devicePair.refresh_token,
        }),
      'invalid_grant'
    );
    assert(
      await revokeOneWorkOAuthConnection({
        userId,
        clientId: trustedDeviceClientId,
      }),
      'account connection consent should remain explicitly revocable'
    );

    // Revoking the current access token terminates the whole grant, not just
    // that short-lived token. Its refresh token must stop working and the
    // account/resource slot must become empty.
    const accessRevokeAuthorization = await issueAuthorization('access-revoke');
    const accessRevokePair = await exchangeAuthorization(
      accessRevokeAuthorization
    );
    await revokeOneWorkOAuthToken({
      clientId: registered.client_id,
      token: accessRevokePair.access_token,
    });
    await expectAccessFailure(accessRevokePair.access_token, 'revoked');
    await expectOAuthError(
      () =>
        rotateOneWorkRefreshToken({
          clientId: registered.client_id,
          refreshToken: accessRevokePair.refresh_token,
        }),
      'invalid_grant'
    );
    assert(
      (await activeSessions()).length === 0,
      'access-token revoke must clear the active-session row'
    );

    // A retry of a just-consumed refresh token is treated as a benign
    // concurrent refresh. Both responses remain usable and the active family
    // stays connected.
    const replayAuthorization = await issueAuthorization('replay');
    const replayPair = await exchangeAuthorization(replayAuthorization);
    const replayChild = await rotateOneWorkRefreshToken({
      clientId: registered.client_id,
      refreshToken: replayPair.refresh_token,
    });
    const replayRetry = await rotateOneWorkRefreshToken({
      clientId: registered.client_id,
      refreshToken: replayPair.refresh_token,
    });
    assert(
      (
        await verifyOneWorkOAuthAccessToken(
          `Bearer ${replayChild.access_token}`
        )
      ).ok &&
        (
          await verifyOneWorkOAuthAccessToken(
            `Bearer ${replayRetry.access_token}`
          )
        ).ok,
      'a refresh retry inside the grace window must keep both responses usable'
    );
    assert(
      (await activeSessions()).length === 1,
      'a concurrent refresh retry must preserve the active-session row'
    );

    // Replays outside the grace window retain the security response and
    // revoke the complete family. Set the window to zero so the test remains
    // deterministic without sleeping.
    const previousReplayGrace =
      process.env.ONEWORK_OAUTH_REFRESH_REPLAY_GRACE_SECONDS;
    process.env.ONEWORK_OAUTH_REFRESH_REPLAY_GRACE_SECONDS = '0';
    try {
      await expectOAuthError(
        () =>
          rotateOneWorkRefreshToken({
            clientId: registered.client_id,
            refreshToken: replayPair.refresh_token,
          }),
        'invalid_grant'
      );
    } finally {
      if (previousReplayGrace === undefined) {
        process.env.ONEWORK_OAUTH_REFRESH_REPLAY_GRACE_SECONDS = undefined;
      } else {
        process.env.ONEWORK_OAUTH_REFRESH_REPLAY_GRACE_SECONDS =
          previousReplayGrace;
      }
    }
    await expectAccessFailure(replayChild.access_token, 'revoked');
    await expectAccessFailure(replayRetry.access_token, 'revoked');
    assert(
      (await activeSessions()).length === 0,
      'a replay outside the grace window must clear the active-session row'
    );

    // Connection revocation and refresh rotation share the active-session
    // lock. No matter which transaction wins, no child remains usable.
    const raceAuthorization = await issueAuthorization('revoke-race');
    const racePair = await exchangeAuthorization(raceAuthorization);
    const [rotationRace, connectionRace] = await Promise.allSettled([
      rotateOneWorkRefreshToken({
        clientId: registered.client_id,
        refreshToken: racePair.refresh_token,
      }),
      revokeOneWorkOAuthConnection({
        userId,
        clientId: registered.client_id,
      }),
    ]);
    assert(
      connectionRace.status === 'fulfilled' && connectionRace.value,
      'connection revocation must win or follow rotation successfully'
    );
    if (rotationRace.status === 'fulfilled') {
      const child = await verifyOneWorkOAuthAccessToken(
        `Bearer ${rotationRace.value.access_token}`
      );
      assert(
        !child.ok && child.reason === 'revoked',
        'a concurrently-created child must be revoked before connection revoke commits'
      );
    } else {
      assert(
        rotationRace.reason instanceof OneWorkOAuthError &&
          rotationRace.reason.code === 'invalid_grant',
        'rotation losing the revoke race must fail with invalid_grant'
      );
    }
    assert(
      (await activeSessions()).length === 0,
      'connection/refresh race must finish with no active session'
    );
    await expectAccessFailure(racePair.access_token, 'revoked');

    const accessHashes = await db
      .select({ tokenHash: oneworkOauthAccessToken.tokenHash })
      .from(oneworkOauthAccessToken)
      .where(eq(oneworkOauthAccessToken.userId, userId));
    const refreshHashes = await db
      .select({ tokenHash: oneworkOauthRefreshToken.tokenHash })
      .from(oneworkOauthRefreshToken)
      .where(eq(oneworkOauthRefreshToken.userId, userId));
    assert(
      [...accessHashes, ...refreshHashes].every(
        ({ tokenHash }) =>
          !tokenHash.startsWith('owat_') && !tokenHash.startsWith('owrt_')
      ),
      'database must contain hashes rather than raw tokens'
    );
    assert(
      !(await verifyOneWorkOAuthAccessToken(null)).ok,
      'missing bearer token must be denied'
    );

    console.log(
      JSON.stringify(
        {
          success: true,
          authorizationCodePkce: true,
          singleActiveAuthorization: true,
          failedAuthorizationPreservesSession: true,
          concurrentAuthorizationSerialized: true,
          crossClientAuthorizationSerialized: true,
          refreshVsNewAuthorizationSerialized: true,
          staleTokenRevokePreservesNewSession: true,
          oldAccessReason: 'replaced',
          oldRefreshRejected: true,
          refreshStaysInFamily: true,
          refreshRotationReplayGraceAndRevocation: true,
          deviceAuthorizationReplacesSession: true,
          accountConnectionRevocation: true,
          accessTokenRevokesFamily: true,
          activeSessionClearedOnRevoke: true,
          entitlementRevalidation: true,
          rawTokensStored: false,
        },
        null,
        2
      )
    );
  } finally {
    await db
      .delete(oneworkOauthRateLimitBucket)
      .where(
        eq(
          oneworkOauthRateLimitBucket.subjectHash,
          hashOneWorkOAuthRateLimitSubject(
            'device_code_client',
            trustedDeviceClientId
          )
        )
      );
    await db.delete(user).where(eq(user.id, userId));
    if (clientIds.length > 0) {
      await db
        .delete(oneworkOauthClient)
        .where(inArray(oneworkOauthClient.clientId, clientIds));
    }
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
