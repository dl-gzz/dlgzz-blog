import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      provider:
        process.env.AI_PROVIDER ||
        process.env.NEXT_PUBLIC_AI_PROVIDER ||
        'claude',
      endpoint:
        process.env.CLAUDE_API_ENDPOINT ||
        process.env.NEXT_PUBLIC_CLAUDE_API_ENDPOINT ||
        'https://api.aigocode.com',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
