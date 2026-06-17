import type { ServiceManifestV1 } from '@/lib/service-manifest';

export type ArticleToolActionType = 'install' | 'download' | 'chat';
export type ArticleToolActionAccess = 'free' | 'auth' | 'premium' | 'license';
export type ArticleToolActionPackage = 'skill' | 'shape' | 'component';
export type ArticleToolActionSource =
  | 'tool_actions'
  | 'service_manifest'
  | 'whiteboard_prompt';

export interface ArticleToolActionAccessState {
  granted: boolean;
  code:
    | 'FREE'
    | 'AUTH_REQUIRED'
    | 'PREMIUM_REQUIRED'
    | 'LICENSE_REQUIRED'
    | 'LICENSE_CONFIG_INVALID';
  statusLabel: string;
  helperText: string;
  actionLabel?: string;
  actionHref?: string;
}

export interface ArticleToolActionV1 {
  id: string;
  type: ArticleToolActionType;
  label: string;
  description?: string;
  access: ArticleToolActionAccess;
  source: ArticleToolActionSource;
  package?: ArticleToolActionPackage;
  href?: string;
  fileKey?: string;
  fileName?: string;
  fileType?: string;
  size?: string;
  prompt?: string;
  whiteboardPrompt?: string;
  serviceManifest?: ServiceManifestV1 | null;
}

export type ArticleToolActionView = ArticleToolActionV1 & {
  accessState: ArticleToolActionAccessState;
};

interface ServiceLikeAccessState {
  granted: boolean;
  code: ArticleToolActionAccessState['code'];
  statusLabel: string;
  helperText: string;
  actionLabel?: string;
  actionHref?: string;
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(value: unknown) {
  const text = readString(value);
  return text || undefined;
}

function readActionType(value: unknown): ArticleToolActionType | null {
  const type = readString(value);
  if (type === 'install' || type === 'download' || type === 'chat') {
    return type;
  }
  return null;
}

function readAccess(value: unknown): ArticleToolActionAccess {
  const access = readString(value);
  if (access === 'auth' || access === 'premium') return access;
  return 'free';
}

function readPackage(value: unknown): ArticleToolActionPackage | undefined {
  const packageType = readString(value);
  if (
    packageType === 'skill' ||
    packageType === 'shape' ||
    packageType === 'component'
  ) {
    return packageType;
  }
  return undefined;
}

function getDefaultLabel(type: ArticleToolActionType) {
  if (type === 'install') return '安装到本地';
  if (type === 'download') return '下载资料';
  return '和这篇内容对话';
}

function getAccessFromManifest(
  manifest: ServiceManifestV1
): ArticleToolActionAccess {
  if (manifest.pricing.mode === 'premium') return 'premium';
  if (manifest.pricing.mode === 'license') return 'license';
  return 'free';
}

function buildDownloadHref(action: ArticleToolActionV1) {
  if (action.href) return action.href;
  if (!action.fileKey) return undefined;

  const params = new URLSearchParams({ key: action.fileKey });
  if (action.access === 'auth' || action.access === 'premium') {
    params.set('access', action.access);
  }
  return `/api/files/download?${params.toString()}`;
}

function normalizeDeclaredAction(
  value: unknown,
  index: number
): ArticleToolActionV1 | null {
  if (!isObject(value)) return null;

  const type = readActionType(value.type);
  if (!type) return null;

  const access = readAccess(value.access);
  const action: ArticleToolActionV1 = {
    id: readString(value.id) || `${type}-${index + 1}`,
    type,
    label: readString(value.label) || getDefaultLabel(type),
    description: readOptionalString(value.description),
    access,
    source: 'tool_actions',
    package: readPackage(value.package || value.package_type),
    href: readOptionalString(value.href || value.url),
    fileKey: readOptionalString(value.file_key || value.fileKey),
    fileName: readOptionalString(
      value.file_name || value.fileName || value.name
    ),
    fileType: readOptionalString(value.file_type || value.fileType),
    size: readOptionalString(value.size),
    prompt: readOptionalString(value.prompt || value.default_question),
    whiteboardPrompt: readOptionalString(
      value.whiteboard_prompt || value.whiteboardPrompt
    ),
  };

  const href = buildDownloadHref(action);
  return href ? { ...action, href } : action;
}

function normalizeDeclaredActions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => normalizeDeclaredAction(item, index))
    .filter((item): item is ArticleToolActionV1 => Boolean(item));
}

export function getArticleToolActions({
  rawActions,
  serviceManifest,
  whiteboardPrompt,
}: {
  rawActions: unknown;
  serviceManifest?: ServiceManifestV1 | null;
  whiteboardPrompt?: string;
}) {
  const actions = normalizeDeclaredActions(rawActions);
  const installIndex = actions.findIndex((action) => action.type === 'install');

  if (installIndex >= 0) {
    const installAction = actions[installIndex];
    actions[installIndex] = {
      ...installAction,
      access: serviceManifest
        ? getAccessFromManifest(serviceManifest)
        : installAction.access,
      serviceManifest: installAction.serviceManifest || serviceManifest || null,
      whiteboardPrompt:
        installAction.whiteboardPrompt || whiteboardPrompt || undefined,
    };
    return actions;
  }

  if (serviceManifest) {
    return [
      ...actions,
      {
        id: `${serviceManifest.id}-install`,
        type: 'install',
        label: '安装到本地',
        description:
          serviceManifest.summary ||
          '安装成一个本地可用的 Skill / Shape 工具。',
        access: getAccessFromManifest(serviceManifest),
        source: 'service_manifest',
        package: 'skill',
        serviceManifest,
        whiteboardPrompt,
      } satisfies ArticleToolActionV1,
    ];
  }

  if (whiteboardPrompt) {
    return [
      ...actions,
      {
        id: 'whiteboard-prompt-install',
        type: 'install',
        label: '生成本地工具',
        description: '把这篇内容作为本地白板里的工具入口打开。',
        access: 'free',
        source: 'whiteboard_prompt',
        package: 'skill',
        whiteboardPrompt,
      } satisfies ArticleToolActionV1,
    ];
  }

  return actions;
}

export function getToolActionAccessState({
  action,
  locale,
  userId,
  hasPremium,
}: {
  action: ArticleToolActionV1;
  locale: string;
  userId?: string | null;
  hasPremium: boolean;
}): ArticleToolActionAccessState {
  const loginHref = `/${locale}/auth/login`;
  const pricingHref = `/${locale}/pricing`;

  if (action.access === 'free') {
    return {
      granted: true,
      code: 'FREE',
      statusLabel: '可直接使用',
      helperText: '这个工具动作可以直接使用。',
    };
  }

  if (action.access === 'auth') {
    if (!userId) {
      return {
        granted: false,
        code: 'AUTH_REQUIRED',
        statusLabel: '未登录',
        helperText: '登录后可以使用这个工具动作。',
        actionLabel: '登录后使用',
        actionHref: loginHref,
      };
    }

    return {
      granted: true,
      code: 'FREE',
      statusLabel: '已登录可用',
      helperText: '当前账号可以使用这个工具动作。',
    };
  }

  if (action.access === 'premium') {
    if (!userId) {
      return {
        granted: false,
        code: 'AUTH_REQUIRED',
        statusLabel: '未登录',
        helperText: '这是会员工具。请先登录，再加入会员后使用。',
        actionLabel: '登录后开通会员',
        actionHref: loginHref,
      };
    }

    if (!hasPremium) {
      return {
        granted: false,
        code: 'PREMIUM_REQUIRED',
        statusLabel: '会员未解锁',
        helperText: '这是会员工具，加入会员后即可使用。',
        actionLabel: '加入会员',
        actionHref: pricingHref,
      };
    }

    return {
      granted: true,
      code: 'FREE',
      statusLabel: '会员已解锁',
      helperText: '当前会员账号可以直接使用这个工具动作。',
    };
  }

  if (!userId) {
    return {
      granted: false,
      code: 'AUTH_REQUIRED',
      statusLabel: '未登录',
      helperText: '请先登录，再继续使用这个工具。',
      actionLabel: '登录后使用',
      actionHref: loginHref,
    };
  }

  if (hasPremium) {
    return {
      granted: true,
      code: 'FREE',
      statusLabel: '会员已解锁',
      helperText: '当前会员账号可以直接使用这个工具动作。',
    };
  }

  return {
    granted: false,
    code: 'PREMIUM_REQUIRED',
    statusLabel: '会员未解锁',
    helperText: '这个旧授权工具暂时按会员权益处理。',
    actionLabel: '加入会员',
    actionHref: pricingHref,
  };
}

export function toArticleToolActionAccessState(
  access: ServiceLikeAccessState
): ArticleToolActionAccessState {
  return {
    granted: access.granted,
    code: access.code,
    statusLabel: access.statusLabel,
    helperText: access.helperText,
    actionLabel: access.actionLabel,
    actionHref: access.actionHref,
  };
}
