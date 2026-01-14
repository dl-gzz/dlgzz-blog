import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    version: '2.0.0-user-id-fix',
    timestamp: new Date().toISOString(),
    commit: '8e1596b',
    message: 'Payment now uses actual logged-in user ID instead of Test User',
    env: {
      baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
      nodeEnv: process.env.NODE_ENV,
    }
  });
}
