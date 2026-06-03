import {
  getBotAssistantRole,
  isActiveBotAssistantRole,
} from '@/config/bot-assistants';
import { getSession } from '@/lib/server';
import { nanoid } from 'nanoid';
import { type NextRequest, NextResponse } from 'next/server';

const DEFAULT_BRIDGE_TIMEOUT_MS = 30_000;

interface ProvisionRequestBody {
  roleId?: unknown;
  source?: unknown;
  locale?: unknown;
}

interface BridgeProvisionResponse {
  success?: boolean;
  assistantId?: string;
  activationId?: string;
  status?: string;
  connectionMode?: string;
  profileName?: string | null;
  qrPayload?: string | null;
  qrImageUrl?: string | null;
  expiresAt?: string | null;
  weixinAccountId?: string | null;
  weixinHomeChannel?: string | null;
  bindingInstructions?: string[];
  message?: string;
  code?: string;
  error?: string;
}

export async function GET() {
  const bridgeUrl = getBridgeUrl();

  if (!bridgeUrl) {
    return NextResponse.json({
      success: false,
      configured: false,
      code: 'BRIDGE_NOT_CONFIGURED',
      error: 'Hermes Bridge 尚未配置',
    });
  }

  try {
    const response = await fetch(new URL('/health', bridgeUrl), {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
      headers: getBridgeHeaders(),
    });
    const data = await response.json().catch(() => null);

    return NextResponse.json({
      success: response.ok,
      configured: true,
      bridgeUrl: maskBridgeUrl(bridgeUrl),
      status: response.ok ? 'connected' : 'unhealthy',
      bridge: data,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        configured: true,
        bridgeUrl: maskBridgeUrl(bridgeUrl),
        code: 'BRIDGE_UNAVAILABLE',
        error: 'Hermes Bridge 未连接',
      },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再创建微信 AI 助手',
      },
      { status: 401 }
    );
  }

  let body: ProvisionRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '请求体不是有效 JSON' },
      { status: 400 }
    );
  }

  const roleId =
    typeof body.roleId === 'string' && body.roleId.trim()
      ? body.roleId.trim()
      : '';

  if (!roleId) {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '缺少 roleId' },
      { status: 400 }
    );
  }

  const role = getBotAssistantRole(roleId);
  if (!role || !isActiveBotAssistantRole(role)) {
    return NextResponse.json(
      {
        success: false,
        code: 'SERVICE_NOT_AVAILABLE',
        error: role ? `${role.name} 还没有开放真实服务开通` : '这个助手服务不存在',
      },
      { status: 400 }
    );
  }

  const bridgeUrl = getBridgeUrl();
  if (!bridgeUrl) {
    return NextResponse.json(
      {
        success: false,
        code: 'BRIDGE_NOT_CONFIGURED',
        error:
          'Hermes Bridge 尚未配置。请设置 HERMES_BRIDGE_URL 后再连接真实 Hermes。',
      },
      { status: 503 }
    );
  }

  const assistantId = `asst_${nanoid(12)}`;
  const payload = {
    assistantId,
    userId,
    roleId,
    serviceId: role.serviceId,
    serviceName: role.name,
    serviceSummary: role.serviceSummary,
    servicePrompt: role.systemPrompt,
    serviceCapabilities: role.capabilities,
    serviceDeliverables: role.deliverables,
    source:
      typeof body.source === 'string' && body.source.trim()
        ? body.source.trim()
        : 'bots-page',
    locale:
      typeof body.locale === 'string' && body.locale.trim()
        ? body.locale.trim()
        : 'zh',
  };

  try {
    const response = await fetch(new URL('/assistants/provision', bridgeUrl), {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(getBridgeTimeoutMs()),
      headers: {
        ...getBridgeHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as
      | BridgeProvisionResponse
      | null;

    if (!response.ok || !data?.success) {
      return NextResponse.json(
        {
          success: false,
          assistantId,
          code: data?.code || 'BRIDGE_PROVISION_FAILED',
          error: data?.error || 'Hermes Bridge 创建助手失败',
        },
        { status: response.ok ? 502 : response.status }
      );
    }

    return NextResponse.json({
      success: true,
      assistantId: data.assistantId || assistantId,
      activationId: data.activationId || data.assistantId || assistantId,
      status: data.status || 'provisioning',
      connectionMode: data.connectionMode || null,
      profileName: data.profileName || null,
      qrPayload: data.qrPayload || null,
      qrImageUrl: data.qrImageUrl || null,
      expiresAt: data.expiresAt || null,
      weixinAccountId: data.weixinAccountId || null,
      weixinHomeChannel: data.weixinHomeChannel || null,
      bindingInstructions: Array.isArray(data.bindingInstructions)
        ? data.bindingInstructions
        : [],
      message: data.message || 'Hermes Bridge 已接收创建请求',
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

function maskBridgeUrl(url: URL) {
  return `${url.protocol}//${url.hostname}:${url.port || defaultPort(url)}`;
}

function defaultPort(url: URL) {
  if (url.protocol === 'https:') return '443';
  if (url.protocol === 'http:') return '80';
  return '';
}
