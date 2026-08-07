import {
  completeApiKeyUsage,
  recordUsage,
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

const DENY_MESSAGE: Record<string, { status: number; error: string }> = {
  missing: {
    status: 401,
    error: '缺少 API Key（Authorization: Bearer dk_live_…）',
  },
  invalid: { status: 401, error: 'API Key 无效' },
  revoked: { status: 403, error: 'API Key 已被吊销' },
  quota_exceeded: { status: 429, error: '本月调用额度已用完' },
};

function summarizeQuery(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '';
  const value = body as Record<string, unknown>;
  return JSON.stringify({
    modelId: value.modelId,
    metrics: value.metrics,
    dimensions: value.dimensions,
  });
}

function unwrapRequest(body: unknown): {
  semanticQuery: unknown;
  mode: SemanticQueryMode;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new SemanticQueryError('BAD_REQUEST', '请求体必须是 JSON 对象', 400);
  }
  const value = body as Record<string, unknown>;
  if (!('semanticQuery' in value)) {
    return { semanticQuery: body, mode: 'execute' };
  }
  const unknownKeys = Object.keys(value).filter(
    (key) => key !== 'semanticQuery' && key !== 'mode'
  );
  if (unknownKeys.length) {
    throw new SemanticQueryError(
      'BAD_REQUEST',
      `未支持的字段: ${unknownKeys[0]}`,
      400
    );
  }
  if (
    value.mode !== undefined &&
    value.mode !== 'execute' &&
    value.mode !== 'validate'
  ) {
    throw new SemanticQueryError(
      'BAD_REQUEST',
      'mode 必须是 execute 或 validate',
      400
    );
  }
  return {
    semanticQuery: value.semanticQuery,
    mode: (value.mode as SemanticQueryMode | undefined) ?? 'execute',
  };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 100_000) {
    return NextResponse.json(
      { success: false, code: 'PAYLOAD_TOO_LARGE', error: '请求体过大' },
      { status: 413 }
    );
  }

  const verified = await verifyApiKey(request.headers.get('authorization'));
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

  let body: unknown;
  let reservation: Awaited<ReturnType<typeof reserveApiKeyUsage>> = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '请求体必须是 JSON' },
      { status: 400 }
    );
  }

  try {
    const parsed = unwrapRequest(body);
    const usageQuery = summarizeQuery(parsed.semanticQuery);
    reservation = await reserveApiKeyUsage({
      apiKeyId: verified.key.id,
      userId: verified.key.userId,
      kind: 'analytics_query',
      serviceId: 'onework-analytics-v1',
      query: usageQuery,
    });
    if (!reservation) {
      return NextResponse.json(
        { success: false, code: 'QUOTA_EXCEEDED', error: '本月调用额度已用完' },
        { status: 429 }
      );
    }
    const result = await executeSemanticQuery(
      parsed.semanticQuery,
      verified.key.userId,
      parsed.mode
    );
    await completeApiKeyUsage({
      eventId: reservation.eventId,
      status: 'ok',
      resultCount: result.rowCount,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: true,
      requestId: result.runId,
      result:
        result.mode === 'validate'
          ? { valid: true, columns: result.columns }
          : {
              columns: result.columns,
              rows: result.rows,
              rowCount: result.rowCount,
              truncated: false,
            },
      evidence: {
        model: result.model.key,
        modelVersion: result.model.version,
        metricDefinitions: result.metricDefinitions,
        resolvedTimeRange: result.resolvedTimeRange,
        executedAt: new Date().toISOString(),
      },
      queryHash: result.queryHash,
      quota: {
        limit: verified.key.monthlyQuota,
        usedThisMonth: reservation.usedThisMonth + 1,
      },
    });
  } catch (error) {
    const semanticQuery =
      body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      'semanticQuery' in body
        ? (body as Record<string, unknown>).semanticQuery
        : body;
    if (reservation) {
      await completeApiKeyUsage({
        eventId: reservation.eventId,
        status: 'error',
        latencyMs: Date.now() - startedAt,
      });
    } else {
      await recordUsage({
        apiKeyId: verified.key.id,
        userId: verified.key.userId,
        kind: 'analytics_query',
        serviceId: 'onework-analytics-v1',
        query: summarizeQuery(semanticQuery),
        latencyMs: Date.now() - startedAt,
        status: error instanceof SemanticQueryError ? 'denied' : 'error',
      });
    }

    if (error instanceof SemanticQueryError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status }
      );
    }
    console.error('[analytics/query] failed:', error);
    return NextResponse.json(
      {
        success: false,
        code: 'QUERY_FAILED',
        error: '分析查询失败',
      },
      { status: 500 }
    );
  }
}
