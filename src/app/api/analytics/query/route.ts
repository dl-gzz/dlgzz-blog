import {
  completeApiKeyUsage,
  reserveApiKeyUsage,
  verifyApiKey,
} from '@/lib/api-key';
import {
  SemanticQueryError,
  type SemanticQueryMode,
  executeSemanticQuery,
} from '@/lib/semantic-layer';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 100_000;
const DEFAULT_ROUTE_TIMEOUT_MS = 15_000;

const DENY_MESSAGE: Record<string, { status: number; error: string }> = {
  missing: {
    status: 401,
    error: '缺少 API Key（Authorization: Bearer dk_live_…）',
  },
  invalid: { status: 401, error: 'API Key 无效' },
  revoked: { status: 403, error: 'API Key 已被吊销' },
  entitlement_expired: {
    status: 403,
    error: 'one-worker-os 权益已过期，请续费后重试',
  },
  device_mismatch: {
    status: 403,
    error: '这把 Key 不属于当前电脑，请在 one-worker-os 网站重新生成安装授权',
  },
  quota_exceeded: { status: 429, error: '本月调用额度已用完' },
};

class AnalyticsRouteTimeoutError extends Error {
  constructor() {
    super('分析查询超时');
    this.name = 'AnalyticsRouteTimeoutError';
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isDatabaseTimeout(error: unknown) {
  if (!isRecord(error)) return false;
  return (
    error.code === '57014' ||
    (typeof error.message === 'string' &&
      /statement timeout|canceling statement due to/i.test(error.message))
  );
}

function routeTimeoutMs() {
  const configured = Number(process.env.ONEWORK_ANALYTICS_API_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_ROUTE_TIMEOUT_MS;
  return Math.max(2_000, Math.min(Math.floor(configured), 30_000));
}

async function withRouteTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AnalyticsRouteTimeoutError()),
          routeTimeoutMs()
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function completeUsageSafely(
  input: Parameters<typeof completeApiKeyUsage>[0]
) {
  try {
    await completeApiKeyUsage(input);
  } catch (error) {
    // The reservation already counts toward quota. Completion enriches the
    // audit row and must never turn an otherwise valid JSON response into an
    // unhandled framework error page.
    console.error('[analytics/query] usage completion failed', error);
  }
}

/** Execute a governed semantic query for an entitled one-worker-os API key. */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(
      { success: false, code: 'PAYLOAD_TOO_LARGE', error: '请求体过大' },
      413
    );
  }

  let verified: Awaited<ReturnType<typeof verifyApiKey>>;
  try {
    verified = await verifyApiKey(
      request.headers.get('authorization'),
      request.headers.get('x-onework-device-id')
    );
  } catch (error) {
    console.error('[analytics/query] API key verification failed', error);
    return json(
      {
        success: false,
        code: 'AUTH_SERVICE_UNAVAILABLE',
        error: '授权服务暂时不可用，请稍后重试',
      },
      503
    );
  }
  if (!verified.ok) {
    const deny = DENY_MESSAGE[verified.reason];
    return json(
      {
        success: false,
        code: verified.reason.toUpperCase(),
        error: deny.error,
      },
      deny.status
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!isRecord(parsed)) throw new Error('not an object');
    body = parsed;
  } catch {
    return json(
      {
        success: false,
        code: 'BAD_REQUEST',
        error: '请求体必须是 JSON 对象',
      },
      400
    );
  }

  const mode = body.mode === undefined ? 'execute' : body.mode;
  if (
    !isRecord(body.semanticQuery) ||
    (mode !== 'execute' && mode !== 'validate')
  ) {
    return json(
      {
        success: false,
        code: 'BAD_REQUEST',
        error:
          '请提供 semanticQuery JSON 对象，mode 仅支持 execute 或 validate',
      },
      400
    );
  }

  let reservation: Awaited<ReturnType<typeof reserveApiKeyUsage>>;
  try {
    // V1 follows the existing per-endpoint reservation contract. one-worker-os will
    // later correlate resolver/knowledge/analytics calls into one user-question
    // charge at the orchestration layer without changing this API response.
    reservation = await reserveApiKeyUsage({
      apiKeyId: verified.key.id,
      userId: verified.key.userId,
      monthlyQuota: verified.key.monthlyQuota,
      kind: 'analytics_query',
      serviceId: 'analytics.query',
      query: JSON.stringify({
        model: body.semanticQuery.model ?? body.semanticQuery.modelId ?? '',
        metrics: body.semanticQuery.metrics ?? [],
        dimensions: body.semanticQuery.dimensions ?? [],
        mode,
      }),
    });
  } catch (error) {
    console.error('[analytics/query] quota reservation failed', error);
    return json(
      {
        success: false,
        code: 'METERING_UNAVAILABLE',
        error: '用量校验暂时不可用，请稍后重试',
      },
      503
    );
  }
  if (!reservation) {
    return json(
      { success: false, code: 'QUOTA_EXCEEDED', error: '本月调用额度已用完' },
      429
    );
  }

  try {
    const result = await withRouteTimeout(
      executeSemanticQuery(
        body.semanticQuery,
        verified.key.userId,
        mode as SemanticQueryMode
      )
    );

    await completeUsageSafely({
      eventId: reservation.eventId,
      status: 'ok',
      resultCount: result.rowCount,
      latencyMs: Date.now() - startedAt,
    });

    return json({
      success: true,
      requestId: result.runId,
      mode: result.mode,
      result: {
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        truncated: result.truncated,
      },
      evidence: {
        model: result.model.key,
        modelId: result.model.id,
        modelVersion: result.model.version,
        metricDefinitions: result.metricDefinitions,
        resolvedTimeRange: result.resolvedTimeRange,
        executedAt: new Date().toISOString(),
      },
      quota: {
        limit: verified.key.monthlyQuota,
        usedThisMonth: reservation.usedThisMonth + 1,
      },
    });
  } catch (error) {
    await completeUsageSafely({
      eventId: reservation.eventId,
      status: 'error',
      latencyMs: Date.now() - startedAt,
    });

    if (error instanceof SemanticQueryError) {
      return json(
        { success: false, code: error.code, error: error.message },
        error.status
      );
    }
    if (
      error instanceof AnalyticsRouteTimeoutError ||
      isDatabaseTimeout(error)
    ) {
      return json(
        {
          success: false,
          code: 'QUERY_TIMEOUT',
          error: '分析查询超时，请缩短时间范围或减少维度后重试',
        },
        504
      );
    }

    console.error('[analytics/query]', error);
    return json(
      {
        success: false,
        code: 'QUERY_FAILED',
        error: '分析查询失败，请稍后重试',
      },
      500
    );
  }
}
