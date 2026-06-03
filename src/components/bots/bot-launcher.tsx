'use client';

import { Switch } from '@/components/ui/switch';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import {
  BadgeCheck,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  QrCode,
  RefreshCcw,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'react-qr-code';

interface WorkerCatalogEmployee {
  id: string;
  name: string;
  responsibility: string;
  suitableTasks: string;
  solvesProblem: string;
  status: string;
  monthlyPriceId: string;
  monthlyAmount: number;
  currency: string;
  soulPath?: string | null;
  version?: {
    id: string;
    skillsSummary: string[];
    soulHash: string;
    createdAt?: string | null;
  } | null;
}

interface WorkerInstance {
  id: string;
  employeeId: string;
  status: string;
  paymentStatus: string;
  profileName?: string | null;
  activationId?: string | null;
  qrPayload?: string | null;
  qrImageUrl?: string | null;
  activationExpiresAt?: string | null;
  gatewayStatus?: string | null;
  error?: string | null;
  employee?: {
    name: string;
  } | null;
}

interface WorkerInstanceSkill {
  id: string;
  name: string;
  summary: string;
  skillType: string;
  riskLevel: string;
  status: string;
  enabled: boolean;
  requiresUserConfig: boolean;
}

interface WorkerActionResult {
  success?: boolean;
  checkout?: {
    url: string;
    id: string;
  };
  instance?: WorkerInstance;
  instanceId?: string;
  status?: string;
  profileName?: string | null;
  activationId?: string | null;
  qrPayload?: string | null;
  qrImageUrl?: string | null;
  expiresAt?: string | null;
  message?: string;
  code?: string;
  error?: string;
}

interface BotLauncherProps {
  initialIsLoggedIn?: boolean;
  initialEmployees?: WorkerCatalogEmployee[];
}

const paidStatuses = new Set(['active', 'completed', 'trialing']);
const activeInstanceStatuses = new Set([
  'ready_to_activate',
  'qr_ready',
  'scanned',
  'activation_expired',
  'activation_failed',
  'active',
  'version_upgrade_pending_activation',
]);
const companionDisplayName = '独立陪伴者';

function redirectToLogin() {
  const callbackUrl = encodeURIComponent('/bots#create');
  window.location.assign(`/auth/login?callbackUrl=${callbackUrl}`);
}

export function BotLauncher({
  initialIsLoggedIn = false,
  initialEmployees = [],
}: BotLauncherProps) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [instances, setInstances] = useState<WorkerInstance[]>([]);
  const [instanceSkills, setInstanceSkills] = useState<WorkerInstanceSkill[]>(
    []
  );
  const [skillUpdatingId, setSkillUpdatingId] = useState('');
  const [selectedId, setSelectedId] = useState(initialEmployees[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<WorkerActionResult | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();

  const hasClientSession = Boolean(session?.user?.id);
  const isCheckingSession = initialIsLoggedIn && isSessionPending;
  const isLoggedIn =
    initialIsLoggedIn && (isSessionPending || hasClientSession);
  const selectedEmployee =
    employees.find((employee) => employee.id === selectedId) || employees[0];
  const selectedInstance = useMemo(() => {
    if (!selectedEmployee) return null;

    return (
      instances.find(
        (instance) =>
          instance.employeeId === selectedEmployee.id &&
          activeInstanceStatuses.has(instance.status)
      ) ||
      instances.find((instance) => instance.employeeId === selectedEmployee.id) ||
      null
    );
  }, [instances, selectedEmployee]);
  const qrPayload = action?.qrPayload || selectedInstance?.qrPayload || '';
  const qrImageUrl = action?.qrImageUrl || selectedInstance?.qrImageUrl || '';
  const activationStatus = action?.status || selectedInstance?.status || '';
  const hasQr = Boolean(qrPayload || qrImageUrl);
  const activated = activationStatus === 'active' || activationStatus === 'activated';
  const activationExpiresAt =
    action?.expiresAt || selectedInstance?.activationExpiresAt || null;
  const activationExpiresAtMs = activationExpiresAt
    ? new Date(activationExpiresAt).getTime()
    : null;
  const qrSecondsRemaining =
    activationExpiresAtMs && Number.isFinite(activationExpiresAtMs)
      ? Math.max(0, Math.floor((activationExpiresAtMs - now) / 1000))
      : null;
  const qrExpired =
    hasQr &&
    !activated &&
    (activationStatus === 'activation_expired' ||
      (activationExpiresAtMs !== null &&
        Number.isFinite(activationExpiresAtMs) &&
        now >= activationExpiresAtMs));
  const canActivate =
    selectedInstance &&
    (paidStatuses.has(selectedInstance.paymentStatus) ||
      selectedInstance.status === 'ready_to_activate' ||
      selectedInstance.status === 'active');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const response = await fetch('/api/workers/catalog', {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.success && Array.isArray(payload.employees)) {
        setEmployees(payload.employees);
        setSelectedId((current) => current || payload.employees[0]?.id || '');
      }
    } catch {
      // Keep server-rendered employees if the catalog endpoint is temporarily down.
    }
  }, []);

  const loadInstances = useCallback(async () => {
    if (!isLoggedIn) return;

    try {
      const response = await fetch('/api/workers/instances', {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.success && Array.isArray(payload.instances)) {
        setInstances(payload.instances);
      }
    } catch {
      // Keep the last visible instance state.
    }
  }, [isLoggedIn]);

  const loadInstanceSkills = useCallback(async (instanceId: string) => {
    try {
      const response = await fetch(`/api/workers/instances/${instanceId}/skills`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.success && Array.isArray(payload.skills)) {
        setInstanceSkills(payload.skills);
      }
    } catch {
      // Skill controls can wait for the next refresh.
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  useEffect(() => {
    if (!selectedInstance?.id || !canActivate) {
      setInstanceSkills([]);
      return;
    }

    void loadInstanceSkills(selectedInstance.id);
  }, [canActivate, loadInstanceSkills, selectedInstance?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const instanceId = params.get('instance_id');
    if (instanceId && isLoggedIn) {
      void refreshInstance(instanceId);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    const instanceId = selectedInstance?.id;
    if (
      !instanceId ||
      !['qr_ready', 'scanned', 'ready_to_activate'].includes(
        selectedInstance.status
      )
    ) {
      return;
    }

    let stopped = false;
    const poll = async () => {
      await refreshInstance(instanceId);
      if (!stopped) window.setTimeout(poll, 2500);
    };

    const timer = window.setTimeout(poll, 2500);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [selectedInstance?.id, selectedInstance?.status]);

  const refreshInstance = async (instanceId: string) => {
    try {
      const response = await fetch(`/api/workers/instances/${instanceId}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.success && payload.instance) {
        setInstances((current) => upsertInstance(current, payload.instance));
      }
    } catch {
      // Last known state is good enough for the visible card.
    }
  };

  const activateWorkerInstance = async (instanceId: string) => {
    const response = await fetch(`/api/workers/instances/${instanceId}/activation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'zh' }),
    });
    const payload = (await response.json().catch(() => null)) as
      | WorkerActionResult
      | null;

    if (!payload || !response.ok || !payload.success) {
      setAction({
        success: false,
        code: payload?.code || 'ACTIVATION_FAILED',
        error: payload?.error || '生成微信激活二维码失败',
      });
      return null;
    }

    setAction(payload);
    await refreshInstance(instanceId);
    return payload;
  };

  const handleCompanion = async () => {
    if (!selectedEmployee) return;
    if (!isLoggedIn) {
      redirectToLogin();
      return;
    }

    setLoading(true);
    setAction(null);
    try {
      const response = await fetch('/api/workers/companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployee.id,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | WorkerActionResult
        | null;

      if (!payload || !response.ok || !payload.success) {
        setAction({
          success: false,
          code: payload?.code || 'COMPANION_CREATE_FAILED',
          error:
            payload?.error ||
            '启用长期陪伴者失败，请稍后重试',
        });
        return;
      }

      if (payload.instance) {
        setInstances((current) => upsertInstance(current, payload.instance!));
        setSelectedId(payload.instance.employeeId);
        await loadInstanceSkills(payload.instance.id);

        if (payload.instance.status === 'active') {
          setAction({
            success: true,
            message: '长期陪伴者已启用。微信身份和记忆会继续沿用当前独立 Profile。',
            profileName: payload.instance.profileName || null,
          });
          return;
        }

        await activateWorkerInstance(payload.instance.id);
        return;
      }

      setAction({
        success: true,
        message: '长期陪伴者已准备好。',
      });
    } catch {
      setAction({
        success: false,
        code: 'NETWORK_ERROR',
        error: '无法连接长期陪伴者接口，请稍后重试',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleActivation = async () => {
    if (!selectedInstance) return;
    if (!isLoggedIn) {
      redirectToLogin();
      return;
    }

    setLoading(true);
    setAction(null);
    try {
      await activateWorkerInstance(selectedInstance.id);
    } catch {
      setAction({
        success: false,
        code: 'NETWORK_ERROR',
        error: '无法连接激活接口，请稍后重试',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSkillToggle = async (
    skill: WorkerInstanceSkill,
    enabled: boolean
  ) => {
    if (!selectedInstance) return;

    setSkillUpdatingId(skill.id);
    setAction(null);
    try {
      const response = await fetch(
        `/api/workers/instances/${selectedInstance.id}/skills/${skill.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        }
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || '技能更新失败');
      }

      setInstanceSkills(Array.isArray(payload.skills) ? payload.skills : []);
      setAction({
        success: true,
        message: `${skill.name} 已${enabled ? '开启' : '关闭'}。如果微信已激活，点击“同步技能配置”即可生效，无需重新扫码。`,
      });
    } catch (err) {
      setAction({
        success: false,
        code: 'SKILL_UPDATE_FAILED',
        error: err instanceof Error ? err.message : '技能更新失败',
      });
    } finally {
      setSkillUpdatingId('');
    }
  };

  return (
    <section
      id="create"
      className="border-y border-slate-200 bg-white py-16 dark:border-white/10 dark:bg-neutral-950"
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <div>
          <div className="inline-flex items-center gap-2 border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/62">
            <Sparkles className="size-3.5" />
            开放测试
          </div>
          <h2 className="mt-4 text-3xl font-black tracking-normal text-slate-950 dark:text-white sm:text-4xl">
            一个长期陪伴者，按需学习不同技能
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600 dark:text-white/64">
            用户只看到一个独立陪伴者。下面这些是可学习的技能模块，网站负责登录、实例隔离、微信激活和技能同步。
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {employees.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-7 text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/62">
                还没有上架技能模块。管理员同步 one-worker-os 后，把准备好的模块设为 active，这里就会出现。
              </div>
            ) : null}

            {employees.map((employee) => {
              const active = employee.id === selectedEmployee?.id;
              const skills = employee.version?.skillsSummary || [];

              return (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(employee.id);
                    setAction(null);
                  }}
                  className={cn(
                    'group min-h-56 rounded-lg border bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-white/5',
                    active
                      ? 'border-slate-950 ring-2 ring-slate-950/8 dark:border-white dark:ring-white/15'
                      : 'border-slate-200 dark:border-white/10'
                  )}
                >
                  <div className="flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white">
                    <Bot className="size-5" />
                  </div>
                  <div className="mt-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-950 dark:text-white">
                        {getSkillModuleName(employee)}
                      </h3>
                      <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-white/48">
                        技能模块
                      </p>
                    </div>
                    {active ? (
                      <span className="rounded-md bg-slate-950 px-2 py-1 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">
                        已选技能
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-4 text-sm font-semibold leading-6 text-slate-800 dark:text-white/82">
                    {employee.responsibility}
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-white/58">
                    {employee.solvesProblem || employee.suitableTasks}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {skills.slice(0, 3).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 dark:border-white/10 dark:text-white/60"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-slate-200 bg-[#faf9f5] p-5 shadow-xl shadow-slate-950/5 dark:border-white/10 dark:bg-white/5 dark:shadow-black/20">
            {selectedEmployee ? (
              <>
                <div className="flex items-center gap-3 border-b border-slate-200 pb-4 dark:border-white/10">
                  <div className="flex size-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-neutral-950 dark:text-white">
                    <Bot className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500 dark:text-white/50">
                      当前陪伴者
                    </p>
                    <h3 className="text-xl font-black text-slate-950 dark:text-white">
                      {companionDisplayName}
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-white/48">
                      已选择：{getSkillModuleName(selectedEmployee)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-[180px_1fr] lg:grid-cols-1 xl:grid-cols-[180px_1fr]">
                  <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-950">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 dark:text-white/50">
                        {activated
                          ? '微信已激活'
                          : qrExpired
                            ? '二维码已过期'
                            : hasQr
                            ? '微信激活二维码'
                            : '开放测试状态'}
                      </span>
                      {activated ? (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      ) : (
                        <QrCode className="size-4 text-slate-500" />
                      )}
                    </div>

                    <div className="mt-4 flex aspect-square items-center justify-center bg-white p-3">
                      {activated ? (
                        <div className="flex h-full w-full flex-col items-center justify-center rounded-lg bg-emerald-50 text-center text-emerald-700">
                          <CheckCircle2 className="size-12" />
                          <div className="mt-3 text-sm font-bold">
                            激活成功
                          </div>
                          <div className="mt-1 px-3 text-xs leading-5">
                            独立 Profile 已运行
                          </div>
                        </div>
                      ) : qrExpired ? (
                        <div className="flex h-full w-full flex-col items-center justify-center rounded-lg bg-amber-50 p-4 text-center text-amber-800">
                          <RefreshCcw className="size-10" />
                          <div className="mt-3 text-sm font-bold">
                            二维码已过期
                          </div>
                          <div className="mt-1 text-xs leading-5">
                            重新生成后请尽快扫码确认
                          </div>
                        </div>
                      ) : qrImageUrl ? (
                        <img
                          src={qrImageUrl}
                          alt="微信激活二维码"
                          className="h-full w-full object-contain"
                        />
                      ) : hasQr ? (
                        <QRCode value={qrPayload} className="h-full w-full" />
                      ) : (
                        <div className="flex h-full w-full flex-col justify-center rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700 dark:bg-white/5 dark:text-white/70">
                          <div className="font-bold text-slate-950 dark:text-white">
                            {selectedInstance
                              ? statusText(selectedInstance.status)
                              : '尚未启用'}
                          </div>
                          <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-white/50">
                            登录后，可创建独立 Profile 并生成微信激活二维码。
                          </div>
                        </div>
                      )}
                    </div>

                    <p className="mt-3 text-center text-xs leading-5 text-slate-500 dark:text-white/48">
                      {activated
                        ? '现在可以在微信里使用独立陪伴者'
                        : qrExpired
                          ? '二维码过期后不会继续保留，请重新生成'
                          : hasQr
                          ? `请用客户微信扫码确认${
                              qrSecondsRemaining !== null
                                ? `，剩余 ${formatDuration(qrSecondsRemaining)}`
                                : ''
                            }`
                          : '启用后生成独立陪伴者实例'}
                    </p>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <h4 className="text-sm font-bold text-slate-950 dark:text-white">
                        当前技能方向
                      </h4>
                      <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-white/62">
                        {selectedEmployee.responsibility}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-950 dark:text-white">
                        能解决的问题
                      </h4>
                      <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-white/62">
                        {selectedEmployee.solvesProblem ||
                          selectedEmployee.suitableTasks}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-950 dark:text-white">
                        模块能力快照
                      </h4>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(selectedEmployee.version?.skillsSummary || []).length ? (
                          selectedEmployee.version?.skillsSummary.map((skill) => (
                            <span
                              key={skill}
                              className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
                            >
                              {skill}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-500 dark:text-white/50">
                            暂无公开技能摘要
                          </span>
                        )}
                      </div>
                    </div>

                    {selectedInstance ? (
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-sm font-bold text-slate-950 dark:text-white">
                            我的技能开关
                          </h4>
                          <SlidersHorizontal className="size-4 text-slate-500 dark:text-white/50" />
                        </div>
                        <div className="mt-3 space-y-2">
                          {instanceSkills.length ? (
                            instanceSkills.map((skill) => (
                              <div
                                key={skill.id}
                                className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-950"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-sm font-semibold text-slate-950 dark:text-white">
                                        {skill.name}
                                      </span>
                                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-white/60">
                                        {skillTypeText(skill.skillType)}
                                      </span>
                                      <span
                                        className={cn(
                                          'rounded-md px-2 py-0.5 text-[11px] font-semibold',
                                          skill.riskLevel === 'high' &&
                                            'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200',
                                          skill.riskLevel === 'medium' &&
                                            'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200',
                                          skill.riskLevel === 'low' &&
                                            'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'
                                        )}
                                      >
                                        {riskText(skill.riskLevel)}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-white/50">
                                      {skill.summary}
                                    </p>
                                  </div>
                                  <Switch
                                    checked={skill.enabled}
                                    disabled={skillUpdatingId === skill.id}
                                    onCheckedChange={(checked) =>
                                      handleSkillToggle(skill, checked)
                                    }
                                    aria-label={`${skill.name} 技能开关`}
                                  />
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500 dark:border-white/10 dark:text-white/50">
                              这个模块暂未分配可选技能。
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-950">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
                        <CircleDollarSign className="size-4" />
                        测试期权益
                      </div>
                      <div className="mt-3 text-lg font-black text-slate-950 dark:text-white">
                        当前直接开放
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-white/50">
                        当前不走计费。登录后可启用独立陪伴者，并打开知识库问答和技能开关。
                      </p>
                    </div>
                  </div>
                </div>

                {action ? (
                  <div
                    className={cn(
                      'mt-5 rounded-lg border px-4 py-3 text-sm leading-6',
                      action.success
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200'
                        : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200'
                    )}
                  >
                    <div className="font-semibold">
                      {action.success
                        ? action.message || '陪伴者已更新'
                        : action.error || '操作失败'}
                    </div>
                    {action.code ? (
                      <div className="mt-1 text-xs opacity-80">
                        Code：{action.code}
                      </div>
                    ) : null}
                    {action.profileName ? (
                      <div className="mt-1 text-xs opacity-80">
                        Profile：{action.profileName}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={canActivate ? handleActivation : handleCompanion}
                    disabled={loading || isCheckingSession || !selectedEmployee}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-white/90"
                  >
                    {isCheckingSession ? (
                      <>
                        <Clock3 className="size-4" />
                        检查登录状态
                      </>
                    ) : loading ? (
                      <>
                        <RefreshCcw className="size-4 animate-spin" />
                        处理中
                      </>
                    ) : !isLoggedIn ? (
                      '登录后启用陪伴者'
                    ) : canActivate ? (
                      <>
                        <ScanLine className="size-4" />
                        {activated
                          ? '同步技能配置'
                          : qrExpired
                          ? '重新生成二维码'
                          : hasQr
                            ? '刷新激活二维码'
                            : '生成激活二维码'}
                      </>
                    ) : (
                      <>
                        <BadgeCheck className="size-4" />
                        启用独立陪伴者
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={loadInstances}
                    disabled={!isLoggedIn || loading}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  >
                    <RefreshCcw className="size-4" />
                    刷新我的陪伴者
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/15 dark:text-white/50">
                等待管理员上架第一个技能模块。
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function getSkillModuleName(employee: WorkerCatalogEmployee) {
  return (
    employee.name
      .replace(/(数字员工|员工|教练|助手)$/u, '')
      .trim() || employee.name
  );
}

function upsertInstance(items: WorkerInstance[], item: WorkerInstance) {
  const index = items.findIndex((current) => current.id === item.id);
  if (index === -1) return [item, ...items];
  return items.map((current) => (current.id === item.id ? item : current));
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: currency || 'CNY',
  }).format((amount || 0) / 100);
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function statusText(status: string) {
  const copy: Record<string, string> = {
    pending_payment: '待启用',
    payment_failed: '启用失败',
    ready_to_activate: '待激活',
    qr_ready: '待扫码',
    scanned: '已扫码',
    activation_expired: '二维码已过期',
    activation_failed: '激活失败',
    active: '已激活',
    version_upgrade_pending_activation: '新版待重新激活',
  };

  return copy[status] || status;
}

function skillTypeText(type: string) {
  const copy: Record<string, string> = {
    config: '配置',
    data: '数据',
    tool: '工具',
  };

  return copy[type] || type;
}

function riskText(level: string) {
  const copy: Record<string, string> = {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
  };

  return copy[level] || level;
}
