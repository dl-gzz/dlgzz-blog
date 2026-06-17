import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import { createWorkerSkillAdmin, listAdminWorkerSkills } from '@/lib/workers';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再查看员工技能库',
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

  const skills = await listAdminWorkerSkills();

  return NextResponse.json({
    success: true,
    skills,
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再创建员工技能',
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

  const body = await request.json().catch(() => ({}));

  try {
    const skill = await createWorkerSkillAdmin(body);

    return NextResponse.json({
      success: true,
      skill,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: 'WORKER_SKILL_CREATE_FAILED',
        error: error instanceof Error ? error.message : '员工技能创建失败',
      },
      { status: 400 }
    );
  }
}
