import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    provider: process.env.NEXT_PUBLIC_AI_PROVIDER || 'claude',
    apiKey: process.env.NEXT_PUBLIC_AI_API_KEY || '',
    endpoint: process.env.NEXT_PUBLIC_CLAUDE_API_ENDPOINT || 'https://api.aigocode.com',
  });
}
