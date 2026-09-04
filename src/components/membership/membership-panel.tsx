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
import { authClient } from '@/lib/auth-client';
import {
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  RefreshCwIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type MembershipStatus = {
  isMember: boolean;
  level: string | null;
  source: string | null;
  startsAt: string | null;
  expiresAt: string | null;
};

function formatDate(value: string | null) {
  if (!value) return '长期有效';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

export function MembershipPanel() {
  const { data: session, isPending } = authClient.useSession();
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [code, setCode] = useState('');
  const [bindCode, setBindCode] = useState('');
  const [bindExpiresAt, setBindExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bindBusy, setBindBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const response = await fetch('/api/membership/me', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success)
        throw new Error(data.error || '读取会员状态失败');
      setStatus(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取会员状态失败');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function redeem() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/membership/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success)
        throw new Error(data.error || '兑换失败');
      setStatus(data);
      setCode('');
      setMessage('会员已开通，网站和小程序现在共享这份权益。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '兑换失败');
    } finally {
      setBusy(false);
    }
  }

  async function createBindCode() {
    setBindBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/mp/bind/code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success)
        throw new Error(data.error || '生成绑定码失败');
      setBindCode(data.code);
      setBindExpiresAt(data.expiresAt);
      setMessage('请在小程序“我的”页面登录后，输入这个绑定码。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成绑定码失败');
    } finally {
      setBindBusy(false);
    }
  }

  async function copyBindCode() {
    if (!bindCode) return;
    try {
      await navigator.clipboard?.writeText(bindCode);
      setMessage('绑定码已复制。');
    } catch {
      setMessage('请手动复制绑定码。');
    }
  }

  if (isPending) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>统一会员</CardTitle>
        <CardDescription>
          星球成交后由管理员发码；兑换一次，网站和微信小程序都使用同一份会员权益。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">当前状态</span>
            <span
              className={
                status?.isMember
                  ? 'font-semibold text-emerald-600'
                  : 'font-semibold'
              }
            >
              {loading ? '读取中…' : status?.isMember ? '会员有效' : '普通用户'}
            </span>
          </div>
          {status?.isMember && (
            <p className="mt-2 text-sm text-muted-foreground">
              有效期至：{formatDate(status.expiresAt)}
              {status.source ? ` · 来源：${status.source}` : ''}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <KeyRoundIcon className="size-4" />
            输入会员兑换码
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="例如：MEM-XXXXXX"
              autoComplete="off"
            />
            <Button
              onClick={() => void redeem()}
              disabled={busy || !code.trim()}
            >
              {busy && <Loader2Icon className="animate-spin" />}
              {busy ? '兑换中…' : '立即兑换'}
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <RefreshCwIcon className="size-4" />
            绑定微信小程序
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            先在小程序点击登录，再生成绑定码并输入到小程序；绑定后同一个微信即可读取你的会员权益。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void createBindCode()}
              disabled={bindBusy}
            >
              {bindBusy && <Loader2Icon className="animate-spin" />}
              {bindBusy ? '生成中…' : '生成小程序绑定码'}
            </Button>
            {bindCode && (
              <Button variant="secondary" onClick={() => void copyBindCode()}>
                <CopyIcon />
                复制绑定码
              </Button>
            )}
          </div>
          {bindCode && (
            <div className="rounded-lg bg-muted p-3">
              <code className="text-lg font-semibold tracking-[0.25em]">
                {bindCode}
              </code>
              <p className="mt-1 text-xs text-muted-foreground">
                有效至：{formatDate(bindExpiresAt)}（约 10 分钟）
              </p>
            </div>
          )}
        </div>

        {message && <p className="text-sm text-emerald-600">{message}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
