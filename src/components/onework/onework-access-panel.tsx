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
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleIcon,
  CopyIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  Link2Icon,
  Loader2Icon,
  LogInIcon,
  PlugZapIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
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
  identity: 'current' | 'legacy' | 'other';
  scopes: string[];
  grantedAt: string;
};

type AccessData = {
  entitlements: Entitlement[];
  devices: OneWorkDevice[];
  oauthConnections: OneWorkOAuthConnection[];
  usage?: {
    usedThisMonth?: number;
    used?: number;
    limit?: number;
    monthlyQuota?: number;
    remaining?: number;
  };
};

const WORKBUDDY_INSTALL_PROMPT = [
  '请在当前 WorkBuddy 安装并连接 one-worker-os。',
  '请打开并严格执行：https://www.dlgzz.com/one-worker-os-marketplace/workbuddy-install.md',
  '先自检是首次安装、旧版迁移还是已安装；不得降级为独立 Skill、旧安装器或 API Key。除网页授权或必须重启外，请直接完成，并在真实验证成功后再告诉我。',
].join('\n');

const TEST_PROMPT = '查看我的 one-worker-os 会员权益和剩余次数';

function formatDate(value: string | null | undefined) {
  if (!value) return '长期有效';
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

function packName(packId: string) {
  if (packId === ALL_PACKS_GRANT) return '全部 one-worker-os 知识库';
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

function oauthClientName(connection: OneWorkOAuthConnection) {
  if (connection.identity === 'current') {
    return 'WorkBuddy · one-worker-os';
  }
  if (connection.identity === 'legacy') return 'WorkBuddy · 旧版连接';
  return connection.clientName || 'one-worker-os 客户端';
}

function entitlementIsActive(item: Entitlement, now: number) {
  if (item.status !== 'active') return false;
  if (!item.expiresAt) return true;
  const expiresAt = new Date(item.expiresAt).getTime();
  return !Number.isNaN(expiresAt) && expiresAt > now;
}

function entitlementStatus(item: Entitlement, now: number) {
  if (item.status === 'active' && entitlementIsActive(item, now)) return '有效';
  if (item.status === 'revoked') return '已撤销';
  return '已过期';
}

function SetupStep({
  index,
  title,
  description,
  done,
  current,
}: {
  index: number;
  title: string;
  description: string;
  done: boolean;
  current: boolean;
}) {
  return (
    <div
      className={`relative flex gap-3 rounded-xl border p-4 transition-colors ${
        done
          ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20'
          : current
            ? 'border-primary/40 bg-primary/5'
            : 'bg-muted/20'
      }`}
    >
      {done ? (
        <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-600" />
      ) : current ? (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {index}
        </span>
      ) : (
        <CircleIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground/50" />
      )}
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

export function OneWorkAccessPanel({
  showRedeem = true,
}: { showRedeem?: boolean }) {
  const { data: session, isPending } = authClient.useSession();
  const [mounted, setMounted] = useState(false);
  const [code, setCode] = useState('');
  const [access, setAccess] = useState<AccessData | null>(null);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revokingDeviceId, setRevokingDeviceId] = useState('');
  const [revokingClientId, setRevokingClientId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [installCopyState, setInstallCopyState] = useState<
    'idle' | 'copying' | 'copied' | 'error'
  >('idle');
  const [now, setNow] = useState(() => Date.now());

  const activeEntitlements = useMemo(
    () =>
      access?.entitlements?.filter((item) => entitlementIsActive(item, now)) ??
      [],
    [access?.entitlements, now]
  );
  const hasValidEntitlement = activeEntitlements.length > 0;
  const oauthConnections = access?.oauthConnections ?? [];
  const isAuthorized = oauthConnections.some(
    (connection) => connection.identity === 'current'
  );
  const canUseOneWorkerOs = hasValidEntitlement && isAuthorized;
  const hasHistoricalEntitlement = (access?.entitlements?.length ?? 0) > 0;

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

  const loadAccess = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoadingAccess(true);
    setError('');
    try {
      const response = await fetch('/api/onework/entitlements', {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || '读取 one-worker-os 权益失败');
      }
      setAccess(data as AccessData);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '读取 one-worker-os 权益失败'
      );
    } finally {
      setLoadingAccess(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function copyText(value: string, successMessage: string) {
    setError('');
    setMessage('');
    try {
      await navigator.clipboard.writeText(value);
      setMessage(successMessage);
    } catch {
      setError('浏览器没有允许复制，请允许剪贴板权限后重试。');
    }
  }

  async function copyInstallPrompt() {
    setInstallCopyState('copying');
    try {
      await navigator.clipboard.writeText(WORKBUDDY_INSTALL_PROMPT);
      setInstallCopyState('copied');
    } catch {
      setInstallCopyState('error');
    }
  }

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
      if (!response.ok || !data.success) {
        throw new Error(data.error || '兑换失败');
      }
      setMessage(`兑换成功，已开通：${data.packs.map(packName).join('、')}`);
      setCode('');
      await loadAccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '兑换失败');
    } finally {
      setBusy(false);
    }
  }

  async function revokeOAuthConnection(connection: OneWorkOAuthConnection) {
    const displayName = oauthClientName(connection);
    if (
      !window.confirm(
        `确定断开「${displayName}」吗？断开后，需要重新进行网页授权才能继续使用。`
      )
    ) {
      return;
    }

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
      setMessage(`已断开：${displayName}`);
      await loadAccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '断开连接失败');
    } finally {
      setRevokingClientId('');
    }
  }

  async function revokeDevice(device: OneWorkDevice) {
    const displayName = device.deviceName || device.platform || '未命名设备';
    if (!window.confirm(`确定撤销旧版设备「${displayName}」吗？`)) return;

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
      setMessage(`已撤销旧版设备：${displayName}`);
      await loadAccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '撤销设备失败');
    } finally {
      setRevokingDeviceId('');
    }
  }

  if (!mounted || isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        正在检查登录状态…
      </div>
    );
  }

  if (!session?.user?.id) {
    return (
      <Card className="overflow-hidden border-primary/25 shadow-lg shadow-primary/5">
        <CardHeader className="bg-gradient-to-br from-primary/10 via-background to-background">
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LogInIcon className="size-5" />
          </div>
          <CardTitle className="text-2xl">登录后开始连接</CardTitle>
          <CardDescription className="max-w-xl text-base leading-7">
            会员权益和 WorkBuddy 授权都属于你的账号。登录一次，即可在 Mac 或
            Windows 上使用同一套连接流程。
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Button asChild size="lg">
            <Link
              href={`${Routes.Login}?callbackUrl=${encodeURIComponent(Routes.OneWork)}`}
            >
              登录 / 注册 <ArrowRightIcon className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const currentStep = !hasValidEntitlement ? 1 : isAuthorized ? 4 : 2;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/25 shadow-xl shadow-primary/5">
        <CardHeader className="bg-gradient-to-br from-primary/10 via-background to-cyan-500/5 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={canUseOneWorkerOs ? 'default' : 'secondary'}>
                  {loadingAccess
                    ? '正在检查'
                    : canUseOneWorkerOs
                      ? '会员有效 · 已授权'
                      : hasValidEntitlement
                        ? '会员有效 · 待连接'
                        : hasHistoricalEntitlement
                          ? '会员已过期'
                          : '尚未开通'}
                </Badge>
                <Badge variant="outline">Mac / Windows 同一流程</Badge>
              </div>
              <CardTitle className="text-2xl sm:text-3xl">
                {canUseOneWorkerOs
                  ? 'one-worker-os 已经可以使用'
                  : hasValidEntitlement
                    ? '接下来，把 WorkBuddy 连接进来'
                    : hasHistoricalEntitlement
                      ? '续费后即可继续使用'
                      : '先开通会员，再连接 WorkBuddy'}
              </CardTitle>
              <CardDescription className="max-w-2xl text-base leading-7">
                {canUseOneWorkerOs
                  ? '你的会员账号已经授权给 AI 客户端。以后不需要复制 Key，知识库更新也不需要重新安装。'
                  : '统一使用 WorkBuddy 插件和网页 OAuth。无需选择操作系统，无需安装 Node.js，也无需复制 API Key。'}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadAccess()}
              disabled={loadingAccess}
            >
              <RefreshCwIcon
                className={`size-4 ${loadingAccess ? 'animate-spin' : ''}`}
              />
              刷新状态
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-3 lg:grid-cols-4">
            <SetupStep
              index={1}
              title="开通会员"
              description="购买后自动开通，或输入兑换码绑定到账号。"
              done={hasValidEntitlement}
              current={currentStep === 1}
            />
            <SetupStep
              index={2}
              title="安装插件"
              description="在 WorkBuddy 内安装并启用 one-worker-os 插件。"
              done={isAuthorized}
              current={currentStep === 2}
            />
            <SetupStep
              index={3}
              title="网页授权"
              description="点击连接，在网页确认会员账号和授权范围。"
              done={isAuthorized}
              current={currentStep === 2}
            />
            <SetupStep
              index={4}
              title="直接使用"
              description="用自然语言提问，one-worker-os 自动选择知识和能力。"
              done={canUseOneWorkerOs}
              current={currentStep === 4}
            />
          </div>

          {message && (
            <output className="block rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              {message}
            </output>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {!hasValidEntitlement && !loadingAccess && showRedeem && (
            <div className="rounded-xl border bg-muted/20 p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <KeyRoundIcon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">输入兑换码开通会员</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    网站购买会自动开通；通过小红书、抖音或人工购买时，在这里输入收到的兑换码。
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <Input
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="例如 OWOS-XXXX-XXXX"
                      autoComplete="off"
                      className="sm:max-w-sm"
                    />
                    <Button
                      onClick={() => void redeem()}
                      disabled={busy || !code.trim()}
                    >
                      {busy ? '兑换中…' : '兑换会员'}
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={Routes.Pricing}>查看会员方案</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {hasValidEntitlement && (
            <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <PlugZapIcon className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">
                      在 WorkBuddy 安装 one-worker-os
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      点击复制安装指令，粘贴到 WorkBuddy
                      新任务中并发送，WorkBuddy 会自动完成后续处理。
                    </p>
                  </div>
                </div>
                <Button
                  className={`mt-5 w-full sm:w-auto ${
                    installCopyState === 'copied'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : ''
                  }`}
                  size="lg"
                  disabled={installCopyState === 'copying'}
                  aria-describedby="install-copy-feedback"
                  onClick={() => void copyInstallPrompt()}
                >
                  {installCopyState === 'copying' ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : installCopyState === 'copied' ? (
                    <CheckCircle2Icon className="size-4" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                  {installCopyState === 'copying'
                    ? '正在复制…'
                    : installCopyState === 'copied'
                      ? '已复制，去 WorkBuddy 粘贴'
                      : '复制安装指令'}
                </Button>
                <div id="install-copy-feedback" className="mt-3 min-h-6">
                  {installCopyState === 'copied' ? (
                    <output
                      aria-live="polite"
                      className="block text-sm font-medium text-emerald-700 dark:text-emerald-300"
                    >
                      复制成功。下一步：打开 WorkBuddy → 新建任务 → 粘贴并发送。
                    </output>
                  ) : installCopyState === 'error' ? (
                    <p role="alert" className="text-sm text-destructive">
                      复制失败，请重试；若仍失败，请检查浏览器的剪贴板权限。
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
                    <Link2Icon className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">
                      第二步：点击连接并授权
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      安装完成后，进入：
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-muted p-3 text-sm font-medium leading-6">
                  专家·技能·连接器 → 连接器 → 自定义连接器 → one-worker-os →
                  连接
                </div>
                <ol className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
                  <li>1. 浏览器会打开 one-worker-os 授权页。</li>
                  <li>2. 核对会员账号和四项权限。</li>
                  <li>3. 由你本人点击「允许连接」。</li>
                  <li>4. 返回本页点击「刷新状态」。</li>
                </ol>
              </div>
            </div>
          )}

          {canUseOneWorkerOs && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900 dark:bg-emerald-950/20">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-start gap-3">
                  <CheckCircle2Icon className="mt-0.5 size-6 shrink-0 text-emerald-600" />
                  <div>
                    <h3 className="text-lg font-semibold">授权已经完成</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      打开
                      WorkBuddy，新建任务并直接说出需求即可。第一次可以用下面这句话验收。
                    </p>
                    <code className="mt-3 block rounded-lg border bg-background px-3 py-2 text-sm">
                      {TEST_PROMPT}
                    </code>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    void copyText(
                      TEST_PROMPT,
                      '测试问题已复制，请粘贴到 WorkBuddy。'
                    )
                  }
                >
                  <CopyIcon className="size-4" />
                  复制测试问题
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheckIcon className="size-5 text-primary" />
              会员与用量
            </CardTitle>
            <CardDescription>权益属于账号，不属于某一台电脑。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
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
                <p className="mt-1 text-xl font-semibold">
                  {usageLimit ?? '—'}
                </p>
              </div>
            </div>

            {!access?.entitlements?.length ? (
              <p className="text-sm text-muted-foreground">
                暂无有效会员权益。
              </p>
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
                      <p className="mt-1 text-xs text-muted-foreground">
                        到期：{formatDate(item.expiresAt)}
                      </p>
                    </div>
                    <Badge variant={active ? 'default' : 'secondary'}>
                      {entitlementStatus(item, now)}
                    </Badge>
                  </div>
                );
              })
            )}

            {hasValidEntitlement && showRedeem && (
              <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  我有新的兑换码或续费码
                </summary>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="输入兑换码"
                    autoComplete="off"
                  />
                  <Button
                    onClick={() => void redeem()}
                    disabled={busy || !code.trim()}
                  >
                    {busy ? '处理中…' : '兑换'}
                  </Button>
                </div>
              </details>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SparklesIcon className="size-5 text-primary" />
              已授权的 AI 客户端
            </CardTitle>
            <CardDescription>
              在这里查看和撤销 WorkBuddy 等客户端的网页授权。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!oauthConnections.length ? (
              <div className="rounded-lg border border-dashed p-5 text-center">
                <Link2Icon className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-2 font-medium">尚未授权 AI 客户端</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  完成上方插件安装和网页授权后，会自动显示在这里。
                </p>
              </div>
            ) : (
              oauthConnections.map((connection) => (
                <div
                  key={connection.clientId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {oauthClientName(connection)}
                      </p>
                      <Badge
                        variant={
                          connection.identity === 'current'
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {connection.identity === 'current'
                          ? '当前版本已授权'
                          : connection.identity === 'legacy'
                            ? '旧版授权，请撤销'
                            : '其他客户端授权'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
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
                      : '撤销授权'}
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {!!access?.devices?.length && (
        <details className="rounded-xl border bg-muted/15 p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            管理旧版安装设备（{access.devices.length}）
          </summary>
          <p className="mt-2 text-muted-foreground">
            这些记录来自旧版 Key
            安装方式。新版插件不再绑定电脑，也不需要生成设备授权。
          </p>
          <div className="mt-4 space-y-2">
            {access.devices.map((device) => (
              <div
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3"
              >
                <div>
                  <p className="font-medium">
                    {device.deviceName || '未命名设备'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {device.platform || '未知系统'} · 最近使用{' '}
                    {formatDateTime(device.lastSeenAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      device.status === 'active' ? 'secondary' : 'outline'
                    }
                  >
                    {device.status === 'active' ? '旧版有效' : '已撤销'}
                  </Badge>
                  {device.status === 'active' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void revokeDevice(device)}
                      disabled={revokingDeviceId === device.id}
                    >
                      <Trash2Icon className="size-4" />
                      {revokingDeviceId === device.id ? '撤销中…' : '撤销'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="flex flex-col justify-between gap-3 rounded-xl border bg-muted/20 p-4 text-sm sm:flex-row sm:items-center">
        <div className="flex items-start gap-2 text-muted-foreground">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            one-worker-os
            只在你授权的范围内工作。图片、官方出处和知识检索都由云端统一更新。
          </p>
        </div>
        <Link
          className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
          href="https://github.com/dl-gzz/dlgzz-blog"
          target="_blank"
          rel="noreferrer"
        >
          查看插件来源 <ExternalLinkIcon className="size-3" />
        </Link>
      </div>
    </div>
  );
}
