import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import { setWorkerInstanceSkillForUser } from '@/lib/workers';
import { type NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    instanceId: string;
    skillId: string;
  }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再配置员工技能',
      },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const enabled = Boolean(body.enabled);
  const { instanceId, skillId } = await context.params;

  try {
    const skills = await setWorkerInstanceSkillForUser({
      instanceId,
      skillId,
      enabled,
      userId,
      allowAdmin: canAccessHermesAdmin(session.user),
    });

    if (!skills) {
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
      skills,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: 'WORKER_INSTANCE_SKILL_UPDATE_FAILED',
        error: error instanceof Error ? error.message : '员工技能配置失败',
      },
      { status: 400 }
    );
  }
}
