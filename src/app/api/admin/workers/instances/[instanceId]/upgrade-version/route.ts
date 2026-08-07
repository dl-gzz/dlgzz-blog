import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { requireSameOrigin } from '@/lib/api-security';
import { getSession } from '@/lib/server';
import { upgradeWorkerInstanceToLatestVersion } from '@/lib/workers';
import { type NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    instanceId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 5_000) {
    return NextResponse.json(
      { success: false, code: 'PAYLOAD_TOO_LARGE', error: '请求体过大' },
      { status: 413 }
    );
  }

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
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(instanceId)) {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '员工实例 ID 无效' },
      { status: 400 }
    );
  }

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
