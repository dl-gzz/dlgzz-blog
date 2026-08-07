import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { requireSameOrigin } from '@/lib/api-security';
import { getSession } from '@/lib/server';
import { setEmployeeWorkerSkillAdmin } from '@/lib/workers';
import { type NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    employeeId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 20_000) {
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
        error: '请先登录后再分配员工技能',
      },
      { status: 401 }
    );
  }

  if (!canAccessHermesAdmin(session.user)) {
    return NextResponse.json(
      {
        success: false,
        code: 'FORBIDDEN',
        error: '当前账号没有员工技能分配权限',
      },
      { status: 403 }
    );
  }

  const { employeeId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(employeeId)) {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '员工 ID 无效' },
      { status: 400 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const skillId =
    typeof body.skillId === 'string' && body.skillId.trim()
      ? body.skillId.trim()
      : '';

  if (!skillId) {
    return NextResponse.json(
      {
        success: false,
        code: 'BAD_REQUEST',
        error: '缺少技能 ID',
      },
      { status: 400 }
    );
  }

  try {
    const assignment = await setEmployeeWorkerSkillAdmin({
      employeeId,
      skillId,
      status: body.status === 'paused' ? 'paused' : 'allowed',
      defaultEnabled:
        typeof body.defaultEnabled === 'boolean'
          ? body.defaultEnabled
          : undefined,
    });

    return NextResponse.json({
      success: true,
      assignment,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: 'WORKER_EMPLOYEE_SKILL_UPDATE_FAILED',
        error: error instanceof Error ? error.message : '员工技能分配失败',
      },
      { status: 400 }
    );
  }
}
