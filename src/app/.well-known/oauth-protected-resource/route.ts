import {
  ONEWORK_OAUTH_SCOPES,
  getOneWorkOAuthIssuer,
  getOneWorkOAuthResource,
} from '@/lib/onework-oauth';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const issuer = getOneWorkOAuthIssuer();
  return NextResponse.json(
    {
      resource: getOneWorkOAuthResource(),
      authorization_servers: [issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: ONEWORK_OAUTH_SCOPES,
      resource_documentation: `${issuer}/onework`,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, must-revalidate',
      },
    }
  );
}
