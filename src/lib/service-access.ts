import 'server-only';

import { getDb } from '@/db';
import { payment } from '@/db/schema';
import type { ServiceManifestV1 } from '@/lib/service-manifest';
import { PaymentTypes, type PaymentStatus } from '@/payment/types';
import { and, desc, eq, inArray } from 'drizzle-orm';

export type ServiceAccessCode =
  | 'FREE'
  | 'AUTH_REQUIRED'
  | 'PREMIUM_REQUIRED'
  | 'LICENSE_REQUIRED'
  | 'LICENSE_CONFIG_INVALID';

export interface ServiceAccessState {
  mode: ServiceManifestV1['pricing']['mode'];
  granted: boolean;
  code: ServiceAccessCode;
  statusLabel: string;
  helperText: string;
  actionLabel?: string;
  actionHref?: string;
  loginHref?: string;
  purchaseHref?: string;
}

export interface ServiceLicenseOrderState {
  found: boolean;
  granted: boolean;
  pending: boolean;
  status: PaymentStatus | string;
  subscriptionId?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export const GRANTED_ONE_TIME_PAYMENT_STATUSES = ['active', 'completed'] as const;
const TRACKED_ONE_TIME_PAYMENT_STATUSES = ['processing', ...GRANTED_ONE_TIME_PAYMENT_STATUSES] as const;

function getDefaultPurchaseHref(locale: string, manifest: ServiceManifestV1) {
  const customHref = manifest.pricing.purchase_url?.trim();
  if (customHref) return customHref;
  if (manifest.pricing.mode === 'license') {
    return `/${locale}/services/buy/${encodeURIComponent(manifest.source.article_slug)}`;
  }
  return `/${locale}/pricing?service=${encodeURIComponent(manifest.id)}`;
}

export async function userHasServiceLicense(userId: string, priceId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const result = await db
      .select({ id: payment.id })
      .from(payment)
      .where(
        and(
          eq(payment.userId, userId),
          eq(payment.type, PaymentTypes.ONE_TIME),
          inArray(payment.status, [...GRANTED_ONE_TIME_PAYMENT_STATUSES]),
          eq(payment.priceId, priceId)
        )
      )
      .limit(1);

    return result.length > 0;
  } catch {
    return false;
  }
}

export async function getServiceLicenseOrderState({
  userId,
  priceId,
  subscriptionId,
}: {
  userId: string;
  priceId: string;
  subscriptionId: string;
}): Promise<ServiceLicenseOrderState | null> {
  try {
    const db = await getDb();
    const result = await db
      .select({
        status: payment.status,
        subscriptionId: payment.subscriptionId,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      })
      .from(payment)
      .where(
        and(
          eq(payment.userId, userId),
          eq(payment.type, PaymentTypes.ONE_TIME),
          eq(payment.priceId, priceId),
          eq(payment.subscriptionId, subscriptionId),
          inArray(payment.status, [...TRACKED_ONE_TIME_PAYMENT_STATUSES])
        )
      )
      .orderBy(desc(payment.createdAt))
      .limit(1);

    if (!result.length) return null;

    const record = result[0];
    const granted = GRANTED_ONE_TIME_PAYMENT_STATUSES.includes(
      record.status as (typeof GRANTED_ONE_TIME_PAYMENT_STATUSES)[number]
    );

    return {
      found: true,
      granted,
      pending: record.status === 'processing',
      status: record.status,
      subscriptionId: record.subscriptionId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function getServiceAccessState({
  locale,
  manifest,
  userId,
  hasPremium,
}: {
  locale: string;
  manifest: ServiceManifestV1;
  userId?: string | null;
  hasPremium?: boolean;
}): Promise<ServiceAccessState> {
  const mode = manifest.pricing.mode;
  const loginHref = `/${locale}/auth/login`;
  const purchaseHref = getDefaultPurchaseHref(locale, manifest);

  if (mode === 'free') {
    return {
      mode,
      granted: true,
      code: 'FREE',
      statusLabel: userId ? '已登录可安装' : '可直接安装',
      helperText: '这个组件可以直接安装到本地客户端。',
    };
  }

  if (mode === 'premium') {
    if (!userId) {
      return {
        mode,
        granted: false,
        code: 'AUTH_REQUIRED',
        statusLabel: '未登录',
        helperText: '这是会员组件。请先登录，再完成会员校验后安装。',
        actionLabel: '先登录再安装',
        actionHref: loginHref,
        loginHref,
        purchaseHref,
      };
    }

    if (!hasPremium) {
      return {
        mode,
        granted: false,
        code: 'PREMIUM_REQUIRED',
        statusLabel: '已登录未开通会员',
        helperText: '这是会员组件，开通会员后才能安装到本地客户端。',
        actionLabel: '升级会员后安装',
        actionHref: purchaseHref,
        loginHref,
        purchaseHref,
      };
    }

    return {
      mode,
      granted: true,
      code: 'FREE',
      statusLabel: '会员已解锁',
      helperText: '当前账号已解锁会员权限，这个组件可以直接安装到客户端。',
      purchaseHref,
    };
  }

  if (!userId) {
    return {
      mode,
      granted: false,
      code: 'AUTH_REQUIRED',
      statusLabel: '未登录',
      helperText: '这是单独购买授权组件。请先登录，再完成购买。',
      actionLabel: '先登录再购买',
      actionHref: loginHref,
      loginHref,
      purchaseHref,
    };
  }

  const licensePriceId = manifest.pricing.price_id?.trim();
  if (!licensePriceId) {
    return {
      mode,
      granted: false,
      code: 'LICENSE_CONFIG_INVALID',
      statusLabel: '授权配置缺失',
      helperText: '这个组件缺少授权价格配置，暂时不能安装。',
      purchaseHref,
    };
  }

  const hasLicense = await userHasServiceLicense(userId, licensePriceId);
  if (!hasLicense) {
    return {
      mode,
      granted: false,
      code: 'LICENSE_REQUIRED',
      statusLabel: '已登录未购买授权',
      helperText: '这是单独购买组件，完成购买后才能安装到本地客户端。',
      actionLabel: '购买此组件',
      actionHref: purchaseHref,
      loginHref,
      purchaseHref,
    };
  }

  return {
    mode,
    granted: true,
    code: 'FREE',
    statusLabel: '已购买授权',
    helperText: '当前账号已拥有这个组件的单独授权，可以直接安装到客户端。',
    purchaseHref,
  };
}
