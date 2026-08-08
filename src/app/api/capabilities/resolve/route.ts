import {
  completeApiKeyUsage,
  reserveApiKeyUsage,
  verifyApiKey,
} from '@/lib/api-key';
import { resolveDispatch } from '@/lib/onework-dispatcher';
import { NextRequest, NextResponse } from 'next/server';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Resolve a user's goal against the governed OneWorkOS capability registry.
 * This is intentionally a JSON API because the Skill invokes it directly
 * from a local terminal; an unknown route must never fall through to HTML.
 */
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
      { success: false, code: verified.reason.toUpperCase(), error: deny.error },
      { status: deny.status }
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!isRecord(parsed)) throw new Error('not an object');
    body = parsed;
  } catch {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '请求体必须是 JSON 对象' },
      { status: 400 }
    );
  }

  const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
  const intentHint = typeof body.intentHint === 'string' ? body.intentHint.trim() : undefined;
  const context = body.context === undefined ? {} : body.context;
  const availableCapabilities = body.availableCapabilities === undefined
    ? []
    : body.availableCapabilities;
  const executionRequested = body.executionRequested === true;
  const kind = typeof body.kind === 'string' ? body.kind.trim() : undefined;
  const skillId = typeof body.skillId === 'string' ? body.skillId.trim() : undefined;
  const limit = body.limit === undefined ? 8 : body.limit;

  if (
    !goal ||
    goal.length > 2_000 ||
    (intentHint !== undefined && intentHint.length > 200) ||
    !isRecord(context) ||
    !Array.isArray(availableCapabilities) ||
    availableCapabilities.length > 100 ||
    availableCapabilities.some(
      (value) => typeof value !== 'string' || value.trim().length === 0 || value.length > 200
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

  const reservation = await reserveApiKeyUsage({
    apiKeyId: verified.key.id,
    userId: verified.key.userId,
    kind: 'capability_resolve',
    query: goal,
  });
  if (!reservation) {
    return NextResponse.json(
      { success: false, code: 'QUOTA_EXCEEDED', error: '本月调用额度已用完' },
      { status: 429 }
    );
  }

  try {
    const result = await resolveDispatch(
      {
        goal,
        ...(intentHint ? { intentHint } : {}),
        context,
        availableCapabilities: availableCapabilities.map((value) => value.trim()),
        executionRequested,
        ...(kind ? { kind } : {}),
        ...(skillId ? { skillId } : {}),
        limit,
      },
      verified.key.userId
    );

    await completeApiKeyUsage({
      eventId: reservation.eventId,
      status: 'ok',
      resultCount: result.resolution.capabilities.length,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: true,
      resolution: result.resolution,
      quota: {
        limit: verified.key.monthlyQuota,
        usedThisMonth: reservation.usedThisMonth + 1,
      },
    });
  } catch (error) {
    await completeApiKeyUsage({
      eventId: reservation.eventId,
      status: 'error',
      latencyMs: Date.now() - startedAt,
    });
    console.error('[capabilities/resolve]', error);
    return NextResponse.json(
      { success: false, code: 'CAPABILITY_RESOLUTION_FAILED', error: '能力路由解析失败，请稍后重试' },
      { status: 500 }
    );
  }
}
