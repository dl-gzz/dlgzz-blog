import {
  ensureMembershipCompanionForUser,
  getDefaultCompanionEmployeeId,
} from '@/lib/workers';
import { getMembershipEntitlementForUser } from '@/lib/entitlements';
import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import { type NextRequest, NextResponse } from 'next/server';

interface CompanionBody {
  employeeId?: unknown;
  personaId?: unknown;
  personaPrompt?: unknown;
}

export async function GET() {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再查看长期陪伴者',
      },
      { status: 401 }
    );
  }

  const entitlement = await getMembershipEntitlementForUser(userId);
  const beta = getCompanionBetaAccess(session.user);

  return NextResponse.json({
    success: true,
    entitlement,
    beta,
    defaultEmployeeId: getDefaultCompanionEmployeeId(),
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再创建长期陪伴者',
      },
      { status: 401 }
    );
  }

  const beta = getCompanionBetaAccess(session.user);
  if (!beta.allowed) {
    return NextResponse.json(
      {
        success: false,
        code: 'WORKER_COMPANION_BETA_CLOSED',
        error: '长期陪伴者正在灰度测试中，当前账号暂未开放。',
        beta,
      },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as CompanionBody;

  try {
    const result = await ensureMembershipCompanionForUser({
      userId,
      employeeId: readString(body.employeeId) || undefined,
      personaId: readString(body.personaId) || null,
      personaPrompt: readString(body.personaPrompt) || null,
    });

    return NextResponse.json({
      success: true,
      created: result.created,
      entitlement: result.entitlement,
      instance: result.instance,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '创建长期陪伴者失败';

    return NextResponse.json(
      {
        success: false,
        code: message.includes('会员')
          ? 'MEMBERSHIP_REQUIRED'
          : 'COMPANION_CREATE_FAILED',
        error: message,
      },
      { status: message.includes('会员') ? 402 : 500 }
    );
  }
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

interface CompanionBetaUser {
  id?: string | null;
  email?: string | null;
  role?: string | null;
}

function getCompanionBetaAccess(user?: CompanionBetaUser | null) {
  const enabled = isCompanionBetaModeEnabled();
  if (!enabled) {
    return {
      enabled,
      allowed: true,
    };
  }

  const userIds = readLowercaseEnvSet('WORKER_COMPANION_BETA_USER_IDS');
  const emails = readLowercaseEnvSet('WORKER_COMPANION_BETA_EMAILS');
  const userId = user?.id?.trim().toLowerCase();
  const email = user?.email?.trim().toLowerCase();

  return {
    enabled,
    allowed:
      canAccessHermesAdmin(user) ||
      Boolean(userId && userIds.has(userId)) ||
      Boolean(email && emails.has(email)),
  };
}

function isCompanionBetaModeEnabled() {
  const value = (process.env.WORKER_COMPANION_BETA_MODE || '')
    .trim()
    .toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function readLowercaseEnvSet(name: string) {
  return new Set(
    (process.env[name] || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}
