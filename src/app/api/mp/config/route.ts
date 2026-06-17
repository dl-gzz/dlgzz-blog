import { getMembershipEntitlementForUser } from '@/lib/entitlements';
import {
  formatPriceText,
  getDefaultMembershipPrice,
} from '@/lib/membership-plan';
import { getMiniappSession } from '@/lib/mp-auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const session = await getMiniappSession(request);
  const membership = session
    ? await getMembershipEntitlementForUser(session.userId)
    : { active: false, source: null };
  const { planId, price } = getDefaultMembershipPrice();

  return NextResponse.json({
    success: true,
    data: {
      appName: '独立工作者',
      theme: {
        primaryColor: '#0F172A',
        accentColor: '#D97706',
        surfaceColor: '#F8FAFC',
      },
      membership: {
        planId,
        priceId: price.priceId,
        planName: '年度会员',
        priceText: formatPriceText(
          price.amount,
          price.currency,
          price.interval
        ),
        benefits: [
          '解锁会员文章',
          '会员期内解锁全部组件',
          '单买组件可作为永久授权保留',
        ],
        current: membership,
      },
      tabs: [
        { key: 'home', label: '博客' },
        { key: 'membership', label: '会员' },
        { key: 'profile', label: '我的' },
      ],
    },
  });
}
