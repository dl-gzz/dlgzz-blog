import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import { upgradeWorkerInstanceToLatestVersion } from '@/lib/workers';
import { type NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    instanceId: string;
  }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再升级员工实例版本',
      },
      { status: 401 }
    );
  }

  if (!canAccessHermesAdmin(session.user)) {
    return NextResponse.json(
      {
        success: false,
        code: 'FORBIDDEN',
        error: '当前账号没有员工实例后台权限',
      },
      { status: 403 }
    );
  }

  const { instanceId } = await context.params;

  try {
    const instance = await upgradeWorkerInstanceToLatestVersion(instanceId);

    if (!instance) {
      return NextResponse.json(
        {
          success: false,
          code: 'WORKER_INSTANCE_NOT_FOUND',
          error: '数字员工实例不存在',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      instance,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: 'WORKER_INSTANCE_UPGRADE_FAILED',
        error: error instanceof Error ? error.message : '员工实例升级失败',
      },
      { status: 400 }
    );
  }
}
