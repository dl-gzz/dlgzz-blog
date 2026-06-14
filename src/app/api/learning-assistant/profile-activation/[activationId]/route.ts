import { getHermesActivationStatus } from '@/lib/hermes-bridge-client';
import { runLearningAssistant } from '@/lib/hermes-learning-assistant';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{
    activationId: string;
  }>;
}

function readText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function bindActivatedParent({
  studentId,
  activationId,
  profileName,
  weixinUserId,
  status,
}: {
  studentId: string;
  activationId: string;
  profileName: string;
  weixinUserId: string;
  status: string;
}) {
  const profileResult = await runLearningAssistant(
    'set_profile',
    [
      '--student-id',
      studentId,
      '--json',
      JSON.stringify({
        hermesProfileId: profileName,
        hermesActivationId: activationId,
        hermesActivationStatus: status,
        parentWeixinUserId: weixinUserId,
        parentBoundVia: 'hermes-bridge-weixin-activation',
        parentBoundAt: new Date().toISOString(),
      }),
    ],
    { timeoutMs: 30000 }
  );

  const bindingResult = await runLearningAssistant(
    'bind_parent',
    [
      '--parent-id',
      weixinUserId,
      '--student-id',
      studentId,
      '--allow-without-token',
    ],
    { timeoutMs: 30000 }
  );

  return { profile: profileResult, binding: bindingResult };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { activationId } = await context.params;
    const studentId = readText(request.nextUrl.searchParams.get('studentId'));
    if (!studentId) {
      return NextResponse.json(
        { success: false, error: '缺少 studentId' },
        { status: 400 }
      );
    }

    const status = await getHermesActivationStatus(activationId);
    const profileName = readText(status.profileName);
    const weixinUserId = readText(status.weixinUserId);
    const activated = status.status === 'activated';
    let finalized: Awaited<ReturnType<typeof bindActivatedParent>> | null = null;

    if (activated && profileName && weixinUserId) {
      finalized = await bindActivatedParent({
        studentId,
        activationId,
        profileName,
        weixinUserId,
        status: status.status || 'activated',
      });
    }

    return NextResponse.json({
      success: true,
      studentId,
      activationId: status.activationId || status.assistantId || activationId,
      status: status.status || 'qr_ready',
      profileName: profileName || null,
      hermesProfileId: profileName || null,
      qrPayload: status.qrPayload || null,
      qrImageUrl: status.qrImageUrl || null,
      expiresAt: status.expiresAt || null,
      weixinUserId: weixinUserId || null,
      gatewayStatus: status.gatewayStatus || null,
      gatewayError: status.gatewayError || null,
      bound: Boolean(finalized?.binding),
      binding: finalized?.binding || null,
      message:
        activated && finalized?.binding
          ? '家长微信已绑定到学生档案'
          : status.message || '等待微信扫码',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : '查询 Hermes 绑定状态失败',
      },
      { status: 503 }
    );
  }
}
