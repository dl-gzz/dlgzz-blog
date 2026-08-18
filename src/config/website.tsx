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
    enableVercelAnalytics: false,
    enableSpeedInsights: false,
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
    provider: 'tencent-ses',
    fromEmail: 'OneWorkOS <noreply@notify.dlgzz.com>',
    supportEmail: '395887347@qq.com',
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
        // 保留免费方案标识，避免影响现有用户权限；不在会员页提供免费体验入口。
        disabled: true,
      },
      // XorPay 采用单次扣款；月付订单会授予一个月的 OneWorkOS 访问权限。
      // 保留旧年付价格配置，确保已有订单、会员和安装授权仍可被正确识别。
      pro: {
        id: 'pro',
        name: 'OneWorkOS 会员',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId:
              process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY ||
              'xorpay_pro_monthly',
            amount: Number(
              process.env.NEXT_PUBLIC_PRO_MONTHLY_AMOUNT_CENTS || 1990
            ),
            currency: 'CNY',
            interval: PlanIntervals.MONTH,
          },
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId:
              process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY ||
              'xorpay_pro_yearly',
            amount: Number(
              process.env.NEXT_PUBLIC_PRO_YEARLY_AMOUNT_CENTS || 9900
            ),
            currency: 'CNY',
            interval: PlanIntervals.YEAR,
            disabled: true,
          },
        ],
        isFree: false,
        isLifetime: false,
        recommended: true,
      },
    },
  },
};
