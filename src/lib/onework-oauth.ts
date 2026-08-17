import 'server-only';

import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { getDb } from '@/db';
import {
  oneworkOauthAccessToken as oauthAccessToken,
  oneworkOauthAuthorizationCode as oauthAuthorizationCode,
  oneworkOauthClient as oauthClient,
  oneworkOauthConsent as oauthConsent,
  oneworkOauthDeviceCode as oauthDeviceCode,
  oneworkOauthRateLimitBucket as oauthRateLimitBucket,
  oneworkOauthRefreshToken as oauthRefreshToken,
  oneworkEntitlement,
} from '@/db/schema';
import { getBaseUrl } from '@/lib/urls/urls';
import { and, desc, eq, gt, isNull, lt, lte, or, sql } from 'drizzle-orm';

export const ONEWORK_OAUTH_SCOPES = [
  'onework:resolve',
  'onework:knowledge',
  'onework:analytics',
  'onework:account',
] as const;

export type OneWorkOAuthScope = (typeof ONEWORK_OAUTH_SCOPES)[number];

const DEFAULT_SCOPE = ONEWORK_OAUTH_SCOPES.join(' ');
const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
const DEVICE_CODE_TTL_MS = 10 * 60 * 1000;
const DEVICE_POLL_INTERVAL_SECONDS = 5;
const TOKEN_HASH_DOMAIN = 'onework-oauth-v1';
const DEVICE_GRANT_TYPE =
  'urn:ietf:params:oauth:grant-type:device_code' as const;
export const ONEWORK_TRUSTED_DEVICE_CLIENT_ID =
  'onework-official-device-client-v1';

export type OneWorkOAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_client_metadata'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'unsupported_response_type'
  | 'invalid_scope'
  | 'invalid_target'
  | 'access_denied'
  | 'authorization_pending'
  | 'slow_down'
  | 'expired_token'
  | 'server_error';

export class OneWorkOAuthError extends Error {
  constructor(
    public readonly code: OneWorkOAuthErrorCode,
    description: string,
    public readonly status = 400
  ) {
    super(description);
    this.name = 'OneWorkOAuthError';
  }
}

/** Read an OAuth request body with a real byte limit and total read deadline. */
export async function readOneWorkOAuthBody(
  request: Request,
  maxBytes: number,
  timeoutMs = 5000
) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > Math.max(1, maxBytes)
  ) {
    throw new OneWorkOAuthError('invalid_request', '请求体过大', 413);
  }
  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + Math.max(250, timeoutMs);
  let bytes = 0;
  let raw = '';
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        await reader.cancel();
        throw new OneWorkOAuthError('invalid_request', '读取请求体超时', 408);
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new OneWorkOAuthError('invalid_request', '读取请求体超时', 408)
              ),
            remaining
          );
        }),
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      });
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new OneWorkOAuthError('invalid_request', '请求体过大', 413);
      }
      raw += decoder.decode(result.value, { stream: true });
    }
    raw += decoder.decode();
    return raw;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A timed-out read is cancelled above; some runtimes retain the lock
      // until that pending read settles.
    }
  }
}

export function requireOneWorkOAuthContentType(
  request: Request,
  mediaType: 'application/json' | 'application/x-www-form-urlencoded'
) {
  const actual = (request.headers.get('content-type') || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (actual !== mediaType) {
    throw new OneWorkOAuthError(
      'invalid_request',
      `Content-Type 必须为 ${mediaType}`,
      415
    );
  }
}

export async function readOneWorkOAuthJsonObject(
  request: Request,
  maxBytes: number
) {
  requireOneWorkOAuthContentType(request, 'application/json');
  const raw = await readOneWorkOAuthBody(request, maxBytes);
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    throw new OneWorkOAuthError('invalid_request', 'JSON 请求体无效');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new OneWorkOAuthError('invalid_request', '请求体必须是 JSON object');
  }
  return parsed as Record<string, unknown>;
}

export interface OneWorkOAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scopes: OneWorkOAuthScope[];
  tokenEndpointAuthMethod: string;
  dynamicallyRegistered: boolean;
}

export interface OneWorkAuthorizationRequest {
  client: OneWorkOAuthClient;
  redirectUri: string;
  scope: string;
  scopes: OneWorkOAuthScope[];
  state: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  resource: string;
}

export interface OneWorkOAuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export type OneWorkOAuthVerifyFailureReason =
  | 'missing'
  | 'invalid'
  | 'expired'
  | 'revoked'
  | 'entitlement_expired';

export type OneWorkOAuthAccessPrincipal = {
  tokenId: string;
  userId: string;
  clientId: string;
  scopes: ReadonlySet<string>;
  expiresAt: Date;
  resource: string;
};

export type OneWorkOAuthVerifyResult =
  | { ok: true; principal: OneWorkOAuthAccessPrincipal }
  | { ok: false; reason: OneWorkOAuthVerifyFailureReason };

export type OneWorkOAuthConnection = {
  clientId: string;
  clientName: string;
  scopes: OneWorkOAuthScope[];
  grantedAt: Date;
};

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function accessTokenTtlSeconds() {
  return boundedInteger(
    process.env.ONEWORK_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
    15 * 60,
    5 * 60,
    60 * 60
  );
}

function refreshTokenTtlSeconds() {
  return boundedInteger(
    process.env.ONEWORK_OAUTH_REFRESH_TOKEN_TTL_SECONDS,
    30 * 24 * 60 * 60,
    24 * 60 * 60,
    90 * 24 * 60 * 60
  );
}

function dynamicClientLimit() {
  return boundedInteger(
    process.env.ONEWORK_OAUTH_DYNAMIC_CLIENT_LIMIT,
    5000,
    10,
    100_000
  );
}

function dynamicClientRateLimit() {
  return boundedInteger(
    process.env.ONEWORK_OAUTH_DCR_RATE_LIMIT_PER_MINUTE,
    10,
    1,
    1000
  );
}

function deviceCodeRateLimit() {
  return boundedInteger(
    process.env.ONEWORK_OAUTH_DEVICE_RATE_LIMIT_PER_MINUTE,
    30,
    1,
    1000
  );
}

function devicePendingLimit() {
  return boundedInteger(
    process.env.ONEWORK_OAUTH_DEVICE_PENDING_LIMIT_PER_CLIENT,
    20,
    1,
    1000
  );
}

function normalizeIssuer(value: string) {
  let issuer: URL;
  try {
    issuer = new URL(value.trim());
  } catch {
    throw new Error('ONEWORK_OAUTH_ISSUER 必须是有效 URL');
  }
  if (
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash ||
    (issuer.pathname !== '/' && issuer.pathname !== '')
  ) {
    throw new Error(
      'ONEWORK_OAUTH_ISSUER 必须是没有路径、查询参数或凭据的 origin'
    );
  }
  const isLoopbackHttp =
    issuer.protocol === 'http:' && isLoopbackHostname(issuer.hostname);
  if (issuer.protocol !== 'https:' && !isLoopbackHttp) {
    throw new Error('ONEWORK_OAUTH_ISSUER 必须使用 HTTPS（本机回环地址除外）');
  }
  return issuer.origin;
}

export function getOneWorkOAuthIssuer() {
  return normalizeIssuer(process.env.ONEWORK_OAUTH_ISSUER || getBaseUrl());
}

export function getOneWorkOAuthResource() {
  return `${getOneWorkOAuthIssuer()}/mcp`;
}

function hashSecret(kind: string, raw: string) {
  return createHash('sha256')
    .update(`${TOKEN_HASH_DOMAIN}:${kind}:${raw}`)
    .digest('hex');
}

export type OneWorkOAuthRateLimitKind =
  | 'dynamic_client_registration'
  | 'device_code_ip'
  | 'device_code_client';

/** 公开仅供受控 E2E 精确回收本次限流 bucket；不会泄露原始主体。 */
export function hashOneWorkOAuthRateLimitSubject(
  kind: OneWorkOAuthRateLimitKind,
  subject: string
) {
  return hashSecret('rate_limit_subject', `${kind}:${subject.slice(0, 256)}`);
}

/**
 * Vercel/Cloudflare 会覆盖这些头。未经受信代理时所有未知请求共用
 * 一个严格 bucket，不会因攻击者伪造随机头而无界写入数据库。
 */
export function getOneWorkOAuthRequestRateLimitSubject(request: Request) {
  const forwarded =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim();
  return forwarded && forwarded.length <= 128 ? forwarded : 'unknown-network';
}

export async function reserveOneWorkOAuthPublicRequest(input: {
  kind: OneWorkOAuthRateLimitKind;
  subject: string;
  limit?: number;
}) {
  const defaultLimit =
    input.kind === 'dynamic_client_registration'
      ? dynamicClientRateLimit()
      : deviceCodeRateLimit();
  const limit = input.limit
    ? Math.max(1, Math.min(Math.floor(input.limit), 10_000))
    : defaultLimit;
  const now = new Date();
  const windowMs = 60_000;
  const bucketStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const staleBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const subjectHash = hashOneWorkOAuthRateLimitSubject(
    input.kind,
    input.subject
  );
  const db = await getDb();

  // 每个 subject/kind 始终只有一行；同时清理无用的旧 bucket。
  await db
    .delete(oauthRateLimitBucket)
    .where(lt(oauthRateLimitBucket.updatedAt, staleBefore));
  const rows = await db
    .insert(oauthRateLimitBucket)
    .values({
      id: `oauth_rate_${randomUUID()}`,
      subjectHash,
      kind: input.kind,
      windowStart: bucketStart,
      requestCount: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [oauthRateLimitBucket.subjectHash, oauthRateLimitBucket.kind],
      set: {
        windowStart: bucketStart,
        requestCount: sql<number>`CASE
          WHEN ${oauthRateLimitBucket.windowStart} < ${bucketStart.toISOString()}::timestamp THEN 1
          ELSE ${oauthRateLimitBucket.requestCount} + 1
        END`,
        updatedAt: now,
      },
      setWhere: or(
        lt(oauthRateLimitBucket.windowStart, bucketStart),
        lt(oauthRateLimitBucket.requestCount, limit)
      ),
    })
    .returning({ requestCount: oauthRateLimitBucket.requestCount });
  return {
    allowed: rows[0]?.requestCount !== undefined,
    limit,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((bucketStart.getTime() + windowMs - now.getTime()) / 1000)
    ),
  };
}

async function lockOAuthConnection(tx: any, userId: string, clientId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(
      hashtext('onework-oauth-connection'),
      hashtext(${`${userId}:${clientId}`})
    )`
  );
}

async function lockOAuthTokenFamily(
  tx: any,
  userId: string,
  clientId: string,
  familyId: string
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(
      hashtext('onework-oauth-token-family'),
      hashtext(${`${userId}:${clientId}:${familyId}`})
    )`
  );
}

async function hasActiveOAuthConsent(
  tx: any,
  userId: string,
  clientId: string,
  scope: string
) {
  const [consent] = await tx
    .select({ id: oauthConsent.id })
    .from(oauthConsent)
    .where(
      and(
        eq(oauthConsent.userId, userId),
        eq(oauthConsent.clientId, clientId),
        eq(oauthConsent.scope, scope),
        isNull(oauthConsent.revokedAt)
      )
    )
    .limit(1);
  return Boolean(consent);
}

function makeSecret(prefix: string, bytes: number) {
  return `${prefix}${randomBytes(bytes).toString('base64url')}`;
}

function normalizeUserCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function makeUserCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  let value = '';
  for (let index = 0; index < bytes.length; index += 1) {
    value += alphabet[bytes[index] % alphabet.length];
  }
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

function secureStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createS256CodeChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function isValidPkceValue(value: string) {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

function isLoopbackHostname(hostname: string) {
  return ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(
    hostname.toLowerCase()
  );
}

function isSafeWorkBuddyConfigSegment(rawSegment: string) {
  if (!rawSegment || rawSegment.length > 768) return false;
  let current = rawSegment;
  for (let depth = 0; depth < 5; depth += 1) {
    // 拒绝当前层已可见的 dot/slash/backslash/NUL 编码，也覆盖多层编码穿越。
    if (/%(?:00|2e|2f|5c)/i.test(current)) return false;
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return false;
    }
    if (
      !decoded ||
      decoded.length > 256 ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      [...decoded].some((character) => {
        const codePoint = character.codePointAt(0) || 0;
        return codePoint < 32 || codePoint === 127;
      })
    ) {
      return false;
    }
    // 没有下一层 percent triplet 时，剩余 % 只是 config id 的普通字符。
    if (!/%[0-9a-f]{2}/i.test(decoded)) return true;
    current = decoded;
  }
  // 超过可审计的编码层数，保守拒绝。
  return false;
}

function isWorkBuddyNativeRedirect(value: string, url: URL) {
  const rawMatch = value.match(
    /^workbuddy:\/\/workbuddy\/mcp\/([^/?#]+)\/oauth\/callback$/i
  );
  if (
    !rawMatch?.[1] ||
    url.protocol !== 'workbuddy:' ||
    url.hostname !== 'workbuddy' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return false;
  }
  return isSafeWorkBuddyConfigSegment(rawMatch[1]);
}

export function isOneWorkOAuthRedirectUriAllowed(value: string) {
  if (!value || value.includes('*')) return false;
  try {
    const url = new URL(value);
    if (url.hash || url.username || url.password) return false;
    if (url.protocol === 'workbuddy:') {
      return isWorkBuddyNativeRedirect(value, url);
    }
    if (url.protocol === 'https:') return Boolean(url.hostname);
    return url.protocol === 'http:' && isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

function redirectUriMatches(registeredValue: string, requestedValue: string) {
  if (registeredValue === requestedValue) return true;
  try {
    const registered = new URL(registeredValue);
    const requested = new URL(requestedValue);
    if (
      registered.protocol !== 'http:' ||
      requested.protocol !== 'http:' ||
      !isLoopbackHostname(registered.hostname) ||
      registered.hostname !== requested.hostname
    ) {
      return false;
    }
    return (
      registered.pathname === requested.pathname &&
      registered.search === requested.search &&
      !registered.hash &&
      !requested.hash &&
      !registered.username &&
      !requested.username &&
      !registered.password &&
      !requested.password
    );
  } catch {
    return false;
  }
}

export function isOneWorkOAuthClientRedirectUri(
  client: OneWorkOAuthClient,
  requestedUri: string
) {
  return (
    isOneWorkOAuthRedirectUriAllowed(requestedUri) &&
    client.redirectUris.some((registered) =>
      redirectUriMatches(registered, requestedUri)
    )
  );
}

function normalizedScopeList(value: string | undefined, allowed: string[]) {
  const requested = (value || allowed.join(' '))
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const unique = [...new Set(requested)];
  if (
    unique.length === 0 ||
    unique.some(
      (scope) =>
        !ONEWORK_OAUTH_SCOPES.includes(scope as OneWorkOAuthScope) ||
        !allowed.includes(scope)
    )
  ) {
    throw new OneWorkOAuthError(
      'invalid_scope',
      '请求包含客户端未获准使用的 scope'
    );
  }
  return unique as OneWorkOAuthScope[];
}

function normalizeResource(value: string | undefined) {
  const expected = getOneWorkOAuthResource();
  const requested = (value || expected).replace(/\/+$/, '');
  if (requested !== expected) {
    throw new OneWorkOAuthError(
      'invalid_target',
      'resource 必须指向 OneWorkOS MCP 服务'
    );
  }
  return expected;
}

function clientFromRow(
  row: typeof oauthClient.$inferSelect
): OneWorkOAuthClient {
  return {
    clientId: row.clientId,
    clientName: row.clientName,
    redirectUris: row.redirectUris,
    grantTypes: row.grantTypes,
    responseTypes: row.responseTypes,
    scopes: row.scopes.filter((scope): scope is OneWorkOAuthScope =>
      ONEWORK_OAUTH_SCOPES.includes(scope as OneWorkOAuthScope)
    ),
    tokenEndpointAuthMethod: row.tokenEndpointAuthMethod,
    dynamicallyRegistered: row.dynamicallyRegistered,
  };
}

export async function getOneWorkOAuthClient(clientId: string) {
  if (!clientId || clientId.length > 200) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(oauthClient)
    .where(
      and(eq(oauthClient.clientId, clientId), eq(oauthClient.status, 'active'))
    )
    .limit(1);
  return row ? clientFromRow(row) : null;
}

export async function registerOneWorkOAuthClient(input: {
  clientName?: unknown;
  redirectUris?: unknown;
  grantTypes?: unknown;
  responseTypes?: unknown;
  scope?: unknown;
  tokenEndpointAuthMethod?: unknown;
}) {
  if (
    !Array.isArray(input.redirectUris) ||
    input.redirectUris.length < 1 ||
    input.redirectUris.length > 5 ||
    input.redirectUris.some(
      (uri) => typeof uri !== 'string' || !isOneWorkOAuthRedirectUriAllowed(uri)
    )
  ) {
    throw new OneWorkOAuthError(
      'invalid_client_metadata',
      'redirect_uris 必须包含 1 到 5 个 HTTPS、loopback HTTP 或受限 WorkBuddy 回调地址'
    );
  }

  const redirectUris = [...new Set(input.redirectUris as string[])];
  const requestedGrantTypes = Array.isArray(input.grantTypes)
    ? [...new Set(input.grantTypes)]
    : ['authorization_code', 'refresh_token'];
  const responseTypes = Array.isArray(input.responseTypes)
    ? [...new Set(input.responseTypes)]
    : ['code'];
  if (
    requestedGrantTypes.some(
      (item) =>
        typeof item !== 'string' ||
        !['authorization_code', 'refresh_token'].includes(item)
    ) ||
    !requestedGrantTypes.includes('authorization_code') ||
    responseTypes.length !== 1 ||
    responseTypes[0] !== 'code' ||
    (input.tokenEndpointAuthMethod !== undefined &&
      input.tokenEndpointAuthMethod !== 'none')
  ) {
    throw new OneWorkOAuthError(
      'invalid_client_metadata',
      '动态注册只支持 public authorization-code client 与 code 响应'
    );
  }
  // WorkBuddy 5.3.13 的 DCR 仅声明 authorization_code，但会使用授权服务
  // 随 token response 签发的 refresh_token。服务端在注册时统一规范化，
  // 使数据库、DCR response 和后续 rotation 的能力声明一致。
  const grantTypes = ['authorization_code', 'refresh_token'];

  const scopes = normalizedScopeList(
    typeof input.scope === 'string' ? input.scope : DEFAULT_SCOPE,
    [...ONEWORK_OAUTH_SCOPES]
  );
  const canonicalRegistration = JSON.stringify({
    redirectUris: [...redirectUris].sort(),
    grantTypes: [...(grantTypes as string[])].sort(),
    responseTypes: [...(responseTypes as string[])].sort(),
    scopes: [...scopes].sort(),
  });
  const clientId = `owc_${createHash('sha256')
    .update(canonicalRegistration)
    .digest('base64url')
    .slice(0, 32)}`;
  const clientName =
    typeof input.clientName === 'string' && input.clientName.trim()
      ? input.clientName.trim().slice(0, 120)
      : 'OneWorkOS MCP Client';
  const now = new Date();
  const staleClientBefore = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const db = await getDb();
  const stored = await db.transaction(async (tx) => {
    // Serialize DCR so the configured cap cannot be bypassed by concurrent
    // registrations. The deterministic client id also makes identical retries
    // idempotent instead of creating a fresh row every time.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('onework-oauth-dcr'))`
    );
    // 只回收无任何授权/令牌/设备码引用的旧动态客户端。先删除已过期
    // 的短期记录，避免全局上限被永久占满。
    await tx
      .delete(oauthAuthorizationCode)
      .where(lte(oauthAuthorizationCode.expiresAt, now));
    await tx.delete(oauthDeviceCode).where(lte(oauthDeviceCode.expiresAt, now));
    await tx
      .delete(oauthAccessToken)
      .where(
        or(
          lte(oauthAccessToken.expiresAt, staleClientBefore),
          lte(oauthAccessToken.revokedAt, staleClientBefore)
        )
      );
    await tx
      .delete(oauthRefreshToken)
      .where(
        or(
          lte(oauthRefreshToken.expiresAt, staleClientBefore),
          lte(oauthRefreshToken.revokedAt, staleClientBefore)
        )
      );
    await tx
      .delete(oauthConsent)
      .where(lte(oauthConsent.revokedAt, staleClientBefore));
    await tx.execute(sql`
      delete from onework_oauth_client as client
      where client.dynamically_registered = true
        and client.created_at < ${staleClientBefore.toISOString()}::timestamp
        and not exists (
          select 1 from onework_oauth_consent consent
          where consent.client_id = client.client_id
        )
        and not exists (
          select 1 from onework_oauth_authorization_code code
          where code.client_id = client.client_id
        )
        and not exists (
          select 1 from onework_oauth_access_token access_token
          where access_token.client_id = client.client_id
        )
        and not exists (
          select 1 from onework_oauth_refresh_token refresh_token
          where refresh_token.client_id = client.client_id
        )
        and not exists (
          select 1 from onework_oauth_device_code device_code
          where device_code.client_id = client.client_id
        )
    `);
    const [existing] = await tx
      .select()
      .from(oauthClient)
      .where(eq(oauthClient.clientId, clientId))
      .limit(1);
    if (existing?.status === 'active') return existing;
    if (existing) {
      throw new OneWorkOAuthError(
        'invalid_client_metadata',
        '相同配置的客户端已经停用，不能自动重新激活'
      );
    }
    const [dynamicCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(oauthClient)
      .where(
        and(
          eq(oauthClient.dynamicallyRegistered, true),
          eq(oauthClient.status, 'active')
        )
      );
    if ((dynamicCount?.count || 0) >= dynamicClientLimit()) {
      throw new OneWorkOAuthError(
        'invalid_client_metadata',
        '动态客户端注册数量已达上限，请联系 OneWorkOS',
        429
      );
    }
    const [inserted] = await tx
      .insert(oauthClient)
      .values({
        clientId,
        clientName,
        redirectUris,
        grantTypes: grantTypes as string[],
        responseTypes: responseTypes as string[],
        scopes,
        tokenEndpointAuthMethod: 'none',
        status: 'active',
        dynamicallyRegistered: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!inserted) {
      throw new OneWorkOAuthError(
        'server_error',
        '动态客户端注册未能持久化',
        500
      );
    }
    return inserted;
  });

  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(stored.createdAt.getTime() / 1000),
    client_name: stored.clientName,
    redirect_uris: stored.redirectUris,
    grant_types: stored.grantTypes,
    response_types: stored.responseTypes,
    scope: stored.scopes.join(' '),
    token_endpoint_auth_method: 'none' as const,
  };
}

export async function prepareOneWorkAuthorizationRequest(
  params: URLSearchParams
): Promise<OneWorkAuthorizationRequest> {
  const clientId = params.get('client_id') || '';
  const client = await getOneWorkOAuthClient(clientId);
  if (!client || client.tokenEndpointAuthMethod !== 'none') {
    throw new OneWorkOAuthError('invalid_client', '未知或已停用的 client_id');
  }
  if (!client.grantTypes.includes('authorization_code')) {
    throw new OneWorkOAuthError(
      'unauthorized_client',
      '客户端未获准使用 authorization_code'
    );
  }
  if (params.get('response_type') !== 'code') {
    throw new OneWorkOAuthError(
      'unsupported_response_type',
      'response_type 必须为 code'
    );
  }

  const redirectUri = params.get('redirect_uri') || '';
  if (!isOneWorkOAuthClientRedirectUri(client, redirectUri)) {
    throw new OneWorkOAuthError(
      'invalid_request',
      'redirect_uri 未注册或不安全'
    );
  }

  const codeChallenge = params.get('code_challenge') || '';
  if (
    params.get('code_challenge_method') !== 'S256' ||
    !isValidPkceValue(codeChallenge)
  ) {
    throw new OneWorkOAuthError(
      'invalid_request',
      '必须使用有效的 PKCE S256 code_challenge'
    );
  }
  const state = params.get('state') || '';
  if (state.length > 1024) {
    throw new OneWorkOAuthError('invalid_request', 'state 过长');
  }
  const scopes = normalizedScopeList(
    params.get('scope') || undefined,
    client.scopes
  );
  return {
    client,
    redirectUri,
    scope: scopes.join(' '),
    scopes,
    state,
    codeChallenge,
    codeChallengeMethod: 'S256',
    resource: normalizeResource(params.get('resource') || undefined),
  };
}

export function buildOneWorkOAuthRedirect(
  redirectUri: string,
  values: Record<string, string | undefined>
) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function userHasActiveOneWorkEntitlement(
  userId: string,
  tx?: any
) {
  const db = tx || (await getDb());
  const [row] = await db
    .select({ id: oneworkEntitlement.id })
    .from(oneworkEntitlement)
    .where(
      and(
        eq(oneworkEntitlement.userId, userId),
        eq(oneworkEntitlement.status, 'active'),
        or(
          isNull(oneworkEntitlement.expiresAt),
          gt(oneworkEntitlement.expiresAt, new Date())
        )
      )
    )
    .limit(1);
  return Boolean(row);
}

async function requireActiveEntitlement(
  userId: string,
  tx?: any,
  code: 'access_denied' | 'invalid_grant' = 'access_denied'
) {
  if (!(await userHasActiveOneWorkEntitlement(userId, tx))) {
    throw new OneWorkOAuthError(
      code,
      'OneWorkOS 权益不存在或已经过期',
      code === 'invalid_grant' ? 400 : 403
    );
  }
}

export async function issueOneWorkAuthorizationCode(input: {
  userId: string;
  request: OneWorkAuthorizationRequest;
}) {
  const rawCode = makeSecret('owac_', 32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + AUTHORIZATION_CODE_TTL_MS);
  const db = await getDb();
  await db.transaction(async (tx) => {
    await lockOAuthConnection(tx, input.userId, input.request.client.clientId);
    await requireActiveEntitlement(input.userId, tx);
    await tx
      .insert(oauthConsent)
      .values({
        id: `oauth_consent_${randomUUID()}`,
        userId: input.userId,
        clientId: input.request.client.clientId,
        scope: input.request.scope,
        grantedAt: now,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          oauthConsent.userId,
          oauthConsent.clientId,
          oauthConsent.scope,
        ],
        set: { grantedAt: now, revokedAt: null, updatedAt: now },
      });
    await tx.insert(oauthAuthorizationCode).values({
      id: `oauth_code_${randomUUID()}`,
      codeHash: hashSecret('authorization_code', rawCode),
      clientId: input.request.client.clientId,
      userId: input.userId,
      redirectUri: input.request.redirectUri,
      scope: input.request.scope,
      resource: input.request.resource,
      codeChallenge: input.request.codeChallenge,
      codeChallengeMethod: 'S256',
      expiresAt,
      createdAt: now,
    });
  });
  return { code: rawCode, expiresAt };
}

function tokenPairValues(input: {
  clientId: string;
  userId: string;
  scope: string;
  resource: string;
  familyId?: string;
  parentTokenId?: string | null;
}) {
  const now = new Date();
  const accessToken = makeSecret('owat_', 32);
  const refreshToken = makeSecret('owrt_', 40);
  const accessTokenId = `oauth_access_${randomUUID()}`;
  const refreshTokenId = `oauth_refresh_${randomUUID()}`;
  const familyId = input.familyId || `oauth_family_${randomUUID()}`;
  const accessExpiresAt = new Date(
    now.getTime() + accessTokenTtlSeconds() * 1000
  );
  const refreshExpiresAt = new Date(
    now.getTime() + refreshTokenTtlSeconds() * 1000
  );
  return {
    now,
    accessToken,
    refreshToken,
    accessTokenId,
    refreshTokenId,
    familyId,
    accessExpiresAt,
    refreshExpiresAt,
    parentTokenId: input.parentTokenId || null,
    ...input,
  };
}

async function insertTokenPair(
  tx: any,
  input: ReturnType<typeof tokenPairValues>
) {
  await tx.insert(oauthAccessToken).values({
    id: input.accessTokenId,
    tokenHash: hashSecret('access_token', input.accessToken),
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    resource: input.resource,
    familyId: input.familyId,
    expiresAt: input.accessExpiresAt,
    createdAt: input.now,
  });
  await tx.insert(oauthRefreshToken).values({
    id: input.refreshTokenId,
    tokenHash: hashSecret('refresh_token', input.refreshToken),
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    resource: input.resource,
    familyId: input.familyId,
    parentTokenId: input.parentTokenId,
    expiresAt: input.refreshExpiresAt,
    createdAt: input.now,
  });
}

function publicTokenResponse(
  pair: ReturnType<typeof tokenPairValues>
): OneWorkOAuthTokenResponse {
  return {
    access_token: pair.accessToken,
    token_type: 'Bearer',
    expires_in: accessTokenTtlSeconds(),
    refresh_token: pair.refreshToken,
    scope: pair.scope,
  };
}

export async function exchangeOneWorkAuthorizationCode(input: {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}) {
  const client = await getOneWorkOAuthClient(input.clientId);
  if (!client) {
    throw new OneWorkOAuthError('invalid_client', '未知或已停用的 client_id');
  }
  if (!client.grantTypes.includes('authorization_code')) {
    throw new OneWorkOAuthError(
      'unauthorized_client',
      '客户端未获准使用 authorization_code'
    );
  }
  if (!isValidPkceValue(input.codeVerifier)) {
    throw new OneWorkOAuthError('invalid_grant', 'code_verifier 无效');
  }
  const resource = normalizeResource(input.resource);
  const db = await getDb();
  const codeHash = hashSecret('authorization_code', input.code);
  const [candidate] = await db
    .select({
      userId: oauthAuthorizationCode.userId,
      clientId: oauthAuthorizationCode.clientId,
    })
    .from(oauthAuthorizationCode)
    .where(eq(oauthAuthorizationCode.codeHash, codeHash))
    .limit(1);
  if (!candidate || candidate.clientId !== input.clientId) {
    throw new OneWorkOAuthError('invalid_grant', '授权码无效或已经过期');
  }
  return db.transaction(async (tx) => {
    // 连接锁必须先于行锁；否则会与账号页的连接撤销死锁。
    await lockOAuthConnection(tx, candidate.userId, candidate.clientId);
    const [row] = await tx
      .select()
      .from(oauthAuthorizationCode)
      .where(eq(oauthAuthorizationCode.codeHash, codeHash))
      .for('update')
      .limit(1);
    const now = new Date();
    if (
      !row ||
      row.clientId !== input.clientId ||
      row.redirectUri !== input.redirectUri ||
      row.resource !== resource ||
      row.consumedAt ||
      row.expiresAt.getTime() <= now.getTime() ||
      row.codeChallengeMethod !== 'S256' ||
      !secureStringEqual(
        row.codeChallenge,
        createS256CodeChallenge(input.codeVerifier)
      )
    ) {
      throw new OneWorkOAuthError('invalid_grant', '授权码无效或已经过期');
    }
    if (
      !(await hasActiveOAuthConsent(tx, row.userId, row.clientId, row.scope))
    ) {
      throw new OneWorkOAuthError('invalid_grant', '用户已撤销该客户端授权');
    }
    await requireActiveEntitlement(row.userId, tx, 'invalid_grant');
    const pair = tokenPairValues({
      clientId: row.clientId,
      userId: row.userId,
      scope: row.scope,
      resource: row.resource,
    });
    await tx
      .update(oauthAuthorizationCode)
      .set({ consumedAt: now })
      .where(eq(oauthAuthorizationCode.id, row.id));
    await insertTokenPair(tx, pair);
    return publicTokenResponse(pair);
  });
}

export async function rotateOneWorkRefreshToken(input: {
  clientId: string;
  refreshToken: string;
  scope?: string;
  resource?: string;
}) {
  const client = await getOneWorkOAuthClient(input.clientId);
  if (!client) {
    throw new OneWorkOAuthError('invalid_client', '未知或已停用的 client_id');
  }
  if (!client.grantTypes.includes('refresh_token')) {
    throw new OneWorkOAuthError(
      'unauthorized_client',
      '客户端未获准使用 refresh_token'
    );
  }
  const requestedResource = normalizeResource(input.resource);
  const db = await getDb();
  const tokenHash = hashSecret('refresh_token', input.refreshToken);
  const [candidate] = await db
    .select({
      userId: oauthRefreshToken.userId,
      clientId: oauthRefreshToken.clientId,
      familyId: oauthRefreshToken.familyId,
    })
    .from(oauthRefreshToken)
    .where(
      and(
        eq(oauthRefreshToken.tokenHash, tokenHash),
        eq(oauthRefreshToken.clientId, input.clientId)
      )
    )
    .limit(1);
  if (!candidate) {
    throw new OneWorkOAuthError(
      'invalid_grant',
      'refresh token 无效或已经过期'
    );
  }
  const result = await db.transaction(async (tx) => {
    await lockOAuthConnection(tx, candidate.userId, candidate.clientId);
    await lockOAuthTokenFamily(
      tx,
      candidate.userId,
      candidate.clientId,
      candidate.familyId
    );
    const [row] = await tx
      .select()
      .from(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.tokenHash, tokenHash),
          eq(oauthRefreshToken.clientId, input.clientId)
        )
      )
      .for('update')
      .limit(1);
    const now = new Date();
    if (!row || row.clientId !== input.clientId) {
      return { error: 'invalid' as const };
    }
    if (row.consumedAt) {
      await tx
        .update(oauthRefreshToken)
        .set({ revokedAt: now })
        .where(eq(oauthRefreshToken.familyId, row.familyId));
      await tx
        .update(oauthAccessToken)
        .set({ revokedAt: now })
        .where(eq(oauthAccessToken.familyId, row.familyId));
      return { error: 'replayed' as const };
    }
    if (
      row.revokedAt ||
      row.expiresAt.getTime() <= now.getTime() ||
      row.resource !== requestedResource
    ) {
      return { error: 'invalid' as const };
    }
    if (
      !(await hasActiveOAuthConsent(tx, row.userId, row.clientId, row.scope))
    ) {
      return { error: 'invalid' as const };
    }
    await requireActiveEntitlement(row.userId, tx, 'invalid_grant');

    const originalScopes = row.scope.split(/\s+/).filter(Boolean);
    const requestedScopes = input.scope
      ? normalizedScopeList(input.scope, originalScopes)
      : (originalScopes as OneWorkOAuthScope[]);
    const pair = tokenPairValues({
      clientId: row.clientId,
      userId: row.userId,
      scope: requestedScopes.join(' '),
      resource: row.resource,
      familyId: row.familyId,
      parentTokenId: row.id,
    });
    await tx
      .update(oauthRefreshToken)
      .set({
        consumedAt: now,
        replacedByTokenId: pair.refreshTokenId,
      })
      .where(eq(oauthRefreshToken.id, row.id));
    await insertTokenPair(tx, pair);
    return { token: publicTokenResponse(pair) };
  });

  if ('error' in result) {
    throw new OneWorkOAuthError(
      'invalid_grant',
      result.error === 'replayed'
        ? '检测到 refresh token 重放，令牌族已撤销'
        : 'refresh token 无效或已经过期'
    );
  }
  return result.token;
}

export async function revokeOneWorkOAuthToken(input: {
  clientId: string;
  token: string;
}) {
  const client = await getOneWorkOAuthClient(input.clientId);
  if (!client || !input.token) return;
  const db = await getDb();
  if (input.token.startsWith('owrt_')) {
    const tokenHash = hashSecret('refresh_token', input.token);
    const [candidate] = await db
      .select({
        userId: oauthRefreshToken.userId,
        clientId: oauthRefreshToken.clientId,
        familyId: oauthRefreshToken.familyId,
      })
      .from(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.tokenHash, tokenHash),
          eq(oauthRefreshToken.clientId, input.clientId)
        )
      )
      .limit(1);
    if (!candidate) return;
    await db.transaction(async (tx) => {
      await lockOAuthConnection(tx, candidate.userId, candidate.clientId);
      await lockOAuthTokenFamily(
        tx,
        candidate.userId,
        candidate.clientId,
        candidate.familyId
      );
      const [row] = await tx
        .select({
          id: oauthRefreshToken.id,
          familyId: oauthRefreshToken.familyId,
        })
        .from(oauthRefreshToken)
        .where(
          and(
            eq(oauthRefreshToken.tokenHash, tokenHash),
            eq(oauthRefreshToken.clientId, input.clientId)
          )
        )
        .limit(1);
      if (!row) return;
      const now = new Date();
      await tx
        .update(oauthRefreshToken)
        .set({ revokedAt: now })
        .where(eq(oauthRefreshToken.familyId, row.familyId));
      await tx
        .update(oauthAccessToken)
        .set({ revokedAt: now })
        .where(eq(oauthAccessToken.familyId, row.familyId));
    });
    return;
  }
  const tokenHash = hashSecret('access_token', input.token);
  const [candidate] = await db
    .select({
      userId: oauthAccessToken.userId,
      clientId: oauthAccessToken.clientId,
      familyId: oauthAccessToken.familyId,
    })
    .from(oauthAccessToken)
    .where(
      and(
        eq(oauthAccessToken.tokenHash, tokenHash),
        eq(oauthAccessToken.clientId, input.clientId)
      )
    )
    .limit(1);
  if (!candidate) return;
  await db.transaction(async (tx) => {
    await lockOAuthConnection(tx, candidate.userId, candidate.clientId);
    if (candidate.familyId) {
      await lockOAuthTokenFamily(
        tx,
        candidate.userId,
        candidate.clientId,
        candidate.familyId
      );
    }
    await tx
      .update(oauthAccessToken)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(oauthAccessToken.tokenHash, tokenHash),
          eq(oauthAccessToken.clientId, input.clientId)
        )
      );
  });
}

export async function listOneWorkOAuthConnections(
  userId: string
): Promise<OneWorkOAuthConnection[]> {
  const db = await getDb();
  const rows = await db
    .select({
      clientId: oauthConsent.clientId,
      clientName: oauthClient.clientName,
      scope: oauthConsent.scope,
      grantedAt: oauthConsent.grantedAt,
    })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthConsent.clientId, oauthClient.clientId))
    .where(
      and(
        eq(oauthConsent.userId, userId),
        isNull(oauthConsent.revokedAt),
        eq(oauthClient.status, 'active')
      )
    )
    .orderBy(desc(oauthConsent.grantedAt));

  const connections = new Map<string, OneWorkOAuthConnection>();
  for (const row of rows) {
    const scopes = row.scope
      .split(/\s+/)
      .filter((scope): scope is OneWorkOAuthScope =>
        ONEWORK_OAUTH_SCOPES.includes(scope as OneWorkOAuthScope)
      );
    const current = connections.get(row.clientId);
    if (!current) {
      connections.set(row.clientId, {
        clientId: row.clientId,
        clientName: row.clientName || 'OneWorkOS 客户端',
        scopes: [...new Set(scopes)],
        grantedAt: row.grantedAt,
      });
      continue;
    }
    current.scopes = [...new Set([...current.scopes, ...scopes])];
    if (row.grantedAt.getTime() > current.grantedAt.getTime()) {
      current.grantedAt = row.grantedAt;
    }
  }
  return [...connections.values()];
}

export async function revokeOneWorkOAuthConnection(input: {
  userId: string;
  clientId: string;
}) {
  if (!input.clientId || input.clientId.length > 200) return false;
  const db = await getDb();
  return db.transaction(async (tx) => {
    await lockOAuthConnection(tx, input.userId, input.clientId);
    const [connection] = await tx
      .select({ id: oauthConsent.id })
      .from(oauthConsent)
      .where(
        and(
          eq(oauthConsent.userId, input.userId),
          eq(oauthConsent.clientId, input.clientId),
          isNull(oauthConsent.revokedAt)
        )
      )
      .limit(1);
    if (!connection) return false;

    const now = new Date();
    const families = await tx
      .selectDistinct({ familyId: oauthRefreshToken.familyId })
      .from(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.userId, input.userId),
          eq(oauthRefreshToken.clientId, input.clientId)
        )
      );
    for (const familyId of families
      .map((row) => row.familyId)
      .filter(Boolean)
      .sort()) {
      await lockOAuthTokenFamily(tx, input.userId, input.clientId, familyId);
    }
    await tx
      .update(oauthConsent)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(oauthConsent.userId, input.userId),
          eq(oauthConsent.clientId, input.clientId),
          isNull(oauthConsent.revokedAt)
        )
      );
    await tx
      .update(oauthAccessToken)
      .set({ revokedAt: now })
      .where(
        and(
          eq(oauthAccessToken.userId, input.userId),
          eq(oauthAccessToken.clientId, input.clientId),
          isNull(oauthAccessToken.revokedAt)
        )
      );
    await tx
      .update(oauthRefreshToken)
      .set({ revokedAt: now })
      .where(
        and(
          eq(oauthRefreshToken.userId, input.userId),
          eq(oauthRefreshToken.clientId, input.clientId),
          isNull(oauthRefreshToken.revokedAt)
        )
      );
    await tx
      .update(oauthAuthorizationCode)
      .set({ consumedAt: now })
      .where(
        and(
          eq(oauthAuthorizationCode.userId, input.userId),
          eq(oauthAuthorizationCode.clientId, input.clientId),
          isNull(oauthAuthorizationCode.consumedAt)
        )
      );
    await tx
      .update(oauthDeviceCode)
      .set({ status: 'denied', updatedAt: now })
      .where(
        and(
          eq(oauthDeviceCode.userId, input.userId),
          eq(oauthDeviceCode.clientId, input.clientId),
          or(
            eq(oauthDeviceCode.status, 'pending'),
            eq(oauthDeviceCode.status, 'approved')
          )
        )
      );
    return true;
  });
}

export async function issueOneWorkDeviceCode(input: {
  clientId: string;
  scope?: string;
  resource?: string;
}) {
  const client = await getOneWorkOAuthClient(input.clientId);
  if (!client) {
    throw new OneWorkOAuthError('invalid_client', '未知或已停用的 client_id');
  }
  if (
    client.dynamicallyRegistered ||
    !client.grantTypes.includes(DEVICE_GRANT_TYPE)
  ) {
    throw new OneWorkOAuthError(
      'unauthorized_client',
      '只有 OneWorkOS 预注册的可信客户端才能使用 device_code'
    );
  }
  const rateLimit = await reserveOneWorkOAuthPublicRequest({
    kind: 'device_code_client',
    subject: client.clientId,
  });
  if (!rateLimit.allowed) {
    throw new OneWorkOAuthError(
      'slow_down',
      '该客户端的设备授权请求过于频繁',
      429
    );
  }
  const scopes = normalizedScopeList(input.scope, client.scopes);
  const resource = normalizeResource(input.resource);
  const rawDeviceCode = makeSecret('owdc_', 32);
  const rawUserCode = makeUserCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEVICE_CODE_TTL_MS);
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtext('onework-oauth-device-client'),
        hashtext(${client.clientId})
      )`
    );
    // 过期码无法再换 token，及时删除避免设备码表无界增长。
    await tx
      .delete(oauthDeviceCode)
      .where(
        and(
          eq(oauthDeviceCode.clientId, client.clientId),
          lte(oauthDeviceCode.expiresAt, now)
        )
      );
    const [pending] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(oauthDeviceCode)
      .where(
        and(
          eq(oauthDeviceCode.clientId, client.clientId),
          gt(oauthDeviceCode.expiresAt, now),
          isNull(oauthDeviceCode.consumedAt),
          or(
            eq(oauthDeviceCode.status, 'pending'),
            eq(oauthDeviceCode.status, 'approved')
          )
        )
      );
    if ((pending?.count || 0) >= devicePendingLimit()) {
      throw new OneWorkOAuthError(
        'slow_down',
        '该客户端待确认的设备授权已达上限',
        429
      );
    }
    await tx.insert(oauthDeviceCode).values({
      id: `oauth_device_${randomUUID()}`,
      deviceCodeHash: hashSecret('device_code', rawDeviceCode),
      userCodeHash: hashSecret('user_code', normalizeUserCode(rawUserCode)),
      clientId: input.clientId,
      scope: scopes.join(' '),
      resource,
      status: 'pending',
      pollIntervalSeconds: DEVICE_POLL_INTERVAL_SECONDS,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  });
  const verificationUri = `${getOneWorkOAuthIssuer()}/onework/activate`;
  return {
    device_code: rawDeviceCode,
    user_code: rawUserCode,
    verification_uri: verificationUri,
    verification_uri_complete: `${verificationUri}?user_code=${encodeURIComponent(rawUserCode)}`,
    expires_in: Math.floor(DEVICE_CODE_TTL_MS / 1000),
    interval: DEVICE_POLL_INTERVAL_SECONDS,
  };
}

export async function getOneWorkDeviceAuthorization(userCode: string) {
  const normalized = normalizeUserCode(userCode);
  if (normalized.length !== 8) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      id: oauthDeviceCode.id,
      clientId: oauthDeviceCode.clientId,
      scope: oauthDeviceCode.scope,
      status: oauthDeviceCode.status,
      expiresAt: oauthDeviceCode.expiresAt,
      consumedAt: oauthDeviceCode.consumedAt,
    })
    .from(oauthDeviceCode)
    .where(
      eq(oauthDeviceCode.userCodeHash, hashSecret('user_code', normalized))
    )
    .limit(1);
  if (!row || row.expiresAt.getTime() <= Date.now() || row.consumedAt) {
    return null;
  }
  const client = await getOneWorkOAuthClient(row.clientId);
  if (!client) return null;
  return {
    clientId: row.clientId,
    clientName: client.clientName,
    scopes: row.scope.split(/\s+/).filter(Boolean),
    status: row.status,
    expiresAt: row.expiresAt,
  };
}

export async function decideOneWorkDeviceAuthorization(input: {
  userId: string;
  userCode: string;
  decision: 'approve' | 'deny';
}) {
  const normalized = normalizeUserCode(input.userCode);
  if (normalized.length !== 8) {
    throw new OneWorkOAuthError('invalid_request', '设备授权码无效');
  }
  const db = await getDb();
  const userCodeHash = hashSecret('user_code', normalized);
  const [candidate] = await db
    .select({
      clientId: oauthDeviceCode.clientId,
      userId: oauthDeviceCode.userId,
    })
    .from(oauthDeviceCode)
    .where(eq(oauthDeviceCode.userCodeHash, userCodeHash))
    .limit(1);
  if (!candidate) {
    throw new OneWorkOAuthError('invalid_request', '设备授权码无效或已过期');
  }
  return db.transaction(async (tx) => {
    await lockOAuthConnection(
      tx,
      candidate.userId || input.userId,
      candidate.clientId
    );
    const [row] = await tx
      .select()
      .from(oauthDeviceCode)
      .where(eq(oauthDeviceCode.userCodeHash, userCodeHash))
      .for('update')
      .limit(1);
    const now = new Date();
    if (
      !row ||
      row.consumedAt ||
      row.expiresAt.getTime() <= now.getTime() ||
      !['pending', 'approved'].includes(row.status)
    ) {
      throw new OneWorkOAuthError('invalid_request', '设备授权码无效或已过期');
    }
    if (row.status === 'approved' && row.userId !== input.userId) {
      throw new OneWorkOAuthError(
        'access_denied',
        '设备授权码已由其他账号确认'
      );
    }
    const status = input.decision === 'approve' ? 'approved' : 'denied';
    if (status === 'approved') {
      await requireActiveEntitlement(input.userId, tx);
    }
    await tx
      .update(oauthDeviceCode)
      .set({
        userId: input.userId,
        status,
        approvedAt: status === 'approved' ? now : null,
        updatedAt: now,
      })
      .where(eq(oauthDeviceCode.id, row.id));
    if (status === 'approved') {
      await tx
        .insert(oauthConsent)
        .values({
          id: `oauth_consent_${randomUUID()}`,
          userId: input.userId,
          clientId: row.clientId,
          scope: row.scope,
          grantedAt: now,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            oauthConsent.userId,
            oauthConsent.clientId,
            oauthConsent.scope,
          ],
          set: { grantedAt: now, revokedAt: null, updatedAt: now },
        });
    }
    return { status };
  });
}

export async function pollOneWorkDeviceToken(input: {
  clientId: string;
  deviceCode: string;
  resource?: string;
}) {
  const client = await getOneWorkOAuthClient(input.clientId);
  if (!client) {
    throw new OneWorkOAuthError('invalid_client', '未知或已停用的 client_id');
  }
  if (
    client.dynamicallyRegistered ||
    !client.grantTypes.includes(DEVICE_GRANT_TYPE)
  ) {
    throw new OneWorkOAuthError(
      'unauthorized_client',
      '只有 OneWorkOS 预注册的可信客户端才能使用 device_code'
    );
  }
  const resource = normalizeResource(input.resource);
  const db = await getDb();
  const deviceCodeHash = hashSecret('device_code', input.deviceCode);
  const [candidate] = await db
    .select({
      clientId: oauthDeviceCode.clientId,
      userId: oauthDeviceCode.userId,
      status: oauthDeviceCode.status,
    })
    .from(oauthDeviceCode)
    .where(eq(oauthDeviceCode.deviceCodeHash, deviceCodeHash))
    .limit(1);
  const result = await db.transaction(async (tx) => {
    const lockedConnection =
      candidate?.status === 'approved' &&
      candidate.userId &&
      candidate.clientId === input.clientId;
    if (lockedConnection) {
      await lockOAuthConnection(tx, candidate.userId!, candidate.clientId);
    }
    const [row] = await tx
      .select()
      .from(oauthDeviceCode)
      .where(eq(oauthDeviceCode.deviceCodeHash, deviceCodeHash))
      .for('update')
      .limit(1);
    const now = new Date();
    if (!row || row.clientId !== input.clientId || row.resource !== resource) {
      return { error: 'invalid_grant' as const };
    }
    if (row.expiresAt.getTime() <= now.getTime()) {
      return { error: 'expired_token' as const };
    }
    if (row.status === 'denied') return { error: 'access_denied' as const };
    if (row.consumedAt || row.status === 'consumed') {
      return { error: 'invalid_grant' as const };
    }

    if (
      row.lastPolledAt &&
      now.getTime() - row.lastPolledAt.getTime() <
        row.pollIntervalSeconds * 1000
    ) {
      await tx
        .update(oauthDeviceCode)
        .set({
          pollIntervalSeconds: Math.min(row.pollIntervalSeconds + 5, 60),
          lastPolledAt: now,
          updatedAt: now,
        })
        .where(eq(oauthDeviceCode.id, row.id));
      return { error: 'slow_down' as const };
    }
    if (row.status !== 'approved' || !row.userId) {
      await tx
        .update(oauthDeviceCode)
        .set({ lastPolledAt: now, updatedAt: now })
        .where(eq(oauthDeviceCode.id, row.id));
      return { error: 'authorization_pending' as const };
    }

    // 如果在预读后才刚完成确认，先结束本次轮询。下次将在行锁
    // 之前取得连接 advisory lock，避免与账号页撤销产生死锁。
    if (!lockedConnection) {
      return { error: 'authorization_pending' as const };
    }

    if (
      !(await hasActiveOAuthConsent(tx, row.userId, row.clientId, row.scope))
    ) {
      return { error: 'access_denied' as const };
    }
    await requireActiveEntitlement(row.userId, tx, 'invalid_grant');
    const pair = tokenPairValues({
      clientId: row.clientId,
      userId: row.userId,
      scope: row.scope,
      resource: row.resource,
    });
    await tx
      .update(oauthDeviceCode)
      .set({
        status: 'consumed',
        consumedAt: now,
        lastPolledAt: now,
        updatedAt: now,
      })
      .where(eq(oauthDeviceCode.id, row.id));
    await insertTokenPair(tx, pair);
    return { token: publicTokenResponse(pair) };
  });

  if ('error' in result && result.error) {
    const descriptions: Record<string, string> = {
      invalid_grant: 'device_code 无效或已经使用',
      expired_token: 'device_code 已经过期',
      access_denied: '用户拒绝了设备授权',
      slow_down: '轮询过快，请降低频率',
      authorization_pending: '等待用户在网页确认授权',
    };
    throw new OneWorkOAuthError(
      result.error,
      descriptions[result.error] || '设备授权失败'
    );
  }
  return result.token;
}

export async function verifyOneWorkOAuthAccessToken(
  authorization: string | null
): Promise<OneWorkOAuthVerifyResult> {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const rawToken = match?.[1]?.trim() || '';
  if (!rawToken) return { ok: false, reason: 'missing' };
  if (!rawToken.startsWith('owat_')) return { ok: false, reason: 'invalid' };

  const db = await getDb();
  const [row] = await db
    .select()
    .from(oauthAccessToken)
    .where(eq(oauthAccessToken.tokenHash, hashSecret('access_token', rawToken)))
    .limit(1);
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.revokedAt) return { ok: false, reason: 'revoked' };
  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (!(await userHasActiveOneWorkEntitlement(row.userId))) {
    return { ok: false, reason: 'entitlement_expired' };
  }
  return {
    ok: true,
    principal: {
      tokenId: row.id,
      userId: row.userId,
      clientId: row.clientId,
      scopes: new Set(row.scope.split(/\s+/).filter(Boolean)),
      expiresAt: row.expiresAt,
      resource: row.resource,
    },
  };
}
