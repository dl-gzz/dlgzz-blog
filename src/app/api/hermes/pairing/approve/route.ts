import { getSession } from '@/lib/server';
import { type NextRequest, NextResponse } from 'next/server';

const DEFAULT_BRIDGE_TIMEOUT_MS = 30_000;

interface PairingApproveRequestBody {
  assistantId?: unknown;
  code?: unknown;
}

interface BridgePairingApproveResponse {
  success?: boolean;
  assistantId?: string;
  status?: string;
  weixinUser?: string | null;
  message?: string;
  code?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再绑定微信 AI 助手',
      },
      { status: 401 }
    );
  }

  let body: PairingApproveRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '请求体不是有效 JSON' },
      { status: 400 }
    );
  }

  const assistantId =
    typeof body.assistantId === 'string' && body.assistantId.trim()
      ? body.assistantId.trim()
      : '';
  const code =
    typeof body.code === 'string' && body.code.trim()
      ? body.code.trim().toUpperCase()
      : '';

  if (!assistantId || !code) {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '缺少 assistantId 或 code' },
      { status: 400 }
    );
  }

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
    const response = await fetch(new URL('/pairing/approve', bridgeUrl), {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(getBridgeTimeoutMs()),
      headers: {
        ...getBridgeHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assistantId, code }),
    });

    const data = (await response.json().catch(() => null)) as
      | BridgePairingApproveResponse
      | null;

    if (!response.ok || !data?.success) {
      return NextResponse.json(
        {
          success: false,
          assistantId,
          code: data?.code || 'PAIRING_APPROVE_FAILED',
          error: data?.error || 'Hermes Bridge 授权配对码失败',
        },
        { status: response.ok ? 502 : response.status }
      );
    }

    return NextResponse.json({
      success: true,
      assistantId: data.assistantId || assistantId,
      status: data.status || 'paired',
      weixinUser: data.weixinUser || null,
      message: data.message || '微信用户已绑定',
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

  return DEFAULT_BRIDGE_TIMEOUT_MS;
}
