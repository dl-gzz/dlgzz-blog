import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import {
  ArrowRight,
  Bot,
  Brain,
  Check,
  CircleCheck,
  Compass,
  FileImage,
  FileText,
  Globe,
  Layers3,
  LockKeyhole,
  type LucideIcon,
  MessageSquareText,
  PenTool,
  PlayCircle,
  Presentation,
  ShieldCheck,
  Sparkles,
  Store,
  Video,
  Workflow,
  Zap,
} from 'lucide-react';

const cardClass =
  'rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)]';

const workflowSteps: Array<{
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    number: '01',
    title: '说出目标',
    description:
      '例如：“我想连接 QQ 邮箱”“我想用 WorkBuddy 做 PPT”“小红书店铺怎么设置发货”。',
    icon: MessageSquareText,
  },
  {
    number: '02',
    title: '理解当前阶段',
    description:
      'OneWorkOS 会识别你想解决的问题，并在需要时询问你现在进行到了哪一步。',
    icon: Compass,
  },
  {
    number: '03',
    title: '调用知识大脑',
    description:
      '系统从经过整理和验证的知识库中检索答案，返回文字、官方截图、视频教程和出处。',
    icon: Brain,
  },
  {
    number: '04',
    title: '调度执行能力',
    description:
      '需要操作时，系统会调用 WorkBuddy、浏览器、连接器、自动化工具或其他 Skill，推动任务继续完成。',
    icon: Workflow,
  },
];

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold tracking-[0.16em] text-blue-700 uppercase">
      <span className="size-1.5 rounded-full bg-blue-500" />
      {children}
    </div>
  );
}

export default function OneWorkOSHome() {
  return (
    <div className="overflow-hidden bg-white text-slate-950">
      <section className="relative isolate overflow-hidden border-b border-slate-200 bg-white px-4 pb-20 pt-14 sm:pt-20 lg:pb-28">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,.16),transparent_36%),radial-gradient(circle_at_8%_18%,rgba(96,165,250,.12),transparent_26%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-50 [background-image:linear-gradient(rgba(148,163,184,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.16)_1px,transparent_1px)] [background-size:52px_52px]"
        />

        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/80 px-4 py-2 text-sm text-blue-700 backdrop-blur">
              <Sparkles className="size-4 text-blue-600" />
              独立工作者的 AI 工作操作系统
            </div>
            <h1 className="mt-7 text-balance text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
              独立工作者的 <span className="text-blue-600">AI 系统</span>
            </h1>
            <p className="mx-auto mt-7 max-w-3xl text-pretty text-base leading-8 text-slate-600 sm:text-lg">
              OneWorkerOS，呈现了“文章即服务”的理念。
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-xl bg-blue-600 px-6 text-base shadow-lg shadow-blue-200 hover:bg-blue-700"
              >
                <LocaleLink href="/ai-chat">
                  立即使用 OneWorkOS <ArrowRight className="size-4" />
                </LocaleLink>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-xl border-slate-300 bg-white px-6 text-base text-slate-800 hover:bg-slate-50 hover:text-slate-950"
              >
                <a href="#workflow">查看它如何工作</a>
              </Button>
            </div>
            <p className="mt-5 text-sm text-slate-500">
              支持
              WorkBuddy、小红书开店与运营、内容创作及更多持续更新的知识能力。
            </p>
          </div>

          <div className="relative mx-auto mt-14 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-3 shadow-[0_30px_90px_-42px_rgba(30,64,175,.45)] sm:p-5">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 sm:p-7">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-blue-500 shadow-[0_0_14px_3px_rgba(59,130,246,.35)]" />
                  OneWorkOS · 工作控制台
                </div>
                <span className="hidden rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow-sm sm:block">
                  在线 · 知识与能力已连接
                </span>
              </div>
              <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-3 text-sm text-slate-500">
                    <MessageSquareText className="size-4 text-blue-600" />
                    用户目标
                  </div>
                  <p className="mt-4 text-lg font-medium text-slate-950">
                    我想连接 WorkBuddy 的 QQ 邮箱
                  </p>
                  <div className="mt-5 flex items-center gap-2 text-xs text-blue-600">
                    <span className="size-2 animate-pulse rounded-full bg-blue-500" />
                    正在理解你的当前阶段
                  </div>
                </div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                  <div className="flex items-center gap-3 text-sm text-blue-700">
                    <Brain className="size-4 text-blue-600" />
                    OneWorkOS 正在工作
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    <p className="flex items-center gap-2">
                      <CircleCheck className="size-4 text-blue-600" />
                      匹配 WorkBuddy 知识包
                    </p>
                    <p className="flex items-center gap-2">
                      <CircleCheck className="size-4 text-blue-600" />
                      找到官方图文教程与配置步骤
                    </p>
                    <p className="flex items-center gap-2">
                      <CircleCheck className="size-4 text-blue-600" />
                      准备打开连接器完成配置
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-600 sm:gap-4 sm:text-sm">
                {['目标', '知识检索', '能力调度'].map((label, index) => (
                  <div
                    key={label}
                    className="relative rounded-xl border border-slate-200 bg-white px-2 py-3"
                  >
                    <span className="mr-1 text-blue-600">0{index + 1}</span>
                    {label}
                    {index < 2 && (
                      <span
                        aria-hidden
                        className="absolute -right-4 top-1/2 hidden h-px w-4 bg-blue-300 lg:block"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="px-4 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <SectionEyebrow>工作流</SectionEyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">
              从一句话，到完整行动
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              不必先学会每一个工具。OneWorkOS
              会把问题、可靠知识和下一步行动连接起来。
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {workflowSteps.map(
              ({ number, title, description, icon: StepIcon }) => {
                return (
                  <article
                    key={number}
                    className={`${cardClass} group relative overflow-hidden`}
                  >
                    <span className="absolute right-5 top-4 text-5xl font-semibold tracking-tighter text-slate-100">
                      {number}
                    </span>
                    <div className="flex size-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                      <StepIcon className="size-5" />
                    </div>
                    <h3 className="mt-6 text-xl font-semibold">{title}</h3>
                    <p className="mt-3 max-w-md leading-7 text-slate-600">
                      {description}
                    </p>
                  </article>
                );
              }
            )}
          </div>
        </div>
      </section>

      <section
        id="capabilities"
        className="border-y border-slate-200 bg-white px-4 py-20 sm:py-28"
      >
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <SectionEyebrow>核心能力</SectionEyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">
              不是回答问题，而是推动工作继续。
            </h2>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            <article className={`${cardClass} border-blue-100`}>
              <Brain className="size-7 text-blue-600" />
              <h3 className="mt-6 text-2xl font-semibold">知识大脑</h3>
              <p className="mt-3 leading-7 text-slate-600">
                不是把大量文档塞给
                AI，而是将知识整理好，根据问题只检索当前需要的内容。
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {[
                  '官方资料与实践经验',
                  '图文教程与视频入口',
                  '清晰标注资料出处',
                  '持续更新，无需重复安装 Skill',
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 size-4 text-blue-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
            <article className={`${cardClass} border-blue-100`}>
              <Layers3 className="size-7 text-blue-600" />
              <h3 className="mt-6 text-2xl font-semibold">能力调度</h3>
              <p className="mt-3 leading-7 text-slate-600">
                OneWorkOS
                会先判断用户想做什么，再选择正确的知识包、Skill、连接器或工具。
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {[
                  '自动识别任务类型',
                  '匹配对应知识和能力',
                  '支持建议型与执行型流程',
                  '避免用户学习复杂工具',
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 size-4 text-blue-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
            <article className={`${cardClass} border-blue-100`}>
              <Zap className="size-7 text-blue-600" />
              <h3 className="mt-6 text-2xl font-semibold">行动闭环</h3>
              <p className="mt-3 leading-7 text-slate-600">
                答案不是终点。OneWorkOS
                会继续告诉用户下一步做什么，并在得到授权后调用工具执行。
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {[
                  '从提问到操作',
                  '从教程到自动化',
                  '从知识到真实结果',
                  '关键操作保留用户确认',
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 size-4 text-blue-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <SectionEyebrow>当前能力</SectionEyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">
              一个入口，连接多种工作能力
            </h2>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            <article className={`${cardClass} relative overflow-hidden`}>
              <Presentation className="size-7 text-blue-600" />
              <h3 className="mt-5 text-xl font-semibold">WorkBuddy 办公助手</h3>
              <p className="mt-3 leading-7 text-slate-600">
                提供 WorkBuddy 官方图文教程、连接器配置、PPT
                制作、日报自动化和功能操作指导。
              </p>
              <div className="mt-6 space-y-2 border-t border-blue-100 pt-5 text-sm text-slate-600">
                <p>“我现在想连接 WorkBuddy 的 QQ 邮箱。”</p>
                <p>“我想使用 WorkBuddy 制作 PPT。”</p>
                <p>“怎么设置每天自动生成日报？”</p>
              </div>
            </article>
            <article className={`${cardClass} relative overflow-hidden`}>
              <Store className="size-7 text-blue-600" />
              <h3 className="mt-5 text-xl font-semibold">
                小红书开店与运营助手
              </h3>
              <p className="mt-3 leading-7 text-slate-600">
                覆盖小红书开店准备、店铺设置、商品、物流、发货、运营规则和官方教程。
              </p>
              <div className="mt-6 space-y-2 border-t border-slate-200 pt-5 text-sm text-slate-600">
                <p>“我刚开小红书店，下一步做什么？”</p>
                <p>“小红书店铺怎么设置发货？”</p>
                <p>“店铺类型如何变更？”</p>
              </div>
            </article>
            <article className={`${cardClass} relative overflow-hidden`}>
              <PenTool className="size-7 text-blue-600" />
              <div className="mt-5 flex items-start justify-between gap-3">
                <h3 className="text-xl font-semibold">独立工作者能力库</h3>
                <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                  持续更新中
                </span>
              </div>
              <p className="mt-3 leading-7 text-slate-600">
                持续加入内容创作、AI
                工具、自动化、网站建设、视频制作和个人工作流。
              </p>
              <div className="mt-6 grid grid-cols-3 gap-2 border-t border-slate-200 pt-5 text-blue-600">
                <div className="rounded-xl bg-white p-3">
                  <FileText className="size-5" />
                </div>
                <div className="rounded-xl bg-white p-3">
                  <Video className="size-5" />
                </div>
                <div className="rounded-xl bg-white p-3">
                  <Globe className="size-5" />
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white px-4 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <SectionEyebrow>差异化</SectionEyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">
              文章及服务的理念
            </h2>
          </div>
          <div className="mt-12 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.3)]">
            <div className="grid md:grid-cols-2">
              <div className="border-b border-slate-200 bg-slate-50 p-7 md:border-b-0 md:border-r">
                <p className="text-sm font-medium text-slate-500">普通知识库</p>
                <h3 className="mt-3 text-2xl font-semibold">返回一段答案</h3>
                <p className="mt-4 max-w-sm leading-7 text-slate-600">
                  用户必须知道该问什么，得到答案后，还要自己判断、查找和完成操作。
                </p>
              </div>
              <div className="bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,.13),transparent_45%)] p-7">
                <p className="text-sm font-medium text-blue-700">OneWorkOS</p>
                <h3 className="mt-3 text-2xl font-semibold">
                  理解目标，连接到行动
                </h3>
                <ul className="mt-5 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  {[
                    '理解用户目标和当前阶段',
                    '检索经过治理的知识',
                    '返回文字、图片、视频和出处',
                    '判断下一步需要什么能力',
                    '结构化文章内容，AI行动指南',
                    '随云端知识更新持续成长',
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <Check className="size-4 shrink-0 text-blue-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <SectionEyebrow>产品理念</SectionEyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">
              独立工作者的数智资产
            </h2>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              每天学习的知识、验证过的方法、完成过的案例，都不应该随着时间被遗忘。
            </p>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              OneWorkOS
              将这些内容沉淀成可检索、可调用、可执行的知识资产，也是你可沉淀的知识库。
            </p>
          </div>
          <div className="grid gap-4 rounded-[2rem] border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2 sm:p-7">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <FileImage className="size-6 text-blue-600" />
              <p className="mt-6 font-semibold">学习与资料</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                教程、图片、视频、案例，不再散落在不同工具里。
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <ShieldCheck className="size-6 text-blue-600" />
              <p className="mt-6 font-semibold">验证过的方法</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                把实践经验沉淀为下一次可直接调用的工作能力。
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Bot className="size-6 text-blue-600" />
              <p className="mt-6 font-semibold">AI 与 Skill</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                让知识不只被阅读，也能在合适的时候被执行。
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <LockKeyhole className="size-6 text-blue-600" />
              <p className="mt-6 font-semibold">你的长期资产</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                随着使用和更新不断成长，始终属于你的工作系统。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="membership" className="px-4 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-blue-200 bg-blue-600 p-1 shadow-[0_24px_70px_-34px_rgba(37,99,235,.7)]">
          <div className="rounded-[1.8rem] bg-white px-6 py-12 sm:px-12 sm:py-14">
            <div className="grid items-center gap-10 lg:grid-cols-[1fr_.8fr]">
              <div>
                <SectionEyebrow>OneWorkOS 会员</SectionEyebrow>
                <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">
                  安装一次，持续获得全部知识能力
                </h2>
                <ul className="mt-7 grid gap-3 text-slate-700 sm:grid-cols-2">
                  {[
                    '使用全部 OneWorkOS 知识库',
                    '每月 1000 次知识检索',
                    'WorkBuddy 与小红书知识能力',
                    '官方图片、资料出处和视频入口',
                    '云端知识持续更新',
                    '新增知识包自动开放',
                  ].map((item) => (
                    <li key={item} className="flex gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-blue-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl bg-blue-600 p-7 text-white shadow-lg shadow-blue-200">
                <p className="text-sm text-blue-100">OneWorkOS 会员</p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-5xl font-semibold">¥19.9</span>
                  <span className="pb-1 text-lg text-blue-100">/ 月</span>
                </div>
                <Button
                  asChild
                  size="lg"
                  className="mt-7 h-12 w-full rounded-xl bg-white text-blue-700 hover:bg-slate-100"
                >
                  <LocaleLink href="/pricing">
                    立即开通 OneWorkOS <ArrowRight className="size-4" />
                  </LocaleLink>
                </Button>
                <p className="mt-4 text-xs leading-5 text-blue-100">
                  权益属于账号。更换电脑后，重新安装插件并登录网页授权即可。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
