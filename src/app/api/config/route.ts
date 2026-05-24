import { NextResponse } from 'next/server';

export async function GET() {
  // Keep this endpoint non-sensitive: clients only need public wiring info.
  return NextResponse.json({
    provider: process.env.NEXT_PUBLIC_AI_PROVIDER || 'claude',
    endpoint:
      process.env.NEXT_PUBLIC_CLAUDE_API_ENDPOINT || 'https://api.aigocode.com',
    apiKey: process.env.NEXT_PUBLIC_AI_API_KEY || '',
    configured: Boolean(process.env.NEXT_PUBLIC_AI_API_KEY),
  });
}
