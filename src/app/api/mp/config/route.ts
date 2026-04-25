import { NextResponse } from 'next/server';

export async function GET() {
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
        planId: 'vip_yearly',
        planName: '年度会员',
        priceText: '请在支付接入后配置正式价格',
        benefits: ['解锁会员文章', '解锁会员组件', '年度有效期 365 天'],
      },
      tabs: [
        { key: 'home', label: '博客' },
        { key: 'membership', label: '会员' },
        { key: 'profile', label: '我的' },
      ],
    },
  });
}
