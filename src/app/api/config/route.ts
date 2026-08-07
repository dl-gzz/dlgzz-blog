import { NextResponse } from 'next/server';

export async function GET() {
  // Keep this endpoint non-sensitive: never return server or provider secrets.
  return NextResponse.json({
    provider: process.env.NEXT_PUBLIC_AI_PROVIDER || 'claude',
    endpoint:
      process.env.NEXT_PUBLIC_CLAUDE_API_ENDPOINT || 'https://api.aigocode.com',
    configured: Boolean(
      process.env.DEEPSEEK_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.ANTHROPIC_API_KEY ||
        process.env.CLAUDE_API_KEY
    ),
  });
}
