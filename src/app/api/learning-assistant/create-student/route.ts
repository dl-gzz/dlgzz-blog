import { requireHermesAdmin, requireSameOrigin } from '@/lib/api-security';
import { runLearningAssistant } from '@/lib/hermes-learning-assistant';
import {
  StudentAccessConfigurationError,
  issueStudentAccessToken,
} from '@/lib/student-access';
import { getBaseUrl } from '@/lib/urls/urls';
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

    const args = ['--student-id', studentId];
    const name = readText(body.name);
    const grade = readText(body.grade);
    if (name.length > 200 || grade.length > 80) {
      return NextResponse.json(
        { success: false, error: '学生资料过长' },
        { status: 400 }
      );
    }
    if (name) args.push('--name', name);
    if (grade) args.push('--grade', grade);

    // Validate the signing configuration before creating or updating data.
    const studentAccess = issueStudentAccessToken(studentId);

    const result = await runLearningAssistant('create_student', args, {
      timeoutMs: 30000,
    });

    if (result.success === false) return NextResponse.json(result);

    const whiteboardUrl = new URL('/whiteboard', getBaseUrl());
    whiteboardUrl.searchParams.set('studentId', studentId);
    whiteboardUrl.hash = new URLSearchParams({
      studentToken: studentAccess.token,
    }).toString();

    return NextResponse.json({
      ...result,
      studentAccessToken: studentAccess.token,
      studentAccessExpiresAt: studentAccess.expiresAt,
      whiteboardUrl: whiteboardUrl.toString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code:
          error instanceof StudentAccessConfigurationError
            ? 'STUDENT_ACCESS_NOT_CONFIGURED'
            : undefined,
        error:
          error instanceof StudentAccessConfigurationError
            ? '学生访问令牌服务未配置，请设置独立签名密钥'
            : error instanceof Error
              ? error.message
              : '创建学生档案失败',
      },
      {
        status: error instanceof StudentAccessConfigurationError ? 503 : 400,
      }
    );
  }
}
