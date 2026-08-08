import { requireSession } from '@/lib/api-security';
import { listOneWorkAccess } from '@/lib/onework-access';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  const access = await listOneWorkAccess(auth.session.user.id);
  return NextResponse.json({ success: true, ...access });
}

