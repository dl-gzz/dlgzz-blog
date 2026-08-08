'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';
import { useState } from 'react';

export function OneWorkAdminPanel() {
  const [label, setLabel] = useState('');
  const [source, setSource] = useState('xhs');
  const [trialDays, setTrialDays] = useState('30');
  const [monthlyQuota, setMonthlyQuota] = useState('1000');
  const [maxRedemptions, setMaxRedemptions] = useState('1');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function issue() {
    setBusy(true);
    setCode('');
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/onework/activation/issue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          packIds: [ALL_PACKS_GRANT],
          label,
          source,
          trialDays: Number(trialDays),
          monthlyQuota: Number(monthlyQuota),
          maxRedemptions: Number(maxRedemptions),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || '签发失败');
      setCode(data.code);
      setMessage('兑换码已生成。请复制给对应购买用户；关闭页面后不会再次显示。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '签发失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-4 max-w-3xl lg:mx-6">
      <CardHeader>
        <CardTitle>签发 OneWorkOS 兑换码</CardTitle>
        <CardDescription>每笔小红书/抖音成交可以生成一枚一次性兑换码。支付回调接入后，这一步可自动化。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
          这枚兑换码默认开通全部 OneWorkOS 知识库。以后新增知识包会自动包含，不需要重新生成兑换码或重新安装 Skill。
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="订单备注（可选）" />
          <Input value={source} onChange={(event) => setSource(event.target.value)} placeholder="来源：xhs / douyin" />
          <Input type="number" min="0" value={trialDays} onChange={(event) => setTrialDays(event.target.value)} placeholder="有效天数" />
          <Input type="number" min="0" value={monthlyQuota} onChange={(event) => setMonthlyQuota(event.target.value)} placeholder="每月检索次数" />
          <Input type="number" min="1" value={maxRedemptions} onChange={(event) => setMaxRedemptions(event.target.value)} placeholder="最大兑换次数" />
        </div>
        <Button onClick={() => void issue()} disabled={busy}>
          {busy ? '签发中…' : '生成兑换码'}
        </Button>
        {code && <code className="block break-all rounded-lg border bg-muted p-4 text-lg font-semibold">{code}</code>}
        {message && <p className="text-sm text-emerald-600">{message}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
