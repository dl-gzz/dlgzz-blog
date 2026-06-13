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
  try {
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

    const args = ['--student-id', studentId];
    const name = readText(body.name);
    const grade = readText(body.grade);
    if (name) args.push('--name', name);
    if (grade) args.push('--grade', grade);

    const result = await runLearningAssistant('create_student', args, {
      timeoutMs: 30000,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建学生档案失败',
      },
      { status: 400 }
    );
  }
}
