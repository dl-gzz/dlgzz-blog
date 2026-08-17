import { requireSameOrigin, requireSession } from '@/lib/api-security';
import { revokeOneWorkOAuthConnection } from '@/lib/onework-oauth';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ clientId: string }> }
) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  const { clientId } = await context.params;
  try {
    const revoked = await revokeOneWorkOAuthConnection({
      userId: auth.session.user.id,
      clientId: decodeURIComponent(clientId),
    });
    if (!revoked) {
      return NextResponse.json(
        {
          success: false,
          code: 'OAUTH_CONNECTION_NOT_FOUND',
          error: '没有找到这条有效连接',
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[onework/oauth/connections/revoke]', error);
    return NextResponse.json(
      {
        success: false,
        code: 'OAUTH_REVOKE_FAILED',
        error: '暂时无法撤销连接，请稍后重试',
      },
      { status: 503 }
    );
  }
}
