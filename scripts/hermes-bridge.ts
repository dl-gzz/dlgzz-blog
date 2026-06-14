import 'dotenv/config';
import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOST = process.env.HERMES_BRIDGE_HOST || '127.0.0.1';
const PORT = Number(process.env.HERMES_BRIDGE_PORT || 7319);
const TOKEN = process.env.HERMES_BRIDGE_TOKEN?.trim() || '';
const HERMES_CLI_COMMAND = process.env.HERMES_CLI_COMMAND?.trim() || '';
const WORKDIR =
  process.env.HERMES_BRIDGE_WORKDIR || '/Users/baiyang/Desktop/one-worker-os';
const DRY_RUN = process.env.HERMES_BRIDGE_DRY_RUN === '1';
const AUTO_START_GATEWAY =
  process.env.HERMES_BRIDGE_AUTO_START_GATEWAY !== '0';
const DATA_DIR =
  process.env.HERMES_BRIDGE_DATA_DIR || join(WORKDIR, '.hermes-bridge');
const COMMAND_TIMEOUT_MS = Number(
  process.env.HERMES_BRIDGE_COMMAND_TIMEOUT_MS || 120_000
);
const ACTIVATION_TTL_MS = Number(
  process.env.HERMES_BRIDGE_ACTIVATION_TTL_MS || 8 * 60 * 1000
);
const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';
const ILINK_APP_CLIENT_VERSION = String((2 << 16) | (2 << 8) | 0);
const QR_TIMEOUT_MS = Number(process.env.HERMES_BRIDGE_QR_TIMEOUT_MS || 10_000);
const LEARNING_ASSISTANT_SCRIPT =
  process.env.LEARNING_ASSISTANT_SCRIPT ||
  join(
    getHermesHome(),
    'skills',
    'learning-assistant',
    'scripts',
    'learning_assistant.py'
  );
const LEARNING_ASSISTANT_PYTHON =
  process.env.LEARNING_ASSISTANT_PYTHON || 'python3';
const LEARNING_ASSISTANT_TOKEN =
  process.env.LEARNING_ASSISTANT_TOKEN?.trim() || '';
const LEARNING_ASSISTANT_TIMEOUT_MS =
  Number(process.env.LEARNING_ASSISTANT_TIMEOUT_SECONDS || 60) * 1000;
const LEARNING_ASSISTANT_ALLOWED_COMMANDS = new Set([
  'answer_parent',
  'bind_parent',
  'bind_parent_from_message',
  'create_bind_token',
  'create_student',
  'daily_report',
  'list_parent_students',
  'next_practice',
  'record_quiz',
  'set_profile',
  'snapshot',
]);
const PROFILE_WEIXIN_ENV_KEYS = [
  'WEIXIN_ACCOUNT_ID',
  'WEIXIN_TOKEN',
  'WEIXIN_BASE_URL',
  'WEIXIN_CDN_BASE_URL',
  'WEIXIN_DM_POLICY',
  'WEIXIN_ALLOWED_USERS',
  'WEIXIN_ALLOW_ALL_USERS',
  'WEIXIN_HOME_CHANNEL',
  'WEIXIN_HOME_CHANNEL_NAME',
] as const;

type HermesCommandCandidate = {
  command: string;
  prefixArgs: string[];
  label: string;
};

interface ProvisionPayload {
  assistantId?: unknown;
  userId?: unknown;
  roleId?: unknown;
  workerInstanceId?: unknown;
  employeeId?: unknown;
  employeeVersionId?: unknown;
  serviceId?: unknown;
  serviceName?: unknown;
  serviceSummary?: unknown;
  servicePrompt?: unknown;
  soulSnapshot?: unknown;
  skillsSummary?: unknown;
  enabledSkills?: unknown;
  serviceCapabilities?: unknown;
  serviceDeliverables?: unknown;
  activationTtlSeconds?: unknown;
  source?: unknown;
  locale?: unknown;
}

interface PairingApprovePayload {
  assistantId?: unknown;
  code?: unknown;
}

interface GatewayState {
  gateway_state?: string;
  pid?: number;
  platforms?: Record<
    string,
    {
      state?: string;
      error_code?: string | null;
      error_message?: string | null;
      updated_at?: string;
    }
  >;
  updated_at?: string;
}

interface ActivationRecord {
  assistantId: string;
  userId: string;
  roleId: string;
  serviceId?: string;
  serviceName?: string;
  workerInstanceId?: string;
  employeeId?: string;
  employeeVersionId?: string;
  profileName: string;
  qrcode: string;
  qrPayload: string;
  status:
    | 'qr_ready'
    | 'scanned'
    | 'activated'
    | 'expired'
    | 'failed';
  baseUrl: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  accountId?: string;
  weixinUserId?: string;
  error?: string;
  gatewayStatus?: 'starting' | 'running' | 'start_failed';
  gatewayError?: string;
  gatewayStartedAt?: string;
}

interface ServiceProvision {
  id: string;
  name: string;
  summary: string;
  prompt: string;
  soulSnapshot?: string;
  workerInstanceId?: string;
  employeeId?: string;
  employeeVersionId?: string;
  skillsSummary: string[];
  enabledSkills: Array<{
    id: string;
    name: string;
    summary: string;
    skillType: string;
    riskLevel: string;
  }>;
  capabilities: string[];
  deliverables: string[];
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);

    if (!isAuthorized(request, url.pathname)) {
      sendJson(response, 401, {
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Hermes Bridge token 校验失败',
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      await handleHealth(response);
      return;
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/api/learning-assistant/run'
    ) {
      await handleLearningAssistantRun(request, response);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/assistants') {
      await handleAdminAssistants(response);
      return;
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/assistants/provision'
    ) {
      await handleProvision(request, response);
      return;
    }

    if (
      request.method === 'GET' &&
      url.pathname === '/activations/status'
    ) {
      await handleActivationStatus(url, response);
      return;
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/pairing/approve'
    ) {
      await handlePairingApprove(request, response);
      return;
    }

    sendJson(response, 404, {
      success: false,
      code: 'NOT_FOUND',
      error: '未知 Hermes Bridge 路径',
    });
  } catch (error) {
    sendJson(response, 500, {
      success: false,
      code: 'BRIDGE_INTERNAL_ERROR',
      error: error instanceof Error ? error.message : 'Hermes Bridge 内部错误',
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Hermes Bridge listening on http://${HOST}:${PORT}`);
  console.log(`Hermes workspace: ${WORKDIR}`);
  console.log(`Dry run: ${DRY_RUN ? 'on' : 'off'}`);
});

async function handleHealth(response: ServerResponse) {
  const weixin = getWeixinState();
  const gateway = getGatewayState();
  const pairing = getPairingState();

  sendJson(response, 200, {
    success: true,
    status: 'ok',
    mode: DRY_RUN ? 'dry_run' : 'hermes',
    workdir: WORKDIR,
    hermesHome: getHermesHome(),
    learningAssistant: {
      script: LEARNING_ASSISTANT_SCRIPT,
      scriptExists: existsSync(LEARNING_ASSISTANT_SCRIPT),
    },
    gateway,
    weixin,
    pairing,
  });
}

async function handleLearningAssistantRun(
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = (await readJson(request)) as {
    command?: unknown;
    args?: unknown;
    input?: unknown;
  };
  const command = typeof body.command === 'string' ? body.command.trim() : '';
  const args = Array.isArray(body.args) ? body.args : [];

  if (!LEARNING_ASSISTANT_ALLOWED_COMMANDS.has(command)) {
    sendJson(response, 400, {
      success: false,
      error: 'unsupported command',
    });
    return;
  }

  if (!args.every((item) => typeof item === 'string')) {
    sendJson(response, 400, {
      success: false,
      error: 'args must be a string array',
    });
    return;
  }

  if (!existsSync(LEARNING_ASSISTANT_SCRIPT)) {
    sendJson(response, 500, {
      success: false,
      error: `script not found: ${LEARNING_ASSISTANT_SCRIPT}`,
    });
    return;
  }

  const result = await runLearningAssistantScript(
    command,
    args as string[],
    body.input
  );

  sendJson(response, result.status, result.payload);
}

async function handleProvision(
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = (await readJson(request)) as ProvisionPayload;
  const assistantId = readRequiredString(body.assistantId, 'assistantId');
  const userId = readRequiredString(body.userId, 'userId');
  const roleId = readRequiredString(body.roleId, 'roleId');
  const service = readServiceProvision(body, roleId);
  const existingActivation = getActivation(assistantId);
  const profileName =
    existingActivation?.profileName || buildProfileName({ assistantId, roleId, userId });
  const activationTtlMs = readActivationTtlMs(body.activationTtlSeconds);

  if (DRY_RUN) {
    sendJson(response, 200, {
      success: true,
      assistantId,
      status: 'demo_ready',
      connectionMode: 'demo',
      profileName,
      serviceId: service.id,
      serviceName: service.name,
      qrPayload: `hermes-demo://assistant/${profileName}?service=${encodeURIComponent(service.id)}`,
      qrImageUrl: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      message: 'Hermes Bridge dry-run：已返回演示接入码',
    });
    return;
  }

  const profile = await ensureProfile(profileName, service);
  if (existingActivation?.status !== 'activated') {
    clearProfileWeixinCredentials(profileName);
  }
  storeAssistantRecord({
    assistantId,
    userId,
    roleId,
    serviceId: service.id,
    serviceName: service.name,
    workerInstanceId: service.workerInstanceId || '',
    employeeId: service.employeeId || '',
    employeeVersionId: service.employeeVersionId || '',
    profileName,
    source: typeof body.source === 'string' ? body.source : '',
    locale: typeof body.locale === 'string' ? body.locale : '',
  });

  if (existingActivation?.status === 'activated') {
    const activated = await ensureActivatedGateway(existingActivation);
    sendJson(response, 200, {
      success: true,
      assistantId,
      status: activated.status,
      serviceId: service.id,
      serviceName: service.name,
      profileName,
      connectionMode: 'already_activated',
      activationId: assistantId,
      qrPayload: null,
      qrImageUrl: null,
      expiresAt: activated.expiresAt,
      weixinAccountId: activated.accountId || null,
      weixinUserId: activated.weixinUserId || null,
      gatewayStatus: activated.gatewayStatus || null,
      gatewayError: activated.gatewayError || null,
      message: getActivationMessage(activated),
    });
    return;
  }

  const activation = await createWeixinActivation({
    assistantId,
    userId,
    roleId,
    serviceId: service.id,
    serviceName: service.name,
    workerInstanceId: service.workerInstanceId,
    employeeId: service.employeeId,
    employeeVersionId: service.employeeVersionId,
    profileName,
    activationTtlMs,
  });

  sendJson(response, 200, {
    success: true,
    assistantId,
    status: activation.status,
    serviceId: service.id,
    serviceName: service.name,
    profileName,
    connectionMode: 'qr_activation',
    activationId: assistantId,
    qrPayload: activation.qrPayload,
    qrImageUrl: null,
    expiresAt: activation.expiresAt,
    bindingInstructions: [
      '请用微信扫描二维码并确认。',
      '确认后页面会自动变为激活成功。',
      '激活成功后，这个微信身份会写入对应 Hermes Profile。',
    ],
    message: profile.created
      ? 'Hermes Profile 已创建；请扫码激活微信助手。'
      : 'Hermes Profile 已存在；请扫码激活微信助手。',
  });
}

async function handleAdminAssistants(response: ServerResponse) {
  const assistants = readJsonFile<Record<string, Record<string, unknown>>>(
    join(DATA_DIR, 'assistants.json')
  ) || {};
  const activations = readActivations();

  const rows = Object.values(assistants).map((record) => {
    const assistantId = String(record.assistantId || '');
    const profileName = String(record.profileName || '');
    const activation = activations[assistantId]
      ? normalizeActivationForAdminList(activations[assistantId]!)
      : null;
    const gateway = profileName ? getProfileGatewayState(profileName) : null;
    const configuredPlatforms = profileName
      ? getConfiguredProfilePlatforms(profileName)
      : new Set<string>();
    const activity = profileName ? getProfileActivity(profileName) : {};
    const weixin = activation?.accountId || record.weixinAccountId || '';
    const weixinUser = activation?.weixinUserId || record.weixinUserId || '';
    const gatewayStatus = gateway
      ? getProfileGatewayStatus(gateway)
      : 'unknown';

    return {
      assistantId,
      userId: String(record.userId || ''),
      roleId: String(record.roleId || ''),
      workerInstanceId: String(
        record.workerInstanceId || activation?.workerInstanceId || ''
      ),
      employeeId: String(record.employeeId || activation?.employeeId || ''),
      employeeVersionId: String(
        record.employeeVersionId || activation?.employeeVersionId || ''
      ),
      serviceId: String(record.serviceId || activation?.serviceId || ''),
      serviceName: String(record.serviceName || activation?.serviceName || ''),
      profileName,
      source: String(record.source || ''),
      locale: String(record.locale || ''),
      status: activation?.status || 'created',
      gatewayStatus,
      gatewayPid: gateway?.pid || null,
      gatewayUpdatedAt: gateway?.updated_at || null,
      platforms: serializeGatewayPlatforms(gateway, configuredPlatforms),
      weixinAccountId: weixin ? maskIdentifier(String(weixin)) : null,
      weixinUserId: weixinUser ? maskIdentifier(String(weixinUser)) : null,
      createdAt: activation?.createdAt || record.updatedAt || null,
      activatedAt:
        activation?.status === 'activated'
          ? activation.updatedAt
          : record.activatedAt || null,
      updatedAt: activation?.updatedAt || record.updatedAt || null,
      expiresAt: activation?.expiresAt || null,
      lastInboundAt: activity.lastInboundAt || null,
      lastResponseAt: activity.lastResponseAt || null,
      logUpdatedAt: activity.logUpdatedAt || null,
      error:
        activation?.error ||
        activation?.gatewayError ||
        getGatewayError(gateway, configuredPlatforms) ||
        null,
    };
  });

  rows.sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  );

  const summary = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.status === 'activated') acc.activated += 1;
      if (row.gatewayStatus === 'running') acc.running += 1;
      if (['qr_ready', 'scanned'].includes(row.status)) acc.pending += 1;
      if (['failed', 'expired'].includes(row.status)) acc.needsAttention += 1;
      return acc;
    },
    {
      total: 0,
      activated: 0,
      running: 0,
      pending: 0,
      needsAttention: 0,
    }
  );

  sendJson(response, 200, {
    success: true,
    generatedAt: new Date().toISOString(),
    workdir: WORKDIR,
    hermesHome: getHermesHome(),
    summary,
    assistants: rows,
  });
}

async function handleActivationStatus(url: URL, response: ServerResponse) {
  const assistantId = url.searchParams.get('assistantId')?.trim() || '';

  if (!assistantId) {
    sendJson(response, 400, {
      success: false,
      code: 'BAD_REQUEST',
      error: '缺少 assistantId',
    });
    return;
  }

  if (DRY_RUN) {
    sendJson(response, 200, {
      success: true,
      assistantId,
      status: 'qr_ready',
      message: 'Hermes Bridge dry-run：等待模拟扫码',
    });
    return;
  }

  const activation = await pollWeixinActivation(assistantId);

  if (!activation) {
    sendJson(response, 404, {
      success: false,
      code: 'ACTIVATION_NOT_FOUND',
      error: '激活会话不存在或已过期',
    });
    return;
  }

  sendJson(response, 200, {
    success: activation.status !== 'failed',
    assistantId,
    status: activation.status,
    profileName: activation.profileName,
    qrPayload: activation.qrPayload,
    expiresAt: activation.expiresAt,
    weixinAccountId: activation.accountId || null,
    weixinUserId: activation.weixinUserId || null,
    gatewayStatus: activation.gatewayStatus || null,
    gatewayError: activation.gatewayError || null,
    error: activation.error || null,
    message: getActivationMessage(activation),
  });
}

async function handlePairingApprove(
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = (await readJson(request)) as PairingApprovePayload;
  const assistantId = readRequiredString(body.assistantId, 'assistantId');
  const code = readRequiredString(body.code, 'code').toUpperCase();

  if (!/^[A-Z2-9]{6,12}$/.test(code)) {
    sendJson(response, 400, {
      success: false,
      code: 'BAD_PAIRING_CODE',
      error: '配对码格式不正确',
    });
    return;
  }

  if (DRY_RUN) {
    sendJson(response, 200, {
      success: true,
      assistantId,
      status: 'paired',
      message: 'Hermes Bridge dry-run：配对码已模拟通过',
    });
    return;
  }

  const result = await runHermes(['pairing', 'approve', 'weixin', code], {
    allowFailure: true,
  });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const approved = result.code === 0 && /Approved!/i.test(output);

  if (!approved) {
    sendJson(response, 404, {
      success: false,
      assistantId,
      code: 'PAIRING_CODE_NOT_FOUND',
      error: output || '配对码不存在或已过期',
    });
    return;
  }

  const userMatch = output.match(/User\s+(.+?)\s+on\s+weixin/i);
  sendJson(response, 200, {
    success: true,
    assistantId,
    status: 'paired',
    weixinUser: userMatch?.[1] || null,
    message: '微信用户已通过 Hermes pairing 授权',
  });
}

async function ensureProfile(profileName: string, service: ServiceProvision) {
  const show = await runHermes(['profile', 'show', profileName], {
    allowFailure: true,
  });

  if (show.code === 0) {
    writeProfileServiceFiles(profileName, service);
    return { created: false };
  }

  const created = await runHermes(
    ['profile', 'create', '--clone', '--no-alias', profileName],
    { allowFailure: true }
  );
  if (created.code !== 0) {
    ensureMinimalProfile(profileName);
  }
  writeProfileServiceFiles(profileName, service);

  return { created: true };
}

function ensureMinimalProfile(profileName: string) {
  const profileHome = getProfileHome(profileName);
  mkdirSync(profileHome, { recursive: true });

  for (const directory of [
    'logs',
    'sessions',
    'memory',
    'skills',
    'weixin/accounts',
  ]) {
    mkdirSync(join(profileHome, directory), { recursive: true });
  }

  for (const fileName of ['config.yaml', '.env', 'SOUL.md']) {
    const sourcePath = join(getHermesHome(), fileName);
    const targetPath = join(profileHome, fileName);
    if (!existsSync(targetPath) && existsSync(sourcePath)) {
      writeFileSync(targetPath, readFileSync(sourcePath, 'utf8'));
      if (fileName === '.env') chmodSync(targetPath, 0o600);
    }
  }

  const soulPath = join(profileHome, 'SOUL.md');
  if (!existsSync(soulPath)) {
    writeFileSync(
      soulPath,
      '# Hermes Assistant\n\nYou are a focused WeChat AI assistant.\n'
    );
  }
}

function clearProfileWeixinCredentials(profileName: string) {
  const profileHome = getProfileHome(profileName);
  mkdirSync(join(profileHome, 'weixin', 'accounts'), { recursive: true });

  const emptyWeixinEnv = Object.fromEntries(
    PROFILE_WEIXIN_ENV_KEYS.map((key) => [key, ''])
  );
  upsertEnvFile(join(profileHome, '.env'), emptyWeixinEnv);

  const accountDir = join(profileHome, 'weixin', 'accounts');
  for (const fileName of readdirSync(accountDir)) {
    if (fileName.endsWith('.json')) {
      rmSync(join(accountDir, fileName), { force: true });
    }
  }
}

function writeProfileServiceFiles(profileName: string, service: ServiceProvision) {
  const profileHome = getProfileHome(profileName);
  mkdirSync(profileHome, { recursive: true });

  const capabilityList = service.capabilities
    .map((item) => formatMarkdownBullet(item))
    .join('\n');
  const deliverableList = service.deliverables
    .map((item) => formatMarkdownBullet(item))
    .join('\n');
  const enabledSkillList = service.enabledSkills
    .map((skill) => `- ${skill.name}（${skill.skillType}/${skill.riskLevel}）：${skill.summary}`)
    .join('\n');
  const serviceDoc = [
    `# ${service.name}`,
    '',
    `Service ID: ${service.id}`,
    service.workerInstanceId ? `Worker Instance ID: ${service.workerInstanceId}` : '',
    service.employeeId ? `Employee ID: ${service.employeeId}` : '',
    service.employeeVersionId
      ? `Employee Version ID: ${service.employeeVersionId}`
      : '',
    '',
    service.summary,
    '',
    '## Capabilities',
    capabilityList || '- 微信对话服务',
    '',
    '## Enabled Skills',
    enabledSkillList || '- 未启用额外技能',
    '',
    '## Deliverables',
    deliverableList || '- 独立 Hermes Profile',
    '',
  ].join('\n');

  writeFileSync(join(profileHome, 'SERVICE.md'), serviceDoc);
  if (service.soulSnapshot?.trim()) {
    writeFileSync(
      join(profileHome, 'EMPLOYEE_SOUL.md'),
      `${service.soulSnapshot.trim()}\n`
    );
  }
  writeFileSync(
    join(profileHome, 'SOUL.md'),
    `${service.prompt.trim()}\n\n---\n\n${serviceDoc}`
  );
}

function formatMarkdownBullet(value: string) {
  return `- ${value.replace(/^\s*-\s*/, '').trim()}`;
}

async function createWeixinActivation({
  assistantId,
  userId,
  roleId,
  serviceId,
  serviceName,
  workerInstanceId,
  employeeId,
  employeeVersionId,
  profileName,
  activationTtlMs,
}: {
  assistantId: string;
  userId: string;
  roleId: string;
  serviceId: string;
  serviceName: string;
  workerInstanceId?: string;
  employeeId?: string;
  employeeVersionId?: string;
  profileName: string;
  activationTtlMs?: number;
}) {
  const qr = await requestIlinkQr();
  const now = new Date();
  const activation: ActivationRecord = {
    assistantId,
    userId,
    roleId,
    serviceId,
    serviceName,
    workerInstanceId,
    employeeId,
    employeeVersionId,
    profileName,
    qrcode: qr.qrcode,
    qrPayload: qr.qrPayload,
    status: 'qr_ready',
    baseUrl: ILINK_BASE_URL,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + (activationTtlMs || ACTIVATION_TTL_MS)
    ).toISOString(),
  };
  upsertActivation(activation);

  return activation;
}

async function requestIlinkQr() {
  const data = await ilinkGet(
    ILINK_BASE_URL,
    `/ilink/bot/get_bot_qrcode?bot_type=3`
  );
  const qrcode = String(data.qrcode || '');
  const qrPayload = String(data.qrcode_img_content || data.qrcode || '');

  if (!qrcode || !qrPayload) {
    throw new Error('iLink 没有返回可用二维码');
  }

  return { qrcode, qrPayload };
}

async function pollWeixinActivation(assistantId: string) {
  const activation = getActivation(assistantId);

  if (!activation) return null;
  if (activation.status === 'activated') {
    return ensureActivatedGateway(activation);
  }
  if (activation.status === 'failed') {
    return activation;
  }
  if (Date.now() > new Date(activation.expiresAt).getTime()) {
    const expired = {
      ...activation,
      status: 'expired' as const,
      updatedAt: new Date().toISOString(),
    };
    upsertActivation(expired);
    return expired;
  }

  try {
    const status = await ilinkGet(
      activation.baseUrl || ILINK_BASE_URL,
      `/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(
        activation.qrcode
      )}`
    );
    const qrStatus = String(status.status || 'wait');

    if (qrStatus === 'scaned') {
      const scanned = {
        ...activation,
        status: 'scanned' as const,
        updatedAt: new Date().toISOString(),
      };
      upsertActivation(scanned);
      return scanned;
    }

    if (qrStatus === 'scaned_but_redirect') {
      const redirectHost = String(status.redirect_host || '');
      const redirected = {
        ...activation,
        baseUrl: redirectHost ? `https://${redirectHost}` : activation.baseUrl,
        status: 'scanned' as const,
        updatedAt: new Date().toISOString(),
      };
      upsertActivation(redirected);
      return redirected;
    }

    if (qrStatus === 'expired') {
      const expired = {
        ...activation,
        status: 'expired' as const,
        updatedAt: new Date().toISOString(),
      };
      upsertActivation(expired);
      return expired;
    }

    if (qrStatus === 'confirmed') {
      const accountId = String(status.ilink_bot_id || '');
      const token = String(status.bot_token || '');
      const baseUrl = String(status.baseurl || activation.baseUrl || ILINK_BASE_URL);
      const weixinUserId = String(status.ilink_user_id || '');

      if (!accountId || !token) {
        throw new Error('iLink 已确认扫码，但没有返回完整账号凭据');
      }

      persistWeixinCredentials(activation.profileName, {
        accountId,
        token,
        baseUrl,
        weixinUserId,
      });
      const gatewayStart = await ensureProfileGatewayStarted(activation.profileName);

      const confirmed = {
        ...activation,
        status: 'activated' as const,
        accountId,
        weixinUserId,
        baseUrl,
        gatewayStatus: gatewayStart.status,
        gatewayError: gatewayStart.error,
        gatewayStartedAt:
          gatewayStart.status === 'running'
            ? new Date().toISOString()
            : activation.gatewayStartedAt,
        updatedAt: new Date().toISOString(),
      };
      upsertActivation(confirmed);
      updateAssistantRecord(activation.assistantId, {
        weixinAccountId: accountId,
        weixinUserId,
        gatewayStatus: gatewayStart.status,
        gatewayError: gatewayStart.error || '',
        activatedAt: confirmed.updatedAt,
      });
      return confirmed;
    }

    return activation;
  } catch (error) {
    if (isPollingTimeout(error)) {
      const waiting = {
        ...activation,
        updatedAt: new Date().toISOString(),
      };
      upsertActivation(waiting);
      return waiting;
    }

    const failed = {
      ...activation,
      status: 'failed' as const,
      error: error instanceof Error ? error.message : '查询二维码状态失败',
      updatedAt: new Date().toISOString(),
    };
    upsertActivation(failed);
    return failed;
  }
}

function isPollingTimeout(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'AbortError' ||
    error.name === 'TimeoutError' ||
    /timeout|aborted/i.test(error.message)
  );
}

async function ilinkGet(baseUrl: string, endpoint: string) {
  const url = `${baseUrl.replace(/\/$/, '')}${endpoint}`;
  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(QR_TIMEOUT_MS),
    headers: {
      'iLink-App-Id': 'bot',
      'iLink-App-ClientVersion': ILINK_APP_CLIENT_VERSION,
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`iLink GET ${endpoint} HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  return JSON.parse(text) as Record<string, unknown>;
}

function getActivationMessage(activation: ActivationRecord) {
  if (activation.status === 'activated') {
    if (activation.gatewayStatus === 'running') {
      return '微信助手已激活，Hermes Gateway 已连接';
    }
    if (activation.gatewayStatus === 'start_failed') {
      return `微信助手已激活，但 Gateway 启动失败：${
        activation.gatewayError || '请检查 Hermes 日志'
      }`;
    }
    return '微信助手已激活，Hermes Gateway 正在启动';
  }
  if (activation.status === 'scanned') return '已扫码，请在微信里确认';
  if (activation.status === 'expired') return '二维码已过期，请重新生成';
  if (activation.status === 'failed') return activation.error || '激活失败';
  return '等待微信扫码';
}

function getProfileHome(profileName: string) {
  if (profileName === 'default') return getHermesHome();
  return join(getHermesHome(), 'profiles', profileName);
}

function persistWeixinCredentials(
  profileName: string,
  {
    accountId,
    token,
    baseUrl,
    weixinUserId,
  }: {
    accountId: string;
    token: string;
    baseUrl: string;
    weixinUserId: string;
  }
) {
  const profileHome = getProfileHome(profileName);
  const accountDir = join(profileHome, 'weixin', 'accounts');
  mkdirSync(accountDir, { recursive: true });

  const accountPath = join(accountDir, `${accountId}.json`);
  writeFileSync(
    accountPath,
    `${JSON.stringify(
      {
        token,
        base_url: baseUrl,
        user_id: weixinUserId,
        saved_at: new Date().toISOString(),
      },
      null,
      2
    )}\n`
  );
  chmodSync(accountPath, 0o600);

  upsertEnvFile(join(profileHome, '.env'), {
    FEISHU_APP_ID: '',
    FEISHU_APP_SECRET: '',
    FEISHU_ENCRYPT_KEY: '',
    FEISHU_VERIFICATION_TOKEN: '',
    FEISHU_HOME_CHANNEL: '',
    FEISHU_HOME_CHANNEL_NAME: '',
    WEIXIN_ACCOUNT_ID: accountId,
    WEIXIN_TOKEN: token,
    WEIXIN_BASE_URL: baseUrl,
    WEIXIN_CDN_BASE_URL: 'https://novac2c.cdn.weixin.qq.com/c2c',
    WEIXIN_DM_POLICY: 'allowlist',
    WEIXIN_ALLOWED_USERS: weixinUserId,
    WEIXIN_ALLOW_ALL_USERS: 'false',
    WEIXIN_HOME_CHANNEL: weixinUserId,
    WEIXIN_HOME_CHANNEL_NAME: 'Weixin Home',
  });
}

async function ensureActivatedGateway(activation: ActivationRecord) {
  const state = getProfileGatewayState(activation.profileName);
  if (isWeixinGatewayConnected(state)) {
    const running = {
      ...activation,
      gatewayStatus: 'running' as const,
      gatewayError: '',
      gatewayStartedAt: activation.gatewayStartedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    upsertActivation(running);
    return running;
  }

  const lastUpdate = new Date(activation.updatedAt).getTime();
  const ageMs = Number.isFinite(lastUpdate) ? Date.now() - lastUpdate : Infinity;
  if (
    (activation.gatewayStatus === 'starting' && ageMs < 15_000) ||
    (activation.gatewayStatus === 'start_failed' &&
      ageMs < 30_000 &&
      !isGatewayServiceMissing(activation.gatewayError || ''))
  ) {
    return activation;
  }

  const gatewayStart = await ensureProfileGatewayStarted(activation.profileName);
  const updated = {
    ...activation,
    gatewayStatus: gatewayStart.status,
    gatewayError: gatewayStart.error,
    gatewayStartedAt:
      gatewayStart.status === 'running'
        ? new Date().toISOString()
        : activation.gatewayStartedAt,
    updatedAt: new Date().toISOString(),
  };
  upsertActivation(updated);
  updateAssistantRecord(activation.assistantId, {
    gatewayStatus: gatewayStart.status,
    gatewayError: gatewayStart.error || '',
  });
  return updated;
}

async function ensureProfileGatewayStarted(profileName: string): Promise<{
  status: 'starting' | 'running' | 'start_failed';
  error?: string;
}> {
  if (isWeixinGatewayConnected(getProfileGatewayState(profileName))) {
    return { status: 'running' };
  }

  let result = await runHermes(
    ['--profile', profileName, 'gateway', 'start'],
    { allowFailure: true }
  );
  let output = `${result.stdout}\n${result.stderr}`.trim();

  if (result.code !== 0 && isGatewayServiceMissing(output)) {
    const install = await runHermes(
      ['--profile', profileName, 'gateway', 'install'],
      { allowFailure: true }
    );
    const installOutput = `${install.stdout}\n${install.stderr}`.trim();

    if (install.code !== 0) {
      return {
        status: 'start_failed',
        error:
          installOutput ||
          `hermes --profile ${profileName} gateway install 失败`,
      };
    }

    result = await runHermes(
      ['--profile', profileName, 'gateway', 'start'],
      { allowFailure: true }
    );
    output = `${result.stdout}\n${result.stderr}`.trim();
  }

  if (result.code !== 0) {
    return {
      status: 'start_failed',
      error: output || `hermes --profile ${profileName} gateway start 失败`,
    };
  }

  const settled = await waitForProfileGateway(profileName, 12_000);
  if (isWeixinGatewayConnected(settled)) {
    return { status: 'running' };
  }

  return { status: 'starting' };
}

function isGatewayServiceMissing(output: string) {
  return /gateway service is not installed|run:\s*hermes\s+gateway\s+install/i.test(
    output
  );
}

async function waitForProfileGateway(profileName: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let state = getProfileGatewayState(profileName);

  while (Date.now() < deadline) {
    state = getProfileGatewayState(profileName);
    if (isWeixinGatewayConnected(state)) return state;
    await delay(1_000);
  }

  return state;
}

function getProfileGatewayState(profileName: string): GatewayState {
  return (
    readJsonFile<GatewayState>(
      join(getProfileHome(profileName), 'gateway_state.json')
    ) || {
      gateway_state: 'unknown',
      platforms: {},
    }
  );
}

function normalizeActivationForAdminList(activation: ActivationRecord) {
  if (
    ['qr_ready', 'scanned'].includes(activation.status) &&
    hasActivationExpired(activation)
  ) {
    const expired = {
      ...activation,
      status: 'expired' as const,
      updatedAt: new Date().toISOString(),
    };
    upsertActivation(expired);
    return expired;
  }

  return activation;
}

function hasActivationExpired(activation: ActivationRecord) {
  const expiresAt = new Date(activation.expiresAt).getTime();
  return Number.isFinite(expiresAt) && Date.now() > expiresAt;
}

function isWeixinGatewayConnected(gateway: GatewayState) {
  return gateway.gateway_state === 'running' &&
    gateway.platforms?.weixin?.state === 'connected';
}

function getProfileGatewayStatus(gateway: GatewayState) {
  if (isWeixinGatewayConnected(gateway)) return 'running';
  if (gateway.gateway_state === 'running') return 'partial';
  if (gateway.gateway_state === 'startup_failed') return 'failed';
  if (gateway.gateway_state === 'stopped') return 'stopped';
  return gateway.gateway_state || 'unknown';
}

function serializeGatewayPlatforms(
  gateway: GatewayState | null,
  configuredPlatforms = new Set<string>()
) {
  if (!gateway?.platforms) return {};

  return Object.fromEntries(
    Object.entries(gateway.platforms)
      .filter(([name]) =>
        configuredPlatforms.size ? configuredPlatforms.has(name) : true
      )
      .map(([name, platform]) => [
        name,
        {
          state: platform.state || 'unknown',
          errorCode: platform.error_code || null,
          errorMessage: platform.error_message || null,
          updatedAt: platform.updated_at || null,
        },
      ])
  );
}

function getGatewayError(
  gateway: GatewayState | null,
  configuredPlatforms = new Set<string>()
) {
  const failed = Object.entries(gateway?.platforms || {}).find(
    ([name, platform]) =>
      (!configuredPlatforms.size || configuredPlatforms.has(name)) &&
      platform.error_message
  );

  return failed?.[1]?.error_message || null;
}

function getConfiguredProfilePlatforms(profileName: string) {
  const env = readDotEnv(join(getProfileHome(profileName), '.env'));
  const platforms = new Set<string>();

  if (env.WEIXIN_ACCOUNT_ID && env.WEIXIN_TOKEN) {
    platforms.add('weixin');
  }

  if (env.FEISHU_APP_ID && env.FEISHU_APP_SECRET) {
    platforms.add('feishu');
  }

  return platforms;
}

function getProfileActivity(profileName: string) {
  const logPath = join(getProfileHome(profileName), 'logs', 'gateway.log');
  try {
    if (!existsSync(logPath)) return {};

    const stat = statSync(logPath);
    const content = readFileSync(logPath, 'utf8').slice(-240_000);
    const lines = content.split(/\r?\n/).filter(Boolean);
    let lastInboundAt = '';
    let lastResponseAt = '';

    for (const line of lines) {
      if (line.includes('inbound message:')) {
        lastInboundAt = readLogTimestamp(line) || lastInboundAt;
      }
      if (line.includes('response ready:')) {
        lastResponseAt = readLogTimestamp(line) || lastResponseAt;
      }
    }

    return {
      lastInboundAt,
      lastResponseAt,
      logUpdatedAt: stat.mtime.toISOString(),
    };
  } catch {
    return {};
  }
}

function readLogTimestamp(line: string) {
  const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  if (!match) return '';

  return new Date(`${match[1]}.000+08:00`).toISOString();
}

function maskIdentifier(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function upsertEnvFile(path: string, updates: Record<string, string>) {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lines = existing ? existing.split(/\r?\n/) : [];
  const seen = new Set<string>();
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match) return line;

    const key = match[1]!;
    if (!(key in updates)) return line;

    seen.add(key);
    return `${key}=${formatEnvValue(updates[key] || '')}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${formatEnvValue(value)}`);
    }
  }

  writeFileSync(path, `${nextLines.filter((line, index) => line || index < nextLines.length - 1).join('\n')}\n`);
  chmodSync(path, 0o600);
}

function formatEnvValue(value: string) {
  if (!value) return '';
  if (/^[A-Za-z0-9_@./:-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

async function ensureGatewayIfPossible() {
  let gateway = getGatewayState();
  const weixin = getWeixinState();
  const weixinConnected = gateway.platforms?.weixin?.state === 'connected';

  if (
    DRY_RUN ||
    !AUTO_START_GATEWAY ||
    !weixin.configured ||
    gateway.gateway_state === 'running' ||
    weixinConnected
  ) {
    return gateway;
  }

  await runHermes(['gateway', 'start'], { allowFailure: true });
  gateway = getGatewayState();

  return gateway;
}

function getProvisionStatus(
  weixin: ReturnType<typeof getWeixinState>,
  gateway: GatewayState
) {
  const weixinPlatform = gateway.platforms?.weixin;
  const weixinConnected = weixinPlatform?.state === 'connected';

  if (!weixin.configured) {
    return {
      status: 'weixin_not_configured',
      connectionMode: 'setup_required',
      qrPayload: null,
      instructions: [
        '先在本机运行 hermes gateway setup，完成微信/iLink 扫码登录。',
        '登录成功后启动 hermes gateway start，再回到博客创建助手。',
      ],
    };
  }

  if (!weixinConnected) {
    return {
      status: 'weixin_gateway_offline',
      connectionMode: 'gateway_required',
      qrPayload: null,
      instructions: [
        'Hermes 已有微信凭据，但 Gateway 当前没有连接到微信。',
        '运行 hermes gateway start 或检查 ~/.hermes/logs/gateway.error.log。',
      ],
    };
  }

  if (weixin.accessMode === 'pairing') {
    return {
      status: 'weixin_pairing_ready',
      connectionMode: 'pairing',
      qrPayload: null,
      instructions: [
        '用户先在微信里给已接入的 Hermes 助手发任意消息。',
        'Hermes 会回复一个 8 位 pairing code。',
        '把 pairing code 填回博客页面，即可授权这个微信用户使用助手。',
      ],
    };
  }

  if (weixin.accessMode === 'open') {
    return {
      status: 'weixin_open_ready',
      connectionMode: 'open',
      qrPayload: null,
      instructions: [
        '当前微信 Gateway 允许所有直接消息进入 Hermes。',
        '建议正式上线前改成 pairing 模式，避免陌生人直接使用。',
      ],
    };
  }

  return {
    status: 'weixin_allowlist_only',
    connectionMode: 'allowlist',
    qrPayload: null,
    instructions: [
      '当前 Hermes 微信 Gateway 是 allowlist 模式，只允许已配置的微信用户。',
      '如要让博客用户自助绑定，请把 WEIXIN_DM_POLICY 设为 pairing，并清空 WEIXIN_ALLOWED_USERS 后重启 Gateway。',
    ],
  };
}

function buildProvisionMessage(profileCreated: boolean, status: string) {
  const prefix = profileCreated ? 'Hermes Profile 已创建；' : 'Hermes Profile 已存在；';

  if (status === 'weixin_pairing_ready') {
    return `${prefix}微信 Gateway 已连接，请让用户在微信里发消息获取 pairing code。`;
  }
  if (status === 'weixin_open_ready') {
    return `${prefix}微信 Gateway 已连接，当前为 open 模式。`;
  }
  if (status === 'weixin_allowlist_only') {
    return `${prefix}微信 Gateway 已连接，但当前只允许 allowlist 用户。`;
  }
  if (status === 'weixin_gateway_offline') {
    return `${prefix}微信凭据已配置，但 Gateway 未连接。`;
  }
  if (status === 'weixin_not_configured') {
    return `${prefix}还需要先完成 Hermes 微信扫码登录。`;
  }

  return `${prefix}Hermes Bridge 已完成处理。`;
}

function getHermesHome() {
  return process.env.HERMES_HOME || join(homedir(), '.hermes');
}

function getGatewayState(): GatewayState {
  return (
    readJsonFile<GatewayState>(join(getHermesHome(), 'gateway_state.json')) || {
      gateway_state: 'unknown',
      platforms: {},
    }
  );
}

function getPairingState() {
  const pairingDir = join(getHermesHome(), 'pairing');
  const pending =
    readJsonFile<Record<string, unknown>>(join(pairingDir, 'weixin-pending.json')) ||
    {};
  const approved =
    readJsonFile<Record<string, unknown>>(join(pairingDir, 'weixin-approved.json')) ||
    {};

  return {
    pendingCount: Object.keys(pending).length,
    approvedCount: Object.keys(approved).length,
  };
}

function getWeixinState() {
  const env = readHermesEnv();
  const accountId = env.WEIXIN_ACCOUNT_ID || '';
  const token = env.WEIXIN_TOKEN || '';
  const account = accountId
    ? readJsonFile<Record<string, unknown>>(
        join(getHermesHome(), 'weixin', 'accounts', `${accountId}.json`)
      )
    : null;
  const dmPolicy = (env.WEIXIN_DM_POLICY || 'open').toLowerCase();
  const allowedUsers = env.WEIXIN_ALLOWED_USERS || '';
  const allowAll = isTruthy(env.WEIXIN_ALLOW_ALL_USERS);

  let accessMode: 'pairing' | 'open' | 'allowlist' | 'disabled' = 'open';
  if (dmPolicy === 'disabled') {
    accessMode = 'disabled';
  } else if (allowAll || dmPolicy === 'open') {
    accessMode = 'open';
  } else if (dmPolicy === 'pairing' && !allowedUsers.trim()) {
    accessMode = 'pairing';
  } else {
    accessMode = 'allowlist';
  }

  return {
    configured: Boolean(accountId && token),
    accountId,
    baseUrl: env.WEIXIN_BASE_URL || String(account?.base_url || ''),
    homeChannel: env.WEIXIN_HOME_CHANNEL || '',
    userId: String(account?.user_id || ''),
    dmPolicy,
    hasAllowlist: Boolean(allowedUsers.trim()),
    allowAll,
    accessMode,
    savedAt: String(account?.saved_at || ''),
  };
}

function readHermesEnv() {
  const fileEnv = readDotEnv(join(getHermesHome(), '.env'));

  return {
    ...fileEnv,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => typeof value === 'string')
    ),
  } as Record<string, string>;
}

function readDotEnv(path: string) {
  if (!existsSync(path)) return {};

  const result: Record<string, string> = {};
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue = ''] = match;
    result[key] = stripEnvQuotes(rawValue.trim());
  }

  return result;
}

function stripEnvQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readJsonFile<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function isTruthy(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function storeAssistantRecord(record: Record<string, string>) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const path = join(DATA_DIR, 'assistants.json');
    const existing = readJsonFile<Record<string, unknown>>(path) || {};
    existing[record.assistantId] = {
      ...record,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(path, `${JSON.stringify(existing, null, 2)}\n`);
    chmodSync(path, 0o600);
  } catch (error) {
    console.warn(
      `Hermes Bridge could not persist assistant record: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function updateAssistantRecord(
  assistantId: string,
  updates: Record<string, string>
) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const path = join(DATA_DIR, 'assistants.json');
    const existing = readJsonFile<Record<string, Record<string, unknown>>>(path) || {};
    existing[assistantId] = {
      ...(existing[assistantId] || {}),
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(path, `${JSON.stringify(existing, null, 2)}\n`);
    chmodSync(path, 0o600);
  } catch (error) {
    console.warn(
      `Hermes Bridge could not update assistant record: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function getActivation(assistantId: string) {
  const activations = readActivations();
  return activations[assistantId] || null;
}

function upsertActivation(activation: ActivationRecord) {
  mkdirSync(DATA_DIR, { recursive: true });
  const path = join(DATA_DIR, 'activations.json');
  const activations = readActivations();
  activations[activation.assistantId] = activation;
  writeFileSync(path, `${JSON.stringify(activations, null, 2)}\n`);
  chmodSync(path, 0o600);
}

function readActivations() {
  return (
    readJsonFile<Record<string, ActivationRecord>>(
      join(DATA_DIR, 'activations.json')
    ) || {}
  );
}

function isAuthorized(request: IncomingMessage, pathname = '/') {
  const acceptedTokens =
    pathname === '/api/learning-assistant/run'
      ? [TOKEN, LEARNING_ASSISTANT_TOKEN].filter(Boolean)
      : [TOKEN].filter(Boolean);

  if (!acceptedTokens.length) return true;

  const authorization = request.headers.authorization || '';
  const bridgeToken = request.headers['x-hermes-bridge-token'];
  const rawBridgeToken = Array.isArray(bridgeToken)
    ? bridgeToken[0]
    : bridgeToken;

  return acceptedTokens.some(
    (token) =>
      authorization === `Bearer ${token}` ||
      String(rawBridgeToken || '').trim() === token
  );
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  throw new Error(`缺少 ${fieldName}`);
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function readSkillObjects(value: unknown): ServiceProvision['enabledSkills'] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const id = readOptionalString(record.id);
      const name = readOptionalString(record.name);
      const summary = readOptionalString(record.summary);

      if (!id || !name || !summary) return null;

      return {
        id,
        name,
        summary,
        skillType: readOptionalString(record.skillType) || 'config',
        riskLevel: readOptionalString(record.riskLevel) || 'low',
      };
    })
    .filter((item): item is ServiceProvision['enabledSkills'][number] =>
      Boolean(item)
    );
}

function readServiceProvision(
  body: ProvisionPayload,
  roleId: string
): ServiceProvision {
  const name = readOptionalString(body.serviceName) || roleId;
  const summary =
    readOptionalString(body.serviceSummary) ||
    `${name} 微信数字员工服务`;
  const prompt =
    readOptionalString(body.servicePrompt) ||
    readOptionalString(body.soulSnapshot) ||
    `你是 ${name}，一个运行在微信里的专业数字员工。请围绕服务目标处理用户请求。`;
  const soulSnapshot = readOptionalString(body.soulSnapshot);
  const skillsSummary = readStringArray(body.skillsSummary);
  const enabledSkills = readSkillObjects(body.enabledSkills);
  const capabilities = readStringArray(body.serviceCapabilities);

  return {
    id: readOptionalString(body.serviceId) || `wechat-${roleId}-assistant`,
    name,
    summary,
    prompt,
    soulSnapshot,
    workerInstanceId: readOptionalString(body.workerInstanceId),
    employeeId: readOptionalString(body.employeeId),
    employeeVersionId: readOptionalString(body.employeeVersionId),
    skillsSummary,
    enabledSkills,
    capabilities: capabilities.length ? capabilities : skillsSummary,
    deliverables: readStringArray(body.serviceDeliverables),
  };
}

function readActivationTtlMs(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return ACTIVATION_TTL_MS;

  return Math.min(Math.max(seconds, 60), 60 * 60) * 1000;
}

function buildProfileName({
  assistantId,
  roleId,
  userId,
}: {
  assistantId: string;
  roleId: string;
  userId: string;
}) {
  const readableRole = roleId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  const hash = createHash('sha256')
    .update(`${assistantId}:${roleId}:${userId}`)
    .digest('hex')
    .slice(0, 12);

  return `bot${readableRole}${hash}`.slice(0, 32);
}

function readJson(request: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: Record<string, unknown>
) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function runHermes(
  args: string[],
  options: { allowFailure?: boolean } = {}
) {
  return runHermesCandidate(buildHermesCommandCandidates(), args, options);
}

async function runHermesCandidate(
  candidates: HermesCommandCandidate[],
  args: string[],
  options: { allowFailure?: boolean }
): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    if (!canUseCommandCandidate(candidate)) continue;

    try {
      return await spawnHermesCandidate(candidate, args, options);
    } catch (error) {
      if (isCommandNotFoundError(error)) {
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      }

      throw error;
    }
  }

  throw (
    lastError ||
    new Error(
      '找不到 Hermes CLI。请设置 HERMES_CLI_COMMAND，或把 hermes 放到 PATH。'
    )
  );
}

function spawnHermesCandidate(
  candidate: HermesCommandCandidate,
  args: string[],
  options: { allowFailure?: boolean }
) {
  return new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const finalArgs = [...candidate.prefixArgs, ...args];
    const child = spawn(candidate.command, finalArgs, {
      cwd: WORKDIR,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(
        new Error(
          `Hermes command timed out: ${formatHermesInvocation(
            candidate,
            args
          )}`
        )
      );
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');

      if (code !== 0 && !options.allowFailure) {
        reject(
          new Error(
            `Hermes command failed (${code}): ${formatHermesInvocation(
              candidate,
              args
            )}\n${stderr || stdout}`
          )
        );
        return;
      }

      resolve({ code, stdout, stderr });
    });
  });
}

function buildHermesCommandCandidates(): HermesCommandCandidate[] {
  const explicit = parseCommandLine(HERMES_CLI_COMMAND);
  const hermesHome = getHermesHome();
  const agentDir = process.env.HERMES_AGENT_DIR || join(hermesHome, 'hermes-agent');
  const python =
    process.env.HERMES_AGENT_PYTHON ||
    join(agentDir, 'venv', 'bin', 'python3');
  const candidates: HermesCommandCandidate[] = [];

  if (explicit.length) {
    candidates.push({
      command: explicit[0]!,
      prefixArgs: explicit.slice(1),
      label: explicit.join(' '),
    });
  }

  candidates.push(
    {
      command: 'hermes',
      prefixArgs: [],
      label: 'hermes',
    },
    {
      command: join(homedir(), '.local', 'bin', 'hermes'),
      prefixArgs: [],
      label: '~/.local/bin/hermes',
    },
    {
      command: join(agentDir, 'venv', 'bin', 'hermes'),
      prefixArgs: [],
      label: 'hermes-agent venv hermes',
    },
    {
      command: python,
      prefixArgs: [join(agentDir, 'rl_cli.py')],
      label: 'hermes-agent rl_cli.py',
    }
  );

  return dedupeHermesCommandCandidates(candidates);
}

function parseCommandLine(value: string) {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
  }

  return tokens.filter(Boolean);
}

function dedupeHermesCommandCandidates(candidates: HermesCommandCandidate[]) {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = `${candidate.command}\0${candidate.prefixArgs.join('\0')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canUseCommandCandidate(candidate: HermesCommandCandidate) {
  if (candidate.command.includes('/')) {
    return existsSync(candidate.command);
  }

  return true;
}

function isCommandNotFoundError(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    ['ENOENT', 'EACCES'].includes(String((error as NodeJS.ErrnoException).code))
  );
}

function formatHermesInvocation(
  candidate: HermesCommandCandidate,
  args: string[]
) {
  return [candidate.label, ...args].join(' ');
}

function runLearningAssistantScript(
  command: string,
  args: string[],
  input: unknown
) {
  return new Promise<{
    status: number;
    payload: Record<string, unknown>;
  }>((resolve, reject) => {
    const child = spawn(
      LEARNING_ASSISTANT_PYTHON,
      [LEARNING_ASSISTANT_SCRIPT, command, ...args],
      {
        cwd: WORKDIR,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        status: 504,
        payload: {
          success: false,
          error: `${command} timed out`,
        },
      });
    }, LEARNING_ASSISTANT_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      const raw = stdout || stderr;
      let parsed: Record<string, unknown> | null = null;

      if (raw) {
        try {
          parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          parsed = null;
        }
      }

      if (code !== 0) {
        resolve({
          status: 400,
          payload:
            parsed ||
            ({
              success: false,
              error: raw || `${command} exited ${code}`,
            } as Record<string, unknown>),
        });
        return;
      }

      if (!parsed) {
        resolve({
          status: 500,
          payload: {
            success: false,
            error: 'learning-assistant returned invalid JSON',
          },
        });
        return;
      }

      resolve({ status: 200, payload: parsed });
    });

    if (typeof input !== 'undefined') {
      child.stdin.write(JSON.stringify(input));
    }
    child.stdin.end();
  });
}
