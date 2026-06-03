import { provisionHermesAssistant } from '@/lib/hermes-bridge-client';
import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import {
  getWorkerInstanceForUser,
  isPaidWorkerInstance,
  listWorkerInstanceKnowledgePacksForUser,
  listWorkerInstanceSkillsForUser,
  updateWorkerInstanceActivation,
} from '@/lib/workers';
import { type NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    instanceId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再激活数字员工',
      },
      { status: 401 }
    );
  }

  const { instanceId } = await context.params;
  const target = await getWorkerInstanceForUser(instanceId, userId, {
    allowAdmin: canAccessHermesAdmin(session.user),
  });

  if (!target) {
    return NextResponse.json(
      {
        success: false,
        code: 'WORKER_INSTANCE_NOT_FOUND',
        error: '数字员工实例不存在',
      },
      { status: 404 }
    );
  }

  if (!isPaidWorkerInstance(target.instance)) {
    return NextResponse.json(
      {
        success: false,
        code: 'PAYMENT_REQUIRED',
        error: '请先完成员工月租付款，再生成微信激活二维码',
      },
      { status: 402 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const locale = typeof body?.locale === 'string' ? body.locale : 'zh';
  const instanceSkills =
    (await listWorkerInstanceSkillsForUser(instanceId, userId, {
      allowAdmin: canAccessHermesAdmin(session.user),
    })) || [];
  const enabledSkills = instanceSkills.filter((skill) => skill.enabled);
  const enabledSkillLines = enabledSkills.map(
    (skill) => `- ${skill.name}：${skill.summary}`
  );
  const enabledSkillCapabilityLines = enabledSkills.map(
    (skill) => `${skill.name}：${skill.summary}`
  );
  const knowledgePacks =
    (await listWorkerInstanceKnowledgePacksForUser(instanceId, userId, {
      allowAdmin: canAccessHermesAdmin(session.user),
    })) || [];
  const knowledgePackLines = knowledgePacks.map(
    (pack) => `- ${pack.id}：${pack.name}（${pack.scope}）`
  );
  const knowledgePackCapabilityLines = knowledgePacks.map(
    (pack) => `${pack.id}：${pack.name}（${pack.scope}）`
  );
  const serviceCapabilityLines = [
    ...enabledSkillCapabilityLines,
    ...knowledgePackCapabilityLines,
  ];
  const servicePrompt = [
    target.version.soulSnapshot.trim(),
    enabledSkillLines.length
      ? `\n## 本实例已启用技能\n${enabledSkillLines.join('\n')}`
      : '',
    knowledgePackLines.length
      ? `\n## 本实例可用知识库\n${knowledgePackLines.join('\n')}`
      : '',
    target.instance.personaPrompt
      ? `\n## 用户选择的性格偏好\n${target.instance.personaPrompt.trim()}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const provision = await provisionHermesAssistant({
      assistantId: target.instance.id,
      workerInstanceId: target.instance.id,
      userId: target.instance.userId,
      roleId: target.employee.id,
      employeeId: target.employee.id,
      employeeVersionId: target.version.id,
      serviceId: `worker-${target.employee.id}`,
      serviceName: target.employee.name,
      serviceSummary: target.employee.responsibility,
      servicePrompt,
      soulSnapshot: target.version.soulSnapshot,
      skillsSummary: enabledSkills.length
        ? enabledSkills.map((skill) => skill.name)
        : target.version.skillsSummary,
      enabledSkills,
      serviceCapabilities: serviceCapabilityLines.length
        ? serviceCapabilityLines
        : target.version.skillsSummary.length
        ? target.version.skillsSummary
        : [target.employee.suitableTasks].filter(Boolean),
      serviceDeliverables: [
        '独立 Hermes Profile',
        '员工灵魂快照',
        '微信扫码激活',
      ],
      source: 'workers-platform',
      locale,
      activationTtlSeconds: 120,
    });

    const updated = await updateWorkerInstanceActivation({
      instanceId: target.instance.id,
      status: provision.status || 'qr_ready',
      profileName: provision.profileName || null,
      activationId:
        provision.activationId || provision.assistantId || target.instance.id,
      qrPayload: provision.qrPayload || null,
      qrImageUrl: provision.qrImageUrl || null,
      expiresAt: provision.expiresAt || null,
      weixinAccountId: provision.weixinAccountId || null,
      weixinUserId: provision.weixinUserId || null,
      gatewayStatus: provision.gatewayStatus || null,
      error: provision.error || provision.gatewayError || null,
    });

    return NextResponse.json({
      success: true,
      instanceId: target.instance.id,
      status: updated?.status || provision.status || 'qr_ready',
      profileName: provision.profileName || null,
      activationId:
        provision.activationId || provision.assistantId || target.instance.id,
      qrPayload: provision.qrPayload || null,
      qrImageUrl: provision.qrImageUrl || null,
      expiresAt: provision.expiresAt || null,
      bindingInstructions: provision.bindingInstructions || [],
      message: provision.message || '请用微信扫码激活数字员工',
    });
  } catch (error) {
    await updateWorkerInstanceActivation({
      instanceId: target.instance.id,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Hermes Bridge 激活失败',
    });

    return NextResponse.json(
      {
        success: false,
        code: 'HERMES_PROVISION_FAILED',
        error: error instanceof Error ? error.message : 'Hermes Bridge 激活失败',
      },
      { status: 503 }
    );
  }
}
