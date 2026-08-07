import { verifyApiKey } from '@/lib/api-key';
import { resolveDispatch } from '@/lib/onework-dispatcher';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

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

const requestSchema = z
  .object({
    goal: z.string().trim().min(1).max(2000).optional(),
    intent: z.string().trim().min(1).max(2000).optional(),
    intentHint: z.string().trim().min(1).max(200).optional(),
    context: z.record(z.string(), z.unknown()).default({}),
    availableCapabilities: z
      .array(z.string().trim().min(1).max(160))
      .max(100)
      .default([]),
    executionRequested: z.boolean().default(false),
    kind: z.string().trim().min(1).max(100).optional(),
    skillId: z.string().trim().min(1).max(160).optional(),
    limit: z.number().int().positive().max(20).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.goal || value.intent), {
    message: '缺少 goal 或 intent',
  });

export async function POST(request: NextRequest) {
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
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '请求体必须是 JSON' },
      { status: 400 }
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        code: 'BAD_REQUEST',
        error: parsed.error.issues[0]?.message ?? '请求格式无效',
      },
      { status: 400 }
    );
  }

  try {
    const dispatch = await resolveDispatch(
      {
        goal: parsed.data.goal || parsed.data.intent || '',
        intentHint: parsed.data.intentHint,
        context: parsed.data.context,
        availableCapabilities: [...new Set(parsed.data.availableCapabilities)],
        executionRequested: parsed.data.executionRequested,
        kind: parsed.data.kind,
        skillId: parsed.data.skillId,
        limit: parsed.data.limit,
      },
      verified.key.userId
    );
    return NextResponse.json({
      success: true,
      ...dispatch,
    });
  } catch (error) {
    console.error('[capabilities/resolve] failed:', error);
    return NextResponse.json(
      {
        success: false,
        code: 'RESOLUTION_FAILED',
        error: '能力解析失败',
      },
      { status: 500 }
    );
  }
}
