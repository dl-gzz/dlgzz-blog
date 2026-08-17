import {
  ONEWORK_OAUTH_SCOPES,
  getOneWorkOAuthIssuer,
} from '@/lib/onework-oauth';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const issuer = getOneWorkOAuthIssuer();
  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      registration_endpoint: `${issuer}/oauth/register`,
      device_authorization_endpoint: `${issuer}/oauth/device/code`,
      response_types_supported: ['code'],
      grant_types_supported: [
        'authorization_code',
        'refresh_token',
        'urn:ietf:params:oauth:grant-type:device_code',
      ],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ONEWORK_OAUTH_SCOPES,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, must-revalidate',
      },
    }
  );
}
