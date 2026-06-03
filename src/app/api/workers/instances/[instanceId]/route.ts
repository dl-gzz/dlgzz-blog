import {
  getHermesActivationStatus,
  isHermesBridgeConfigured,
} from '@/lib/hermes-bridge-client';
import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import {
  getWorkerInstanceForUser,
  serializeEmployeeVersion,
  updateWorkerInstanceActivation,
} from '@/lib/workers';
import { type NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    instanceId: string;
  }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再查看数字员工实例',
      },
      { status: 401 }
    );
  }

  const { instanceId } = await context.params;
  const allowAdmin = canAccessHermesAdmin(session.user);
  const target = await getWorkerInstanceForUser(instanceId, userId, {
    allowAdmin,
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

  if (
    isHermesBridgeConfigured() &&
    (target.instance.activationId || target.instance.profileName)
  ) {
    try {
      const status = await getHermesActivationStatus(
        target.instance.activationId || target.instance.id
      );
      await updateWorkerInstanceActivation({
        instanceId,
        status: status.status || null,
        profileName: status.profileName || null,
        activationId: status.activationId || status.assistantId || null,
        qrPayload: status.qrPayload || null,
        qrImageUrl: status.qrImageUrl || null,
        expiresAt: status.expiresAt || null,
        weixinAccountId: status.weixinAccountId || null,
        weixinUserId: status.weixinUserId || null,
        gatewayStatus: status.gatewayStatus || null,
        error: status.error || status.gatewayError || null,
      });
    } catch {
      // Keep the last known local state visible if the bridge is temporarily down.
    }
  }

  const refreshed = await getWorkerInstanceForUser(instanceId, userId, {
    allowAdmin,
  });

  return NextResponse.json({
    success: true,
    instance: refreshed ? serializeTarget(refreshed) : serializeTarget(target),
  });
}

function serializeTarget(
  target: NonNullable<Awaited<ReturnType<typeof getWorkerInstanceForUser>>>
) {
  return {
    ...target.instance,
    employee: {
      id: target.employee.id,
      name: target.employee.name,
      responsibility: target.employee.responsibility,
      suitableTasks: target.employee.suitableTasks,
      solvesProblem: target.employee.solvesProblem,
      monthlyAmount: target.employee.monthlyAmount,
      currency: target.employee.currency,
    },
    version: serializeEmployeeVersion(target.version),
  };
}
