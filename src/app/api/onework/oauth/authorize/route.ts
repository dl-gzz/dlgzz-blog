import { requireSameOrigin, requireSession } from '@/lib/api-security';
import {
  OneWorkOAuthError,
  buildOneWorkOAuthRedirect,
  issueOneWorkAuthorizationCode,
  prepareOneWorkAuthorizationRequest,
  readOneWorkOAuthJsonObject,
  userHasActiveOneWorkEntitlement,
} from '@/lib/onework-oauth';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const known =
    error instanceof OneWorkOAuthError
      ? error
      : new OneWorkOAuthError('server_error', '授权服务暂时不可用', 500);
  if (!(error instanceof OneWorkOAuthError)) {
    console.error('[onework/oauth/authorize]', error);
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

function paramsFromSerializedQuery(value: unknown) {
  if (typeof value !== 'string' || value.length > 12_000) {
    throw new OneWorkOAuthError(
      'invalid_request',
      'authorization_query 无效或过长'
    );
  }
  return new URLSearchParams(value.startsWith('?') ? value.slice(1) : value);
}

/** Consent page bootstrap. Pass through the standard authorize query string. */
export async function GET(request: NextRequest) {
  const auth = await requireSession('请先登录后确认 one-worker-os 授权');
  if ('response' in auth) return auth.response;
  try {
    const prepared = await prepareOneWorkAuthorizationRequest(
      request.nextUrl.searchParams
    );
    const eligible = await userHasActiveOneWorkEntitlement(
      auth.session.user.id
    );
    return NextResponse.json(
      {
        success: true,
        eligible,
        client: {
          id: prepared.client.clientId,
          name: prepared.client.clientName,
          dynamicallyRegistered: prepared.client.dynamicallyRegistered,
        },
        scopes: prepared.scopes,
        redirectUri: prepared.redirectUri,
        state: prepared.state,
        resource: prepared.resource,
        user: {
          id: auth.session.user.id,
          name: auth.session.user.name,
          email: auth.session.user.email,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Explicit approve/deny action from the localized consent page. */
export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  const auth = await requireSession('请先登录后确认 one-worker-os 授权');
  if ('response' in auth) return auth.response;
  try {
    const record = await readOneWorkOAuthJsonObject(request, 16_000);
    const decision = record.decision;
    if (decision !== 'approve' && decision !== 'deny') {
      throw new OneWorkOAuthError('invalid_request', 'decision 无效');
    }
    const prepared = await prepareOneWorkAuthorizationRequest(
      paramsFromSerializedQuery(record.authorization_query)
    );
    if (decision === 'deny') {
      return NextResponse.json(
        {
          success: true,
          redirectTo: buildOneWorkOAuthRedirect(prepared.redirectUri, {
            error: 'access_denied',
            error_description: '用户拒绝了授权请求',
            state: prepared.state,
          }),
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const issued = await issueOneWorkAuthorizationCode({
      userId: auth.session.user.id,
      request: prepared,
    });
    return NextResponse.json(
      {
        success: true,
        redirectTo: buildOneWorkOAuthRedirect(prepared.redirectUri, {
          code: issued.code,
          state: prepared.state,
        }),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
