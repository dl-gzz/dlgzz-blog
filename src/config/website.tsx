import { PaymentTypes, PlanIntervals } from '@/payment/types';
import type { WebsiteConfig } from '@/types';

/**
 * 独立工作者 website configuration
 *
 * docs:
 * https://mksaas.com/docs/config/website
 */
export const websiteConfig: WebsiteConfig = {
  metadata: {
    theme: {
      defaultTheme: 'default',
      enableSwitch: true,
    },
    mode: {
      defaultMode: 'system',
      enableSwitch: true,
    },
    images: {
      ogImage: '/og.png',
      logoLight: '/logo.png',
      logoDark: '/logo-dark.png',
    },
    social: {
      github: 'https://github.com/dl-gzz',
      twitter: '',
      blueSky: '',
      discord: '',
      mastodon: '',
      linkedin: '',
      youtube: '',
    },
  },
  features: {
    enableDiscordWidget: false,
    enableUpgradeCard: true,
    enableAffonsoAffiliate: false,
    enablePromotekitAffiliate: false,
  },
  routes: {
    defaultLoginRedirect: '/dashboard',
  },
  analytics: {
    enableVercelAnalytics: true,
    enableSpeedInsights: true,
  },
  auth: {
    enableEmailLogin: true,
    enableGoogleLogin: false,
    enableGithubLogin: false,
  },
  i18n: {
    defaultLocale: 'zh',
    locales: {
      en: {
        flag: '🇺🇸',
        name: 'English',
      },
      zh: {
        flag: '🇨🇳',
        name: '中文',
      },
    },
  },
  blog: {
    paginationSize: 6,
    relatedPostsSize: 3,
  },
  mail: {
    provider: 'smtp',
    fromEmail: '独立工作者 <395887347@qq.com>',
    supportEmail: '独立工作者 <395887347@qq.com>',
  },
  newsletter: {
    provider: 'resend',
    autoSubscribeAfterSignUp: false,
  },
  storage: {
    provider: 's3',
  },
  payment: {
    provider: 'xorpay', // Changed from 'stripe' to 'xorpay'
  },
  price: {
    plans: {
      free: {
        id: 'free',
        prices: [],
        isFree: true,
        isLifetime: false,
      },
      pro: {
        id: 'pro',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || 'xorpay_pro_monthly',
            amount: 180, // 180 分 = 1.80 元 (XorPay test amount)
            currency: 'CNY',
            interval: PlanIntervals.MONTH,
          },
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY || 'xorpay_pro_yearly',
            amount: 180, // 180 分 = 1.80 元 (XorPay test amount)
            currency: 'CNY',
            interval: PlanIntervals.YEAR,
          },
        ],
        isFree: false,
        isLifetime: false,
        recommended: true,
      },
    },
  },
};
