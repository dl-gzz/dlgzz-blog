import { requireSameOrigin, requireSession } from '@/lib/api-security';
import { revokeOneWorkDevice } from '@/lib/onework-access';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  if (!id || id.length > 160 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '设备参数无效' },
      { status: 400 }
    );
  }

  try {
    const revoked = await revokeOneWorkDevice(auth.session.user.id, id);
    if (!revoked) {
      return NextResponse.json(
        { success: false, code: 'DEVICE_NOT_FOUND', error: '设备不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[onework/devices/revoke]', error);
    return NextResponse.json(
      {
        success: false,
        code: 'DEVICE_SERVICE_UNAVAILABLE',
        error: '撤销设备暂时失败，请稍后重试',
      },
      { status: 503 }
    );
  }
}
