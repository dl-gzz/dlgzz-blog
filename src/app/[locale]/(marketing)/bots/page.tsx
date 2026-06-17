import { BotLauncher } from '@/components/bots/bot-launcher';
import { LocaleLink } from '@/i18n/navigation';
import { constructMetadata } from '@/lib/metadata';
import { getSession } from '@/lib/server';
import { listWorkerCatalog } from '@/lib/workers';
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  ClipboardCheck,
  QrCode,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';

export async function generateMetadata(): Promise<Metadata> {
  return constructMetadata({
    title: '独立陪伴者',
    description: '一个长期陪伴者，按需学习技能模块，提供微信陪伴、知识库和工具服务。',
    canonicalUrl: '/bots',
  });
}

const workflowSteps = [
  {
    title: '你维护底层能力',
    description: '只维护陪伴者灵魂、技能模块、知识库和 SOP。',
    icon: BrainCircuit,
  },
  {
    title: '平台同步模块',
    description: '管理员确认模块资料完整后，再设为开放测试可用。',
    icon: ClipboardCheck,
  },
  {
    title: '用户启用陪伴者',
    description: '用户登录后启用一个长期陪伴者，系统保存独立实例状态。',
    icon: Bot,
  },
  {
    title: '微信扫码使用',
    description: '每个实例独立 Hermes Profile，记忆、微信绑定和运行状态互不串。',
    icon: QrCode,
  },
];

export default async function BotsPage() {
  const session = await getSession();
  const employees = await safeListWorkerCatalog();

  return (
    <div className="bg-[#f8f7f2] text-slate-950 dark:bg-neutral-950 dark:text-white">
      <section className="overflow-hidden border-b border-slate-200 pt-24 dark:border-white/10 lg:pt-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-14 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:px-10 lg:pb-20">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-300 bg-white/80 px-3 py-1 text-xs font-semibold uppercase text-slate-600 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5 dark:text-white/62">
              <Smartphone className="size-3.5" />
              只做一件事：维护陪伴者能力
            </div>
            <h1 className="mt-7 max-w-4xl text-balance text-4xl font-black leading-[1.08] tracking-normal text-slate-950 sm:text-5xl lg:text-6xl dark:text-white">
              一个独立陪伴者，下面添加不同技能
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg dark:text-white/64">
              用户不用理解复杂后台，也不用反复扫码换身份。网站只给他一个长期陪伴者；你在后台持续补技能、沉淀 SOP、完善知识库。
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="#create"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-white/90"
              >
                查看陪伴者技能
                <ArrowRight className="size-4" />
              </a>
              <LocaleLink
                href="/admin/bots"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white/70 px-5 text-sm font-semibold text-slate-800 shadow-sm shadow-slate-950/5 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                管理后台
              </LocaleLink>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {[
                ['底层来源', 'one-worker-os'],
                ['技能模块', `${employees.length} 个`],
                ['核心动作', '维护能力'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-slate-200 bg-white/70 p-4 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="text-2xl font-black text-slate-950 dark:text-white">
                    {value}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-white/72">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="relative overflow-hidden rounded-lg border border-slate-300 bg-white p-3 shadow-xl shadow-slate-950/10 dark:border-white/10 dark:bg-white/5 dark:shadow-black/30">
              <Image
                src="/images/blog/digital-employees/digital-employee-d01-cover.png"
                alt="独立陪伴者工作流示意"
                width={1344}
                height={768}
                priority
                className="aspect-[16/9] rounded-md object-cover"
              />
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-2 text-sm font-bold">
                <ShieldCheck className="size-4 text-emerald-600" />
                平台边界
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-white/62">
                平台不生成灵魂、不随意改写能力模块，只复制你确认过的版本快照。你保持陪伴者越来越能解决问题，其他流程自动化。
              </p>
            </div>
          </div>
        </div>
      </section>

      <BotLauncher
        initialIsLoggedIn={Boolean(session?.user?.id)}
        initialEmployees={employees}
      />

      <section className="border-b border-slate-200 bg-[#f8f7f2] py-16 dark:border-white/10 dark:bg-neutral-950">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="max-w-3xl">
            <div className="inline-flex border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200">
              工作闭环
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-normal sm:text-4xl">
              把平台工作收敛成一条后台流水线
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-600 dark:text-white/64">
              你只做能力建设。同步、登录权限、激活、实例隔离、技能开关和状态监控交给系统。
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {workflowSteps.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white">
                      <StepIcon className="size-5" />
                    </div>
                    <span className="text-xs font-black text-slate-400">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-white/60">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

async function safeListWorkerCatalog() {
  try {
    return await listWorkerCatalog();
  } catch {
    return [];
  }
}
