import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import { updateWorkerSkillAdmin } from '@/lib/workers';
import { type NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    skillId: string;
  }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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
