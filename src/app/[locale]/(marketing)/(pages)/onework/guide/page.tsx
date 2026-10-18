import Container from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { constructMetadata } from '@/lib/metadata';
import { getUrlWithLocale } from '@/lib/urls/urls';
import {
  ArrowRightIcon,
  BotIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleHelpIcon,
  ClipboardCheckIcon,
  Code2Icon,
  KeyRoundIcon,
  Layers3Icon,
  LockKeyholeIcon,
  SearchIcon,
  SparklesIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import Link from 'next/link';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  return constructMetadata({
    title: 'OneWorkOS 接入指南',
    description:
      '了解 OneWorkOS 能做什么，并用三步把你的 AI 客户端连接到知识、Skill 与行动。',
    canonicalUrl: getUrlWithLocale('/onework/guide', locale),
  });
}

const capabilities = [
  {
    icon: SearchIcon,
    title: '检索你的知识',
    description: '让 AI 先找到与你的目标相关的资料、方法和已验证经验。',
  },
  {
    icon: WorkflowIcon,
    title: '调度 Skill 与工具',
    description: '把需要重复执行的步骤交给合适的能力，而不是只返回一段答案。',
  },
  {
    icon: Layers3Icon,
    title: '连接多个客户端',
    description: 'WorkBuddy、豆包、OpenClaw 等客户端可以分别授权并同时使用。',
  },
  {
    icon: SparklesIcon,
    title: '沉淀可复用结果',
    description: '把一次完成的工作整理成下一次可以继续调用的知识资产。',
  },
];

const clients = [
  {
    icon: BotIcon,
    name: 'WorkBuddy',
    description: '复制接入提示，由客户端完成配置和网页授权。',
  },
  {
    icon: SparklesIcon,
    name: '豆包',
    description: '添加远程 MCP，再从客户端发起登录授权。',
  },
  {
    icon: Code2Icon,
    name: 'OpenClaw',
    description: '使用远程 MCP 地址连接，不需要复制 API Key。',
  },
  {
    icon: KeyRoundIcon,
    name: '其他 MCP 客户端',
    description: '支持 OAuth 的客户端可以使用通用远程 MCP 配置。',
  },
];

const steps = [
  {
    number: '01',
    title: '登录并开通',
    description: '登录 OneWorkOS，确认账号已拥有可用的会员权益。',
    icon: KeyRoundIcon,
  },
  {
    number: '02',
    title: '选择你的客户端',
    description: '在设置页选择 WorkBuddy、豆包、OpenClaw 或其他 MCP 客户端。',
    icon: ClipboardCheckIcon,
  },
  {
    number: '03',
    title: '完成网页授权',
    description: '复制接入提示，点击连接；浏览器打开后由你本人确认授权。',
    icon: LockKeyholeIcon,
  },
];

const sectionLinks = [
  ['overview', '一分钟看懂'],
  ['capabilities', '它能做什么'],
  ['steps', '三步接入'],
  ['clients', '客户端说明'],
  ['security', '授权边界'],
  ['faq', '常见问题'],
] as const;

export default function OneWorkGuidePage() {
  return (
    <div className="theme-blue min-h-screen bg-background">
      <Container className="px-4 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <header className="max-w-3xl space-y-6">
            <Badge className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 hover:bg-blue-50 dark:bg-blue-950/40 dark:text-blue-200">
              OneWorkOS · 接入指南
            </Badge>
            <div className="space-y-4">
              <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                把你的 AI 客户端，连接到 OneWorkOS
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                让知识、Skill
                和工具在一个授权边界内协同工作。你只需要选择客户端，完成一次网页授权，之后直接说出目标即可。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/settings/onework">
                  开始接入 <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/onework">了解 OneWorkOS</Link>
              </Button>
            </div>
          </header>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              ['一次授权', '登录后由你本人确认，客户端不需要保存 API Key。'],
              [
                '账号级权益',
                '会员权益属于账号，不绑定某一台电脑或某一个客户端。',
              ],
              ['多端可连接', '可以分别连接不同客户端，按需管理和断开授权。'],
            ].map(([title, description]) => (
              <Card
                key={title}
                className="border-blue-100 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/20"
              >
                <CardContent className="p-5">
                  <CheckCircle2Icon className="size-5 text-blue-600 dark:text-blue-400" />
                  <p className="mt-4 font-semibold">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
            <main className="min-w-0 space-y-20">
              <section id="overview" className="scroll-mt-8 space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
                    一分钟看懂
                  </p>
                  <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    OneWorkOS 是什么？
                  </h2>
                  <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                    它不是一个需要你从头学习的新工具，而是一层把你的知识、AI
                    和行动连接起来的工作系统。
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardContent className="p-6">
                      <BotIcon className="size-6 text-blue-600 dark:text-blue-400" />
                      <h3 className="mt-5 text-xl font-semibold">
                        你说目标，AI 找路径
                      </h3>
                      <p className="mt-2 leading-7 text-muted-foreground">
                        OneWorkOS
                        会先理解目标和当前阶段，再把问题连接到合适的知识和能力。
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <Layers3Icon className="size-6 text-blue-600 dark:text-blue-400" />
                      <h3 className="mt-5 text-xl font-semibold">
                        文章不只用来阅读
                      </h3>
                      <p className="mt-2 leading-7 text-muted-foreground">
                        结构化内容可以被检索、调用和执行，逐渐变成属于你的知识资产。
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </section>

              <section id="capabilities" className="scroll-mt-8 space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
                    能力边界
                  </p>
                  <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    接入后，它能帮你做什么？
                  </h2>
                  <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                    先从真实工作开始，再把有效的方法留在系统里，下一次继续使用。
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {capabilities.map(({ icon: Icon, title, description }) => (
                    <Card
                      key={title}
                      className="transition-colors hover:border-blue-300 dark:hover:border-blue-700"
                    >
                      <CardContent className="p-6">
                        <Icon className="size-6 text-blue-600 dark:text-blue-400" />
                        <h3 className="mt-5 font-semibold">{title}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {description}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>

              <section id="steps" className="scroll-mt-8 space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
                    三步上手
                  </p>
                  <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    从零开始，几分钟接上
                  </h2>
                  <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                    不需要先学会复杂配置，也不需要复制一串长期有效的密钥。
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {steps.map(({ number, title, description, icon: Icon }) => (
                    <Card key={number} className="relative overflow-hidden">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                            {number}
                          </span>
                          <Icon className="size-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="mt-8 text-lg font-semibold">{title}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {description}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50/70 p-5 dark:border-blue-900/60 dark:bg-blue-950/20">
                  <p className="text-sm leading-6 text-muted-foreground">
                    现在就开始：打开设置页，选择你正在使用的客户端。
                  </p>
                  <Button asChild variant="outline">
                    <Link href="/settings/onework">
                      打开接入设置 <ArrowRightIcon className="size-4" />
                    </Link>
                  </Button>
                </div>
              </section>

              <section id="clients" className="scroll-mt-8 space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
                    客户端说明
                  </p>
                  <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    按你的客户端接入
                  </h2>
                  <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                    每个客户端的入口不同，但最终都会回到同一个 OneWorkOS OAuth
                    授权流程。
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {clients.map(({ icon: Icon, name, description }) => (
                    <Card key={name}>
                      <CardContent className="flex items-start gap-4 p-5">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                          <Icon className="size-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{name}</h3>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            {description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>

              <section id="security" className="scroll-mt-8 space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
                    授权边界
                  </p>
                  <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    你始终掌握授权
                  </h2>
                </div>
                <Card className="border-blue-200 dark:border-blue-900/60">
                  <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
                    {[
                      '每个客户端单独授权、单独断开。',
                      '授权范围由 OneWorkOS 统一管理。',
                      '不需要在客户端保存长期 API Key。',
                      '会员权益属于账号，不属于设备。',
                    ].map((item) => (
                      <div key={item} className="flex items-start gap-3">
                        <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-400" />
                        <p className="text-sm leading-6 text-muted-foreground">
                          {item}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </section>

              <section id="faq" className="scroll-mt-8 space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
                    常见问题
                  </p>
                  <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    遇到问题怎么办？
                  </h2>
                </div>
                <div className="space-y-3">
                  <details className="group rounded-xl border p-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                      授权完成后，换一台电脑还要重新开通吗？
                      <ChevronRightIcon className="size-4 transition-transform group-open:rotate-90" />
                    </summary>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                      不需要重新购买。会员权益属于账号；新电脑只需要在对应客户端重新完成一次网页授权。
                    </p>
                  </details>
                  <details className="group rounded-xl border p-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                      我可以同时连接多个客户端吗？
                      <ChevronRightIcon className="size-4 transition-transform group-open:rotate-90" />
                    </summary>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                      可以。进入设置页后，每个客户端都可以单独授权、查看和断开。
                    </p>
                  </details>
                  <details className="group rounded-xl border p-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                      客户端没有 OAuth 入口怎么办？
                      <ChevronRightIcon className="size-4 transition-transform group-open:rotate-90" />
                    </summary>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                      先确认客户端支持远程 HTTP MCP 和
                      OAuth；如果仍然无法连接，可以使用设置页中的“其他 MCP
                      客户端”配置并联系支持。
                    </p>
                  </details>
                </div>
              </section>
            </main>

            <aside className="hidden lg:block">
              <nav
                className="sticky top-8 rounded-xl border bg-card p-4"
                aria-label="接入指南目录"
              >
                <div className="flex items-center gap-2 px-2 pb-3 text-sm font-semibold">
                  <CircleHelpIcon className="size-4 text-blue-600 dark:text-blue-400" />
                  本页目录
                </div>
                <div className="space-y-1 border-l pl-3">
                  {sectionLinks.map(([id, label]) => (
                    <Link
                      key={id}
                      href={`#${id}`}
                      className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                    >
                      {label}
                      <ChevronRightIcon className="size-3.5" />
                    </Link>
                  ))}
                </div>
              </nav>
            </aside>
          </div>

          <section className="mt-20 rounded-2xl border border-blue-200 bg-blue-600 px-6 py-10 text-white shadow-xl shadow-blue-600/15 sm:px-10 sm:py-12 dark:border-blue-500/40 dark:bg-blue-700">
            <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-center">
              <div className="max-w-2xl space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-100">
                  开始使用
                </p>
                <h2 className="text-3xl font-bold tracking-tight">
                  把下一件事交给你的工作系统
                </h2>
                <p className="leading-7 text-blue-50">
                  选择客户端、完成授权，然后从一句真实的问题开始。
                </p>
              </div>
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="shrink-0 bg-white text-blue-700 hover:bg-blue-50"
              >
                <Link href="/settings/onework">
                  开始接入 <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
            </div>
          </section>
        </div>
      </Container>
    </div>
  );
}
