import { requireSameOrigin, requireSession } from '@/lib/api-security';
import {
  OneWorkOAuthError,
  decideOneWorkDeviceAuthorization,
  getOneWorkDeviceAuthorization,
  readOneWorkOAuthJsonObject,
  userHasActiveOneWorkEntitlement,
} from '@/lib/onework-oauth';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const known =
    error instanceof OneWorkOAuthError
      ? error
      : new OneWorkOAuthError('server_error', '设备授权暂时不可用', 500);
  if (!(error instanceof OneWorkOAuthError)) {
    console.error('[onework/oauth/device/authorize]', error);
  }
  return NextResponse.json(
    {
      success: false,
      error: known.code,
      error_description: known.message,
    },
    { status: known.status, headers: { 'Cache-Control': 'no-store' } }
  );
}

/** Lookup for the localized /onework/activate page. */
export async function GET(request: NextRequest) {
  const auth = await requireSession('请先登录后确认设备授权');
  if ('response' in auth) return auth.response;
  try {
    const authorization = await getOneWorkDeviceAuthorization(
      request.nextUrl.searchParams.get('user_code') || ''
    );
    if (!authorization) {
      throw new OneWorkOAuthError('invalid_request', '设备授权码无效或已过期');
    }
    return NextResponse.json(
      {
        success: true,
        eligible: await userHasActiveOneWorkEntitlement(auth.session.user.id),
        ...authorization,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Explicit approve/deny action from the localized device page. */
export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  const auth = await requireSession('请先登录后确认设备授权');
  if ('response' in auth) return auth.response;
  try {
    const record = await readOneWorkOAuthJsonObject(request, 8_000);
    if (record.decision !== 'approve' && record.decision !== 'deny') {
      throw new OneWorkOAuthError('invalid_request', 'decision 无效');
    }
    const result = await decideOneWorkDeviceAuthorization({
      userId: auth.session.user.id,
      userCode: typeof record.user_code === 'string' ? record.user_code : '',
      decision: record.decision,
    });
    return NextResponse.json(
      { success: true, status: result.status },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
