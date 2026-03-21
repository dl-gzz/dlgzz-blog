'use server';

import { findPlanByPriceId } from '@/lib/price-plan';
import { getSession } from '@/lib/server';
import { getUrlWithLocale } from '@/lib/urls/urls';
import { createCheckout } from '@/payment';
import type { CreateCheckoutParams } from '@/payment/types';
import { getLocale } from 'next-intl/server';
import { createSafeActionClient } from 'next-safe-action';
import { z } from 'zod';

const actionClient = createSafeActionClient();

const checkoutSchema = z.object({
  userId: z.string().min(1, { message: 'User ID is required' }),
  slug: z.string().min(1, { message: 'Slug is required' }),
  serviceId: z.string().min(1, { message: 'Service ID is required' }),
  serviceName: z.string().min(1, { message: 'Service name is required' }),
  priceId: z.string().min(1, { message: 'Price ID is required' }),
});

export const createServiceCheckoutAction = actionClient
  .schema(checkoutSchema)
  .action(async ({ parsedInput }) => {
    const { userId, slug, serviceId, serviceName, priceId } = parsedInput;

    const session = await getSession();
    if (!session) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    if (session.user.id !== userId) {
      return {
        success: false,
        error: 'Not authorized to do this action',
      };
    }

    try {
      const locale = await getLocale();
      const plan = findPlanByPriceId(priceId);
      if (!plan) {
        return {
          success: false,
          error: 'Service price plan not found',
        };
      }

      const successUrl = getUrlWithLocale(
        `/services/buy/${slug}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        locale
      );
      const cancelUrl = getUrlWithLocale(`/services/buy/${slug}`, locale);
      const params: CreateCheckoutParams = {
        planId: plan.id,
        priceId,
        userId: session.user.id,
        customerEmail: session.user.email,
        successUrl,
        cancelUrl,
        locale,
        metadata: {
          userId: session.user.id,
          userName: session.user.name,
          serviceSlug: slug,
          serviceId,
          serviceName,
        },
      };

      const result = await createCheckout(params);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
