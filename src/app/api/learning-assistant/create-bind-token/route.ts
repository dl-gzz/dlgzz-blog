import { requireHermesAdmin, requireSameOrigin } from '@/lib/api-security';
import { runLearningAssistant } from '@/lib/hermes-learning-assistant';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  const auth = await requireHermesAdmin('学习助手接口暂只允许管理员访问');
  if ('response' in auth) return auth.response;

  try {
    const body = (await request.json().catch(() => null)) as unknown;
    if (!isObjectRecord(body)) {
      return NextResponse.json(
        { success: false, error: '请求体必须是 JSON object' },
        { status: 400 }
      );
    }

    const studentId = readText(body.studentId);
    if (!studentId || studentId.length > 160 || /[\u0000-\u001f]/.test(studentId)) {
      return NextResponse.json(
        { success: false, error: '缺少 studentId' },
        { status: 400 }
      );
    }

    const result = await runLearningAssistant(
      'create_bind_token',
      ['--student-id', studentId],
      { timeoutMs: 30000 }
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : '生成家长绑定 token 失败',
      },
      { status: 400 }
    );
  }
}
