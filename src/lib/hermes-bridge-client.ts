import 'server-only';

const DEFAULT_BRIDGE_TIMEOUT_MS = 30_000;

export interface BridgeProvisionPayload {
  assistantId: string;
  userId: string;
  roleId: string;
  serviceId: string;
  serviceName: string;
  serviceSummary: string;
  servicePrompt: string;
  serviceCapabilities: string[];
  serviceDeliverables: string[];
  source: string;
  locale: string;
  workerInstanceId?: string;
  employeeId?: string;
  employeeVersionId?: string;
  soulSnapshot?: string;
  skillsSummary?: string[];
  enabledSkills?: Array<{
    id: string;
    name: string;
    summary: string;
    skillType: string;
    riskLevel: string;
  }>;
  activationTtlSeconds?: number;
}

export interface BridgeProvisionResponse {
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
  weixinUserId?: string | null;
  gatewayStatus?: string | null;
  gatewayError?: string | null;
  bindingInstructions?: string[];
  message?: string;
  code?: string;
  error?: string;
}

export function isHermesBridgeConfigured() {
  return Boolean(getBridgeUrl());
}

export async function provisionHermesAssistant(payload: BridgeProvisionPayload) {
  const bridgeUrl = getBridgeUrl();
  if (!bridgeUrl) {
    throw new Error('Hermes Bridge 尚未配置');
  }

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
    throw new Error(data?.error || 'Hermes Bridge 创建助手失败');
  }

  return data;
}

export async function getHermesActivationStatus(assistantId: string) {
  const bridgeUrl = getBridgeUrl();
  if (!bridgeUrl) {
    throw new Error('Hermes Bridge 尚未配置');
  }

  const url = new URL('/activations/status', bridgeUrl);
  url.searchParams.set('assistantId', assistantId);

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(getBridgeTimeoutMs()),
    headers: getBridgeHeaders(),
  });
  const data = (await response.json().catch(() => null)) as
    | BridgeProvisionResponse
    | null;

  if (!response.ok || !data?.success) {
    throw new Error(data?.error || 'Hermes Bridge 查询激活状态失败');
  }

  return data;
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
    'X-Hermes-Bridge-Token': token,
  };
}

function getBridgeTimeoutMs() {
  const rawTimeout = Number(process.env.HERMES_BRIDGE_TIMEOUT_MS);
  if (Number.isFinite(rawTimeout) && rawTimeout > 0) {
    return rawTimeout;
  }

  return DEFAULT_BRIDGE_TIMEOUT_MS;
}
