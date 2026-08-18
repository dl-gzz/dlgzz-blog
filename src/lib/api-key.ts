import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import {
  apiKey,
  apiKeyPackGrant,
  apiRateLimitBucket,
  apiUsageEvent,
  oneworkDevice,
  oneworkEntitlement,
  user,
} from '@/db/schema';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';
import { and, desc, eq, gt, gte, isNull, lt, or, sql } from 'drizzle-orm';

const KEY_PREFIX = 'dk_live_';

function hashKey(rawKey: string) {
  return createHash('sha256').update(rawKey).digest('hex');
}

export interface IssuedApiKey {
  id: string;
  rawKey: string; // 只在签发时返回一次
  keyPrefix: string;
}

/** 为用户签发一把新 Key（明文只此一次返回）。 */
export async function issueApiKey({
  userId,
  name = '',
  monthlyQuota = 1000,
}: {
  userId: string;
  name?: string;
  monthlyQuota?: number;
}): Promise<IssuedApiKey> {
  const safeMonthlyQuota =
    Number.isFinite(monthlyQuota) && monthlyQuota >= 1
      ? Math.floor(monthlyQuota)
      : 1000;
  const db = await getDb();
  const secret = randomBytes(24).toString('base64url');
  const rawKey = `${KEY_PREFIX}${secret}`;
  const id = `apikey_${randomUUID()}`;
  const keyPrefix = `${KEY_PREFIX}${secret.slice(0, 6)}…`;

  await db.insert(apiKey).values({
    id,
    userId,
    name,
    keyHash: hashKey(rawKey),
    keyPrefix,
    monthlyQuota: safeMonthlyQuota,
  });

  return { id, rawKey, keyPrefix };
}

export interface VerifiedKey {
  id: string;
  userId: string;
  monthlyQuota: number;
}

export type KeyDenyReason =
  | 'missing'
  | 'invalid'
  | 'revoked'
  | 'entitlement_expired'
  | 'device_mismatch'
  | 'quota_exceeded';

export type KeyVerifyResult =
  | { ok: true; key: VerifiedKey; usedThisMonth: number }
  | { ok: false; reason: KeyDenyReason };

export type ApiUsageKind =
  | 'knowledge_query'
  | 'analytics_query'
  | 'capability_resolve'
  | 'skill_install';

export interface ApiUsageReservation {
  eventId: string;
  usedThisMonth: number;
}

export interface ApiRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetsAt: Date;
}

function extractRawKey(headerValue: string | null): string {
  if (!headerValue) return '';
  const trimmed = headerValue.trim();
  return trimmed.toLowerCase().startsWith('bearer ')
    ? trimmed.slice(7).trim()
    : trimmed;
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** one-worker-os 会员按北京时间自然月结算。 */
export function oneWorkMonthStart(now = new Date()): Date {
  const shanghai = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  return new Date(
    Date.UTC(shanghai.getUTCFullYear(), shanghai.getUTCMonth(), 1) -
      SHANGHAI_OFFSET_MS
  );
}

export function hashOneWorkDeviceId(value: string) {
  return createHash('sha256')
    .update(`onework-device-v1:${value.trim()}`)
    .digest('hex');
}

function shouldStoreUsageQueries() {
  return ['1', 'true', 'yes', 'on'].includes(
    (process.env.ONEWORK_STORE_USAGE_QUERIES || '').trim().toLowerCase()
  );
}

function usageQueryForStorage(value?: string) {
  return shouldStoreUsageQueries() ? (value || '').slice(0, 500) : '';
}

async function getEntitlementState(userId: string) {
  const db = await getDb();
  const now = new Date();
  const all = await db
    .select({
      knowledgePackId: oneworkEntitlement.knowledgePackId,
      monthlyQuota: oneworkEntitlement.monthlyQuota,
      status: oneworkEntitlement.status,
      expiresAt: oneworkEntitlement.expiresAt,
    })
    .from(oneworkEntitlement)
    .where(eq(oneworkEntitlement.userId, userId));
  return {
    all,
    active: all.filter(
      (entitlement) =>
        entitlement.status === 'active' &&
        (!entitlement.expiresAt ||
          entitlement.expiresAt.getTime() > now.getTime())
    ),
  };
}

function effectiveMonthlyQuota(entitlements: Array<{ monthlyQuota: number }>) {
  return entitlements.reduce(
    (maximum, item) => Math.max(maximum, Math.floor(item.monthlyQuota || 0)),
    0
  );
}

/**
 * 校验 Key、账号当前权益、设备绑定和账号共享月额度。
 * 权益与额度不再固化在安装时签发的 Key 上，因此续费/提额即时生效。
 */
export async function verifyApiKey(
  headerValue: string | null,
  deviceIdHeader?: string | null
): Promise<KeyVerifyResult> {
  const rawKey = extractRawKey(headerValue);
  if (!rawKey) return { ok: false, reason: 'missing' };

  const db = await getDb();
  const [row] = await db
    .select()
    .from(apiKey)
    .where(eq(apiKey.keyHash, hashKey(rawKey)))
    .limit(1);

  if (!row) return { ok: false, reason: 'invalid' };
  if (row.status !== 'active') return { ok: false, reason: 'revoked' };

  const [device] = await db
    .select({
      id: oneworkDevice.id,
      deviceHash: oneworkDevice.deviceHash,
      status: oneworkDevice.status,
      lastSeenAt: oneworkDevice.lastSeenAt,
    })
    .from(oneworkDevice)
    .where(eq(oneworkDevice.apiKeyId, row.id))
    .limit(1);

  // 只有安装器签发、已登记设备的 Key 才需要设备头；管理员/旧版 API Key 保持兼容。
  if (device) {
    if (device.status !== 'active') return { ok: false, reason: 'revoked' };
    const suppliedDeviceId = (deviceIdHeader || '').trim();
    if (
      !suppliedDeviceId ||
      hashOneWorkDeviceId(suppliedDeviceId) !== device.deviceHash
    ) {
      return { ok: false, reason: 'device_mismatch' };
    }

    if (
      !device.lastSeenAt ||
      Date.now() - device.lastSeenAt.getTime() > 5 * 60 * 1000
    ) {
      await db
        .update(oneworkDevice)
        .set({ lastSeenAt: new Date(), updatedAt: new Date() })
        .where(eq(oneworkDevice.id, device.id));
    }
  }

  const entitlementState = await getEntitlementState(row.userId);
  // 2026-08 以前签发的受管理 Key 只有 pack grant，没有账号权益行。
  // 仅在“从未有过权益”时保留兼容；一旦账号进入新权益体系，过期后必须拒绝。
  const monthlyQuota =
    entitlementState.all.length === 0
      ? Math.max(0, Math.floor(row.monthlyQuota || 0))
      : effectiveMonthlyQuota(entitlementState.active);
  if (
    (entitlementState.all.length > 0 && entitlementState.active.length === 0) ||
    monthlyQuota < 1
  ) {
    return { ok: false, reason: 'entitlement_expired' };
  }

  const [usage] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apiUsageEvent)
    .where(
      and(
        eq(apiUsageEvent.userId, row.userId),
        eq(apiUsageEvent.status, 'ok'),
        gte(apiUsageEvent.createdAt, oneWorkMonthStart())
      )
    );

  const usedThisMonth = usage?.count ?? 0;
  if (usedThisMonth >= monthlyQuota) {
    return { ok: false, reason: 'quota_exceeded' };
  }

  return {
    ok: true,
    key: { id: row.id, userId: row.userId, monthlyQuota },
    usedThisMonth,
  };
}

/** Key 是否可访问账号当前有效权益中的知识包。旧的无权益 Key 才回退到历史 grant。 */
export async function keyHasPackAccess(
  apiKeyId: string,
  packId: string
): Promise<boolean> {
  const db = await getDb();
  const [key] = await db
    .select({ userId: apiKey.userId })
    .from(apiKey)
    .where(eq(apiKey.id, apiKeyId))
    .limit(1);
  if (!key) return false;

  const allEntitlements = await db
    .select({
      knowledgePackId: oneworkEntitlement.knowledgePackId,
      status: oneworkEntitlement.status,
      expiresAt: oneworkEntitlement.expiresAt,
    })
    .from(oneworkEntitlement)
    .where(eq(oneworkEntitlement.userId, key.userId));

  if (allEntitlements.length > 0) {
    const now = Date.now();
    return allEntitlements.some(
      (entitlement) =>
        entitlement.status === 'active' &&
        (!entitlement.expiresAt || entitlement.expiresAt.getTime() > now) &&
        (entitlement.knowledgePackId === packId ||
          entitlement.knowledgePackId === ALL_PACKS_GRANT)
    );
  }

  const grants = await db
    .select({ id: apiKeyPackGrant.id, expiresAt: apiKeyPackGrant.expiresAt })
    .from(apiKeyPackGrant)
    .where(
      and(
        eq(apiKeyPackGrant.apiKeyId, apiKeyId),
        or(
          eq(apiKeyPackGrant.knowledgePackId, packId),
          eq(apiKeyPackGrant.knowledgePackId, ALL_PACKS_GRANT)
        )
      )
    );

  return grants.some(
    (grant) => !grant.expiresAt || grant.expiresAt.getTime() >= Date.now()
  );
}

/** 授权一个 Key 访问某知识包（幂等）。 */
export async function grantPackToKey({
  apiKeyId,
  packId,
  source = 'purchase',
  expiresAt = null,
}: {
  apiKeyId: string;
  packId: string;
  source?: string;
  expiresAt?: Date | null;
}) {
  const db = await getDb();
  await db
    .insert(apiKeyPackGrant)
    .values({
      id: `grant_${randomUUID()}`,
      apiKeyId,
      knowledgePackId: packId,
      source,
      expiresAt,
    })
    .onConflictDoNothing({
      target: [apiKeyPackGrant.apiKeyId, apiKeyPackGrant.knowledgePackId],
    });
}

/**
 * 对不计入月度检索额度的公开 API 做账号级原子固定窗口限流。
 * 每个账号/能力只保留一行，避免限流数据随请求无限增长。
 */
export async function reserveApiKeyRateLimit({
  userId,
  kind,
  limit,
  windowMs = 60_000,
}: {
  userId: string;
  kind: string;
  limit: number;
  windowMs?: number;
}): Promise<ApiRateLimitResult> {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 10_000));
  const safeWindowMs = Math.max(
    1_000,
    Math.min(Math.floor(windowMs), 24 * 60 * 60 * 1000)
  );
  const now = new Date();
  const bucketStart = new Date(
    Math.floor(now.getTime() / safeWindowMs) * safeWindowMs
  );
  const resetsAt = new Date(bucketStart.getTime() + safeWindowMs);
  const db = await getDb();

  const rows = await db
    .insert(apiRateLimitBucket)
    .values({
      id: `rate_limit_${randomUUID()}`,
      userId,
      kind: kind.slice(0, 80),
      windowStart: bucketStart,
      requestCount: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [apiRateLimitBucket.userId, apiRateLimitBucket.kind],
      set: {
        windowStart: bucketStart,
        requestCount: sql<number>`CASE
          WHEN ${apiRateLimitBucket.windowStart} < ${bucketStart.toISOString()}::timestamp THEN 1
          ELSE ${apiRateLimitBucket.requestCount} + 1
        END`,
        updatedAt: now,
      },
      setWhere: or(
        lt(apiRateLimitBucket.windowStart, bucketStart),
        lt(apiRateLimitBucket.requestCount, safeLimit)
      ),
    })
    .returning({ requestCount: apiRateLimitBucket.requestCount });

  const requestCount = rows[0]?.requestCount;
  if (requestCount === undefined) {
    return { allowed: false, limit: safeLimit, remaining: 0, resetsAt };
  }
  return {
    allowed: true,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - requestCount),
    resetsAt,
  };
}

/**
 * Atomically reserve one metered request. The row lock closes the race where
 * concurrent requests could all pass verifyApiKey before any one of them was
 * recorded. Pending reservations expire from quota accounting after ten
 * minutes so a crashed request cannot permanently consume a user's quota.
 * Usage is counted by user rather than apiKeyId so a customer cannot multiply
 * the monthly allowance by installing the Skill on multiple devices.
 */
export async function reserveApiKeyUsage(event: {
  apiKeyId: string;
  userId: string;
  monthlyQuota: number;
  kind: ApiUsageKind;
  knowledgePackId?: string | null;
  serviceId?: string | null;
  query?: string;
}): Promise<ApiUsageReservation | null> {
  const db = await getDb();
  const now = new Date();
  const pendingSince = new Date(now.getTime() - 10 * 60 * 1000);

  return db.transaction(async (tx) => {
    // Key 与 OAuth/MCP 两条通道都锁同一个 user 行，才能共享
    // 一份月度额度并防止跨通道并发超额。
    const [account] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, event.userId))
      .for('update')
      .limit(1);
    if (!account) return null;

    const keys = await tx
      .select({ id: apiKey.id, status: apiKey.status })
      .from(apiKey)
      .where(eq(apiKey.userId, event.userId))
      .for('update');
    const key = keys.find((item) => item.id === event.apiKeyId);

    if (!key || key.status !== 'active') return null;

    const [usage] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(apiUsageEvent)
      .where(
        and(
          eq(apiUsageEvent.userId, event.userId),
          gte(apiUsageEvent.createdAt, oneWorkMonthStart(now)),
          or(
            eq(apiUsageEvent.status, 'ok'),
            and(
              eq(apiUsageEvent.status, 'pending'),
              gte(apiUsageEvent.createdAt, pendingSince)
            )
          )
        )
      );

    const usedThisMonth = usage?.count ?? 0;
    if (event.monthlyQuota < 1 || usedThisMonth >= event.monthlyQuota) {
      return null;
    }

    const eventId = `usage_${randomUUID()}`;
    await tx.insert(apiUsageEvent).values({
      id: eventId,
      apiKeyId: key.id,
      userId: event.userId,
      kind: event.kind,
      knowledgePackId: event.knowledgePackId ?? null,
      serviceId: event.serviceId ?? null,
      query: usageQueryForStorage(event.query),
      status: 'pending',
      createdAt: now,
    });

    return { eventId, usedThisMonth };
  });
}

/**
 * OAuth/MCP 按账号预留一次计量。OAuth 不再绑定某个设备 Key，
 * 因此通过锁定 user 行串行化同一账号的并发请求。它与旧 Key
 * 通道共用 api_usage_event，所有客户端共享同一份月度额度。
 */
export async function reserveOneWorkUserUsage(event: {
  userId: string;
  monthlyQuota: number;
  kind: ApiUsageKind;
  knowledgePackId?: string | null;
  serviceId?: string | null;
  query?: string;
}): Promise<ApiUsageReservation | null> {
  const db = await getDb();
  const now = new Date();
  const pendingSince = new Date(now.getTime() - 10 * 60 * 1000);

  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, event.userId))
      .for('update')
      .limit(1);
    if (!account) return null;

    const [usage] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(apiUsageEvent)
      .where(
        and(
          eq(apiUsageEvent.userId, event.userId),
          gte(apiUsageEvent.createdAt, oneWorkMonthStart(now)),
          or(
            eq(apiUsageEvent.status, 'ok'),
            and(
              eq(apiUsageEvent.status, 'pending'),
              gte(apiUsageEvent.createdAt, pendingSince)
            )
          )
        )
      );

    const usedThisMonth = usage?.count ?? 0;
    if (event.monthlyQuota < 1 || usedThisMonth >= event.monthlyQuota) {
      return null;
    }

    const eventId = `usage_${randomUUID()}`;
    await tx.insert(apiUsageEvent).values({
      id: eventId,
      apiKeyId: null,
      userId: event.userId,
      kind: event.kind,
      knowledgePackId: event.knowledgePackId ?? null,
      serviceId: event.serviceId ?? null,
      query: usageQueryForStorage(event.query),
      status: 'pending',
      createdAt: now,
    });

    return { eventId, usedThisMonth };
  });
}

/** Complete a previously reserved request without creating a second billable row. */
export async function completeApiKeyUsage(event: {
  eventId: string;
  status: 'ok' | 'error';
  resultCount?: number;
  embeddingTokens?: number;
  latencyMs?: number;
}) {
  try {
    const db = await getDb();
    const [updated] = await db
      .update(apiUsageEvent)
      .set({
        status: event.status,
        resultCount: event.resultCount ?? 0,
        embeddingTokens: event.embeddingTokens ?? 0,
        latencyMs: event.latencyMs ?? 0,
      })
      .where(
        and(
          eq(apiUsageEvent.id, event.eventId),
          eq(apiUsageEvent.status, 'pending')
        )
      )
      .returning({ apiKeyId: apiUsageEvent.apiKeyId });

    if (updated?.apiKeyId) {
      await db
        .update(apiKey)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(apiKey.id, updated.apiKeyId));
    }
  } catch (error) {
    console.warn('[api-key] completeUsage failed:', error);
  }
}

/** 记一条用量事件（算账的地基）。绝不抛错影响主流程。 */
export async function recordUsage(event: {
  apiKeyId?: string | null;
  userId?: string | null;
  kind: ApiUsageKind;
  knowledgePackId?: string | null;
  serviceId?: string | null;
  query?: string;
  resultCount?: number;
  embeddingTokens?: number;
  latencyMs?: number;
  status?: 'ok' | 'denied' | 'error';
}) {
  try {
    const db = await getDb();
    await db.insert(apiUsageEvent).values({
      id: `usage_${randomUUID()}`,
      apiKeyId: event.apiKeyId ?? null,
      userId: event.userId ?? null,
      kind: event.kind,
      knowledgePackId: event.knowledgePackId ?? null,
      serviceId: event.serviceId ?? null,
      query: usageQueryForStorage(event.query),
      resultCount: event.resultCount ?? 0,
      embeddingTokens: event.embeddingTokens ?? 0,
      latencyMs: event.latencyMs ?? 0,
      status: event.status ?? 'ok',
    });
    if (event.apiKeyId && event.status !== 'error') {
      await db
        .update(apiKey)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(apiKey.id, event.apiKeyId));
    }
  } catch (error) {
    console.warn('[api-key] recordUsage failed:', error);
  }
}

export async function listUserApiKeys(userId: string) {
  const db = await getDb();
  return db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      status: apiKey.status,
      monthlyQuota: apiKey.monthlyQuota,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .where(eq(apiKey.userId, userId))
    .orderBy(desc(apiKey.createdAt));
}

export async function revokeApiKey(userId: string, keyId: string) {
  const db = await getDb();
  const result = await db
    .update(apiKey)
    .set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(apiKey.id, keyId), eq(apiKey.userId, userId)))
    .returning({ id: apiKey.id });
  return result.length > 0;
}
