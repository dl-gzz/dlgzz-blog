import { runLearningAssistant } from '@/lib/hermes-learning-assistant';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    if (!isObjectRecord(body)) {
      return NextResponse.json(
        { success: false, error: '请求体必须是 JSON object' },
        { status: 400 }
      );
    }

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
