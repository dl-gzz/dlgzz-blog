import Container from '@/components/layout/container';
import { OneWorkAccessPanel } from '@/components/onework/onework-access-panel';
import { constructMetadata } from '@/lib/metadata';
import { getUrlWithLocale } from '@/lib/urls/urls';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  return constructMetadata({
    title: 'OneWorkOS 授权与安装',
    description: '兑换 OneWorkOS 知识包，管理设备授权并连接 WorkBuddy Skill。',
    canonicalUrl: getUrlWithLocale('/onework', locale),
  });
}

export default function OneWorkPage() {
  return (
    <Container className="px-4 py-16">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-medium text-primary">OneWorkOS</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">把你的 WorkBuddy 连接到真正的知识库</h1>
          <p className="text-lg text-muted-foreground">
            购买后输入兑换码即可绑定账号。知识包属于账号，设备 Key 可以随时重新生成，图片、官方出处和检索用量仍由 OneWorkOS 统一管理。
          </p>
        </div>
        <OneWorkAccessPanel />
      </div>
    </Container>
  );
}

