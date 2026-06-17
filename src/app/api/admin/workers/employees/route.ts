import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import { listAdminWorkerEmployees } from '@/lib/workers';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再查看员工目录后台',
      },
      { status: 401 }
    );
  }

  if (!canAccessHermesAdmin(session.user)) {
    return NextResponse.json(
      {
        success: false,
        code: 'FORBIDDEN',
        error: '当前账号没有员工目录后台权限',
      },
      { status: 403 }
    );
  }

  const employees = await listAdminWorkerEmployees();

  return NextResponse.json({
    success: true,
    employees,
  });
}
