import 'server-only';

import { createHash } from 'node:crypto';
import { getDb } from '@/db';
import { apiUsageEvent } from '@/db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

/**
 * 网页 AI 问答的「试吃」额度。
 *
 * 商业意图：让未付费的人亲身感受知识库的检索质量（最强的转化钩子），
 * 同时用日额度防止免费白嫖掉付费商品本身。
 *
 * 会员不受限；免费用户按 用户ID / 访客IP哈希 计当日次数。
 */

// ⚠️ 测试期临时放开为 100。正式上线前改回 3（或在 Zeabur 设
//    AI_CHAT_FREE_DAILY_LIMIT=3）——每天 3 次才是"试吃→开会员"的转化钩子。
export const FREE_DAILY_LIMIT = Number(
  process.env.AI_CHAT_FREE_DAILY_LIMIT || 100
);

export interface TrialQuotaState {
  allowed: boolean;
  isMember: boolean;
  used: number;
  limit: number;
  remaining: number;
  /** 计数身份：会员/登录用户用 userId，游客用 visitorId */
  userId: string | null;
  visitorId: string | null;
}

/** 把 IP 哈希成稳定短标识：不存明文 IP，够用来做当日限流。 */
export function visitorIdFromRequest(request: Request): string {
  const headers = request.headers;
  const raw =
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    headers.get('cf-connecting-ip') ||
    'unknown';
  const salt = process.env.BETTER_AUTH_SECRET || 'dlgzz';
  return createHash('sha256').update(`${salt}:${raw}`).digest('hex').slice(0, 32);
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

/**
 * 只读检查：当前身份今天还能不能问。
 * 会员直接放行；免费用户统计当日 kind='web_chat' 且 status='ok' 的记录数。
 */
export async function checkTrialQuota({
  userId,
  visitorId,
  isMember,
}: {
  userId: string | null;
  visitorId: string | null;
  isMember: boolean;
}): Promise<TrialQuotaState> {
  if (isMember) {
    return {
      allowed: true,
      isMember: true,
      used: 0,
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
      userId,
      visitorId,
    };
  }

  const identityFilter = userId
    ? eq(apiUsageEvent.userId, userId)
    : visitorId
      ? eq(apiUsageEvent.visitorId, visitorId)
      : null;

  // 拿不到任何身份时保守放行一次，避免把正常用户误伤
  if (!identityFilter) {
    return {
      allowed: true,
      isMember: false,
      used: 0,
      limit: FREE_DAILY_LIMIT,
      remaining: FREE_DAILY_LIMIT,
      userId,
      visitorId,
    };
  }

  let used = 0;
  try {
    const db = await getDb();
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(apiUsageEvent)
      .where(
        and(
          identityFilter,
          eq(apiUsageEvent.kind, 'web_chat'),
          eq(apiUsageEvent.status, 'ok'),
          gte(apiUsageEvent.createdAt, startOfTodayUtc())
        )
      );
    used = row?.count ?? 0;
  } catch {
    // 计量表不可用时不阻断产品主流程
    used = 0;
  }

  const remaining = Math.max(0, FREE_DAILY_LIMIT - used);

  return {
    allowed: remaining > 0,
    isMember: false,
    used,
    limit: FREE_DAILY_LIMIT,
    remaining,
    userId,
    visitorId,
  };
}

/** 记一次成功问答。失败不抛错——计量不能拖垮问答本身。 */
export async function recordTrialUsage({
  userId,
  visitorId,
  knowledgePackId,
  query,
  resultCount,
  latencyMs,
}: {
  userId: string | null;
  visitorId: string | null;
  knowledgePackId?: string | null;
  query: string;
  resultCount: number;
  latencyMs: number;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(apiUsageEvent).values({
      id: `evt_${nanoid(16)}`,
      userId: userId ?? null,
      visitorId: userId ? null : (visitorId ?? null),
      kind: 'web_chat',
      knowledgePackId: knowledgePackId ?? null,
      query: query.slice(0, 500),
      resultCount,
      latencyMs,
      status: 'ok',
    });
  } catch (error) {
    console.error('[free-trial-quota] 记录用量失败:', error);
  }
}
