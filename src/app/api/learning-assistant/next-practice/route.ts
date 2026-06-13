import { runLearningAssistant } from '@/lib/hermes-learning-assistant';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function readText(value: string | null, fallback = '') {
  return value?.trim() ? value.trim() : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const studentId = readText(request.nextUrl.searchParams.get('studentId'));
    if (!studentId) {
      return NextResponse.json(
        { success: false, error: '缺少 studentId' },
        { status: 400 }
      );
    }

    const args = ['--student-id', studentId];
    const dueBefore = readText(request.nextUrl.searchParams.get('dueBefore'));
    const limit = readText(request.nextUrl.searchParams.get('limit'), '8');
    const poolLimit = readText(
      request.nextUrl.searchParams.get('poolLimit'),
      '20'
    );

    if (dueBefore) args.push('--due-before', dueBefore);
    args.push('--limit', limit, '--pool-limit', poolLimit);

    const result = await runLearningAssistant('next_practice', args, {
      timeoutMs: 30000,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '生成下一次练习失败',
      },
      { status: 400 }
    );
  }
}
