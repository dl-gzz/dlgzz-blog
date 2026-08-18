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
    'workbuddy://workbuddy/mcp/config%3A5.3.13-test/oauth/callback';
  assert(
    isOneWorkOAuthRedirectUriAllowed(realWorkBuddyRedirect),
    'the exact WorkBuddy 5.3.13 native callback shape should be accepted'
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
  const encodedConfigId = encodeURIComponent(`config:${suffix}`);
  const redirectUri = `workbuddy://workbuddy/mcp/${encodedConfigId}/oauth/callback`;
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
      redirectUris: [redirectUri],
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
    const authorizationRequest = await prepareOneWorkAuthorizationRequest(
      new URLSearchParams({
        response_type: 'code',
        client_id: registered.client_id,
        redirect_uri: redirectUri,
        scope: 'onework:resolve onework:knowledge',
        state: `state-${suffix}`,
        code_challenge: createS256CodeChallenge(verifier),
        code_challenge_method: 'S256',
      })
    );
    const issued = await issueOneWorkAuthorizationCode({
      userId,
      request: authorizationRequest,
    });

    await expectOAuthError(
      () =>
        exchangeOneWorkAuthorizationCode({
          clientId: registered.client_id,
          code: issued.code,
          redirectUri,
          codeVerifier: randomBytes(48).toString('base64url'),
        }),
      'invalid_grant'
    );
    const firstPair = await exchangeOneWorkAuthorizationCode({
      clientId: registered.client_id,
      code: issued.code,
      redirectUri,
      codeVerifier: verifier,
    });
    const firstVerified = await verifyOneWorkOAuthAccessToken(
      `Bearer ${firstPair.access_token}`
    );
    assert(firstVerified.ok, 'authorization-code access token should verify');
    assert(
      firstVerified.principal.scopes.has('onework:knowledge'),
      'knowledge scope should be present'
    );
    await expectOAuthError(
      () =>
        exchangeOneWorkAuthorizationCode({
          clientId: registered.client_id,
          code: issued.code,
          redirectUri,
          codeVerifier: verifier,
        }),
      'invalid_grant'
    );

    const rotated = await rotateOneWorkRefreshToken({
      clientId: registered.client_id,
      refreshToken: firstPair.refresh_token,
      scope: 'onework:knowledge',
    });
    assert(
      (await verifyOneWorkOAuthAccessToken(`Bearer ${rotated.access_token}`))
        .ok,
      'rotated access token should verify'
    );
    await expectOAuthError(
      () =>
        rotateOneWorkRefreshToken({
          clientId: registered.client_id,
          refreshToken: firstPair.refresh_token,
        }),
      'invalid_grant'
    );
    const replayRevoked = await verifyOneWorkOAuthAccessToken(
      `Bearer ${rotated.access_token}`
    );
    assert(
      !replayRevoked.ok && replayRevoked.reason === 'revoked',
      'refresh replay must revoke the full token family'
    );

    // Connection revocation and refresh rotation share an advisory lock. No
    // matter which transaction wins, there must be no usable child afterward.
    const raceVerifier = randomBytes(48).toString('base64url');
    const raceRequest = await prepareOneWorkAuthorizationRequest(
      new URLSearchParams({
        response_type: 'code',
        client_id: registered.client_id,
        redirect_uri: redirectUri,
        scope: 'onework:resolve onework:knowledge',
        state: `race-${suffix}`,
        code_challenge: createS256CodeChallenge(raceVerifier),
        code_challenge_method: 'S256',
      })
    );
    const raceCode = await issueOneWorkAuthorizationCode({
      userId,
      request: raceRequest,
    });
    const racePair = await exchangeOneWorkAuthorizationCode({
      clientId: registered.client_id,
      code: raceCode.code,
      redirectUri,
      codeVerifier: raceVerifier,
    });
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
    const raceParent = await verifyOneWorkOAuthAccessToken(
      `Bearer ${racePair.access_token}`
    );
    assert(
      !raceParent.ok && raceParent.reason === 'revoked',
      'connection revoke must revoke the parent access token'
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
    const device = await issueOneWorkDeviceCode({
      clientId: trustedDeviceClientId,
      scope: 'onework:account',
    });
    await decideOneWorkDeviceAuthorization({
      userId,
      userCode: device.user_code,
      decision: 'approve',
    });
    const devicePair = await pollOneWorkDeviceToken({
      clientId: trustedDeviceClientId,
      deviceCode: device.device_code,
    });
    assert(
      (await verifyOneWorkOAuthAccessToken(`Bearer ${devicePair.access_token}`))
        .ok,
      'device access token should verify'
    );
    const connections = await listOneWorkOAuthConnections(userId);
    assert(
      connections.some(
        (connection) => connection.clientId === trustedDeviceClientId
      ),
      'approved device client should appear in account connections'
    );

    await db
      .update(oneworkEntitlement)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(eq(oneworkEntitlement.id, entitlementId));
    const entitlementDenied = await verifyOneWorkOAuthAccessToken(
      `Bearer ${devicePair.access_token}`
    );
    assert(
      !entitlementDenied.ok &&
        entitlementDenied.reason === 'entitlement_expired',
      'expired entitlement must invalidate an otherwise active token'
    );
    await db
      .update(oneworkEntitlement)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(oneworkEntitlement.id, entitlementId));
    await revokeOneWorkOAuthToken({
      clientId: trustedDeviceClientId,
      token: devicePair.refresh_token,
    });
    const revoked = await verifyOneWorkOAuthAccessToken(
      `Bearer ${devicePair.access_token}`
    );
    assert(
      !revoked.ok && revoked.reason === 'revoked',
      'refresh revoke must revoke the full token family'
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
      'account connection should be revocable'
    );
    assert(
      !(await listOneWorkOAuthConnections(userId)).some(
        (connection) => connection.clientId === trustedDeviceClientId
      ),
      'revoked client must disappear from account connections'
    );

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
          refreshRotationAndReplayRevocation: true,
          deviceAuthorization: true,
          accountConnectionRevocation: true,
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
