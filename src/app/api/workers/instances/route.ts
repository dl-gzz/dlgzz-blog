import { getSession } from '@/lib/server';
import { listWorkerInstancesForUser } from '@/lib/workers';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再查看我的数字员工',
      },
      { status: 401 }
    );
  }

  const instances = await listWorkerInstancesForUser(userId);

  return NextResponse.json({
    success: true,
    instances,
  });
}
