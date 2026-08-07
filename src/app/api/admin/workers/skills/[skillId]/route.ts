import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { requireSameOrigin } from '@/lib/api-security';
import { getSession } from '@/lib/server';
import { updateWorkerSkillAdmin } from '@/lib/workers';
import { type NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    skillId: string;
  }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 50_000) {
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
        error: '请先登录后再修改员工技能',
      },
      { status: 401 }
    );
  }

  if (!canAccessHermesAdmin(session.user)) {
    return NextResponse.json(
      {
        success: false,
        code: 'FORBIDDEN',
        error: '当前账号没有员工技能库权限',
      },
      { status: 403 }
    );
  }

  const { skillId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(skillId)) {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '技能 ID 无效' },
      { status: 400 }
    );
  }
  const body = await request.json().catch(() => ({}));

  try {
    const skill = await updateWorkerSkillAdmin(skillId, body);

    if (!skill) {
      return NextResponse.json(
        {
          success: false,
          code: 'WORKER_SKILL_NOT_FOUND',
          error: '技能不存在',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      skill,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: 'WORKER_SKILL_UPDATE_FAILED',
        error: error instanceof Error ? error.message : '员工技能更新失败',
      },
      { status: 400 }
    );
  }
}
