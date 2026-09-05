'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export function MembershipAdminPanel({
  embedded = false,
  onIssued,
}: {
  embedded?: boolean;
  onIssued?: () => void;
}) {
  const id = useId();
  const inFlight = useRef(false);
  const [label, setLabel] = useState('');
  const [source, setSource] = useState('planet');
  const [duration, setDuration] = useState('365');
  const [customDays, setCustomDays] = useState('365');
  const [issued, setIssued] = useState<{
    code: string;
    days: number | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!issued || copied) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [issued, copied]);

  async function issue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || issued) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const days =
        duration === 'permanent'
          ? null
          : Number(duration === 'custom' ? customDays : duration);
      if (
        days !== null &&
        (!Number.isInteger(days) || days < 1 || days > 3650)
      ) {
        throw new Error('有效天数必须是 1 到 3650 之间的整数。');
      }
      const response = await fetch('/api/membership/activation/issue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          source,
          durationDays: days,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success)
        throw new Error(data.error || '签发失败');
      setIssued({ code: data.code, days: data.durationDays });
      setCopied(false);
      setMessage('已生成。请先复制保存，再离开页面或给下一位发码。');
      onIssued?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '签发失败');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function copy(delivery: boolean) {
    if (!issued) return;
    const text = delivery
      ? [
          '你的星球会员兑换码：' + issued.code,
          '会员时长：' +
            (issued.days === null ? '永久' : issued.days + ' 天') +
            '，从兑换时起计算；续期会累加剩余时间。',
          '1. 打开 ' +
            window.location.origin +
            '/auth/register 注册网站账号（已有账号直接登录）。',
          '2. 在网站「设置 → 会员与 OneWorkOS 连接」兑换；也可以在小程序「我的」登录微信、关联网站账号后兑换。',
          '同一个码只兑换一次，网站和小程序共享会员身份。所有文章公开阅读。',
        ].join('\n')
      : issued.code;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setMessage(
        delivery
          ? '发给用户的话术已复制，可以粘贴到微信或星球私信。'
          : '会员码已复制，请妥善保存并发给对应用户。'
      );
    } catch {
      setError('自动复制失败，请选中下方会员码手动复制。');
    }
  }

  return (
    <Card
      className={
        embedded
          ? 'h-full border-primary/20 shadow-none'
          : 'mx-4 max-w-3xl lg:mx-6'
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <KeyRoundIcon className="size-5 text-primary" />
          给星球会员发码
        </CardTitle>
        <CardDescription>
          确认星球已付款后，为这位用户生成一个 MEM
          会员码。网站、小程序共用，无需两边分别发码。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={issue} className="space-y-4">
          <fieldset
            disabled={busy || Boolean(issued)}
            className="grid gap-4 disabled:opacity-60 sm:grid-cols-2"
          >
            <div className="space-y-2 sm:col-span-2">
              <label htmlFor={id + '-label'} className="text-sm font-medium">
                发给谁 / 订单备注{' '}
                <span className="font-normal text-muted-foreground">
                  （可选）
                </span>
              </label>
              <Input
                id={id + '-label'}
                maxLength={200}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例如：星球昵称 + 订单尾号，便于之后查找"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor={id + '-duration'} className="text-sm font-medium">
                会员时长
              </label>
              <select
                id={id + '-duration'}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="365">一年 · 365 天</option>
                <option value="90">三个月 · 90 天</option>
                <option value="30">一个月 · 30 天</option>
                <option value="permanent">永久会员</option>
                <option value="custom">自定义天数</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor={id + '-source'} className="text-sm font-medium">
                发码来源
              </label>
              <select
                id={id + '-source'}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="planet">知识星球已付费</option>
                <option value="admin">管理员赠送</option>
                <option value="website">网站订单</option>
              </select>
            </div>
            {duration === 'custom' ? (
              <div className="space-y-2 sm:col-span-2">
                <label htmlFor={id + '-days'} className="text-sm font-medium">
                  自定义有效天数
                </label>
                <Input
                  id={id + '-days'}
                  type="number"
                  min="1"
                  max="3650"
                  step="1"
                  required
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                />
              </div>
            ) : null}
          </fieldset>
          <p className="text-xs leading-5 text-muted-foreground">
            这里设置的是兑换后获得的会员时长，不是码的领取截止日期。每个码只使用一次，续期自动累加。
          </p>
          {!issued ? (
            <Button type="submit" disabled={busy} className="w-full sm:w-auto">
              {busy ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <KeyRoundIcon />
              )}
              {busy ? '正在生成…' : '生成会员码'}
            </Button>
          ) : null}
        </form>
        {issued ? (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckIcon className="size-4 text-emerald-600" />
              生成成功 ·{' '}
              {issued.days === null ? '永久会员' : issued.days + ' 天会员'}
            </p>
            <code className="block select-all break-all rounded-md border bg-background p-3 font-mono text-base font-semibold">
              {issued.code}
            </code>
            <p className="text-xs text-muted-foreground">
              完整码仅此时显示；下方记录只保留前缀，不能找回完整码。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void copy(true)}>
                <CopyIcon />
                复制发给用户的话术
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copy(false)}
              >
                仅复制会员码
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!copied}
                onClick={() => {
                  setIssued(null);
                  setLabel('');
                  setCopied(false);
                  setError('');
                  setMessage('');
                }}
              >
                已保存，给下一位发码
              </Button>
            </div>
            {!copied ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  onChange={(e) => setCopied(e.target.checked)}
                />
                我已手动复制并保存完整码
              </label>
            ) : null}
          </div>
        ) : null}
        {message ? (
          <p
            role="status"
            className="text-sm text-emerald-700 dark:text-emerald-400"
          >
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
