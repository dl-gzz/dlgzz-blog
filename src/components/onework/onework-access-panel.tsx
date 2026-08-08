'use client';

import { Badge } from '@/components/ui/badge';
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
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';
import { Routes } from '@/routes';
import { CopyIcon, DownloadIcon, ExternalLinkIcon, KeyRoundIcon, MonitorDownIcon, RefreshCwIcon } from 'lucide-react';
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
  const [installToken, setInstallToken] = useState('');
  const [installExpiresAt, setInstallExpiresAt] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState('');
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
    try {
      const response = await fetch('/api/onework/activation/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, deviceName, platform }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || '兑换失败');
      setMessage(`兑换成功，已开通：${data.packs.map(packName).join('、')}`);
      setCode('');
      await loadAccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '兑换失败');
    } finally {
      setBusy(false);
    }
  }

  async function fetchInstallSession() {
    const response = await fetch('/api/onework/install/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceName, platform }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || typeof data.token !== 'string') {
      throw new Error(data.error || '生成安装授权失败');
    }
    setInstallToken(data.token);
    setInstallExpiresAt(data.expiresAt || null);
    return { token: data.token as string, expiresAt: data.expiresAt as string | null };
  }

  async function createInstallSession() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fetchInstallSession();
      setMessage('安装授权已生成，10 分钟内使用一次即可。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成安装授权失败');
    } finally {
      setBusy(false);
    }
  }

  async function copyAiInstallPrompt() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { token } = await fetchInstallSession();
      const server = window.location.origin;
      const unixCommand = `curl -fsSL ${server}/downloads/onework-install.mjs | node - --server ${server} --token "${token}"`;
      const windowsCommand = `\$tmp = Join-Path \$env:TEMP 'onework-install.mjs'; Invoke-WebRequest -UseBasicParsing -Uri '${server}/downloads/onework-install.mjs' -OutFile \$tmp; node \$tmp --server '${server}' --token '${token}'`;
      const prompt = [
        '请直接在本机终端执行 OneWorkOS 安装，不要只解释步骤：',
        '1. 检查 Node.js 18+；',
        `2. 先判断操作系统：macOS/Linux 执行：${unixCommand}`,
        `   Windows PowerShell 执行：${windowsCommand}`,
        '3. 自动安装或更新 OneWorkOS Skill；',
        '4. 检查本机 WorkBuddy 的 Skill 目录和授权文件是否存在；',
        '5. 不要输出或回显长期 API Key；完成后提示我重启 WorkBuddy。',
      ].join('\n');
      setInstallPrompt(prompt);
      try {
        await navigator.clipboard.writeText(prompt);
        setMessage('AI 安装指令已复制，请粘贴到 WorkBuddy。');
      } catch {
        setMessage('AI 安装指令已生成，请展开下方内容并手动复制。');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成 AI 安装指令失败');
    } finally {
      setBusy(false);
    }
  }

  async function downloadInstaller() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { token } = await fetchInstallSession();
      const server = window.location.origin;
      const quote = (value: string) => value.replaceAll("'", "'\\''");
      const isWindows = platform === 'Windows';
      const filename = isWindows ? 'onework-install.cmd' : 'onework-install.command';
      const script = isWindows
        ? `@echo off\r\nsetlocal\r\nset \"SERVER=${quote(server)}\"\r\nset \"TOKEN=${quote(token)}\"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n  echo 未检测到 Node.js 18+，请先安装：https://nodejs.org/\r\n  start \"\" https://nodejs.org/\r\n  pause\r\n  exit /b 1\r\n)\r\nset \"INSTALLER=%TEMP%\\onework-install-%RANDOM%.mjs\"\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command \"Invoke-WebRequest -UseBasicParsing -Uri '%SERVER%/downloads/onework-install.mjs' -OutFile '%INSTALLER%'\"\r\nnode \"%INSTALLER%\" --server \"%SERVER%\" --token \"%TOKEN%\"\r\ndel /q \"%INSTALLER%\" >nul 2>nul\r\necho.\r\necho 安装完成，请重启 WorkBuddy。\r\npause\r\n`
        : `#!/bin/bash\nset -euo pipefail\nSERVER='${quote(server)}'\nTOKEN='${quote(token)}'\nif ! command -v node >/dev/null 2>&1; then\n  echo '未检测到 Node.js 18+，请先安装：https://nodejs.org/'\n  if command -v open >/dev/null 2>&1; then open 'https://nodejs.org/'; fi\n  read -r -p '按回车关闭'\n  exit 1\nfi\nINSTALLER=\"$(mktemp -t onework-install).mjs\"\ntrap 'rm -f \"$INSTALLER\"' EXIT\ncurl -fsSL \"$SERVER/downloads/onework-install.mjs\" -o \"$INSTALLER\"\nnode \"$INSTALLER\" --server \"$SERVER\" --token \"$TOKEN\"\necho ''\nread -r -p '安装完成，按回车关闭'\n`;

      const blob = new Blob([script], { type: 'text/plain;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);

      setMessage(`已下载 ${filename}。双击运行并允许系统授权即可自动安装。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '下载安装器失败');
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
            <CardDescription>输入购买后收到的兑换码。兑换只开通账号权益，设备 Key 会在安装时自动领取。</CardDescription>
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
              {busy ? '处理中…' : '兑换权益'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MonitorDownIcon className="size-5" />换电脑 / 安装授权</CardTitle>
          <CardDescription>权益属于账号，不属于某台电脑。新设备打开 WorkBuddy 前，生成一次性安装授权即可。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => void copyAiInstallPrompt()} disabled={busy}>
            <CopyIcon className="size-4" />复制 AI 安装指令
          </Button>
          <p className="text-xs text-muted-foreground">
            把这段指令粘贴到 WorkBuddy，由它调用本机终端自动完成安装。你只需允许终端权限并重启 WorkBuddy。
          </p>
          {installPrompt && (
            <details className="rounded-lg border p-4 text-sm">
              <summary className="cursor-pointer font-medium">查看 AI 安装指令</summary>
              <textarea className="mt-3 min-h-44 w-full rounded border bg-muted p-3 font-mono text-xs" value={installPrompt} readOnly />
            </details>
          )}
          <details className="rounded-lg border p-4 text-sm">
            <summary className="cursor-pointer font-medium">高级：下载备用安装器</summary>
            <div className="mt-3 space-y-2">
              <Button onClick={() => void downloadInstaller()} disabled={busy}>
                <DownloadIcon className="size-4" />下载 Mac / Windows 安装器
              </Button>
              <Button variant="outline" onClick={() => void createInstallSession()} disabled={busy}>
                <RefreshCwIcon className="size-4" />生成安装授权
              </Button>
              {installToken && (
                <>
                  <p>有效期至：{formatDate(installExpiresAt)}</p>
                  <code className="block break-all rounded bg-muted p-2">{installToken}</code>
                  <p className="text-muted-foreground">安装器使用这个短时授权领取 Key；它本身不是长期密钥，使用一次后失效。</p>
                </>
              )}
            </div>
          </details>
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
