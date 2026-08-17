import {
  OneWorkOAuthError,
  exchangeOneWorkAuthorizationCode,
  pollOneWorkDeviceToken,
  readOneWorkOAuthBody,
  requireOneWorkOAuthContentType,
  rotateOneWorkRefreshToken,
} from '@/lib/onework-oauth';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

async function readForm(request: NextRequest) {
  requireOneWorkOAuthContentType(request, 'application/x-www-form-urlencoded');
  const raw = await readOneWorkOAuthBody(request, 16_000);
  return new URLSearchParams(raw);
}

async function exchangeGrant(form: URLSearchParams) {
  const clientId = form.get('client_id') || '';
  const grantType = form.get('grant_type') || '';
  if (grantType === 'authorization_code') {
    return exchangeOneWorkAuthorizationCode({
      clientId,
      code: form.get('code') || '',
      redirectUri: form.get('redirect_uri') || '',
      codeVerifier: form.get('code_verifier') || '',
      resource: form.get('resource') || undefined,
    });
  }
  if (grantType === 'refresh_token') {
    return rotateOneWorkRefreshToken({
      clientId,
      refreshToken: form.get('refresh_token') || '',
      scope: form.get('scope') || undefined,
      resource: form.get('resource') || undefined,
    });
  }
  if (grantType === DEVICE_GRANT_TYPE) {
    return pollOneWorkDeviceToken({
      clientId,
      deviceCode: form.get('device_code') || '',
      resource: form.get('resource') || undefined,
    });
  }
  throw new OneWorkOAuthError('unsupported_grant_type', '不支持的 grant_type');
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('authorization')) {
      throw new OneWorkOAuthError(
        'invalid_client',
        'OneWorkerOS 仅支持无需 client_secret 的 public client',
        401
      );
    }
    const form = await readForm(request);
    const result = await exchangeGrant(form);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    });
  } catch (error) {
    const known =
      error instanceof OneWorkOAuthError
        ? error
        : new OneWorkOAuthError('server_error', '令牌服务暂时不可用', 500);
    if (!(error instanceof OneWorkOAuthError)) {
      console.error('[onework/oauth/token]', error);
    }
    return NextResponse.json(
      { error: known.code, error_description: known.message },
      {
        status: known.status,
        headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
      }
    );
  }
}
