import { defaultMessages } from '@/i18n/messages';
import { routing } from '@/i18n/routing';
import EmailLayout from '@/mail/components/email-layout';
import type { BaseEmailProps } from '@/mail/types';
import {
  Button,
  Heading,
  Hr,
  Section,
  Text,
} from '@react-email/components';
import { createTranslator } from 'use-intl/core';

interface PaymentSuccessProps extends BaseEmailProps {
  planName: string;
  interval: string; // 'month' or 'year'
  amount: number;
  currency: string;
  periodStart: string; // ISO date string
  periodEnd: string; // ISO date string
  dashboardUrl: string;
}

export default function PaymentSuccess({
  locale,
  messages,
  planName,
  interval,
  amount,
  currency,
  periodStart,
  periodEnd,
  dashboardUrl,
}: PaymentSuccessProps) {
  const t = createTranslator({
    locale,
    messages,
    namespace: 'Mail.paymentSuccess',
  });

  // Format dates
  const startDate = new Date(periodStart).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const endDate = new Date(periodEnd).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Format amount
  const formattedAmount = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  }).format(amount / 100);

  // Get interval text
  const intervalText = interval === 'month' ? t('monthly') : t('yearly');

  return (
    <EmailLayout locale={locale} messages={messages}>
      <Heading className="text-2xl font-bold text-gray-900">
        {t('subject')}
      </Heading>

      <Text className="text-base text-gray-700">{t('greeting')}</Text>

      <Text className="text-base text-gray-700">{t('thankYou')}</Text>

      <Section className="my-8 rounded-lg border border-gray-200 bg-gray-50 p-6">
        <Heading className="mb-4 text-lg font-semibold text-gray-900">
          {t('subscriptionDetails')}
        </Heading>

        <table className="w-full">
          <tbody>
            <tr>
              <td className="py-2 text-sm text-gray-600">{t('plan')}:</td>
              <td className="py-2 text-sm font-medium text-gray-900">
                {planName} ({intervalText})
              </td>
            </tr>
            <tr>
              <td className="py-2 text-sm text-gray-600">{t('amount')}:</td>
              <td className="py-2 text-sm font-medium text-gray-900">
                {formattedAmount}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-sm text-gray-600">{t('startDate')}:</td>
              <td className="py-2 text-sm font-medium text-gray-900">
                {startDate}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-sm text-gray-600">{t('expiryDate')}:</td>
              <td className="py-2 text-sm font-medium text-gray-900">
                {endDate}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section className="my-6 text-center">
        <Button
          href={dashboardUrl}
          className="rounded-md bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
        >
          {t('viewDashboard')}
        </Button>
      </Section>

      <Hr className="my-6 border-gray-200" />

      <Text className="text-sm text-gray-600">{t('accessInfo')}</Text>

      <Text className="text-sm text-gray-600">{t('renewalInfo')}</Text>

      <Text className="text-sm text-gray-600">{t('supportInfo')}</Text>
    </EmailLayout>
  );
}

PaymentSuccess.PreviewProps = {
  locale: routing.defaultLocale,
  messages: defaultMessages,
  planName: '独立工作者会员',
  interval: 'month',
  amount: 180,
  currency: 'CNY',
  periodStart: new Date().toISOString(),
  periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  dashboardUrl: 'https://example.com/dashboard',
} as PaymentSuccessProps;
