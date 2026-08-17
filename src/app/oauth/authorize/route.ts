import {
  OneWorkOAuthError,
  buildOneWorkOAuthRedirect,
  getOneWorkOAuthClient,
  getOneWorkOAuthIssuer,
  isOneWorkOAuthClientRedirectUri,
  prepareOneWorkAuthorizationRequest,
} from '@/lib/onework-oauth';
import { getSession } from '@/lib/server';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function oauthError(error: unknown) {
  const known =
    error instanceof OneWorkOAuthError
      ? error
      : new OneWorkOAuthError('server_error', '授权服务暂时不可用', 500);
  return NextResponse.json(
    { error: known.code, error_description: known.message },
    { status: known.status, headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * OAuth browser entry point. It validates the client and PKCE request before
 * sending an anonymous user to Better Auth. An authenticated user is sent to
 * the localized consent page, which must call /api/onework/oauth/authorize.
 * No cookie alone can approve a client: approval always requires an explicit
 * POST from that page.
 */
export async function GET(request: NextRequest) {
  let authorizationRequest: Awaited<
    ReturnType<typeof prepareOneWorkAuthorizationRequest>
  >;
  try {
    authorizationRequest = await prepareOneWorkAuthorizationRequest(
      request.nextUrl.searchParams
    );
  } catch (error) {
    const clientId = request.nextUrl.searchParams.get('client_id') || '';
    const redirectUri = request.nextUrl.searchParams.get('redirect_uri') || '';
    const client = await getOneWorkOAuthClient(clientId).catch(() => null);
    if (
      error instanceof OneWorkOAuthError &&
      client &&
      isOneWorkOAuthClientRedirectUri(client, redirectUri)
    ) {
      return NextResponse.redirect(
        buildOneWorkOAuthRedirect(redirectUri, {
          error: error.code,
          error_description: error.message,
          state: request.nextUrl.searchParams.get('state') || undefined,
        })
      );
    }
    return oauthError(error);
  }

  const session = await getSession();
  const issuer = getOneWorkOAuthIssuer();
  if (!session?.user?.id) {
    const loginUrl = new URL('/auth/login', issuer);
    loginUrl.searchParams.set(
      'callbackUrl',
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return NextResponse.redirect(loginUrl);
  }

  if (request.nextUrl.searchParams.get('prompt') === 'none') {
    return NextResponse.redirect(
      buildOneWorkOAuthRedirect(authorizationRequest.redirectUri, {
        error: 'interaction_required',
        error_description: '需要用户明确确认授权',
        state: authorizationRequest.state,
      })
    );
  }

  const consentUrl = new URL('/onework/oauth/authorize', issuer);
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    consentUrl.searchParams.append(key, value);
  }
  return NextResponse.redirect(consentUrl);
}
