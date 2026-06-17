import 'server-only';

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { getDb } from '@/db';
import { miniappAccount, user } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

interface MiniappTokenPayload {
  accountId: string;
  openid: string;
  exp: number;
}

export interface MiniappSession {
  accountId: string;
  openid: string;
  userId: string;
}

function base64url(input: string) {
  return Buffer.from(input).toString('base64url');
}

function fromBase64url(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function getTokenSecret() {
  const secret =
    process.env.MINIAPP_AUTH_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error(
      'MINIAPP_AUTH_SECRET or BETTER_AUTH_SECRET is required in production'
    );
  }
  return secret || 'dev-miniapp-auth-secret';
}

function signPayload(encodedPayload: string) {
  return createHmac('sha256', getTokenSecret())
    .update(encodedPayload)
    .digest('base64url');
}

export function createMiniappToken(accountId: string, openid: string) {
  const payload: MiniappTokenPayload = {
    accountId,
    openid,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

function verifyMiniappToken(token?: string | null): MiniappTokenPayload | null {
  if (!token) return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expected = signPayload(encodedPayload);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      fromBase64url(encodedPayload)
    ) as MiniappTokenPayload;
    if (
      !payload.accountId ||
      !payload.openid ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function readMiniappTokenFromRequest(request: NextRequest) {
  const authorization = request.headers.get('authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return (
    request.headers.get('x-mp-token') ||
    request.nextUrl.searchParams.get('token')
  );
}

export async function getMiniappSession(
  request: NextRequest
): Promise<MiniappSession | null> {
  const payload = verifyMiniappToken(readMiniappTokenFromRequest(request));
  if (!payload) return null;

  const db = await getDb();
  const rows = await db
    .select({
      accountId: miniappAccount.id,
      openid: miniappAccount.openid,
      userId: miniappAccount.userId,
    })
    .from(miniappAccount)
    .where(eq(miniappAccount.id, payload.accountId))
    .limit(1);

  if (!rows.length || rows[0].openid !== payload.openid) return null;
  return rows[0];
}

function hashOpenid(openid: string) {
  return createHash('sha256').update(openid).digest('hex').slice(0, 32);
}

export async function getOrCreateMiniappAccount(params: {
  openid: string;
  unionid?: string | null;
}) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(miniappAccount)
    .where(eq(miniappAccount.openid, params.openid))
    .limit(1);

  if (existing.length) {
    await db
      .update(miniappAccount)
      .set({
        unionid: params.unionid || existing[0].unionid,
        updatedAt: new Date(),
      })
      .where(eq(miniappAccount.id, existing[0].id));
    return existing[0];
  }

  const now = new Date();
  const userId = `mp_user_${randomUUID()}`;
  const accountId = `mp_account_${randomUUID()}`;
  const openidHash = hashOpenid(params.openid);

  await db.insert(user).values({
    id: userId,
    name: '微信小程序用户',
    email: `mp_${openidHash}@miniapp.local`,
    emailVerified: true,
    image: null,
    createdAt: now,
    updatedAt: now,
    role: null,
    banned: false,
    banReason: null,
    banExpires: null,
    customerId: `mp_${openidHash}`,
  });

  await db.insert(miniappAccount).values({
    id: accountId,
    openid: params.openid,
    unionid: params.unionid || null,
    userId,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id: accountId,
    openid: params.openid,
    unionid: params.unionid || null,
    userId,
    createdAt: now,
    updatedAt: now,
  };
}

export async function exchangeWechatCodeForOpenid(code: string) {
  const appId = process.env.WECHAT_MINIAPP_APP_ID;
  const appSecret = process.env.WECHAT_MINIAPP_APP_SECRET;

  if ((!appId || !appSecret) && process.env.NODE_ENV !== 'production') {
    return {
      openid: `dev_${hashOpenid(code || 'local')}`,
      unionid: null,
    };
  }

  if (!appId || !appSecret) {
    throw new Error(
      'WECHAT_MINIAPP_APP_ID or WECHAT_MINIAPP_APP_SECRET is not configured'
    );
  }

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`WeChat code2session failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data.openid) {
    throw new Error(data.errmsg || 'WeChat did not return openid');
  }

  return {
    openid: String(data.openid),
    unionid: data.unionid ? String(data.unionid) : null,
  };
}
