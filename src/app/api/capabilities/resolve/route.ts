import { reserveApiKeyRateLimit, verifyApiKey } from '@/lib/api-key';
import { resolveDispatch } from '@/lib/onework-dispatcher';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const DENY_MESSAGE: Record<string, { status: number; error: string }> = {
  missing: {
    status: 401,
    error: '缺少 API Key（Authorization: Bearer dk_live_…）',
  },
  invalid: { status: 401, error: 'API Key 无效' },
  revoked: { status: 403, error: 'API Key 已被吊销' },
  entitlement_expired: {
    status: 403,
    error: 'OneWorkOS 权益已过期，请续费后重试',
  },
  device_mismatch: {
    status: 403,
    error: '这把 Key 不属于当前电脑，请在 OneWorkOS 网站重新生成安装授权',
  },
  quota_exceeded: { status: 429, error: '本月调用额度已用完' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

class PayloadTooLargeError extends Error {}

async function readBoundedJsonObject(request: NextRequest, maxBytes: number) {
  if (!request.body) throw new Error('empty body');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new PayloadTooLargeError('payload too large');
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error('not an object');
  return parsed;
}

function resolverRateLimitPerMinute() {
  const configured = Number(
    process.env.ONEWORK_RESOLVER_RATE_LIMIT_PER_MINUTE || 30
  );
  return Number.isInteger(configured) && configured >= 1 && configured <= 300
    ? configured
    : 30;
}

/**
 * Resolve a user's goal against the governed OneWorkOS capability registry.
 * This is intentionally a JSON API because the Skill invokes it directly
 * from a local terminal; an unknown route must never fall through to HTML.
 */
export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 100_000) {
    return NextResponse.json(
      { success: false, code: 'PAYLOAD_TOO_LARGE', error: '请求体过大' },
      { status: 413 }
    );
  }

  let verified: Awaited<ReturnType<typeof verifyApiKey>>;
  try {
    verified = await verifyApiKey(
      request.headers.get('authorization'),
      request.headers.get('x-onework-device-id')
    );
  } catch (error) {
    console.error('[capabilities/resolve] authorization unavailable', error);
    return NextResponse.json(
      {
        success: false,
        code: 'AUTH_SERVICE_UNAVAILABLE',
        error: '授权服务暂时不可用，请稍后重试',
      },
      { status: 503 }
    );
  }
  if (!verified.ok) {
    const deny = DENY_MESSAGE[verified.reason];
    return NextResponse.json(
      {
        success: false,
        code: verified.reason.toUpperCase(),
        error: deny.error,
      },
      { status: deny.status }
    );
  }

  // Limit every authenticated attempt before parsing the body. Otherwise a
  // valid Key could bypass the limiter with malformed or chunked requests
  // while still forcing repeated authorization/database work.
  let rateLimit: Awaited<ReturnType<typeof reserveApiKeyRateLimit>>;
  try {
    rateLimit = await reserveApiKeyRateLimit({
      userId: verified.key.userId,
      kind: 'capability_resolve',
      limit: resolverRateLimitPerMinute(),
    });
  } catch (error) {
    console.error('[capabilities/resolve] rate limiter unavailable', error);
    return NextResponse.json(
      {
        success: false,
        code: 'RATE_LIMIT_SERVICE_UNAVAILABLE',
        error: '能力路由限流服务暂时不可用，请稍后重试',
      },
      { status: 503 }
    );
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        code: 'RATE_LIMITED',
        error: '能力路由请求过于频繁，请稍后重试',
        retryAt: rateLimit.resetsAt.toISOString(),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(
            Math.max(
              1,
              Math.ceil((rateLimit.resetsAt.getTime() - Date.now()) / 1000)
            )
          ),
        },
      }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJsonObject(request, 100_000);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json(
        { success: false, code: 'PAYLOAD_TOO_LARGE', error: '请求体过大' },
        { status: 413 }
      );
    }
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '请求体必须是 JSON 对象' },
      { status: 400 }
    );
  }

  const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
  const intentHint =
    typeof body.intentHint === 'string' ? body.intentHint.trim() : undefined;
  const context = body.context === undefined ? {} : body.context;
  const availableCapabilities =
    body.availableCapabilities === undefined ? [] : body.availableCapabilities;
  const executionRequested = body.executionRequested === true;
  const kind = typeof body.kind === 'string' ? body.kind.trim() : undefined;
  const skillId =
    typeof body.skillId === 'string' ? body.skillId.trim() : undefined;
  const limit = body.limit === undefined ? 8 : body.limit;

  if (
    !goal ||
    goal.length > 2_000 ||
    (intentHint !== undefined && intentHint.length > 200) ||
    !isRecord(context) ||
    !Array.isArray(availableCapabilities) ||
    availableCapabilities.length > 100 ||
    availableCapabilities.some(
      (value) =>
        typeof value !== 'string' ||
        value.trim().length === 0 ||
        value.length > 200
    ) ||
    (kind !== undefined && kind.length > 80) ||
    (skillId !== undefined && skillId.length > 160) ||
    typeof limit !== 'number' ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 20
  ) {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '能力路由参数无效' },
      { status: 400 }
    );
  }

  try {
    const result = await resolveDispatch(
      {
        goal,
        ...(intentHint ? { intentHint } : {}),
        context,
        availableCapabilities: availableCapabilities.map((value) =>
          value.trim()
        ),
        executionRequested,
        ...(kind ? { kind } : {}),
        ...(skillId ? { skillId } : {}),
        limit,
      },
      verified.key.userId
    );

    return NextResponse.json({
      success: true,
      resolution: result.resolution,
      quota: {
        limit: verified.key.monthlyQuota,
        usedThisMonth: verified.usedThisMonth,
      },
      rateLimit: {
        limitPerMinute: rateLimit.limit,
        remaining: rateLimit.remaining,
        resetsAt: rateLimit.resetsAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[capabilities/resolve]', error);
    return NextResponse.json(
      {
        success: false,
        code: 'CAPABILITY_RESOLUTION_FAILED',
        error: '能力路由解析失败，请稍后重试',
      },
      { status: 500 }
    );
  }
}
