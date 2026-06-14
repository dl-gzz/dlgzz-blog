import { provisionHermesAssistant } from '@/lib/hermes-bridge-client';
import { runLearningAssistant } from '@/lib/hermes-learning-assistant';
import { createHash } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function buildAssistantId(studentId: string) {
  const hash = createHash('sha256').update(studentId).digest('hex').slice(0, 16);
  return `edu_${hash}`;
}

function buildServicePrompt({
  studentId,
  name,
  grade,
}: {
  studentId: string;
  name: string;
  grade: string;
}) {
  const displayName = name || studentId;
  return [
    '# AI 学习助手家长端',
    '',
    `你是 ${displayName} 的学习助手，运行在家长微信里。`,
    '',
    '## 学生档案',
    `- 学生编号：${studentId}`,
    name ? `- 姓名：${name}` : '',
    grade ? `- 年级：${grade}` : '',
    '',
    '## 行为规则',
    '- 家长问学习情况、薄弱点、错题、复习建议时，调用 learning-assistant skill 的 answer_parent。',
    '- 优先使用当前微信会话的 HERMES_SESSION_USER_ID 作为 parentId；如工具需要显式参数，则把当前发信人微信 ID 传给 --parent-id。',
    `- 如果家长没有说明孩子，默认查询学生编号 ${studentId}；如 skill 返回 needChild，再温和追问家长要查哪个孩子。`,
    '- 只回答与孩子学习记录、白板答题、错题复习、学习建议相关的问题。',
    '- 语气简洁、温和、像一位靠谱的老师，不夸大、不制造焦虑。',
  ]
    .filter(Boolean)
    .join('\n');
}

async function ensureStudentProfile({
  studentId,
  name,
  grade,
}: {
  studentId: string;
  name: string;
  grade: string;
}) {
  const args = ['--student-id', studentId];
  if (name) args.push('--name', name);
  if (grade) args.push('--grade', grade);

  try {
    return await runLearningAssistant('create_student', args, {
      timeoutMs: 30000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('已被使用')) {
      return { success: true, studentId, reused: true };
    }
    throw error;
  }
}

async function rememberActivation({
  studentId,
  profileName,
  activationId,
  status,
}: {
  studentId: string;
  profileName: string;
  activationId: string;
  status: string;
}) {
  if (!profileName) return null;

  return runLearningAssistant(
    'set_profile',
    [
      '--student-id',
      studentId,
      '--json',
      JSON.stringify({
        hermesProfileId: profileName,
        hermesActivationId: activationId,
        hermesActivationStatus: status,
        hermesActivationUpdatedAt: new Date().toISOString(),
      }),
    ],
    { timeoutMs: 30000 }
  );
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

    const name = readText(body.name);
    const grade = readText(body.grade);
    const assistantId = readText(body.assistantId, buildAssistantId(studentId));

    const profile = await ensureStudentProfile({ studentId, name, grade });
    const displayName = name || studentId;
    const servicePrompt = buildServicePrompt({ studentId, name, grade });
    const provision = await provisionHermesAssistant({
      assistantId,
      userId: 'learning-assistant',
      roleId: 'learning-parent',
      serviceId: `learning-assistant:${studentId}`,
      serviceName: `${displayName} 的学习助手`,
      serviceSummary: '面向家长微信的学生学习档案问答助手',
      servicePrompt,
      soulSnapshot: servicePrompt,
      skillsSummary: ['learning-assistant'],
      enabledSkills: [
        {
          id: 'learning-assistant',
          name: '学习助手',
          summary: '读取学生白板答题记录、错题本、掌握度，并回答家长问题。',
          skillType: 'local',
          riskLevel: 'low',
        },
      ],
      serviceCapabilities: [
        '微信扫码激活独立 Hermes Profile',
        '绑定家长微信身份到学生档案',
        '回答家长关于学习表现、错题、薄弱点和复习建议的问题',
      ],
      serviceDeliverables: [
        '独立 Hermes Profile',
        '家长微信问答通道',
        '学生学习档案绑定',
      ],
      source: 'learning-assistant-whiteboard',
      locale: 'zh',
      activationTtlSeconds: 600,
    });

    await rememberActivation({
      studentId,
      profileName: provision.profileName || '',
      activationId: provision.activationId || provision.assistantId || assistantId,
      status: provision.status || 'qr_ready',
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      studentId,
      studentName: name,
      studentGrade: grade,
      profile,
      assistantId,
      activationId: provision.activationId || provision.assistantId || assistantId,
      status: provision.status || 'qr_ready',
      connectionMode: provision.connectionMode || 'qr_activation',
      profileName: provision.profileName || null,
      hermesProfileId: provision.profileName || null,
      qrPayload: provision.qrPayload || null,
      qrImageUrl: provision.qrImageUrl || null,
      expiresAt: provision.expiresAt || null,
      weixinUserId: provision.weixinUserId || null,
      gatewayStatus: provision.gatewayStatus || null,
      message: provision.message || '请用家长微信扫码绑定学习助手',
      bindingInstructions: provision.bindingInstructions || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : '生成 Hermes 绑定二维码失败',
      },
      { status: 503 }
    );
  }
}
