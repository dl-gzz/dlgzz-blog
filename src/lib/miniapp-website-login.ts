import 'server-only';

import { getDb } from '@/db';
import { session as websiteSession } from '@/db/schema';
import { auth } from '@/lib/auth';
import { MiniappAuthError } from '@/lib/miniapp-auth';
import { getBaseUrl } from '@/lib/urls/urls';
import { and, eq } from 'drizzle-orm';

/** Use the normal auth HTTP handler so password, verification, ban and rate-limit
 * checks stay identical to website login. Never return its token/cookie to the app.
 */
export async function verifyWebsiteCredentials(
  request: Request,
  email: string,
  password: string
) {
  const origin = new URL(getBaseUrl()).origin;
  const headers = new Headers({ 'content-type': 'application/json', origin });
  for (const name of ['x-forwarded-for', 'x-real-ip', 'user-agent']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await auth.handler(
    new Request(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, rememberMe: false }),
    })
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) {
      throw new MiniappAuthError(
        '尝试次数过多，请稍后再试',
        'RATE_LIMITED',
        429
      );
    }
    if (result.code === 'EMAIL_NOT_VERIFIED') {
      throw new MiniappAuthError(
        '请先完成网站邮箱验证，再关联账号',
        'EMAIL_NOT_VERIFIED',
        403
      );
    }
    throw new MiniappAuthError(
      '网站邮箱或密码不正确，或账号暂不可用',
      'WEBSITE_LOGIN_FAILED',
      401
    );
  }
  if (typeof result.user?.id !== 'string' || typeof result.token !== 'string') {
    throw new MiniappAuthError(
      '网站登录暂不可用，请稍后重试',
      'WEBSITE_LOGIN_FAILED',
      502
    );
  }

  // This session only proved ownership; the app continues to use its WeChat token.
  const db = await getDb();
  await db
    .delete(websiteSession)
    .where(
      and(
        eq(websiteSession.token, result.token),
        eq(websiteSession.userId, result.user.id)
      )
    );
  return result.user.id as string;
}
