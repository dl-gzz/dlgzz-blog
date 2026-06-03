import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import { updateWorkerEmployeeAdmin } from '@/lib/workers';
import { type NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    employeeId: string;
  }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再修改员工上架状态',
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

  const body = await request.json().catch(() => ({}));
  const status =
    typeof body.status === 'string' && ['draft', 'active', 'paused'].includes(body.status)
      ? body.status
      : undefined;
  const monthlyAmount =
    typeof body.monthlyAmount === 'number' && Number.isFinite(body.monthlyAmount)
      ? body.monthlyAmount
      : undefined;
  const monthlyPriceId =
    typeof body.monthlyPriceId === 'string' && body.monthlyPriceId.trim()
      ? body.monthlyPriceId.trim()
      : undefined;
  const currency =
    typeof body.currency === 'string' && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : undefined;
  const { employeeId } = await context.params;

  try {
    const employee = await updateWorkerEmployeeAdmin({
      employeeId,
      status,
      monthlyAmount,
      monthlyPriceId,
      currency,
    });

    if (!employee) {
      return NextResponse.json(
        {
          success: false,
          code: 'WORKER_EMPLOYEE_NOT_FOUND',
          error: '员工不存在',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      employee,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: 'WORKER_EMPLOYEE_UPDATE_FAILED',
        error: error instanceof Error ? error.message : '员工更新失败',
      },
      { status: 400 }
    );
  }
}
