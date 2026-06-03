import { getSession } from '@/lib/server';
import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { NextResponse } from 'next/server';

const DEFAULT_BRIDGE_TIMEOUT_MS = 30_000;

interface BridgeAdminAssistantsResponse {
  success?: boolean;
  generatedAt?: string;
  summary?: Record<string, number>;
  assistants?: unknown[];
  code?: string;
  error?: string;
}

export async function GET() {
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再查看助手管理后台',
      },
      { status: 401 }
    );
  }

  if (!canAccessHermesAdmin(session.user)) {
    return NextResponse.json(
      {
        success: false,
        code: 'FORBIDDEN',
        error: '当前账号没有助手管理后台权限',
      },
      { status: 403 }
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
    const response = await fetch(new URL('/admin/assistants', bridgeUrl), {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(getBridgeTimeoutMs()),
      headers: getBridgeHeaders(),
    });
    const data = (await response.json().catch(() => null)) as
      | BridgeAdminAssistantsResponse
      | null;

    if (!response.ok || !data?.success) {
      return NextResponse.json(
        {
          success: false,
          code: data?.code || 'BRIDGE_ADMIN_FAILED',
          error: data?.error || 'Hermes Bridge 查询助手列表失败',
        },
        { status: response.ok ? 502 : response.status }
      );
    }

    return NextResponse.json({
      success: true,
      generatedAt: data.generatedAt || new Date().toISOString(),
      summary: data.summary || {},
      assistants: Array.isArray(data.assistants) ? data.assistants : [],
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
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
