'use client';

import { MembershipAdminPanel } from '@/components/membership/membership-admin-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocaleLink } from '@/i18n/navigation';
import type {
  AdminMembershipOverview,
  MembershipCodeState,
} from '@/lib/admin-membership-overview';
import { Routes } from '@/routes';
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';

const states: Record<MembershipCodeState, string> = {
  pending: '待兑换',
  redeemed: '已兑换',
  expired: '已过期',
  revoked: '已停用',
};
const sources: Record<string, string> = {
  planet: '知识星球',
  website: '网站',
  admin: '管理员赠送',
  activation: '兑换码',
};
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  dateStyle: 'medium',
  timeStyle: 'short',
});
function date(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : '—';
}

export function AdminMembershipWorkspace({
  overview,
}: { overview: AdminMembershipOverview | null }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const id = useId();
  const refresh = () => startRefresh(() => router.refresh());
  const query = search.trim().toLowerCase();
  const rows = (overview?.codes ?? []).filter(
    (code) =>
      (status === 'all' || code.state === status) &&
      (!query ||
        [
          code.label,
          code.codePrefix,
          code.redeemedName,
          code.redeemedEmail,
        ].some((value) => value?.toLowerCase().includes(query)))
  );
  const metrics = [
    {
      title: '注册用户',
      value: overview?.stats.users,
      description: '网站注册账号总数',
      icon: UsersRoundIcon,
    },
    {
      title: '有效统一会员',
      value: overview?.stats.activeMembers,
      description: '网站、小程序共用权益',
      icon: ShieldCheckIcon,
    },
    {
      title: '待兑换会员码',
      value: overview?.stats.pendingCodes,
      description: '未使用且未过期的码',
      icon: KeyRoundIcon,
    },
    {
      title: '已关联小程序',
      value: overview?.stats.linkedUsers,
      description: '完成微信关联的网站账号',
      icon: SmartphoneIcon,
    },
  ];

  return (
    <div className="space-y-6">
      <section
        aria-label="会员运营概览"
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        {metrics.map((item) => (
          <div
            key={item.title}
            className="rounded-xl border bg-card p-4 sm:p-5"
          >
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>{item.title}</span>
              <item.icon className="size-4 shrink-0" />
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
              {item.value ?? '—'}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {item.description}
            </p>
          </div>
        ))}
      </section>
      {!overview ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200"
        >
          暂时无法读取运营数据，没有把异常显示成
          0。你可以稍后点击下方“刷新记录”重试。
        </div>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section id="issue-code" className="min-w-0 scroll-mt-20">
          <MembershipAdminPanel embedded onIssued={refresh} />
        </section>
        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">日常操作，按这三步来</h2>
            <ol className="mt-4 space-y-4">
              {[
                [
                  '确认星球付款',
                  '先在知识星球核对用户付款，再来发码；这里不会自动核验星球订单。',
                ],
                [
                  '生成并发给用户',
                  '填写昵称或订单备注，选择时长，复制会员码或完整使用说明。',
                ],
                [
                  '查看是否兑换',
                  '用户关联账号、兑换一次后，两端共享会员；下方记录可查领取情况。',
                ],
              ].map(([title, detail], index) => (
                <li key={title} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-2 font-semibold">其他常用入口</h2>
            {[
              {
                href: Routes.AdminUsers,
                title: '用户管理',
                detail: '查找账号、核对邮箱与账号状态',
                icon: UsersRoundIcon,
              },
              {
                href: Routes.Blog,
                title: '查看公开文章',
                detail: '检查网站已发布内容，不是文章编辑器',
                icon: BookOpenIcon,
              },
              {
                href: Routes.SettingsOneWork,
                title: '我自己的会员与连接',
                detail: '个人权益，与给其他用户发码分开',
                icon: SmartphoneIcon,
              },
            ].map((link) => (
              <LocaleLink
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <link.icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{link.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {link.detail}
                  </p>
                </div>
                <ArrowUpRightIcon className="size-4 text-muted-foreground" />
              </LocaleLink>
            ))}
          </section>
        </aside>
      </div>
      <section
        id="code-records"
        className="scroll-mt-20 overflow-hidden rounded-xl border bg-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
          <div>
            <h2 className="text-lg font-semibold">最近发码记录</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              展示最近 30
              条统一会员码；仅保存前缀，无法找回完整码。时间为北京时间。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={refreshing}
            onClick={refresh}
          >
            <RefreshCwIcon className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? '刷新中…' : '刷新记录'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 px-5 py-4">
          <label htmlFor={id + '-search'} className="sr-only">
            在最近记录中搜索昵称、邮箱或码前缀
          </label>
          <Input
            id={id + '-search'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="在最近 30 条中搜索昵称、邮箱、码前缀"
            className="min-w-0 flex-1 sm:min-w-64"
          />
          <label htmlFor={id + '-status'} className="sr-only">
            兑换状态
          </label>
          <select
            id={id + '-status'}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">全部状态</option>
            {Object.entries(states).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">统一会员兑换码最近记录</caption>
            <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
              <tr>
                {[
                  '发给谁 / 码前缀',
                  '来源',
                  '会员时长',
                  '状态',
                  '兑换账号',
                  '生成 / 兑换时间',
                ].map((title) => (
                  <th key={title} scope="col" className="px-5 py-3 font-medium">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((code) => (
                <tr key={code.id} className="border-b last:border-0">
                  <td className="max-w-60 px-5 py-4">
                    <p className="break-words font-medium">
                      {code.label || '未填写备注'}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {code.codePrefix}…
                    </p>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {sources[code.source] || code.source}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {code.durationDays === null
                      ? '永久'
                      : code.durationDays + ' 天'}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={
                        'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs ' +
                        (code.state === 'redeemed'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : code.state === 'pending'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-muted text-muted-foreground')
                      }
                    >
                      {states[code.state]}
                    </span>
                  </td>
                  <td className="max-w-64 break-all px-5 py-4">
                    <p>
                      {code.redeemedName ||
                        (code.state === 'redeemed'
                          ? '账号已删除或不可用'
                          : '尚未兑换')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {code.redeemedEmail}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-muted-foreground">
                    <p>生成 {date(code.createdAt)}</p>
                    <p className="mt-1">兑换 {date(code.redeemedAt)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {!overview
              ? '记录读取失败，请刷新重试。'
              : overview.codes.length
                ? '当前筛选没有匹配记录。'
                : '还没有签发过会员码，先在上方为第一位用户发码。'}
          </p>
        ) : null}
        {overview ? (
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            最近更新：{date(overview.checkedAt)} · 统计不包含独立的 OneWorkOS
            额度码。
          </p>
        ) : null}
      </section>
    </div>
  );
}
