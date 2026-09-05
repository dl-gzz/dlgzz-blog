import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      success: true,
      data: {
        appName: '独立工作者',
        theme: {
          primaryColor: '#0F172A',
          accentColor: '#D97706',
          surfaceColor: '#F8FAFC',
        },
        membership: {
          planId: 'club',
          planName: '星球会员',
          priceText: '在知识星球完成付费后，用兑换码开通',
          benefits: [
            '网站和小程序共享会员身份',
            '所有文章公开阅读',
            '按兑换码设置有效期',
          ],
        },
        tabs: [
          { key: 'home', label: '博客' },
          { key: 'membership', label: '会员' },
          { key: 'profile', label: '我的' },
        ],
      },
    },
    {
      headers: {
        'Cache-Control':
          'public, max-age=60, s-maxage=300, stale-while-revalidate=60',
      },
    }
  );
}
