import { runLearningAssistant } from '@/lib/hermes-learning-assistant';
import { requireStudentAccess } from '@/lib/student-access';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as unknown;
  if (!isObjectRecord(body)) {
    return NextResponse.json(
      { success: false, error: '请求体必须是 JSON object' },
      { status: 400 }
    );
  }

  const studentId = readText(body.studentId);
  if (!studentId) {
    return NextResponse.json(
      { success: false, error: '缺少 studentId' },
      { status: 400 }
    );
  }

  const auth = await requireStudentAccess(request, studentId);
  if ('response' in auth) return auth.response;

  try {
    const result = await runLearningAssistant('record_quiz', [], {
      input: body,
      timeoutMs: 30000,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '保存答题记录失败',
      },
      { status: 400 }
    );
  }
}
