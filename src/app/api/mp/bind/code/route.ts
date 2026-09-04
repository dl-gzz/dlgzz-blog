import { requireSameOrigin, requireSession } from '@/lib/api-security';
import { createMiniappBindCode } from '@/lib/miniapp-auth';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  try {
    const result = await createMiniappBindCode(auth.session.user.id);
    return NextResponse.json({
      success: true,
      ...result,
      notice: '绑定码 10 分钟内有效，只能绑定一个微信身份。',
    });
  } catch (error) {
    console.error('[mp/bind/code]', error);
    return NextResponse.json(
      {
        success: false,
        code: 'BIND_CODE_UNAVAILABLE',
        error: '绑定码生成失败，请稍后重试',
      },
      { status: 503 }
    );
  }
}
