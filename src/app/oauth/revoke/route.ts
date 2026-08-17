import {
  OneWorkOAuthError,
  getOneWorkOAuthClient,
  readOneWorkOAuthBody,
  requireOneWorkOAuthContentType,
  revokeOneWorkOAuthToken,
} from '@/lib/onework-oauth';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('authorization')) {
      throw new OneWorkOAuthError(
        'invalid_client',
        'OneWorkerOS 仅支持无需 client_secret 的 public client',
        401
      );
    }
    requireOneWorkOAuthContentType(
      request,
      'application/x-www-form-urlencoded'
    );
    const raw = await readOneWorkOAuthBody(request, 16_000);
    const form = new URLSearchParams(raw);
    const clientId = form.get('client_id') || '';
    if (!(await getOneWorkOAuthClient(clientId))) {
      throw new OneWorkOAuthError('invalid_client', '未知或已停用的 client_id');
    }
    await revokeOneWorkOAuthToken({
      clientId,
      token: form.get('token') || '',
    });
    return new NextResponse(null, {
      status: 200,
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    });
  } catch (error) {
    const known =
      error instanceof OneWorkOAuthError
        ? error
        : new OneWorkOAuthError('server_error', '撤销服务暂时不可用', 500);
    if (!(error instanceof OneWorkOAuthError)) {
      console.error('[onework/oauth/revoke]', error);
    }
    return NextResponse.json(
      { error: known.code, error_description: known.message },
      { status: known.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
