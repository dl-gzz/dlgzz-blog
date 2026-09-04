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
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';

export function MembershipAdminPanel() {
  const [label, setLabel] = useState('');
  const [source, setSource] = useState('planet');
  const [durationDays, setDurationDays] = useState('365');
  const [permanent, setPermanent] = useState(false);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function issue() {
    setBusy(true);
    setCode('');
    setMessage('');
    setError('');
    try {
      const parsedDuration = Number(durationDays);
      if (
        !permanent &&
        (!Number.isInteger(parsedDuration) ||
          parsedDuration < 1 ||
          parsedDuration > 3650)
      ) {
        throw new Error('有效天数必须是 1 到 3650 之间的整数。');
      }
      const response = await fetch('/api/membership/activation/issue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label,
          source,
          durationDays: permanent ? null : parsedDuration,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success)
        throw new Error(data.error || '签发失败');
      setCode(data.code);
      setMessage('会员兑换码已生成，只在本次页面显示；请复制后发给对应用户。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '签发失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-4 max-w-3xl lg:mx-6">
      <CardHeader>
        <CardTitle>签发统一会员兑换码</CardTitle>
        <CardDescription>
          星球成交后，在这里为用户生成一次性兑换码；用户在网站兑换后，网站和小程序共享会员权限。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="星球昵称 / 订单备注（可选）"
          />
          <Input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="来源，例如 planet"
          />
          <Input
            type="number"
            min="1"
            max="3650"
            step="1"
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
            disabled={permanent}
            placeholder="会员有效天数"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={permanent}
              onChange={(event) => setPermanent(event.target.checked)}
            />
            永久有效
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          每个兑换码只能使用一次。建议把星球昵称或订单号写进备注，方便后续核对和人工撤销。
        </p>
        <Button onClick={() => void issue()} disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {busy ? '签发中…' : '生成会员兑换码'}
        </Button>
        {code && (
          <code className="block break-all rounded-lg border bg-muted p-4 text-lg font-semibold">
            {code}
          </code>
        )}
        {message && <p className="text-sm text-emerald-600">{message}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
