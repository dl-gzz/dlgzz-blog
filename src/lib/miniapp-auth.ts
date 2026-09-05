import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import {
  miniappAccount,
  miniappBindCode,
  miniappSession,
  user,
} from '@/db/schema';
import { and, eq, gt, isNull } from 'drizzle-orm';

export class MiniappAuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 401
  ) {
    super(message);
    this.name = 'MiniappAuthError';
  }
}

function hashSecret(value: string) {
  return createHash('sha256').update(value.trim()).digest('hex');
}

function readBearerToken(request: Request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function makeSessionToken() {
  return `mpst_${randomBytes(32).toString('base64url')}`;
}

function makeBindCode() {
  return randomBytes(5).toString('hex').toUpperCase().slice(0, 8);
}

function sessionTtlDays() {
  const value = Number(process.env.MINIAPP_SESSION_TTL_DAYS || 30);
  return Number.isInteger(value) && value >= 1 && value <= 180 ? value : 30;
}

function normalizeBindCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

function miniappCredentials() {
  const appId =
    process.env.WECHAT_MINIAPP_APP_ID || process.env.MINIAPP_APP_ID || '';
  const appSecret =
    process.env.WECHAT_MINIAPP_APP_SECRET ||
    process.env.MINIAPP_APP_SECRET ||
    '';
  return { appId, appSecret };
}

async function exchangeWeChatCode(code: string) {
  const { appId, appSecret } = miniappCredentials();
  if (!appId || !appSecret) {
    throw new MiniappAuthError(
      '小程序登录尚未配置，请在服务端设置 WECHAT_MINIAPP_APP_ID 和 WECHAT_MINIAPP_APP_SECRET',
      'MINIAPP_AUTH_NOT_CONFIGURED',
      503
    );
  }

  const params = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    js_code: code,
    grant_type: 'authorization_code',
  });
  const response = await fetch(
    `https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`,
    { cache: 'no-store' }
  );
  if (!response.ok) {
    throw new MiniappAuthError(
      '微信登录服务暂时不可用',
      'WECHAT_AUTH_FAILED',
      502
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    openid?: string;
    unionid?: string;
    errcode?: number;
    errmsg?: string;
  };
  if (!payload.openid) {
    if (
      payload.errcode === 40125 ||
      payload.errcode === 40013 ||
      payload.errcode === 40001
    ) {
      throw new MiniappAuthError(
        '微信登录配置暂时异常，请联系管理员处理',
        'MINIAPP_AUTH_CONFIGURATION_ERROR',
        503
      );
    }
    throw new MiniappAuthError(
      payload.errmsg || '微信登录凭证无效，请重试',
      `WECHAT_${payload.errcode || 'AUTH_FAILED'}`,
      400
    );
  }
  return { openid: payload.openid, unionid: payload.unionid || null };
}

export async function createMiniappSession(code: string) {
  const normalizedCode = code.trim();
  if (!normalizedCode) {
    throw new MiniappAuthError('缺少微信登录凭证', 'MISSING_CODE', 400);
  }

  const { openid, unionid } = await exchangeWeChatCode(normalizedCode);
  const db = await getDb();
  let [account] = await db
    .select()
    .from(miniappAccount)
    .where(eq(miniappAccount.openid, openid))
    .limit(1);

  if (!account && unionid) {
    [account] = await db
      .select()
      .from(miniappAccount)
      .where(eq(miniappAccount.unionid, unionid))
      .limit(1);
    if (account && account.openid !== openid) {
      await db
        .update(miniappAccount)
        .set({ openid, updatedAt: new Date() })
        .where(eq(miniappAccount.id, account.id));
    }
  }

  if (account) {
    const [linkedUser] = await db
      .select({ banned: user.banned })
      .from(user)
      .where(eq(user.id, account.userId))
      .limit(1);
    if (linkedUser?.banned) {
      throw new MiniappAuthError(
        '当前账号已被停用，请联系管理员',
        'USER_BANNED',
        403
      );
    }
  }

  const rawToken = makeSessionToken();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + sessionTtlDays() * 24 * 60 * 60 * 1000
  );
  await db.insert(miniappSession).values({
    id: `miniapp_session_${randomUUID()}`,
    tokenHash: hashSecret(rawToken),
    openid,
    unionid,
    userId: account?.userId || null,
    expiresAt,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return {
    token: rawToken,
    expiresAt,
    needsBinding: !account?.userId,
    userId: account?.userId || null,
    openid,
  };
}

async function getSessionByToken(token: string) {
  const db = await getDb();
  const [session] = await db
    .select()
    .from(miniappSession)
    .where(eq(miniappSession.tokenHash, hashSecret(token)))
    .limit(1);
  if (!session) {
    throw new MiniappAuthError(
      '小程序登录已失效，请重新登录',
      'INVALID_SESSION'
    );
  }
  if (session.revokedAt) {
    throw new MiniappAuthError(
      '小程序登录已退出，请重新登录',
      'SESSION_REVOKED'
    );
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    throw new MiniappAuthError(
      '小程序登录已过期，请重新登录',
      'SESSION_EXPIRED'
    );
  }
  if (session.userId) {
    const [linkedUser] = await db
      .select({ banned: user.banned, banExpires: user.banExpires })
      .from(user)
      .where(eq(user.id, session.userId))
      .limit(1);
    if (
      !linkedUser ||
      (linkedUser.banned &&
        (!linkedUser.banExpires ||
          linkedUser.banExpires.getTime() > Date.now()))
    ) {
      throw new MiniappAuthError(
        '当前账号已停用，请联系管理员',
        'USER_BANNED',
        403
      );
    }
  }
  return { db, session };
}

export async function getOptionalMiniappSession(request: Request) {
  const token = readBearerToken(request);
  if (!token) return null;
  const { db, session } = await getSessionByToken(token);
  await db
    .update(miniappSession)
    .set({ lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(miniappSession.id, session.id));
  return session;
}

export async function requireMiniappSession(request: Request) {
  const token = readBearerToken(request);
  if (!token) {
    throw new MiniappAuthError('请先在小程序中登录', 'UNAUTHORIZED', 401);
  }
  const { db, session } = await getSessionByToken(token);
  await db
    .update(miniappSession)
    .set({ lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(miniappSession.id, session.id));
  if (!session.userId) {
    throw new MiniappAuthError(
      '请在小程序“我的”页面关联网站账号',
      'BINDING_REQUIRED',
      409
    );
  }
  return { ...session, userId: session.userId };
}

export async function createMiniappBindCode(userId: string) {
  const db = await getDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  await db
    .update(miniappBindCode)
    .set({ consumedAt: now })
    .where(
      and(
        eq(miniappBindCode.userId, userId),
        isNull(miniappBindCode.consumedAt)
      )
    );

  const rawCode = makeBindCode();
  await db.insert(miniappBindCode).values({
    id: `miniapp_bind_${randomUUID()}`,
    codeHash: hashSecret(normalizeBindCode(rawCode)),
    userId,
    expiresAt,
    createdAt: now,
  });
  return { code: rawCode, expiresAt };
}

export async function bindMiniappSession({
  request,
  code,
}: {
  request: Request;
  code: string;
}) {
  const token = readBearerToken(request);
  if (!token) {
    throw new MiniappAuthError('请先在小程序中登录', 'UNAUTHORIZED', 401);
  }
  const normalizedCode = normalizeBindCode(code);
  if (!normalizedCode) {
    throw new MiniappAuthError(
      '请输入网站生成的绑定码',
      'MISSING_BIND_CODE',
      400
    );
  }

  const { db, session } = await getSessionByToken(token);
  const now = new Date();
  return db.transaction(async (tx) => {
    const [lockedSession] = await tx
      .select()
      .from(miniappSession)
      .where(eq(miniappSession.id, session.id))
      .for('update')
      .limit(1);
    if (!lockedSession || lockedSession.expiresAt.getTime() <= now.getTime()) {
      throw new MiniappAuthError(
        '小程序登录已过期，请重新登录',
        'SESSION_EXPIRED'
      );
    }

    const [bindCode] = await tx
      .select()
      .from(miniappBindCode)
      .where(eq(miniappBindCode.codeHash, hashSecret(normalizedCode)))
      .for('update')
      .limit(1);
    if (!bindCode) {
      throw new MiniappAuthError(
        '绑定码无效，请重新生成',
        'INVALID_BIND_CODE',
        404
      );
    }
    if (bindCode.consumedAt) {
      throw new MiniappAuthError('绑定码已经使用', 'BIND_CODE_CONSUMED', 409);
    }
    if (bindCode.expiresAt.getTime() <= now.getTime()) {
      throw new MiniappAuthError(
        '绑定码已过期，请重新生成',
        'BIND_CODE_EXPIRED',
        410
      );
    }
    if (lockedSession.userId && lockedSession.userId !== bindCode.userId) {
      throw new MiniappAuthError(
        '当前微信已绑定其他网站账号',
        'ACCOUNT_CONFLICT',
        409
      );
    }

    const [existingAccount] = await tx
      .select()
      .from(miniappAccount)
      .where(eq(miniappAccount.openid, lockedSession.openid))
      .for('update')
      .limit(1);
    if (existingAccount && existingAccount.userId !== bindCode.userId) {
      throw new MiniappAuthError(
        '当前微信已绑定其他网站账号',
        'ACCOUNT_CONFLICT',
        409
      );
    }

    if (existingAccount) {
      await tx
        .update(miniappAccount)
        .set({ unionid: lockedSession.unionid, updatedAt: now })
        .where(eq(miniappAccount.id, existingAccount.id));
    } else {
      await tx.insert(miniappAccount).values({
        id: `miniapp_account_${randomUUID()}`,
        openid: lockedSession.openid,
        unionid: lockedSession.unionid,
        userId: bindCode.userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await tx
      .update(miniappSession)
      .set({ userId: bindCode.userId, updatedAt: now, lastSeenAt: now })
      .where(eq(miniappSession.id, lockedSession.id));
    await tx
      .update(miniappBindCode)
      .set({ consumedAt: now })
      .where(eq(miniappBindCode.id, bindCode.id));

    return { userId: bindCode.userId };
  });
}

export function isMiniappTokenConfigured() {
  const { appId, appSecret } = miniappCredentials();
  return Boolean(appId && appSecret);
}

/** Call only with a user ID obtained from verified website authentication. */
export async function linkVerifiedWebsiteAccount(
  request: Request,
  verifiedUserId: string
) {
  const token = readBearerToken(request);
  if (!token) throw new MiniappAuthError('请先在小程序中登录', 'UNAUTHORIZED');
  const { db, session } = await getSessionByToken(token);
  return db.transaction(async (tx) => {
    const now = new Date();
    const [websiteUser] = await tx
      .select()
      .from(user)
      .where(eq(user.id, verifiedUserId))
      .for('update')
      .limit(1);
    if (
      !websiteUser ||
      (websiteUser.banned &&
        (!websiteUser.banExpires || websiteUser.banExpires > now))
    ) {
      throw new MiniappAuthError('当前网站账号不可用', 'USER_BANNED', 403);
    }

    // The unique openid constraint arbitrates simultaneous first bindings.
    // A conflicting insert is never allowed to overwrite another user's link.
    await tx
      .insert(miniappAccount)
      .values({
        id: `miniapp_account_${randomUUID()}`,
        openid: session.openid,
        unionid: session.unionid,
        userId: verifiedUserId,
      })
      .onConflictDoNothing({ target: miniappAccount.openid });
    const [account] = await tx
      .select()
      .from(miniappAccount)
      .where(eq(miniappAccount.openid, session.openid))
      .for('update')
      .limit(1);
    if (!account || account.userId !== verifiedUserId) {
      throw new MiniappAuthError(
        '当前微信已关联其他网站账号，请使用原账号',
        'ACCOUNT_CONFLICT',
        409
      );
    }
    const [current] = await tx
      .select()
      .from(miniappSession)
      .where(eq(miniappSession.id, session.id))
      .for('update')
      .limit(1);
    if (!current || current.revokedAt || current.expiresAt <= now) {
      throw new MiniappAuthError(
        '微信登录已失效，请重新登录',
        'SESSION_EXPIRED'
      );
    }
    if (current.userId && current.userId !== verifiedUserId) {
      throw new MiniappAuthError(
        '当前微信已关联其他网站账号',
        'ACCOUNT_CONFLICT',
        409
      );
    }
    await tx
      .update(miniappSession)
      .set({ userId: verifiedUserId, updatedAt: now, lastSeenAt: now })
      .where(eq(miniappSession.id, current.id));
    return { userId: verifiedUserId };
  });
}
