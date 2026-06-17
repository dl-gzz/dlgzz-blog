import { websiteConfig } from '@/config/website';
import { findPlanByPriceId } from '@/lib/price-plan';
import { getSession } from '@/lib/server';
import { getUrlWithLocale } from '@/lib/urls/urls';
import {
  attachCheckoutToWorkerInstance,
  createWorkerInstance,
  getActiveWorkerEmployee,
  markWorkerInstancePayment,
} from '@/lib/workers';
import { createCheckout } from '@/payment';
import type { Locale } from 'next-intl';
import { type NextRequest, NextResponse } from 'next/server';

interface WorkerCheckoutBody {
  employeeId?: unknown;
  personaId?: unknown;
  personaPrompt?: unknown;
  locale?: unknown;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: '请先登录后再雇佣数字员工',
      },
      { status: 401 }
    );
  }

  let body: WorkerCheckoutBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '请求体不是有效 JSON' },
      { status: 400 }
    );
  }

  const employeeId = readString(body.employeeId);
  if (!employeeId) {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '缺少 employeeId' },
      { status: 400 }
    );
  }

  const target = await getActiveWorkerEmployee(employeeId);
  if (!target) {
    return NextResponse.json(
      {
        success: false,
        code: 'WORKER_NOT_AVAILABLE',
        error: '这个数字员工尚未上架或缺少灵魂文档',
      },
      { status: 400 }
    );
  }

  const plan = findPlanByPriceId(target.employee.monthlyPriceId);
  if (!plan) {
    return NextResponse.json(
      {
        success: false,
        code: 'WORKER_PRICE_NOT_CONFIGURED',
        error: `员工价格未配置：${target.employee.monthlyPriceId}`,
      },
      { status: 500 }
    );
  }

  const created = await createWorkerInstance({
    userId,
    employeeId,
    personaId: readString(body.personaId) || null,
    personaPrompt: readString(body.personaPrompt) || null,
  });

  if (!created) {
    return NextResponse.json(
      {
        success: false,
        code: 'WORKER_INSTANCE_CREATE_FAILED',
        error: '创建雇佣实例失败',
      },
      { status: 500 }
    );
  }

  const locale = readLocale(body.locale);
  const successUrl = getUrlWithLocale(
    `/bots?worker_checkout=success&instance_id=${encodeURIComponent(
      created.instance.id
    )}&session_id={CHECKOUT_SESSION_ID}`,
    locale
  );
  const cancelUrl = getUrlWithLocale(
    `/bots?worker_checkout=cancel&instance_id=${encodeURIComponent(
      created.instance.id
    )}`,
    locale
  );

  try {
    const checkout = await createCheckout({
      planId: plan.id,
      priceId: created.employee.monthlyPriceId,
      userId,
      customerEmail: session.user.email,
      successUrl,
      cancelUrl,
      locale,
      metadata: {
        userId,
        userName: session.user.name,
        workerInstanceId: created.instance.id,
        workerEmployeeId: created.employee.id,
        workerEmployeeName: created.employee.name,
        workerEmployeeVersionId: created.version.id,
      },
    });

    const subscriptionId =
      websiteConfig.payment.provider === 'xorpay' ? checkout.id : null;
    await attachCheckoutToWorkerInstance({
      instanceId: created.instance.id,
      checkoutSessionId: checkout.id,
      subscriptionId,
    });

    return NextResponse.json({
      success: true,
      checkout,
      instanceId: created.instance.id,
      employeeId: created.employee.id,
      employeeVersionId: created.version.id,
    });
  } catch (error) {
    await markWorkerInstancePayment({
      workerInstanceId: created.instance.id,
      paymentStatus: 'failed',
    });

    return NextResponse.json(
      {
        success: false,
        code: 'CHECKOUT_FAILED',
        error: error instanceof Error ? error.message : '创建付款失败',
        instanceId: created.instance.id,
      },
      { status: 502 }
    );
  }
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : 'zh';
}
