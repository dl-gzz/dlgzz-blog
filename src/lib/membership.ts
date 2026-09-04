import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import {
  membershipActivationCode,
  membershipEntitlement,
  user,
} from '@/db/schema';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';

export const CLUB_MEMBERSHIP_PRODUCT = 'club';

export class MembershipError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'MembershipError';
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

function validateDurationDays(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const normalized = Math.floor(value);
  if (!Number.isFinite(value) || normalized < 1 || normalized > 3650) {
    throw new MembershipError(
      '会员有效期必须是 1 到 3650 天之间的整数，永久会员请留空',
      'INVALID_DURATION'
    );
  }
  return normalized;
}

function mergeExpiry(
  currentExpiry: Date | null | undefined,
  durationDays: number | null,
  now: Date
) {
  // null means permanent. A permanent grant must never be shortened by a
  // later time-limited activation.
  if (currentExpiry === null) return null;
  if (durationDays === null) return null;

  const requestedExpiry = addDays(now, durationDays);
  if (!currentExpiry || currentExpiry.getTime() <= now.getTime()) {
    return requestedExpiry;
  }
  return currentExpiry.getTime() >= requestedExpiry.getTime()
    ? currentExpiry
    : requestedExpiry;
}

function makeActivationCode() {
  const suffix = randomBytes(18)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  return `MEM-${suffix}`;
}

export async function hasActiveMembership(
  userId: string,
  productId = CLUB_MEMBERSHIP_PRODUCT
) {
  try {
    const db = await getDb();
    const now = new Date();
    const rows = await db
      .select({ id: membershipEntitlement.id })
      .from(membershipEntitlement)
      .where(
        and(
          eq(membershipEntitlement.userId, userId),
          eq(membershipEntitlement.productId, productId),
          eq(membershipEntitlement.status, 'active'),
          or(
            isNull(membershipEntitlement.expiresAt),
            gt(membershipEntitlement.expiresAt, now)
          )
        )
      )
      .limit(1);

    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function getMembershipStatus(
  userId: string,
  productId = CLUB_MEMBERSHIP_PRODUCT
) {
  const db = await getDb();
  const now = new Date();
  const entitlements = await db
    .select({
      id: membershipEntitlement.id,
      productId: membershipEntitlement.productId,
      level: membershipEntitlement.level,
      source: membershipEntitlement.source,
      status: membershipEntitlement.status,
      startsAt: membershipEntitlement.startsAt,
      expiresAt: membershipEntitlement.expiresAt,
      externalId: membershipEntitlement.externalId,
    })
    .from(membershipEntitlement)
    .where(
      and(
        eq(membershipEntitlement.userId, userId),
        eq(membershipEntitlement.productId, productId)
      )
    )
    .orderBy(desc(membershipEntitlement.updatedAt));

  const activeEntitlements = entitlements.filter(
    (item) =>
      item.status === 'active' &&
      (!item.expiresAt || item.expiresAt.getTime() > now.getTime())
  );
  const current = activeEntitlements[0] || null;

  return {
    isMember: Boolean(current),
    level: current?.level || null,
    source: current?.source || null,
    startsAt: current?.startsAt || null,
    expiresAt: current?.expiresAt || null,
    entitlements,
  };
}

/** 管理员为星球成交用户签发一次性会员兑换码。 */
export async function issueMembershipActivationCode({
  durationDays = 365,
  codeExpiresAt = null,
  label = '',
  source = 'planet',
  createdByUserId,
  productId = CLUB_MEMBERSHIP_PRODUCT,
  membershipLevel = 'member',
}: {
  durationDays?: number | null;
  codeExpiresAt?: Date | null;
  label?: string;
  source?: string;
  createdByUserId?: string | null;
  productId?: string;
  membershipLevel?: string;
}) {
  const safeDurationDays = validateDurationDays(durationDays);
  if (codeExpiresAt && codeExpiresAt.getTime() <= Date.now()) {
    throw new MembershipError(
      '兑换码失效时间必须在未来',
      'INVALID_CODE_EXPIRY'
    );
  }

  const rawCode = makeActivationCode();
  const db = await getDb();
  await db.insert(membershipActivationCode).values({
    id: `membership_code_${randomUUID()}`,
    codeHash: hashSecret(rawCode),
    codePrefix: `${rawCode.slice(0, 12)}…`,
    productId: productId.slice(0, 80),
    membershipLevel: membershipLevel.slice(0, 40),
    label: label.slice(0, 120),
    source: source.slice(0, 30),
    durationDays: safeDurationDays,
    maxRedemptions: 1,
    redeemedCount: 0,
    status: 'active',
    codeExpiresAt,
    createdByUserId: createdByUserId || null,
  });

  return {
    rawCode,
    codePrefix: `${rawCode.slice(0, 12)}…`,
    durationDays: safeDurationDays,
  };
}

/** 网站支付回调使用同一张权益表，保证直付用户也能同步到小程序。 */
export async function grantMembershipEntitlement({
  userId,
  durationDays,
  source = 'website',
  externalId,
  productId = CLUB_MEMBERSHIP_PRODUCT,
  membershipLevel = 'member',
}: {
  userId: string;
  durationDays: number | null;
  source?: string;
  externalId?: string | null;
  productId?: string;
  membershipLevel?: string;
}) {
  const safeDurationDays = validateDurationDays(durationDays);
  const db = await getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(membershipEntitlement)
      .where(
        and(
          eq(membershipEntitlement.userId, userId),
          eq(membershipEntitlement.productId, productId)
        )
      )
      .for('update')
      .limit(1);
    const expiresAt = mergeExpiry(
      existing?.status === 'active' ? existing.expiresAt : undefined,
      safeDurationDays,
      now
    );

    await tx
      .insert(membershipEntitlement)
      .values({
        id: `membership_${randomUUID()}`,
        userId,
        productId: productId.slice(0, 80),
        level: membershipLevel.slice(0, 40),
        source: source.slice(0, 30),
        status: 'active',
        startsAt: existing?.startsAt || now,
        expiresAt,
        externalId: externalId ? externalId.slice(0, 160) : null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [membershipEntitlement.userId, membershipEntitlement.productId],
        set: {
          level: membershipLevel.slice(0, 40),
          source: source.slice(0, 30),
          status: 'active',
          expiresAt,
          externalId: externalId ? externalId.slice(0, 160) : null,
          updatedAt: now,
        },
      });

    return { expiresAt, source: source.slice(0, 30) };
  });
}

/** 用户兑换会员码；兑换与权益写入在同一个事务中完成。 */
export async function redeemMembershipActivationCode({
  userId,
  code,
}: {
  userId: string;
  code: string;
}) {
  const rawCode = code.trim();
  if (!rawCode) throw new MembershipError('请输入会员兑换码', 'MISSING_CODE');

  const db = await getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .for('update')
      .limit(1);

    const [activation] = await tx
      .select()
      .from(membershipActivationCode)
      .where(eq(membershipActivationCode.codeHash, hashSecret(rawCode)))
      .for('update')
      .limit(1);

    if (!activation) {
      throw new MembershipError(
        '会员兑换码无效，请检查是否输入正确',
        'INVALID_CODE',
        404
      );
    }
    if (activation.status !== 'active') {
      throw new MembershipError(
        '会员兑换码已使用或已失效',
        'CODE_NOT_ACTIVE',
        409
      );
    }
    if (
      activation.codeExpiresAt &&
      activation.codeExpiresAt.getTime() <= now.getTime()
    ) {
      throw new MembershipError('会员兑换码已过期', 'CODE_EXPIRED', 410);
    }
    if (activation.redeemedCount >= activation.maxRedemptions) {
      throw new MembershipError(
        '会员兑换码已达到使用次数上限',
        'CODE_EXHAUSTED',
        409
      );
    }

    const [existing] = await tx
      .select()
      .from(membershipEntitlement)
      .where(
        and(
          eq(membershipEntitlement.userId, userId),
          eq(membershipEntitlement.productId, activation.productId)
        )
      )
      .for('update')
      .limit(1);

    const expiresAt = mergeExpiry(
      existing?.status === 'active' ? existing.expiresAt : undefined,
      activation.durationDays,
      now
    );

    await tx
      .insert(membershipEntitlement)
      .values({
        id: `membership_${randomUUID()}`,
        userId,
        productId: activation.productId,
        level: activation.membershipLevel,
        source: activation.source,
        status: 'active',
        startsAt: existing?.startsAt || now,
        expiresAt,
        externalId: activation.id,
      })
      .onConflictDoUpdate({
        target: [membershipEntitlement.userId, membershipEntitlement.productId],
        set: {
          level: activation.membershipLevel,
          source: activation.source,
          status: 'active',
          expiresAt,
          externalId: activation.id,
          updatedAt: now,
        },
      });

    await tx
      .update(membershipActivationCode)
      .set({
        redeemedCount: activation.redeemedCount + 1,
        status: 'redeemed',
        redeemedByUserId: userId,
        redeemedAt: now,
        updatedAt: now,
      })
      .where(eq(membershipActivationCode.id, activation.id));

    return {
      productId: activation.productId,
      level: activation.membershipLevel,
      expiresAt,
      source: activation.source,
    };
  });
}
