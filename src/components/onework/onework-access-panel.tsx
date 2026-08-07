'use client';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';
import { Routes } from '@/routes';
import { ExternalLinkIcon, KeyRoundIcon, MonitorDownIcon, RefreshCwIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type AccessData = {
  entitlements: Array<{
    knowledgePackId: string;
    status: string;
    monthlyQuota: number;
    expiresAt: string | null;
  }>;
  devices: Array<{
    id: string;
    deviceName: string;
    platform: string;
    status: string;
    lastSeenAt: string | null;
    createdAt: string;
  }>;
  keys: Array<{
    id: string;
    keyPrefix: string;
    status: string;
    monthlyQuota: number;
    lastUsedAt: string | null;
    createdAt: string;
  }>;
};

function formatDate(value: string | null | undefined) {
  if (!value) return '不过期';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value));
}

function packName(packId: string) {
  if (packId === ALL_PACKS_GRANT) return '全部 OneWorkOS 知识库';
  if (packId === 'onework-workbuddy-v1') return 'WorkBuddy 办公助手';
  if (packId === 'xhs-open-shop-v1') return '小红书开店助手';
  if (packId === 'xhs-operations-v1') return '小红书运营助手';
  return packId;
}

export function OneWorkAccessPanel({ showRedeem = true }: { showRedeem?: boolean }) {
  const { data: session, isPending } = authClient.useSession();
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [platform, setPlatform] = useState('macOS');
  const [access, setAccess] = useState<AccessData | null>(null);
  const [rawKey, setRawKey] = useState('');
  const [installToken, setInstallToken] = useState('');
  const [installExpiresAt, setInstallExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadAccess() {
    if (!session?.user?.id) return;
    const response = await fetch('/api/onework/entitlements', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.success) setAccess(data);
  }

  useEffect(() => {
    void loadAccess();
  }, [session?.user?.id]);

  async function redeem() {
    setBusy(true);
    setError('');
    setMessage('');
    setRawKey('');
    try {
      const response = await fetch('/api/onework/activation/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, deviceName, platform }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || '兑换失败');
      setRawKey(data.key.rawKey);
      setMessage(`兑换成功，已开通：${data.packs.map(packName).join('、')}`);
      setCode('');
      await loadAccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '兑换失败');
    } finally {
      setBusy(false);
    }
  }

  async function createInstallSession() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/onework/install/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceName, platform }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || '生成安装授权失败');
      setInstallToken(data.token);
      setInstallExpiresAt(data.expiresAt);
      setMessage('安装授权已生成，10 分钟内使用一次即可。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成安装授权失败');
    } finally {
      setBusy(false);
    }
  }

  if (isPending) {
    return <div className="py-12 text-center text-muted-foreground">正在检查登录状态…</div>;
  }

  if (!session?.user?.id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>先登录 OneWorkOS</CardTitle>
          <CardDescription>兑换码会绑定到你的账号，换电脑时仍可以重新生成设备授权。</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`${Routes.Login}?callbackURL=${Routes.OneWork}`}>登录 / 注册</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {showRedeem && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRoundIcon className="size-5" />兑换 OneWorkOS</CardTitle>
            <CardDescription>输入购买后收到的兑换码。兑换成功后，网站会为当前设备签发专属 Key。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="例如 OWOS-XXXX-XXXX"
              autoComplete="off"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="设备名称（可选）" />
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="macOS">macOS</option>
                <option value="Windows">Windows</option>
                <option value="Linux">Linux</option>
                <option value="other">其他</option>
              </select>
            </div>
            <Button onClick={() => void redeem()} disabled={busy || !code.trim()}>
              {busy ? '处理中…' : '兑换并生成 Key'}
            </Button>
            {rawKey && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="font-medium">请立即复制这把 Key（只显示一次）</p>
                <code className="mt-2 block break-all rounded bg-black/10 p-2">{rawKey}</code>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MonitorDownIcon className="size-5" />换电脑 / 安装授权</CardTitle>
          <CardDescription>权益属于账号，不属于某台电脑。新设备打开 WorkBuddy 前，生成一次性安装授权即可。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={() => void createInstallSession()} disabled={busy}>
            <RefreshCwIcon className="size-4" />生成安装授权
          </Button>
          {installToken && (
            <div className="space-y-2 rounded-lg border p-4 text-sm">
              <p>有效期至：{formatDate(installExpiresAt)}</p>
              <code className="block break-all rounded bg-muted p-2">{installToken}</code>
              <p className="text-muted-foreground">安装器使用这个短时授权领取 Key；它本身不是长期密钥，使用一次后失效。</p>
            </div>
          )}
        </CardContent>
      </Card>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>我的 OneWorkOS 权益</CardTitle>
          <CardDescription>检索额度仍按现有 API Key 统计；这里展示的是账号授权状态。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!access?.entitlements?.length ? (
            <p className="text-sm text-muted-foreground">暂无已激活知识包。</p>
          ) : (
            access.entitlements.map((item) => (
              <div key={item.knowledgePackId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="font-medium">{packName(item.knowledgePackId)}</p>
                  <p className="text-xs text-muted-foreground">每月 {item.monthlyQuota} 次 · 到期：{formatDate(item.expiresAt)}</p>
                </div>
                <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>{item.status === 'active' ? '有效' : item.status}</Badge>
              </div>
            ))
          )}
          {access?.devices?.length ? (
            <div className="pt-3 text-sm text-muted-foreground">
              已绑定设备：{access.devices.filter((device) => device.status === 'active').length} 台
            </div>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        需要查看图片和官方出处时，Skill 仍会回到 OneWorkOS 受治理知识库检索，不会把兑换码当作知识内容。
        <Link className="ml-1 inline-flex items-center gap-1 text-primary underline" href="https://www.dlgzz.com" target="_blank">
          dlgzz.com <ExternalLinkIcon className="size-3" />
        </Link>
      </p>
    </div>
  );
}
