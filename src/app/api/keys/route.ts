import { requireSession } from '@/lib/api-security';
import {
  issueApiKey,
  listUserApiKeys,
  revokeApiKey,
} from '@/lib/api-key';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** GET：列出我的 Key（只回前缀，不回明文）。 */
export async function GET() {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  const keys = await listUserApiKeys(auth.session.user.id);
  return NextResponse.json({ success: true, keys });
}

/** POST：签发一把新 Key（明文只在这次响应里返回一次）。 */
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : '';

  const issued = await issueApiKey({ userId: auth.session.user.id, name });
  return NextResponse.json({
    success: true,
    key: {
      id: issued.id,
      rawKey: issued.rawKey,
      keyPrefix: issued.keyPrefix,
    },
    notice: '请立即复制保存 rawKey，它只显示这一次。',
  });
}

/** DELETE?id=…：吊销一把 Key。 */
export async function DELETE(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  const keyId = request.nextUrl.searchParams.get('id')?.trim() || '';
  if (!keyId) {
    return NextResponse.json(
      { success: false, error: '缺少 id' },
      { status: 400 }
    );
  }

  const revoked = await revokeApiKey(auth.session.user.id, keyId);
  if (!revoked) {
    return NextResponse.json(
      { success: false, error: 'Key 不存在或不属于你' },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true });
}
