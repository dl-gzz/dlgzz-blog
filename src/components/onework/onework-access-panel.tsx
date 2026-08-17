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
import {
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  MonitorDownIcon,
  PlugZapIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  Trash2Icon,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Entitlement = {
  knowledgePackId: string;
  status: string;
  monthlyQuota: number;
  expiresAt: string | null;
};

type OneWorkDevice = {
  id: string;
  deviceName: string;
  platform: string;
  status: string;
  lastSeenAt: string | null;
  createdAt: string;
};

type OneWorkOAuthConnection = {
  clientId: string;
  clientName: string;
  scopes: string[];
  grantedAt: string;
};

type AccessData = {
  entitlements: Entitlement[];
  devices: OneWorkDevice[];
  oauthConnections?: OneWorkOAuthConnection[];
  keys: Array<{
    id: string;
    keyPrefix: string;
    status: string;
    monthlyQuota: number;
    lastUsedAt: string | null;
    createdAt: string;
  }>;
  usage?: {
    usedThisMonth?: number;
    used?: number;
    limit?: number;
    monthlyQuota?: number;
    remaining?: number;
  };
};

function formatDate(value: string | null | undefined) {
  if (!value) return '不过期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '尚未使用';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function packName(packId: string) {
  if (packId === ALL_PACKS_GRANT) return '全部 OneWorkOS 知识库';
  if (packId === 'onework-workbuddy-v1') return 'WorkBuddy 办公助手';
  if (packId === 'xhs-open-shop-v1') return '小红书开店助手';
  if (packId === 'xhs-operations-v1') return '小红书运营助手';
  return packId;
}

function oauthScopeName(scope: string) {
  if (scope === 'onework:resolve') return '能力调度';
  if (scope === 'onework:knowledge') return '知识检索';
  if (scope === 'onework:analytics') return '数据分析';
  if (scope === 'onework:account') return '账号权益';
  return scope;
}

function detectPlatform() {
  const userAgent = navigator.userAgent;
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'other';
}

function normalizeDeviceName(value: string, platform: string) {
  const trimmed = value.trim().slice(0, 80);
  return trimmed || `${platform === 'other' ? '当前' : platform} 设备`;
}

function commandSafeDeviceName(value: string, platform: string) {
  return normalizeDeviceName(value, platform)
    .replace(/[^\w\u3400-\u9fff .()-]/g, '-')
    .slice(0, 80);
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function powershellQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function entitlementIsActive(item: Entitlement, now: number) {
  if (item.status !== 'active') return false;
  if (!item.expiresAt) return true;
  const expiresAt = new Date(item.expiresAt).getTime();
  return !Number.isNaN(expiresAt) && expiresAt > now;
}

function entitlementStatus(item: Entitlement, now: number) {
  if (item.status === 'active' && !entitlementIsActive(item, now))
    return '已过期';
  if (item.status === 'active') return '有效';
  if (item.status === 'revoked') return '已撤销';
  if (item.status === 'expired') return '已过期';
  return item.status;
}

export function OneWorkAccessPanel({
  showRedeem = true,
}: { showRedeem?: boolean }) {
  const { data: session, isPending } = authClient.useSession();
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [platform, setPlatform] = useState('macOS');
  const [isMobile, setIsMobile] = useState(false);
  const [access, setAccess] = useState<AccessData | null>(null);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [installToken, setInstallToken] = useState('');
  const [installExpiresAt, setInstallExpiresAt] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [revokingDeviceId, setRevokingDeviceId] = useState('');
  const [revokingClientId, setRevokingClientId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const activeEntitlements = useMemo(
    () =>
      access?.entitlements?.filter((item) => entitlementIsActive(item, now)) ??
      [],
    [access?.entitlements, now]
  );
  const hasValidEntitlement = activeEntitlements.length > 0;

  const usageLimit =
    access?.usage?.limit ??
    access?.usage?.monthlyQuota ??
    (activeEntitlements.length
      ? Math.max(...activeEntitlements.map((item) => item.monthlyQuota))
      : null);
  const usageUsed = access?.usage?.usedThisMonth ?? access?.usage?.used ?? null;
  const usageRemaining =
    access?.usage?.remaining ??
    (usageUsed !== null && usageLimit !== null
      ? Math.max(0, usageLimit - usageUsed)
      : null);

  const installSecondsRemaining = installExpiresAt
    ? Math.max(
        0,
        Math.ceil((new Date(installExpiresAt).getTime() - now) / 1000)
      )
    : 0;

  const loadAccess = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoadingAccess(true);
    try {
      const response = await fetch('/api/onework/entitlements', {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || '读取 OneWorkOS 权益失败');
      }
      setAccess(data as AccessData);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '读取 OneWorkOS 权益失败'
      );
    } finally {
      setLoadingAccess(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    const detectedPlatform = detectPlatform();
    setPlatform(detectedPlatform);
    setIsMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  useEffect(() => {
    if (!installExpiresAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [installExpiresAt]);

  async function redeem() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/onework/activation/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success)
        throw new Error(data.error || '兑换失败');
      setMessage(`兑换成功，已开通：${data.packs.map(packName).join('、')}`);
      setCode('');
      await loadAccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '兑换失败');
    } finally {
      setBusy(false);
    }
  }

  async function copyPluginInstallPrompt() {
    const prompt = [
      '请直接帮我把 OneWorkOS 安装到当前 WorkBuddy，不要只解释步骤：',
      '1. 添加插件市场：dl-gzz/dlgzz-blog',
      '2. 安装插件：one-work-os@onework-os-marketplace',
      '3. 重新加载插件：/reload-plugins',
      '4. 连接 https://www.dlgzz.com/mcp，打开网页授权；不要让我复制或输入 API Key。',
      '5. 我在网页点击「允许连接」后，调用 onework_get_usage 验收。',
      '如果当前版本不允许你代为执行插件命令，请直接打开「插件」页面，并只告诉我下一个必须点击的位置。',
    ].join('\n');
    setError('');
    setMessage('');
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage('新版安装话术已复制，直接粘贴给 WorkBuddy 即可。');
    } catch {
      setError('浏览器没有允许复制，请在下方展开后手动复制。');
    }
  }

  async function fetchInstallSession() {
    if (!hasValidEntitlement) {
      throw new Error('当前账号没有有效权益，请先兑换或续费。');
    }
    if (isMobile) {
      throw new Error(
        '请在准备安装 WorkBuddy 的电脑上打开本页并生成安装授权。'
      );
    }

    const selectedDeviceName = commandSafeDeviceName(deviceName, platform);
    const response = await fetch('/api/onework/install/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceName: selectedDeviceName, platform }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || typeof data.token !== 'string') {
      throw new Error(data.error || '生成安装授权失败');
    }
    setDeviceName(selectedDeviceName);
    setInstallToken(data.token);
    setInstallExpiresAt(data.expiresAt || null);
    setNow(Date.now());
    return {
      token: data.token as string,
      expiresAt: data.expiresAt as string | null,
    };
  }

  async function createInstallSession() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fetchInstallSession();
      setMessage('安装授权已生成，请在下方倒计时结束前使用一次。');
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
      const selectedDeviceName = commandSafeDeviceName(deviceName, platform);
      const installerUrl = `${server}/downloads/onework-install.mjs`;
      const unixCommand = [
        `tmpdir="$(mktemp -d "\${TMPDIR:-/tmp}/onework-install.XXXXXX")" || exit 1`,
        'tmp="$tmpdir/onework-install.mjs"',
        `curl -fsSL ${shellQuote(installerUrl)} -o "$tmp" || { rm -rf "$tmpdir"; exit 1; }`,
        `node "$tmp" --server ${shellQuote(server)} --token ${shellQuote(token)} --device-name ${shellQuote(selectedDeviceName)}`,
        'status=$?',
        'rm -rf "$tmpdir"',
        'exit "$status"',
      ].join('; ');
      const windowsCommand =
        `$tmp = Join-Path $env:TEMP ('onework-install-' + [guid]::NewGuid() + '.mjs'); ` +
        'try { ' +
        `Invoke-WebRequest -UseBasicParsing -Uri ${powershellQuote(installerUrl)} -OutFile $tmp -ErrorAction Stop; ` +
        `& node $tmp --server ${powershellQuote(server)} --token ${powershellQuote(token)} --device-name ${powershellQuote(selectedDeviceName)}; ` +
        'if ($LASTEXITCODE -ne 0) { throw "OneWorkOS 安装失败，退出码：$LASTEXITCODE" } ' +
        '} finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }';
      const prompt = [
        '请直接在当前电脑的终端安装 OneWorkOS，不要只解释步骤，也不要回显授权内容：',
        '1. 识别操作系统并确认 Node.js 主版本不低于 18；检查失败时停止并明确告诉我原因；',
        `2. macOS/Linux：先把安装程序下载为临时 .mjs 文件，再执行：${unixCommand}`,
        `3. Windows PowerShell：先把安装程序下载为临时 .mjs 文件，再执行：${windowsCommand}`,
        '4. 每一步都检查退出状态；失败时停止，不要宣称安装成功；',
        '5. 成功后检查 WorkBuddy Skill 目录和授权文件，并提醒我重启 WorkBuddy。',
      ].join('\n');
      setInstallPrompt(prompt);
      try {
        await navigator.clipboard.writeText(prompt);
        setMessage('AI 安装指令已复制，请粘贴到当前电脑上的 WorkBuddy。');
      } catch {
        setMessage('AI 安装指令已生成，请展开下方内容并手动复制。');
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '生成 AI 安装指令失败'
      );
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
      const selectedDeviceName = commandSafeDeviceName(deviceName, platform);
      const isWindows = platform === 'Windows';
      const filename = isWindows ? 'onework-install.cmd' : 'onework-install.sh';
      const script = isWindows
        ? `@echo off\r\nsetlocal\r\nset "SERVER=${server}"\r\nset "TOKEN=${token}"\r\nset "DEVICE_NAME=${selectedDeviceName}"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 goto :node_missing\r\nfor /f "delims=" %%V in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "NODE_MAJOR=%%V"\r\nif not defined NODE_MAJOR goto :node_missing\r\nif %NODE_MAJOR% LSS 18 goto :node_old\r\nset "INSTALLER=%TEMP%\\onework-install-%RANDOM%-%RANDOM%.mjs"\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%SERVER%/downloads/onework-install.mjs' -OutFile '%INSTALLER%' -ErrorAction Stop"\r\nif errorlevel 1 goto :download_failed\r\nif not exist "%INSTALLER%" goto :download_failed\r\nnode "%INSTALLER%" --server "%SERVER%" --token "%TOKEN%" --device-name "%DEVICE_NAME%"\r\nset "INSTALL_STATUS=%ERRORLEVEL%"\r\ndel /q "%INSTALLER%" >nul 2>nul\r\nif not "%INSTALL_STATUS%"=="0" goto :install_failed\r\necho.\r\necho OneWorkOS installation completed. Restart WorkBuddy now.\r\npause\r\nexit /b 0\r\n:node_missing\r\necho Node.js was not found. Install Node.js 18 or later: https://nodejs.org/\r\npause\r\nexit /b 1\r\n:node_old\r\necho Node.js 18 or later is required. Current major version: %NODE_MAJOR%\r\npause\r\nexit /b 1\r\n:download_failed\r\necho Failed to download the OneWorkOS installer. Check the network and try again.\r\nif exist "%INSTALLER%" del /q "%INSTALLER%" >nul 2>nul\r\npause\r\nexit /b 1\r\n:install_failed\r\necho OneWorkOS installation failed. Exit code: %INSTALL_STATUS%\r\npause\r\nexit /b %INSTALL_STATUS%\r\n`
        : `#!/bin/bash\nset -euo pipefail\nSERVER=${shellQuote(server)}\nTOKEN=${shellQuote(token)}\nDEVICE_NAME=${shellQuote(selectedDeviceName)}\nif ! command -v node >/dev/null 2>&1; then\n  echo '未检测到 Node.js，请先安装 Node.js 18 或更高版本：https://nodejs.org/'\n  exit 1\nfi\nNODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"\nif ! [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] || (( NODE_MAJOR < 18 )); then\n  echo "需要 Node.js 18 或更高版本，当前主版本：\${NODE_MAJOR:-未知}"\n  exit 1\nfi\nif ! command -v curl >/dev/null 2>&1; then\n  echo '未检测到 curl，无法下载安装程序。'\n  exit 1\nfi\nINSTALL_DIR="$(mktemp -d "\${TMPDIR:-/tmp}/onework-install.XXXXXX")"\nINSTALLER="$INSTALL_DIR/onework-install.mjs"\ntrap 'rm -rf "$INSTALL_DIR"' EXIT\ncurl -fsSL "$SERVER/downloads/onework-install.mjs" -o "$INSTALLER"\nnode "$INSTALLER" --server "$SERVER" --token "$TOKEN" --device-name "$DEVICE_NAME"\necho ''\necho 'OneWorkOS 安装完成，请立即重启 WorkBuddy。'\n`;

      const blob = new Blob([script], { type: 'text/plain;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);

      setMessage(
        isWindows
          ? `已下载 ${filename}。双击运行；若任一步失败，窗口会保留具体错误。`
          : `已下载 ${filename}。macOS 请打开终端执行：bash ~/Downloads/${filename}`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '下载安装脚本失败');
    } finally {
      setBusy(false);
    }
  }

  async function revokeDevice(device: OneWorkDevice) {
    const displayName = device.deviceName || device.platform || '未命名设备';
    if (!window.confirm(`确定撤销「${displayName}」的 OneWorkOS 授权吗？`))
      return;

    setRevokingDeviceId(device.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `/api/onework/devices/${encodeURIComponent(device.id)}`,
        { method: 'DELETE' }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || '撤销设备失败');
      }
      setMessage(`已撤销设备：${displayName}`);
      await loadAccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '撤销设备失败');
    } finally {
      setRevokingDeviceId('');
    }
  }

  async function revokeOAuthConnection(connection: OneWorkOAuthConnection) {
    if (
      !window.confirm(
        `确定断开「${connection.clientName || 'OneWorkOS 客户端'}」吗？断开后，它需要重新进行网页授权才能继续使用。`
      )
    )
      return;

    setRevokingClientId(connection.clientId);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `/api/onework/oauth/connections/${encodeURIComponent(connection.clientId)}`,
        { method: 'DELETE' }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || '断开连接失败');
      }
      setMessage(`已断开：${connection.clientName || 'OneWorkOS 客户端'}`);
      await loadAccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '断开连接失败');
    } finally {
      setRevokingClientId('');
    }
  }

  if (isPending) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        正在检查登录状态…
      </div>
    );
  }

  if (!session?.user?.id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>先登录 OneWorkOS</CardTitle>
          <CardDescription>
            兑换码会绑定到你的账号，换电脑时仍可以重新生成设备授权。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link
              href={`${Routes.Login}?callbackUrl=${encodeURIComponent(Routes.OneWork)}`}
            >
              登录 / 注册
            </Link>
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
            <CardTitle className="flex items-center gap-2">
              <KeyRoundIcon className="size-5" />
              兑换 OneWorkOS
            </CardTitle>
            <CardDescription>
              输入购买后收到的兑换码。兑换只开通账号权益，设备授权会在安装时自动领取。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="例如 OWOS-XXXX-XXXX"
              autoComplete="off"
            />
            <Button
              onClick={() => void redeem()}
              disabled={busy || !code.trim()}
            >
              {busy ? '处理中…' : '兑换权益'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden border-primary/30 shadow-lg shadow-primary/5">
        <CardHeader className="bg-gradient-to-br from-primary/10 via-background to-background">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge>推荐</Badge>
            <Badge variant="secondary">Mac / Windows 同一流程</Badge>
          </div>
          <CardTitle className="flex items-center gap-2">
            <PlugZapIcon className="size-5" />用 WorkBuddy 插件连接
          </CardTitle>
          <CardDescription>
            安装一个很薄的插件，然后在网页登录并点击一次授权。不需要
            Node.js、终端、设备 Key 或手动配置路径。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              '无需复制 API Key',
              '网页 OAuth 授权',
              '知识库在云端实时更新',
              '插件可由 WorkBuddy 管理升级',
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3"
              >
                <ShieldCheckIcon className="size-4 shrink-0 text-primary" />
                {item}
              </div>
            ))}
          </div>
          {!hasValidEntitlement && !loadingAccess && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              可以先安装插件，但连接前需要先兑换或开通 OneWorkOS 权益。
            </div>
          )}
          <Button onClick={() => void copyPluginInstallPrompt()}>
            <CopyIcon className="size-4" />
            复制 WorkBuddy 安装话术
          </Button>
          <details className="rounded-lg border p-4 text-sm">
            <summary className="cursor-pointer font-medium">
              我想手动安装
            </summary>
            <div className="mt-3 space-y-2 text-muted-foreground">
              <code className="block break-all rounded bg-muted p-2 text-xs">
                /plugin marketplace add dl-gzz/dlgzz-blog
              </code>
              <code className="block break-all rounded bg-muted p-2 text-xs">
                /plugin install one-work-os@onework-os-marketplace
              </code>
              <code className="block break-all rounded bg-muted p-2 text-xs">
                /reload-plugins
              </code>
              <p>
                首次调用时 WorkBuddy 会打开 OneWorkOS
                网页，登录后点击「允许连接」即可。
              </p>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorDownIcon className="size-5" />
            旧版兼容安装
          </CardTitle>
          <CardDescription>
            仅在旧版 WorkBuddy 不支持远程 MCP / OAuth 时使用。此通道仍然保留，
            已安装用户不受影响。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingAccess ? (
            <p className="text-sm text-muted-foreground">正在确认账号权益…</p>
          ) : !hasValidEntitlement ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              当前账号没有有效权益。请先兑换或续费，安装功能才会启用。
            </div>
          ) : isMobile ? (
            <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
              <SmartphoneIcon className="mt-0.5 size-5 shrink-0" />
              <p>
                当前正在使用手机。请在目标 Mac、Windows 或 Linux
                电脑上打开本页并登录同一账号，再生成安装授权。
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.target.value)}
                  placeholder={`${platform === 'other' ? '当前' : platform} 设备（可修改）`}
                  maxLength={80}
                />
                <select
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  aria-label="设备操作系统"
                >
                  <option value="macOS">macOS</option>
                  <option value="Windows">Windows</option>
                  <option value="Linux">Linux</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                已自动识别当前系统；如识别不准，可以手动修改。设备名称会写入安装授权和设备列表。
              </p>
              <Button
                onClick={() => void copyAiInstallPrompt()}
                disabled={busy}
              >
                <CopyIcon className="size-4" />
                复制 AI 安装指令
              </Button>
              <p className="text-xs text-muted-foreground">
                把指令粘贴到当前电脑上的 WorkBuddy。它会先下载 .mjs
                安装程序，再执行并逐步检查结果。
              </p>
              {installPrompt && (
                <details className="rounded-lg border p-4 text-sm">
                  <summary className="cursor-pointer font-medium">
                    查看 AI 安装指令
                  </summary>
                  <textarea
                    className="mt-3 min-h-44 w-full rounded border bg-muted p-3 font-mono text-xs"
                    value={installPrompt}
                    readOnly
                  />
                </details>
              )}
              <details className="rounded-lg border p-4 text-sm">
                <summary className="cursor-pointer font-medium">
                  高级：备用安装方式
                </summary>
                <div className="mt-3 space-y-3">
                  <Button
                    onClick={() => void downloadInstaller()}
                    disabled={busy}
                  >
                    <DownloadIcon className="size-4" />
                    下载备用安装脚本
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Windows 可运行下载的 .cmd；macOS/Linux 下载的是
                    .sh，需要在终端用 bash 执行，不能直接双击安装。
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => void createInstallSession()}
                    disabled={busy}
                  >
                    <RefreshCwIcon className="size-4" />
                    只生成安装授权
                  </Button>
                  {installToken && (
                    <>
                      {installSecondsRemaining > 0 ? (
                        <p className="font-medium text-amber-700 dark:text-amber-300">
                          剩余有效时间：
                          {formatCountdown(installSecondsRemaining)}
                        </p>
                      ) : (
                        <p className="font-medium text-destructive">
                          这份安装授权已过期，请重新生成。
                        </p>
                      )}
                      <code className="block break-all rounded bg-muted p-2">
                        {installToken}
                      </code>
                      <p className="text-muted-foreground">
                        这是一次性短时授权，不是长期 API
                        Key；使用一次或倒计时结束后失效。
                      </p>
                    </>
                  )}
                </div>
              </details>
            </>
          )}
        </CardContent>
      </Card>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>我的 OneWorkOS 权益</CardTitle>
          <CardDescription>
            这里展示账号当前有效状态、本月检索用量和已绑定设备。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">本月已用</p>
              <p className="mt-1 text-xl font-semibold">{usageUsed ?? '—'}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">本月剩余</p>
              <p className="mt-1 text-xl font-semibold">
                {usageRemaining ?? '—'}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">每月额度</p>
              <p className="mt-1 text-xl font-semibold">{usageLimit ?? '—'}</p>
            </div>
          </div>
          {usageUsed === null && (
            <p className="text-xs text-muted-foreground">
              用量统计正在同步；不会把未知用量显示为 0。
            </p>
          )}

          {!access?.entitlements?.length ? (
            <p className="text-sm text-muted-foreground">暂无已激活知识包。</p>
          ) : (
            access.entitlements.map((item) => {
              const active = entitlementIsActive(item, now);
              return (
                <div
                  key={item.knowledgePackId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {packName(item.knowledgePackId)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      每月 {item.monthlyQuota} 次 · 到期：
                      {formatDate(item.expiresAt)}
                    </p>
                  </div>
                  <Badge variant={active ? 'default' : 'secondary'}>
                    {entitlementStatus(item, now)}
                  </Badge>
                </div>
              );
            })
          )}

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">已连接的 AI 客户端</h3>
              <span className="text-xs text-muted-foreground">
                {access?.oauthConnections?.length ?? 0} 个
              </span>
            </div>
            {!access?.oauthConnections?.length ? (
              <p className="text-sm text-muted-foreground">
                尚未通过网页授权连接 WorkBuddy 或其他 AI 客户端。
              </p>
            ) : (
              access.oauthConnections.map((connection) => (
                <div
                  key={connection.clientId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {connection.clientName || 'OneWorkOS 客户端'}
                      </p>
                      <Badge>已连接</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {connection.scopes.map(oauthScopeName).join('、')} ·
                      授权于 {formatDateTime(connection.grantedAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void revokeOAuthConnection(connection)}
                    disabled={revokingClientId === connection.clientId}
                  >
                    <Trash2Icon className="size-4" />
                    {revokingClientId === connection.clientId
                      ? '断开中…'
                      : '断开连接'}
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">旧版安装设备</h3>
              <span className="text-xs text-muted-foreground">
                有效{' '}
                {access?.devices?.filter((device) => device.status === 'active')
                  .length ?? 0}{' '}
                台
              </span>
            </div>
            {!access?.devices?.length ? (
              <p className="text-sm text-muted-foreground">
                尚未绑定旧版设备。新版 OAuth 插件不需要绑定电脑。
              </p>
            ) : (
              access.devices.map((device) => (
                <div
                  key={device.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {device.deviceName || '未命名设备'}
                      </p>
                      <Badge
                        variant={
                          device.status === 'active' ? 'default' : 'secondary'
                        }
                      >
                        {device.status === 'active'
                          ? '有效'
                          : device.status === 'revoked'
                            ? '已撤销'
                            : device.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {device.platform || '未知系统'} · 首次绑定{' '}
                      {formatDateTime(device.createdAt)} · 最近使用{' '}
                      {formatDateTime(device.lastSeenAt)}
                    </p>
                  </div>
                  {device.status === 'active' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void revokeDevice(device)}
                      disabled={revokingDeviceId === device.id}
                    >
                      <Trash2Icon className="size-4" />
                      {revokingDeviceId === device.id ? '撤销中…' : '撤销授权'}
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        需要查看图片和官方出处时，Skill 仍会回到 OneWorkOS
        受治理知识库检索，不会把兑换码当作知识内容。
        <Link
          className="ml-1 inline-flex items-center gap-1 text-primary underline"
          href="https://www.dlgzz.com"
          target="_blank"
        >
          dlgzz.com <ExternalLinkIcon className="size-3" />
        </Link>
      </p>
    </div>
  );
}
