import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import {
  apiKey,
  apiKeyPackGrant,
  apiUsageEvent,
  oneworkActivationCode,
  oneworkDevice,
  oneworkEntitlement,
  oneworkEntitlementGrant,
  oneworkInstallToken,
  user,
} from '@/db/schema';
import { hashOneWorkDeviceId, oneWorkMonthStart } from '@/lib/api-key';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';
import { findPlanByPriceId } from '@/lib/price-plan';
import { and, desc, eq, gt, gte, inArray, isNull, or, sql } from 'drizzle-orm';

/** 现有知识包仍保留用于兼容旧兑换码；新授权统一使用全量权限。 */
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

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function positiveInteger(value: number, field: string, maximum = 1_000_000) {
  const normalized = Math.floor(value);
  if (!Number.isFinite(value) || normalized < 1 || normalized > maximum) {
    throw new OneWorkAccessError(
      `${field}必须是 1 到 ${maximum} 之间的整数`,
      'INVALID_LIMIT'
    );
  }
  return normalized;
}

function oneWorkDeviceLimit() {
  const configured = Number(process.env.ONEWORK_DEVICE_LIMIT || 3);
  return Number.isInteger(configured) && configured >= 1 && configured <= 20
    ? configured
    : 3;
}

function normalizePackIds(packIds: string[]) {
  if (packIds.some((packId) => packId.trim() === ALL_PACKS_GRANT)) {
    return [ALL_PACKS_GRANT];
  }
  const allowed = new Set<string>(ONEWORK_PUBLIC_PACKS);
  const normalized = [
    ...new Set(
      packIds
        .map((packId) => packId.trim())
        .filter((packId) => allowed.has(packId))
    ),
  ];
  if (normalized.length === 0) {
    throw new OneWorkAccessError(
      '至少选择一个有效的 OneWorkOS 知识包',
      'INVALID_PACKS'
    );
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

function extendEntitlementExpiry(
  currentExpiry: Date | null | undefined,
  days: number,
  now: Date
) {
  // null 仅表示已存在的永久权益；undefined 表示首次开通。
  if (currentExpiry === null) return null;
  const base =
    currentExpiry && currentExpiry.getTime() > now.getTime()
      ? currentExpiry
      : now;
  return addDays(base, days);
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
  registerDevice = true,
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
  registerDevice?: boolean;
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
    monthlyQuota: Math.max(1, Math.floor(monthlyQuota)),
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

  if (registerDevice) {
    // Serialize device issuance per account. The same computer may run the
    // installer more than once; it must update one device row rather than
    // creating a new active device on every install.
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .for('update')
      .limit(1);

    const deviceHash = hashOneWorkDeviceId(deviceId);
    const existingDevices: Array<{
      id: string;
      apiKeyId: string;
      status: string;
    }> = await tx
      .select({
        id: oneworkDevice.id,
        apiKeyId: oneworkDevice.apiKeyId,
        status: oneworkDevice.status,
      })
      .from(oneworkDevice)
      .where(
        and(
          eq(oneworkDevice.userId, userId),
          eq(oneworkDevice.deviceHash, deviceHash)
        )
      )
      .orderBy(desc(oneworkDevice.createdAt), desc(oneworkDevice.id))
      .for('update');

    const oldApiKeyIds = existingDevices
      .map((device) => device.apiKeyId)
      .filter((oldApiKeyId) => oldApiKeyId !== apiKeyId);
    if (oldApiKeyIds.length > 0) {
      await tx
        .update(apiKey)
        .set({ status: 'revoked', revokedAt: now, updatedAt: now })
        .where(inArray(apiKey.id, oldApiKeyIds));
    }

    const canonicalDevice = existingDevices[0];
    if (!canonicalDevice || canonicalDevice.status !== 'active') {
      const activeDevices: Array<{ id: string }> = await tx
        .select({ id: oneworkDevice.id })
        .from(oneworkDevice)
        .where(
          and(
            eq(oneworkDevice.userId, userId),
            eq(oneworkDevice.status, 'active')
          )
        )
        .for('update');
      const deviceLimit = oneWorkDeviceLimit();
      if (activeDevices.length >= deviceLimit) {
        throw new OneWorkAccessError(
          `已达到 ${deviceLimit} 台设备上限，请先在网站撤销不再使用的设备`,
          'DEVICE_LIMIT_REACHED',
          409
        );
      }
    }

    if (canonicalDevice) {
      const duplicateDeviceIds = existingDevices
        .slice(1)
        .map((device) => device.id);
      if (duplicateDeviceIds.length > 0) {
        await tx
          .delete(oneworkDevice)
          .where(inArray(oneworkDevice.id, duplicateDeviceIds));
      }
      await tx
        .update(oneworkDevice)
        .set({
          apiKeyId,
          deviceName: deviceName.slice(0, 80),
          platform: platform.slice(0, 30),
          status: 'active',
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(oneworkDevice.id, canonicalDevice.id));
    } else {
      await tx.insert(oneworkDevice).values({
        id: `device_${randomUUID()}`,
        userId,
        apiKeyId,
        deviceHash,
        deviceName: deviceName.slice(0, 80),
        platform: platform.slice(0, 30),
        status: 'active',
        lastSeenAt: now,
      });
    }
  }

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
  const safeTrialDays = positiveInteger(trialDays, '权益天数', 3650);
  const safeMonthlyQuota = positiveInteger(
    monthlyQuota,
    '每月额度',
    10_000_000
  );
  if (maxRedemptions !== 1) {
    throw new OneWorkAccessError(
      '每枚兑换码只能绑定一个账号一次',
      'SHARED_ACTIVATION_CODE_NOT_ALLOWED'
    );
  }
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
    trialDays: safeTrialDays,
    monthlyQuota: safeMonthlyQuota,
    maxRedemptions: 1,
    expiresAt,
    createdByUserId: createdByUserId ?? null,
  });

  return { rawCode, codePrefix, packIds: safePackIds };
}

/**
 * 给网站内购成功的账号直接授予权益。外部平台成交仍使用兑换码；
 * 网站 OneWorkOS 会员成交后直接授予全量知识库权益。
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
  const safeTrialDays = positiveInteger(trialDays, '权益天数', 3650);
  const safeMonthlyQuota = positiveInteger(
    monthlyQuota,
    '每月额度',
    10_000_000
  );
  const db = await getDb();
  const now = new Date();
  const requestedExpiresAt = addDays(now, safeTrialDays);

  await db.transaction(async (tx) => {
    // 同一账号的不同支付订单也必须串行续期，否则两个回调
    // 可能都从同一个旧到期时间计算，导致少发一期。
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .for('update')
      .limit(1);

    for (const packId of safePackIds) {
      if (externalOrderId) {
        const insertedGrant = await tx
          .insert(oneworkEntitlementGrant)
          .values({
            id: `entitlement_grant_${randomUUID()}`,
            userId,
            knowledgePackId: packId,
            externalOrderId,
            source,
            grantedAt: now,
          })
          .onConflictDoNothing({
            target: [
              oneworkEntitlementGrant.userId,
              oneworkEntitlementGrant.externalOrderId,
              oneworkEntitlementGrant.knowledgePackId,
            ],
          })
          .returning({ id: oneworkEntitlementGrant.id });
        if (insertedGrant.length === 0) continue;
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
      const mergedExpiry = extendEntitlementExpiry(
        existing ? existing.expiresAt : undefined,
        safeTrialDays,
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
          monthlyQuota: safeMonthlyQuota,
          startsAt: existing?.startsAt ?? now,
          expiresAt: mergedExpiry,
          externalOrderId: externalOrderId ?? null,
        })
        .onConflictDoUpdate({
          target: [
            oneworkEntitlement.userId,
            oneworkEntitlement.knowledgePackId,
          ],
          set: {
            status: 'active',
            monthlyQuota: Math.max(
              existing?.monthlyQuota ?? 0,
              safeMonthlyQuota
            ),
            expiresAt: mergedExpiry,
            externalOrderId:
              externalOrderId ?? existing?.externalOrderId ?? null,
            updatedAt: now,
          },
        });
    }

    await tx
      .update(apiKey)
      .set({
        monthlyQuota: sql`greatest(${apiKey.monthlyQuota}, ${safeMonthlyQuota})`,
        updatedAt: now,
      })
      .where(and(eq(apiKey.userId, userId), eq(apiKey.status, 'active')));
  });

  return {
    packIds: safePackIds,
    expiresAt: requestedExpiresAt,
    monthlyQuota: safeMonthlyQuota,
  };
}

export function shouldGrantOneWorkForPrice(priceId: string) {
  // 产品归属由网站价格计划唯一管理，不再维护第二份环境变量白名单。
  return findPlanByPriceId(priceId)?.id === 'pro';
}

export function getOneWorkPaymentPacks() {
  // 一次购买即授予全部 OneWorkOS 知识库；后续新增知识包无需改环境变量。
  return [ALL_PACKS_GRANT];
}

/** 用户兑换码，只开通账号权益；设备 Key 由安装器在绑定电脑时领取。 */
export async function redeemOneWorkActivation({
  userId,
  code,
}: {
  userId: string;
  code: string;
}) {
  const rawCode = code.trim();
  if (!rawCode) throw new OneWorkAccessError('请输入兑换码', 'MISSING_CODE');

  const db = await getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    // 不同兑换码也可能在同一账号上同时兑换；与网站支付
    // 共用账号锁，避免并发续期覆盖。
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .for('update')
      .limit(1);

    const [activation] = await tx
      .select()
      .from(oneworkActivationCode)
      .where(eq(oneworkActivationCode.codeHash, hashSecret(rawCode)))
      .for('update')
      .limit(1);

    if (!activation) {
      throw new OneWorkAccessError(
        '兑换码无效，请检查是否输入正确',
        'INVALID_CODE',
        404
      );
    }
    if (activation.status !== 'active') {
      throw new OneWorkAccessError(
        '兑换码已使用或已失效',
        'CODE_NOT_ACTIVE',
        409
      );
    }
    if (
      activation.expiresAt &&
      activation.expiresAt.getTime() <= now.getTime()
    ) {
      throw new OneWorkAccessError('兑换码已过期', 'CODE_EXPIRED', 410);
    }
    if (activation.redeemedCount >= 1) {
      throw new OneWorkAccessError(
        '兑换码已达到使用次数上限',
        'CODE_EXHAUSTED',
        409
      );
    }

    const packIds = normalizePackIds(activation.packIds);
    const trialDays = positiveInteger(activation.trialDays, '权益天数', 3650);
    const monthlyQuota = positiveInteger(
      activation.monthlyQuota,
      '每月额度',
      10_000_000
    );
    const requestedExpiresAt = addDays(now, trialDays);
    const existingEntitlements = await tx
      .select()
      .from(oneworkEntitlement)
      .where(eq(oneworkEntitlement.userId, userId));

    for (const packId of packIds) {
      const existing = existingEntitlements.find(
        (item) => item.knowledgePackId === packId
      );
      const mergedExpiry = extendEntitlementExpiry(
        existing ? existing.expiresAt : undefined,
        trialDays,
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
          monthlyQuota,
          startsAt: existing?.startsAt ?? now,
          expiresAt: mergedExpiry,
        })
        .onConflictDoUpdate({
          target: [
            oneworkEntitlement.userId,
            oneworkEntitlement.knowledgePackId,
          ],
          set: {
            status: 'active',
            monthlyQuota: Math.max(existing?.monthlyQuota ?? 0, monthlyQuota),
            expiresAt: mergedExpiry,
            updatedAt: now,
          },
        });
    }

    await tx
      .update(apiKey)
      .set({
        monthlyQuota: sql`greatest(${apiKey.monthlyQuota}, ${monthlyQuota})`,
        updatedAt: now,
      })
      .where(and(eq(apiKey.userId, userId), eq(apiKey.status, 'active')));

    await tx
      .update(oneworkActivationCode)
      .set({
        redeemedCount: 1,
        status: 'redeemed',
        redeemedByUserId: userId,
        redeemedAt: now,
        updatedAt: now,
      })
      .where(eq(oneworkActivationCode.id, activation.id));

    return {
      packIds,
      expiresAt: requestedExpiresAt,
      monthlyQuota,
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
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .for('update')
      .limit(1);

    const entitlements = await tx
      .select({ monthlyQuota: oneworkEntitlement.monthlyQuota })
      .from(oneworkEntitlement)
      .where(
        and(
          eq(oneworkEntitlement.userId, userId),
          eq(oneworkEntitlement.status, 'active'),
          or(
            isNull(oneworkEntitlement.expiresAt),
            gt(oneworkEntitlement.expiresAt, now)
          )
        )
      );
    if (
      entitlements.length === 0 ||
      entitlements.every((item) => (item.monthlyQuota || 0) < 1)
    ) {
      throw new OneWorkAccessError(
        '当前账号没有有效的 OneWorkOS 权益，请先兑换或续费',
        'NO_ACTIVE_ENTITLEMENT',
        403
      );
    }

    // 一个账号只保留最新的未使用安装会话，避免旧指令被误用。
    await tx
      .update(oneworkInstallToken)
      .set({ consumedAt: now })
      .where(
        and(
          eq(oneworkInstallToken.userId, userId),
          isNull(oneworkInstallToken.consumedAt)
        )
      );

    await tx.insert(oneworkInstallToken).values({
      id: `install_${randomUUID()}`,
      tokenHash: hashSecret(rawToken),
      userId,
      platform: platform.slice(0, 30),
      deviceName: deviceName.slice(0, 80),
      expiresAt,
    });
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
  deviceId: string;
  deviceName?: string;
  platform?: string;
}) {
  if (!token.trim())
    throw new OneWorkAccessError('缺少安装授权', 'MISSING_INSTALL_TOKEN');
  if (!deviceId.trim()) {
    throw new OneWorkAccessError(
      '安装器未提供设备标识，请使用网站最新安装指令',
      'MISSING_DEVICE_ID'
    );
  }
  const db = await getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [install] = await tx
      .select()
      .from(oneworkInstallToken)
      .where(eq(oneworkInstallToken.tokenHash, hashSecret(token)))
      .for('update')
      .limit(1);
    if (!install)
      throw new OneWorkAccessError(
        '安装授权无效',
        'INVALID_INSTALL_TOKEN',
        404
      );
    if (install.consumedAt)
      throw new OneWorkAccessError(
        '安装授权已使用',
        'INSTALL_TOKEN_CONSUMED',
        409
      );
    if (install.expiresAt.getTime() <= now.getTime()) {
      throw new OneWorkAccessError(
        '安装授权已过期，请在网站重新生成',
        'INSTALL_TOKEN_EXPIRED',
        410
      );
    }

    const entitlements = await tx
      .select()
      .from(oneworkEntitlement)
      .where(
        and(
          eq(oneworkEntitlement.userId, install.userId),
          eq(oneworkEntitlement.status, 'active'),
          or(
            isNull(oneworkEntitlement.expiresAt),
            gt(oneworkEntitlement.expiresAt, now)
          )
        )
      );
    const allAccessEntitlements = entitlements.filter(
      (item) => item.knowledgePackId === ALL_PACKS_GRANT
    );
    const effectiveEntitlements =
      allAccessEntitlements.length > 0 ? allAccessEntitlements : entitlements;
    if (
      effectiveEntitlements.length === 0 ||
      effectiveEntitlements.every((item) => (item.monthlyQuota || 0) < 1)
    ) {
      throw new OneWorkAccessError(
        '当前账号没有有效的 OneWorkOS 权益，请先兑换或续费',
        'NO_ACTIVE_ENTITLEMENT',
        403
      );
    }
    const packIds =
      allAccessEntitlements.length > 0
        ? [ALL_PACKS_GRANT]
        : normalizePackIds(entitlements.map((item) => item.knowledgePackId));
    const packExpiries = Object.fromEntries(
      effectiveEntitlements.map((item) => [
        item.knowledgePackId,
        item.expiresAt,
      ])
    ) as Record<string, Date | null>;
    const earliestExpiry = effectiveEntitlements.some((item) => !item.expiresAt)
      ? null
      : effectiveEntitlements.reduce<Date | null>((current, item) => {
          if (!item.expiresAt) return current;
          if (!current || item.expiresAt.getTime() < current.getTime())
            return item.expiresAt;
          return current;
        }, null);
    const monthlyQuota = effectiveEntitlements.reduce(
      (max, item) => Math.max(max, item.monthlyQuota || 0),
      0
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
      deviceId: deviceId.trim(),
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
  const now = new Date();
  const pendingSince = new Date(now.getTime() - 10 * 60 * 1000);
  const [rawEntitlements, devices, keys, usageRows] = await Promise.all([
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
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(apiUsageEvent)
      .where(
        and(
          eq(apiUsageEvent.userId, userId),
          gte(apiUsageEvent.createdAt, oneWorkMonthStart(now)),
          or(
            eq(apiUsageEvent.status, 'ok'),
            and(
              eq(apiUsageEvent.status, 'pending'),
              gte(apiUsageEvent.createdAt, pendingSince)
            )
          )
        )
      ),
  ]);

  const entitlements = rawEntitlements.map((entitlement) => ({
    ...entitlement,
    status:
      entitlement.status === 'active' &&
      entitlement.expiresAt &&
      entitlement.expiresAt.getTime() <= now.getTime()
        ? 'expired'
        : entitlement.status,
  }));
  const activeEntitlements = entitlements.filter(
    (entitlement) => entitlement.status === 'active'
  );
  const limit = activeEntitlements.reduce(
    (maximum, entitlement) => Math.max(maximum, entitlement.monthlyQuota || 0),
    0
  );
  const usedThisMonth = usageRows[0]?.count ?? 0;

  return {
    entitlements,
    devices,
    keys,
    usage: {
      usedThisMonth,
      limit,
      remaining: Math.max(0, limit - usedThisMonth),
    },
    deviceLimit: oneWorkDeviceLimit(),
  };
}

/** 用户主动撤销一台电脑；设备对应的 Key 同时失效。 */
export async function revokeOneWorkDevice(userId: string, deviceId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [device] = await tx
      .select({ id: oneworkDevice.id, apiKeyId: oneworkDevice.apiKeyId })
      .from(oneworkDevice)
      .where(
        and(eq(oneworkDevice.id, deviceId), eq(oneworkDevice.userId, userId))
      )
      .for('update')
      .limit(1);
    if (!device) return false;

    const revokedAt = new Date();
    await tx
      .update(oneworkDevice)
      .set({ status: 'revoked', updatedAt: revokedAt })
      .where(eq(oneworkDevice.id, device.id));
    await tx
      .update(apiKey)
      .set({ status: 'revoked', revokedAt, updatedAt: revokedAt })
      .where(and(eq(apiKey.id, device.apiKeyId), eq(apiKey.userId, userId)));
    return true;
  });
}

export function isOneWorkPublicPack(value: string): value is OneWorkPublicPack {
  return (ONEWORK_PUBLIC_PACKS as readonly string[]).includes(value);
}
