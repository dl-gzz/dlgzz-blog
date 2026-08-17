import { requireSession } from '@/lib/api-security';
import { listOneWorkAccess } from '@/lib/onework-access';
import { listOneWorkOAuthConnections } from '@/lib/onework-oauth';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  try {
    const [access, oauthConnections] = await Promise.all([
      listOneWorkAccess(auth.session.user.id),
      listOneWorkOAuthConnections(auth.session.user.id),
    ]);
    return NextResponse.json({ success: true, ...access, oauthConnections });
  } catch (error) {
    console.error('[onework/entitlements]', error);
    return NextResponse.json(
      {
        success: false,
        code: 'ACCESS_SERVICE_UNAVAILABLE',
        error: '权益信息暂时无法读取，请稍后重试',
      },
      { status: 503 }
    );
  }
}
