import {
  OneWorkOAuthError,
  getOneWorkOAuthRequestRateLimitSubject,
  issueOneWorkDeviceCode,
  readOneWorkOAuthBody,
  requireOneWorkOAuthContentType,
  reserveOneWorkOAuthPublicRequest,
} from '@/lib/onework-oauth';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

async function readForm(request: NextRequest) {
  requireOneWorkOAuthContentType(request, 'application/x-www-form-urlencoded');
  const raw = await readOneWorkOAuthBody(request, 16_000);
  return new URLSearchParams(raw);
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
    const reservation = await reserveOneWorkOAuthPublicRequest({
      kind: 'device_code_ip',
      subject: getOneWorkOAuthRequestRateLimitSubject(request),
    });
    if (!reservation.allowed) {
      return NextResponse.json(
        {
          error: 'slow_down',
          error_description: '设备授权请求过于频繁，请稍后重试',
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
    const result = await issueOneWorkDeviceCode({
      clientId: form.get('client_id') || '',
      scope: form.get('scope') || undefined,
      resource: form.get('resource') || undefined,
    });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    });
  } catch (error) {
    const known =
      error instanceof OneWorkOAuthError
        ? error
        : new OneWorkOAuthError('server_error', '设备授权暂时不可用', 500);
    if (!(error instanceof OneWorkOAuthError)) {
      console.error('[onework/oauth/device/code]', error);
    }
    return NextResponse.json(
      { error: known.code, error_description: known.message },
      { status: known.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
