import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import { syncWorkerEmployees } from '@/lib/workers';
import { NextResponse } from 'next/server';

export async function POST() {
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再同步数字员工',
      },
      { status: 401 }
    );
  }

  if (!canAccessHermesAdmin(session.user)) {
    return NextResponse.json(
      {
        success: false,
        code: 'FORBIDDEN',
        error: '当前账号没有员工同步权限',
      },
      { status: 403 }
    );
  }

  const result = await syncWorkerEmployees(session.user.id);
  return NextResponse.json({
    success: result.status !== 'failed',
    ...result,
  });
}
