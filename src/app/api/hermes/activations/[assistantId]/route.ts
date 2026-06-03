import { getSession } from '@/lib/server';
import { type NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    assistantId: string;
  }>;
}

interface BridgeActivationStatusResponse {
  success?: boolean;
  assistantId?: string;
  status?: string;
  profileName?: string | null;
  qrPayload?: string | null;
  expiresAt?: string | null;
  weixinAccountId?: string | null;
  weixinUserId?: string | null;
  message?: string;
  code?: string;
  error?: string;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再查看微信助手激活状态',
      },
      { status: 401 }
    );
  }

  const { assistantId } = await context.params;
  const bridgeUrl = getBridgeUrl();

  if (!bridgeUrl) {
    return NextResponse.json(
      {
        success: false,
        code: 'BRIDGE_NOT_CONFIGURED',
        error: 'Hermes Bridge 尚未配置',
      },
      { status: 503 }
    );
  }

  try {
    const url = new URL('/activations/status', bridgeUrl);
    url.searchParams.set('assistantId', assistantId);

    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(getBridgeTimeoutMs()),
      headers: getBridgeHeaders(),
    });
    const data = (await response.json().catch(() => null)) as
      | BridgeActivationStatusResponse
      | null;

    if (!response.ok || !data?.success) {
      return NextResponse.json(
        {
          success: false,
          assistantId,
          status: data?.status || null,
          code: data?.code || 'ACTIVATION_STATUS_FAILED',
          error: data?.error || 'Hermes Bridge 查询激活状态失败',
        },
        { status: response.ok ? 502 : response.status }
      );
    }

    return NextResponse.json({
      success: true,
      assistantId: data.assistantId || assistantId,
      status: data.status || 'qr_ready',
      profileName: data.profileName || null,
      qrPayload: data.qrPayload || null,
      expiresAt: data.expiresAt || null,
      weixinAccountId: data.weixinAccountId || null,
      weixinUserId: data.weixinUserId || null,
      message: data.message || '等待微信扫码',
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        assistantId,
        code: 'BRIDGE_UNAVAILABLE',
        error: 'Hermes Bridge 未连接或响应超时',
      },
      { status: 503 }
    );
  }
}

function getBridgeUrl() {
  const rawUrl = process.env.HERMES_BRIDGE_URL?.trim();
  if (!rawUrl) return null;

  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function getBridgeHeaders(): Record<string, string> {
  const token = process.env.HERMES_BRIDGE_TOKEN?.trim();
  if (!token) return {};

  return {
    Authorization: `Bearer ${token}`,
  };
}

function getBridgeTimeoutMs() {
  const rawTimeout = Number(process.env.HERMES_BRIDGE_TIMEOUT_MS);
  if (Number.isFinite(rawTimeout) && rawTimeout > 0) {
    return rawTimeout;
  }

  return 30_000;
}
