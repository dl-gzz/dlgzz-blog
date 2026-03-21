import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return constructMetadata({
    title: '已安装组件',
    description: '在本地客户端里查看和管理已经安装的组件。',
    canonicalUrl: '/services/installed',
  });
}

export default async function InstalledServicesGuidePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const clientInstalledUrl = `http://localhost:3001/${locale}/services/installed`;
  const clientWhiteboardUrl = `http://localhost:3001/${locale}/whiteboard`;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-12 md:px-6">
      <div className="rounded-[32px] border bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-8 shadow-sm">
        <div className="inline-flex rounded-full border bg-white px-3 py-1 text-xs font-semibold text-slate-700">
          Client Installed
        </div>
        <h1 className="mt-4 text-4xl font-black tracking-tight">已安装组件在客户端里管理</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          商店端负责展示和销售，真正的已安装组件列表在本地客户端里。打开客户端后，你可以查看、打开、卸载已经安装的组件。
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={clientInstalledUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            打开客户端已安装页
          </a>
          <a
            href={clientWhiteboardUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border bg-white px-5 py-3 text-sm font-semibold hover:bg-accent"
          >
            打开客户端母体
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border bg-card p-5">
          <div className="text-sm font-semibold text-muted-foreground">1. 在商店里挑选组件</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            先看文章和市场页，确认功能、适用场景和服务说明。
          </p>
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <div className="text-sm font-semibold text-muted-foreground">2. 安装到客户端</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            点击安装后，商店把 manifest 交给本地客户端，客户端完成安装和注册。
          </p>
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <div className="text-sm font-semibold text-muted-foreground">3. 在客户端里管理</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            已安装页支持查看、打开和卸载，这部分是客户端职责，不在商店端本地保存。
          </p>
        </div>
      </div>
    </div>
  );
}
