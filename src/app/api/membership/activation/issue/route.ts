import { requireHermesAdmin, requireSameOrigin } from '@/lib/api-security';
import {
  MembershipError,
  issueMembershipActivationCode,
} from '@/lib/membership';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** 管理员为星球已成交用户签发一次性网站/小程序会员码。 */
export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  const auth = await requireHermesAdmin('只有管理员可以签发会员兑换码');
  if ('response' in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const parsedCodeExpiry =
    typeof body?.codeExpiresAt === 'string'
      ? new Date(body.codeExpiresAt)
      : null;
  const durationDays =
    body?.durationDays === null
      ? null
      : typeof body?.durationDays === 'number'
        ? body.durationDays
        : 365;

  try {
    const result = await issueMembershipActivationCode({
      durationDays,
      codeExpiresAt:
        parsedCodeExpiry && !Number.isNaN(parsedCodeExpiry.getTime())
          ? parsedCodeExpiry
          : null,
      label: typeof body?.label === 'string' ? body.label : '',
      source: typeof body?.source === 'string' ? body.source : 'planet',
      createdByUserId: auth.session.user.id,
    });

    return NextResponse.json({
      success: true,
      code: result.rawCode,
      codePrefix: result.codePrefix,
      durationDays: result.durationDays,
      notice: '兑换码只在这次响应中显示，请复制给对应用户。',
    });
  } catch (error) {
    if (error instanceof MembershipError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status }
      );
    }
    console.error('[membership/activation/issue]', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', error: '签发会员码失败' },
      { status: 500 }
    );
  }
}
