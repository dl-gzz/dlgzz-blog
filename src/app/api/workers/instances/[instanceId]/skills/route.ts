import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import { listWorkerInstanceSkillsForUser } from '@/lib/workers';
import { type NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    instanceId: string;
  }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再查看员工技能',
      },
      { status: 401 }
    );
  }

  const { instanceId } = await context.params;
  const skills = await listWorkerInstanceSkillsForUser(instanceId, userId, {
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
}
