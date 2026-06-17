import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BUILD_MARKER = 'edu-courseware-db-blog-fallback-2026-06-17';

function firstPresentEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return null;
}

export async function GET() {
  return NextResponse.json({
    success: true,
    buildMarker: BUILD_MARKER,
    commit:
      firstPresentEnv([
        'ZEABUR_GIT_COMMIT_SHA',
        'GIT_COMMIT_SHA',
        'VERCEL_GIT_COMMIT_SHA',
        'RAILWAY_GIT_COMMIT_SHA',
        'CF_PAGES_COMMIT_SHA',
      ]) || null,
    branch:
      firstPresentEnv([
        'ZEABUR_GIT_BRANCH',
        'GIT_BRANCH',
        'VERCEL_GIT_COMMIT_REF',
        'RAILWAY_GIT_BRANCH',
        'CF_PAGES_BRANCH',
      ]) || null,
    checkedAt: new Date().toISOString(),
  });
}
