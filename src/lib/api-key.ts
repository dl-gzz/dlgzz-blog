import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import { apiKey, apiKeyPackGrant, apiUsageEvent } from '@/db/schema';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

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
    monthlyQuota,
  });

  return { id, rawKey, keyPrefix };
}

export interface VerifiedKey {
  id: string;
  userId: string;
  monthlyQuota: number;
}

export type KeyDenyReason = 'missing' | 'invalid' | 'revoked' | 'quota_exceeded';

export type KeyVerifyResult =
  | { ok: true; key: VerifiedKey; usedThisMonth: number }
  | { ok: false; reason: KeyDenyReason };

function extractRawKey(headerValue: string | null): string {
  if (!headerValue) return '';
  const trimmed = headerValue.trim();
  return trimmed.toLowerCase().startsWith('bearer ')
    ? trimmed.slice(7).trim()
    : trimmed;
}

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** 校验 Key：存在、未吊销、当月未超额。返回时附带当月已用量。 */
export async function verifyApiKey(headerValue: string | null): Promise<KeyVerifyResult> {
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

  const [usage] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apiUsageEvent)
    .where(
      and(
        eq(apiUsageEvent.apiKeyId, row.id),
        eq(apiUsageEvent.status, 'ok'),
        gte(apiUsageEvent.createdAt, monthStart())
      )
    );

  const usedThisMonth = usage?.count ?? 0;
  if (row.monthlyQuota > 0 && usedThisMonth >= row.monthlyQuota) {
    return { ok: false, reason: 'quota_exceeded' };
  }

  return {
    ok: true,
    key: { id: row.id, userId: row.userId, monthlyQuota: row.monthlyQuota },
    usedThisMonth,
  };
}

/** Key 是否被授权访问某个知识包（未过期）。 */
export async function keyHasPackAccess(apiKeyId: string, packId: string): Promise<boolean> {
  const db = await getDb();
  const [grant] = await db
    .select({ id: apiKeyPackGrant.id, expiresAt: apiKeyPackGrant.expiresAt })
    .from(apiKeyPackGrant)
    .where(
      and(eq(apiKeyPackGrant.apiKeyId, apiKeyId), eq(apiKeyPackGrant.knowledgePackId, packId))
    )
    .limit(1);

  if (!grant) return false;
  if (grant.expiresAt && grant.expiresAt.getTime() < Date.now()) return false;
  return true;
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

/** 记一条用量事件（算账的地基）。绝不抛错影响主流程。 */
export async function recordUsage(event: {
  apiKeyId?: string | null;
  userId?: string | null;
  kind: 'knowledge_query' | 'analytics_query' | 'skill_install';
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
      query: (event.query ?? '').slice(0, 500),
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
