import {
  OneWorkOAuthError,
  getOneWorkOAuthRequestRateLimitSubject,
  readOneWorkOAuthJsonObject,
  registerOneWorkOAuthClient,
  reserveOneWorkOAuthPublicRequest,
} from '@/lib/onework-oauth';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

async function readBoundedJson(request: NextRequest, maxBytes = 20_000) {
  try {
    return await readOneWorkOAuthJsonObject(request, maxBytes);
  } catch (error) {
    if (
      error instanceof OneWorkOAuthError &&
      error.code === 'invalid_request'
    ) {
      throw new OneWorkOAuthError(
        'invalid_client_metadata',
        error.message,
        error.status
      );
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const reservation = await reserveOneWorkOAuthPublicRequest({
      kind: 'dynamic_client_registration',
      subject: getOneWorkOAuthRequestRateLimitSubject(request),
    });
    if (!reservation.allowed) {
      return NextResponse.json(
        {
          error: 'invalid_client_metadata',
          error_description: '动态客户端注册过于频繁，请稍后重试',
        },
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(reservation.retryAfterSeconds),
          },
        }
      );
    }
    const globalReservation = await reserveOneWorkOAuthPublicRequest({
      kind: 'dynamic_client_registration',
      subject: 'global',
      limit:
        Number(process.env.ONEWORK_OAUTH_DCR_GLOBAL_RATE_LIMIT_PER_MINUTE) ||
        100,
    });
    if (!globalReservation.allowed) {
      return NextResponse.json(
        {
          error: 'invalid_client_metadata',
          error_description: '动态客户端注册服务当前过载，请稍后重试',
        },
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(globalReservation.retryAfterSeconds),
          },
        }
      );
    }
    const body = await readBoundedJson(request);
    const result = await registerOneWorkOAuthClient({
      clientName: body.client_name,
      redirectUris: body.redirect_uris,
      grantTypes: body.grant_types,
      responseTypes: body.response_types,
      scope: body.scope,
      tokenEndpointAuthMethod: body.token_endpoint_auth_method,
    });
    return NextResponse.json(result, {
      status: 201,
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    });
  } catch (error) {
    const known =
      error instanceof OneWorkOAuthError
        ? error
        : new OneWorkOAuthError(
            'server_error',
            '动态客户端注册暂时不可用',
            500
          );
    if (!(error instanceof OneWorkOAuthError)) {
      console.error('[onework/oauth/register]', error);
    }
    return NextResponse.json(
      { error: known.code, error_description: known.message },
      { status: known.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
