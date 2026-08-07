import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import {
  apiKey,
  apiKeyPackGrant,
  oneworkActivationCode,
  oneworkDevice,
  oneworkEntitlement,
  oneworkInstallToken,
} from '@/db/schema';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';

/** 目前向用户开放的受治理知识包。新增产品时只需扩展这个白名单。 */
export const ONEWORK_PUBLIC_PACKS = [
  'onework-workbuddy-v1',
  'xhs-open-shop-v1',
  'xhs-operations-v1',
] as const;

export type OneWorkPublicPack = (typeof ONEWORK_PUBLIC_PACKS)[number];

export class OneWorkAccessError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'OneWorkAccessError';
  }
}

function normalizeSecret(value: string) {
  return value.trim().toUpperCase();
}

function hashSecret(value: string) {
  return createHash('sha256').update(normalizeSecret(value)).digest('hex');
}

function hashDeviceId(value: string) {
  return createHash('sha256')
    .update(`onework-device-v1:${value.trim()}`)
    .digest('hex');
}

function addDays(date: Date, days: number) {
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(date.getTime() + Math.round(days) * 24 * 60 * 60 * 1000);
}

function normalizePackIds(packIds: string[]) {
  const allowed = new Set<string>(ONEWORK_PUBLIC_PACKS);
  const normalized = [...new Set(
    packIds
      .map((packId) => packId.trim())
      .filter((packId) => allowed.has(packId))
  )];
  if (normalized.length === 0) {
    throw new OneWorkAccessError('至少选择一个有效的 OneWorkOS 知识包', 'INVALID_PACKS');
  }
  return normalized;
}

function makeActivationCode() {
  return `OWOS-${randomBytes(18).toString('base64url').toUpperCase()}`;
}

function makeInstallToken() {
  return `owinst_${randomBytes(28).toString('base64url')}`;
}

function makeApiKey() {
  const secret = randomBytes(24).toString('base64url');
  const rawKey = `dk_live_${secret}`;
  return {
    rawKey,
    keyHash: createHash('sha256').update(rawKey).digest('hex'),
    keyPrefix: `dk_live_${secret.slice(0, 6)}…`,
  };
}

function getExpiryForEntitlement(
  currentExpiry: Date | null,
  requestedExpiry: Date | null,
  now: Date
) {
  // null 表示不过期；一旦已有永久权益，就不应被一次试用覆盖。
  if (currentExpiry === null && requestedExpiry === null) return null;
  if (currentExpiry === null) return null;
  if (requestedExpiry === null) return currentExpiry;
  return new Date(Math.max(currentExpiry.getTime(), requestedExpiry.getTime(), now.getTime()));
}

async function insertApiKeyAndGrants({
  tx,
  userId,
  packIds,
  monthlyQuota,
  expiresAt,
  packExpiries,
  name,
  source,
  deviceId,
  deviceName,
  platform,
}: {
  tx: any;
  userId: string;
  packIds: string[];
  monthlyQuota: number;
  expiresAt: Date | null;
  packExpiries?: Record<string, Date | null>;
  name: string;
  source: string;
  deviceId: string;
  deviceName: string;
  platform: string;
}) {
  const { rawKey, keyHash, keyPrefix } = makeApiKey();
  const apiKeyId = `apikey_${randomUUID()}`;
  const now = new Date();

  await tx.insert(apiKey).values({
    id: apiKeyId,
    userId,
    name,
    keyHash,
    keyPrefix,
    monthlyQuota: Math.max(0, Math.floor(monthlyQuota || 1000)),
  });

  for (const packId of packIds) {
    await tx
      .insert(apiKeyPackGrant)
      .values({
        id: `grant_${randomUUID()}`,
        apiKeyId,
        knowledgePackId: packId,
        source,
        expiresAt: packExpiries?.[packId] ?? expiresAt,
      })
      .onConflictDoNothing({
        target: [apiKeyPackGrant.apiKeyId, apiKeyPackGrant.knowledgePackId],
      });
  }

  await tx.insert(oneworkDevice).values({
    id: `device_${randomUUID()}`,
    userId,
    apiKeyId,
    deviceHash: hashDeviceId(deviceId),
    deviceName: deviceName.slice(0, 80),
    platform: platform.slice(0, 30),
    status: 'active',
    lastSeenAt: now,
  });

  return { apiKeyId, rawKey, keyPrefix };
}

/** 管理员签发兑换码；原始码只返回一次。 */
export async function issueOneWorkActivationCode({
  packIds,
  trialDays = 30,
  monthlyQuota = 1000,
  maxRedemptions = 1,
  label = '',
  source = 'manual',
  expiresAt = null,
  createdByUserId,
}: {
  packIds: string[];
  trialDays?: number;
  monthlyQuota?: number;
  maxRedemptions?: number;
  label?: string;
  source?: string;
  expiresAt?: Date | null;
  createdByUserId?: string | null;
}) {
  const safePackIds = normalizePackIds(packIds);
  const rawCode = makeActivationCode();
  const codePrefix = `${rawCode.slice(0, 13)}…`;
  const db = await getDb();

  await db.insert(oneworkActivationCode).values({
    id: `activation_${randomUUID()}`,
    codeHash: hashSecret(rawCode),
    codePrefix,
    label: label.slice(0, 120),
    source: source.slice(0, 30),
    packIds: safePackIds,
    trialDays: Math.max(0, Math.floor(trialDays)),
    monthlyQuota: Math.max(0, Math.floor(monthlyQuota)),
    maxRedemptions: Math.max(1, Math.floor(maxRedemptions)),
    expiresAt,
    createdByUserId: createdByUserId ?? null,
  });

  return { rawCode, codePrefix, packIds: safePackIds };
}

/**
 * 给网站内购成功的账号直接授予权益。外部平台成交仍使用兑换码；
 * 只有把价格 ID 放入 ONEWORK_PRICE_IDS 后，支付回调才会走这里。
 */
export async function grantOneWorkEntitlements({
  userId,
  packIds,
  trialDays = 365,
  monthlyQuota = 1000,
  source = 'payment',
  externalOrderId,
}: {
  userId: string;
  packIds: string[];
  trialDays?: number;
  monthlyQuota?: number;
  source?: string;
  externalOrderId?: string | null;
}) {
  const safePackIds = normalizePackIds(packIds);
  const db = await getDb();
  const now = new Date();
  const expiresAt = addDays(now, trialDays);

  await db.transaction(async (tx) => {
    for (const packId of safePackIds) {
      if (externalOrderId) {
        const [alreadyGranted] = await tx
          .select({ id: oneworkEntitlement.id })
          .from(oneworkEntitlement)
          .where(
            and(
              eq(oneworkEntitlement.userId, userId),
              eq(oneworkEntitlement.knowledgePackId, packId),
              eq(oneworkEntitlement.externalOrderId, externalOrderId)
            )
          )
          .limit(1);
        if (alreadyGranted) continue;
      }

      const [existing] = await tx
        .select()
        .from(oneworkEntitlement)
        .where(
          and(
            eq(oneworkEntitlement.userId, userId),
            eq(oneworkEntitlement.knowledgePackId, packId)
          )
        )
        .limit(1);
      const mergedExpiry = getExpiryForEntitlement(
        existing ? existing.expiresAt : expiresAt,
        expiresAt,
        now
      );

      await tx
        .insert(oneworkEntitlement)
        .values({
          id: `entitlement_${randomUUID()}`,
          userId,
          knowledgePackId: packId,
          source,
          status: 'active',
          monthlyQuota: Math.max(0, Math.floor(monthlyQuota)),
          startsAt: existing?.startsAt ?? now,
          expiresAt: mergedExpiry,
          externalOrderId: externalOrderId ?? null,
        })
        .onConflictDoUpdate({
          target: [oneworkEntitlement.userId, oneworkEntitlement.knowledgePackId],
          set: {
            status: 'active',
            monthlyQuota: Math.max(existing?.monthlyQuota ?? 0, monthlyQuota),
            expiresAt: mergedExpiry,
            externalOrderId: externalOrderId ?? existing?.externalOrderId ?? null,
            updatedAt: now,
          },
        });
    }
  });

  return { packIds: safePackIds, expiresAt, monthlyQuota };
}

export function shouldGrantOneWorkForPrice(priceId: string) {
  const configured = (process.env.ONEWORK_PRICE_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.includes(priceId);
}

export function getOneWorkPaymentPacks() {
  const configured = (process.env.ONEWORK_PACK_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return normalizePackIds(
    configured.length > 0 ? configured : ['onework-workbuddy-v1']
  );
}

/** 用户兑换码，返回一把仅显示一次的设备 Key。 */
export async function redeemOneWorkActivation({
  userId,
  code,
  deviceId,
  deviceName = '',
  platform = 'unknown',
}: {
  userId: string;
  code: string;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
}) {
  const rawCode = code.trim();
  if (!rawCode) throw new OneWorkAccessError('请输入兑换码', 'MISSING_CODE');

  const db = await getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [activation] = await tx
      .select()
      .from(oneworkActivationCode)
      .where(eq(oneworkActivationCode.codeHash, hashSecret(rawCode)))
      .for('update')
      .limit(1);

    if (!activation) {
      throw new OneWorkAccessError('兑换码无效，请检查是否输入正确', 'INVALID_CODE', 404);
    }
    if (activation.status !== 'active') {
      throw new OneWorkAccessError('兑换码已使用或已失效', 'CODE_NOT_ACTIVE', 409);
    }
    if (activation.expiresAt && activation.expiresAt.getTime() <= now.getTime()) {
      throw new OneWorkAccessError('兑换码已过期', 'CODE_EXPIRED', 410);
    }
    if (activation.redeemedCount >= activation.maxRedemptions) {
      throw new OneWorkAccessError('兑换码已达到使用次数上限', 'CODE_EXHAUSTED', 409);
    }

    const packIds = normalizePackIds(activation.packIds);
    const expiresAt = addDays(now, activation.trialDays);
    const existingEntitlements = await tx
      .select()
      .from(oneworkEntitlement)
      .where(eq(oneworkEntitlement.userId, userId));

    for (const packId of packIds) {
      const existing = existingEntitlements.find((item) => item.knowledgePackId === packId);
      const mergedExpiry = getExpiryForEntitlement(
        existing ? existing.expiresAt : expiresAt,
        expiresAt,
        now
      );
      await tx
        .insert(oneworkEntitlement)
        .values({
          id: `entitlement_${randomUUID()}`,
          userId,
          knowledgePackId: packId,
          source: activation.source,
          status: 'active',
          monthlyQuota: activation.monthlyQuota,
          startsAt: existing?.startsAt ?? now,
          expiresAt: mergedExpiry,
        })
        .onConflictDoUpdate({
          target: [oneworkEntitlement.userId, oneworkEntitlement.knowledgePackId],
          set: {
            status: 'active',
            monthlyQuota: Math.max(existing?.monthlyQuota ?? 0, activation.monthlyQuota),
            expiresAt: mergedExpiry,
            updatedAt: now,
          },
        });
    }

    const issued = await insertApiKeyAndGrants({
      tx,
      userId,
      packIds,
      monthlyQuota: activation.monthlyQuota,
      expiresAt,
      name: `${activation.label || 'OneWorkOS'} · ${platform}`,
      source: activation.source,
      deviceId: deviceId?.trim() || randomUUID(),
      deviceName,
      platform,
    });

    const nextCount = activation.redeemedCount + 1;
    await tx
      .update(oneworkActivationCode)
      .set({
        redeemedCount: nextCount,
        status: nextCount >= activation.maxRedemptions ? 'redeemed' : 'active',
        redeemedByUserId: userId,
        redeemedAt: now,
        updatedAt: now,
      })
      .where(eq(oneworkActivationCode.id, activation.id));

    return {
      ...issued,
      packIds,
      expiresAt,
      monthlyQuota: activation.monthlyQuota,
      deviceName,
      platform,
    };
  });
}

/** 生成十分钟有效的一次性安装会话，不把 API Key 放进 URL。 */
export async function createOneWorkInstallToken({
  userId,
  platform = 'unknown',
  deviceName = '',
}: {
  userId: string;
  platform?: string;
  deviceName?: string;
}) {
  const rawToken = makeInstallToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const db = await getDb();
  await db.insert(oneworkInstallToken).values({
    id: `install_${randomUUID()}`,
    tokenHash: hashSecret(rawToken),
    userId,
    platform: platform.slice(0, 30),
    deviceName: deviceName.slice(0, 80),
    expiresAt,
  });
  return { rawToken, expiresAt };
}

/** 安装器消费短时会话并领取当前用户所有有效知识包。 */
export async function claimOneWorkInstallToken({
  token,
  deviceId,
  deviceName = '',
  platform = 'unknown',
}: {
  token: string;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
}) {
  if (!token.trim()) throw new OneWorkAccessError('缺少安装授权', 'MISSING_INSTALL_TOKEN');
  const db = await getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [install] = await tx
      .select()
      .from(oneworkInstallToken)
      .where(eq(oneworkInstallToken.tokenHash, hashSecret(token)))
      .for('update')
      .limit(1);
    if (!install) throw new OneWorkAccessError('安装授权无效', 'INVALID_INSTALL_TOKEN', 404);
    if (install.consumedAt) throw new OneWorkAccessError('安装授权已使用', 'INSTALL_TOKEN_CONSUMED', 409);
    if (install.expiresAt.getTime() <= now.getTime()) {
      throw new OneWorkAccessError('安装授权已过期，请在网站重新生成', 'INSTALL_TOKEN_EXPIRED', 410);
    }

    const entitlements = await tx
      .select()
      .from(oneworkEntitlement)
      .where(
        and(
          eq(oneworkEntitlement.userId, install.userId),
          eq(oneworkEntitlement.status, 'active'),
          or(isNull(oneworkEntitlement.expiresAt), gt(oneworkEntitlement.expiresAt, now))
        )
      );
    const packIds = normalizePackIds(entitlements.map((item) => item.knowledgePackId));
    const packExpiries = Object.fromEntries(
      entitlements.map((item) => [item.knowledgePackId, item.expiresAt])
    ) as Record<string, Date | null>;
    const earliestExpiry = entitlements.reduce<Date | null>((current, item) => {
      if (!item.expiresAt) return null;
      if (!current || item.expiresAt.getTime() < current.getTime()) return item.expiresAt;
      return current;
    }, null);
    const monthlyQuota = entitlements.reduce(
      (max, item) => Math.max(max, item.monthlyQuota || 0),
      1000
    );

    const issued = await insertApiKeyAndGrants({
      tx,
      userId: install.userId,
      packIds,
      monthlyQuota,
      expiresAt: earliestExpiry,
      packExpiries,
      name: `${deviceName || install.deviceName || 'OneWorkOS'} · ${platform || install.platform}`,
      source: 'install',
      deviceId: deviceId?.trim() || randomUUID(),
      deviceName: deviceName || install.deviceName,
      platform: platform || install.platform,
    });

    await tx
      .update(oneworkInstallToken)
      .set({ consumedAt: now })
      .where(eq(oneworkInstallToken.id, install.id));

    return { ...issued, packIds, expiresAt: earliestExpiry, monthlyQuota };
  });
}

export async function listOneWorkAccess(userId: string) {
  const db = await getDb();
  const [entitlements, devices, keys] = await Promise.all([
    db
      .select()
      .from(oneworkEntitlement)
      .where(eq(oneworkEntitlement.userId, userId))
      .orderBy(desc(oneworkEntitlement.createdAt)),
    db
      .select({
        id: oneworkDevice.id,
        deviceName: oneworkDevice.deviceName,
        platform: oneworkDevice.platform,
        status: oneworkDevice.status,
        lastSeenAt: oneworkDevice.lastSeenAt,
        createdAt: oneworkDevice.createdAt,
      })
      .from(oneworkDevice)
      .where(eq(oneworkDevice.userId, userId))
      .orderBy(desc(oneworkDevice.createdAt)),
    db
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
      .orderBy(desc(apiKey.createdAt)),
  ]);

  return { entitlements, devices, keys };
}

export function isOneWorkPublicPack(value: string): value is OneWorkPublicPack {
  return (ONEWORK_PUBLIC_PACKS as readonly string[]).includes(value);
}
