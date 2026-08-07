import {
  getBotAssistantRole,
  isActiveBotAssistantRole,
} from '@/config/bot-assistants';
import { requireSession } from '@/lib/api-security';
import {
  ensureHealthProfile,
  updateHealthAssistantForUser,
} from '@/lib/health';
import { provisionHermesAssistant } from '@/lib/hermes-bridge-client';
import { nanoid } from 'nanoid';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const auth = await requireSession('请先登录后再连接三高健康管家');
  if ('response' in auth) return auth.response;

  const userId = auth.session.user.id;
  const profile = await ensureHealthProfile(userId);
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;

  if (
    !force &&
    profile.hermesAssistantId &&
    profile.hermesStatus === 'active'
  ) {
    return NextResponse.json({
      success: true,
      assistant: {
        assistantId: profile.hermesAssistantId,
        activationId: profile.hermesActivationId,
        profileName: profile.hermesProfileName,
        connectionMode: profile.hermesConnectionMode || 'browser_profile',
        status: profile.hermesStatus,
      },
      message: '三高健康管家已连接',
    });
  }

  const role = getBotAssistantRole('health');
  if (!role || !isActiveBotAssistantRole(role)) {
    return NextResponse.json(
      {
        success: false,
        code: 'SERVICE_NOT_AVAILABLE',
        error: '三高健康管家还没有开放连接',
      },
      { status: 400 }
    );
  }

  const assistantId = profile.hermesAssistantId || `health_${nanoid(12)}`;

  try {
    const provision = await provisionHermesAssistant({
      assistantId,
      userId,
      roleId: role.id,
      serviceId: role.serviceId,
      serviceName: role.name,
      serviceSummary: role.serviceSummary,
      servicePrompt: role.systemPrompt,
      serviceCapabilities: role.capabilities,
      serviceDeliverables: role.deliverables,
      connectionMode: 'browser_profile',
      source: 'health-dashboard',
      locale: typeof body?.locale === 'string' ? body.locale : 'zh',
    });

    const updatedProfile = await updateHealthAssistantForUser(userId, {
      assistantId: provision.assistantId || assistantId,
      activationId:
        provision.activationId || provision.assistantId || assistantId,
      profileName: provision.profileName || null,
      connectionMode: provision.connectionMode || 'browser_profile',
      status: provision.status || 'active',
    });

    return NextResponse.json({
      success: true,
      assistant: {
        assistantId: updatedProfile?.hermesAssistantId || assistantId,
        activationId:
          updatedProfile?.hermesActivationId ||
          provision.activationId ||
          provision.assistantId ||
          assistantId,
        profileName: updatedProfile?.hermesProfileName || provision.profileName,
        connectionMode:
          updatedProfile?.hermesConnectionMode ||
          provision.connectionMode ||
          'browser_profile',
        status: updatedProfile?.hermesStatus || provision.status || 'active',
      },
      message: provision.message || '三高健康管家已连接 Hermes',
    });
  } catch (error) {
    await updateHealthAssistantForUser(userId, {
      assistantId,
      connectionMode: 'browser_profile',
      status: 'failed',
    });

    return NextResponse.json(
      {
        success: false,
        code: 'HERMES_PROVISION_FAILED',
        error:
          error instanceof Error ? error.message : 'Hermes Bridge 连接失败',
      },
      { status: 503 }
    );
  }
}
