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
    title: 'OneWorkerOS 会员与 WorkBuddy 连接',
    description:
      '开通 OneWorkerOS 会员，安装 WorkBuddy 插件并通过网页授权开始使用。Mac 与 Windows 使用同一流程，无需 API Key。',
    canonicalUrl: getUrlWithLocale('/onework', locale),
  });
}

export default function OneWorkPage() {
  return (
    <Container className="px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-medium text-primary">OneWorkerOS</p>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            连接 OneWorkerOS，只需要一条清晰的流程
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
            开通会员，在 WorkBuddy 安装插件，再由你本人完成一次网页授权。Mac 和
            Windows 使用同一套方式，不需要复制 API Key，也不需要配置本地环境。
          </p>
        </div>
        <OneWorkAccessPanel />
      </div>
    </Container>
  );
}
