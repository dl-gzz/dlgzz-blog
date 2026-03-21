import 'server-only';

import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { getServiceCatalog, type ServiceCatalogItem } from '@/lib/service-catalog';
import { GRANTED_ONE_TIME_PAYMENT_STATUSES } from '@/lib/service-access';
import { PaymentTypes } from '@/payment/types';
import { and, desc, eq, inArray } from 'drizzle-orm';

export interface OwnedServiceEntry {
  item: ServiceCatalogItem;
  purchasedAt?: Date | null;
  priceId?: string;
}

export async function getGrantedOneTimePayments(userId: string) {
  const db = await getDb();
  return db
    .select({
      id: payment.id,
      priceId: payment.priceId,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    })
    .from(payment)
    .where(
      and(
        eq(payment.userId, userId),
        eq(payment.type, PaymentTypes.ONE_TIME),
        inArray(payment.status, [...GRANTED_ONE_TIME_PAYMENT_STATUSES])
      )
    )
    .orderBy(desc(payment.createdAt));
}

export async function getOwnedLicenseServices(locale: string, userId: string): Promise<OwnedServiceEntry[]> {
  const payments = await getGrantedOneTimePayments(userId);
  if (!payments.length) return [];

  const latestByPriceId = new Map<string, Date | null>();
  for (const record of payments) {
    if (!latestByPriceId.has(record.priceId)) {
      latestByPriceId.set(record.priceId, record.createdAt || record.updatedAt || null);
    }
  }

  return getServiceCatalog(locale)
    .filter((item) => item.manifest.pricing.mode === 'license')
    .filter((item) => {
      const priceId = item.manifest.pricing.price_id?.trim();
      return Boolean(priceId && latestByPriceId.has(priceId));
    })
    .map((item) => {
      const priceId = item.manifest.pricing.price_id?.trim() || undefined;
      return {
        item,
        purchasedAt: priceId ? latestByPriceId.get(priceId) || null : null,
        priceId,
      } satisfies OwnedServiceEntry;
    });
}

export function getPremiumServices(locale: string): ServiceCatalogItem[] {
  return getServiceCatalog(locale).filter((item) => item.manifest.pricing.mode === 'premium');
}
