import { requireHermesAdmin, requireSameOrigin } from '@/lib/api-security';
import {
  OneWorkAccessError,
  issueOneWorkActivationCode,
} from '@/lib/onework-access';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** 管理员为小红书/抖音成交用户生成兑换码。 */
export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  const auth = await requireHermesAdmin(
    '只有管理员可以签发 one-worker-os 兑换码'
  );
  if ('response' in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const requestedPackIds = Array.isArray(body?.packIds)
    ? body.packIds.filter(
        (value: unknown): value is string => typeof value === 'string'
      )
    : [];
  const packIds =
    requestedPackIds.length > 0 ? requestedPackIds : [ALL_PACKS_GRANT];
  const parsedExpiry =
    typeof body?.expiresAt === 'string' ? new Date(body.expiresAt) : null;

  try {
    const result = await issueOneWorkActivationCode({
      packIds,
      trialDays: typeof body?.trialDays === 'number' ? body.trialDays : 30,
      monthlyQuota:
        typeof body?.monthlyQuota === 'number' ? body.monthlyQuota : 1000,
      maxRedemptions: 1,
      label: typeof body?.label === 'string' ? body.label : '',
      source: typeof body?.source === 'string' ? body.source : 'manual',
      expiresAt:
        parsedExpiry && !Number.isNaN(parsedExpiry.getTime())
          ? parsedExpiry
          : null,
      createdByUserId: auth.session.user.id,
    });
    return NextResponse.json({
      success: true,
      code: result.rawCode,
      codePrefix: result.codePrefix,
      packs: result.packIds,
      notice: '兑换码只在这次响应中显示，请复制给购买用户。',
    });
  } catch (error) {
    if (error instanceof OneWorkAccessError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status }
      );
    }
    console.error('[onework/issue]', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', error: '签发兑换码失败' },
      { status: 500 }
    );
  }
}
