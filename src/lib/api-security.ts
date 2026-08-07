import 'server-only';

import { NextResponse } from 'next/server';
import { canAccessHermesAdmin } from './hermes-admin-access';
import { getSession } from './server';

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function requireSession(message = '请先登录') {
  const session = await getSession();

  if (!session?.user?.id) {
    return {
      response: NextResponse.json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          error: message,
        },
        { status: 401 }
      ),
    } as const;
  }

  return { session: session as Session } as const;
}

export async function requireHermesAdmin(message = '这个接口只允许管理员访问') {
  const auth = await requireSession('请先登录后再访问管理员接口');
  if ('response' in auth) return auth;

  if (!canAccessHermesAdmin(auth.session.user)) {
    return {
      response: NextResponse.json(
        {
          success: false,
          code: 'FORBIDDEN',
          error: message,
        },
        { status: 403 }
      ),
    } as const;
  }

  return { session: auth.session } as const;
}
