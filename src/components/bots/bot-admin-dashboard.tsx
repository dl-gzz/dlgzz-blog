'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { LocaleLink } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Routes } from '@/routes';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  PauseCircle,
  Plus,
  QrCode,
  RefreshCcw,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WorkerEmployee {
  id: string;
  name: string;
  responsibility: string;
  suitableTasks: string;
  solvesProblem: string;
  status: string;
  soulPath?: string | null;
  monthlyAmount: number;
  currency: string;
  latestVersionId?: string | null;
  updatedAt?: string | null;
  syncedAt?: string | null;
  version?: {
    id: string;
    skillsSummary: string[];
    soulHash: string;
    createdAt: string;
  } | null;
  skills?: WorkerEmployeeSkill[];
}

interface WorkerEmployeeSkill {
  id: string;
  name: string;
  summary: string;
  skillType: string;
  riskLevel: string;
  status: string;
  employeeSkill?: {
    status: string;
    defaultEnabled: boolean;
  };
}

interface WorkerSkill {
  id: string;
  name: string;
  summary: string;
  skillType: string;
  riskLevel: string;
  status: string;
  defaultEnabled: boolean;
  requiresUserConfig: boolean;
  employeeSkills?: Array<{
    employeeId: string;
    status: string;
    defaultEnabled: boolean;
  }>;
}

interface WorkerInstance {
  id: string;
  userId: string;
  employeeId: string;
  employeeVersionId: string;
  status: string;
  paymentStatus: string;
  profileName?: string | null;
  activationId?: string | null;
  gatewayStatus?: string | null;
  error?: string | null;
  activatedAt?: string | null;
  updatedAt?: string | null;
  employee?: {
    name: string;
  } | null;
}

export function BotAdminDashboard() {
  const [employees, setEmployees] = useState<WorkerEmployee[]>([]);
  const [instances, setInstances] = useState<WorkerInstance[]>([]);
  const [skills, setSkills] = useState<WorkerSkill[]>([]);
  const [skillDraft, setSkillDraft] = useState({
    id: '',
    name: '',
    summary: '',
    status: 'public',
    skillType: 'config',
    riskLevel: 'low',
    defaultEnabled: false,
  });
  const [employeeSkillSelection, setEmployeeSkillSelection] = useState<
    Record<string, string>
  >({});
  const [employeeSkillDefault, setEmployeeSkillDefault] = useState<
    Record<string, boolean>
  >({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingSkill, setSavingSkill] = useState(false);
  const [assigningKey, setAssigningKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const [employeesResponse, instancesResponse, skillsResponse] =
        await Promise.all([
        fetch('/api/admin/workers/employees', { cache: 'no-store' }),
        fetch('/api/admin/workers/instances', { cache: 'no-store' }),
          fetch('/api/admin/workers/skills', { cache: 'no-store' }),
        ]);
      const employeesPayload = await employeesResponse.json().catch(() => null);
      const instancesPayload = await instancesResponse.json().catch(() => null);
      const skillsPayload = await skillsResponse.json().catch(() => null);

      if (!employeesResponse.ok || !employeesPayload?.success) {
        throw new Error(employeesPayload?.error || '员工目录加载失败');
      }
      if (!instancesResponse.ok || !instancesPayload?.success) {
        throw new Error(instancesPayload?.error || '员工实例加载失败');
      }
      if (!skillsResponse.ok || !skillsPayload?.success) {
        throw new Error(skillsPayload?.error || '员工技能加载失败');
      }

      setEmployees(
        Array.isArray(employeesPayload.employees)
          ? employeesPayload.employees
          : []
      );
      setInstances(
        Array.isArray(instancesPayload.instances)
          ? instancesPayload.instances
          : []
      );
      setSkills(Array.isArray(skillsPayload.skills) ? skillsPayload.skills : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '员工后台加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const summary = useMemo(() => {
    return {
      employees: employees.length,
      activeEmployees: employees.filter((item) => item.status === 'active')
        .length,
      instances: instances.length,
      activeInstances: instances.filter((item) => item.status === 'active')
        .length,
      skills: skills.length,
      publicSkills: skills.filter((item) =>
        ['public', 'beta', 'internal'].includes(item.status)
      ).length,
      needsAttention: [
        ...employees.filter((item) => !item.latestVersionId),
        ...instances.filter((item) => item.error || item.status.includes('failed')),
      ].length,
    };
  }, [employees, instances, skills]);

  const syncEmployees = async () => {
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/workers/sync', { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || '员工同步失败');
      }

      setNotice(
        `同步完成：${payload.synced || 0} 个员工，${payload.skipped || 0} 个跳过`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '员工同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const updateEmployeeStatus = async (
    employee: WorkerEmployee,
    status: 'active' | 'paused' | 'draft'
  ) => {
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `/api/admin/workers/employees/${employee.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || '员工状态更新失败');
      }

      setNotice(`${employee.name} 已更新为 ${statusText(status)}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '员工状态更新失败');
    }
  };

  const createSkill = async () => {
    setSavingSkill(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/workers/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skillDraft),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || '技能创建失败');
      }

      setNotice(`技能 ${payload.skill?.name || skillDraft.name} 已创建`);
      setSkillDraft({
        id: '',
        name: '',
        summary: '',
        status: 'public',
        skillType: 'config',
        riskLevel: 'low',
        defaultEnabled: false,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '技能创建失败');
    } finally {
      setSavingSkill(false);
    }
  };

  const updateSkillStatus = async (skill: WorkerSkill, status: string) => {
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `/api/admin/workers/skills/${encodeURIComponent(skill.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || '技能状态更新失败');
      }

      setNotice(`${skill.name} 已更新为 ${skillStatusText(status)}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '技能状态更新失败');
    }
  };

  const assignSkill = async (employee: WorkerEmployee) => {
    const skillId = employeeSkillSelection[employee.id] || skills[0]?.id || '';
    if (!skillId) return;

    const key = `${employee.id}:${skillId}`;
    setAssigningKey(key);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `/api/admin/workers/employees/${encodeURIComponent(employee.id)}/skills`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skillId,
            status: 'allowed',
            defaultEnabled: Boolean(employeeSkillDefault[employee.id]),
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || '员工技能分配失败');
      }

      setNotice(`${employee.name} 已允许技能 ${skillId}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '员工技能分配失败');
    } finally {
      setAssigningKey('');
    }
  };

  return (
    <div className="space-y-4 px-4 lg:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            数字员工运营台
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            你只维护 one-worker-os 里的员工；这里负责同步、上架、雇佣实例和激活状态。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading || syncing}
            className="gap-2"
          >
            <RefreshCcw className={cn('size-4', loading && 'animate-spin')} />
            刷新
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={syncEmployees}
            disabled={syncing}
            className="gap-2"
          >
            <RefreshCcw className={cn('size-4', syncing && 'animate-spin')} />
            同步员工
          </Button>
          <Button asChild size="sm" variant="secondary" className="gap-2">
            <LocaleLink href={Routes.Bots}>
              <QrCode className="size-4" />
              前台市场
            </LocaleLink>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {notice ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          icon={Bot}
          label="员工总数"
          value={summary.employees}
          detail="同步到平台的员工"
        />
        <MetricCard
          icon={Rocket}
          label="已上架"
          value={summary.activeEmployees}
          detail="用户可雇佣"
          tone="green"
        />
        <MetricCard
          icon={UserRound}
          label="雇佣实例"
          value={summary.instances}
          detail="用户创建的员工实例"
          tone="blue"
        />
        <MetricCard
          icon={ShieldCheck}
          label="已激活"
          value={summary.activeInstances}
          detail="微信扫码成功"
          tone="green"
        />
        <MetricCard
          icon={SlidersHorizontal}
          label="技能库"
          value={summary.skills}
          detail={`${summary.publicSkills} 个可分配`}
          tone="blue"
        />
        <MetricCard
          icon={AlertTriangle}
          label="需处理"
          value={summary.needsAttention}
          detail="缺灵魂或异常"
          tone="red"
        />
      </div>

      <Card className="rounded-lg">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle className="text-base font-semibold">技能库</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 lg:grid-cols-[160px_180px_1fr_120px_120px_120px_auto]">
            <Input
              value={skillDraft.id}
              onChange={(event) =>
                setSkillDraft((current) => ({
                  ...current,
                  id: event.target.value,
                }))
              }
              placeholder="skill_design"
              className="h-10"
            />
            <Input
              value={skillDraft.name}
              onChange={(event) =>
                setSkillDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="技能名称"
              className="h-10"
            />
            <Textarea
              value={skillDraft.summary}
              onChange={(event) =>
                setSkillDraft((current) => ({
                  ...current,
                  summary: event.target.value,
                }))
              }
              placeholder="这个技能能强化员工的哪一项专业能力"
              className="min-h-10 resize-none"
            />
            <select
              value={skillDraft.skillType}
              onChange={(event) =>
                setSkillDraft((current) => ({
                  ...current,
                  skillType: event.target.value,
                }))
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="config">配置</option>
              <option value="data">数据</option>
              <option value="tool">工具</option>
            </select>
            <select
              value={skillDraft.riskLevel}
              onChange={(event) =>
                setSkillDraft((current) => ({
                  ...current,
                  riskLevel: event.target.value,
                }))
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="low">低风险</option>
              <option value="medium">中风险</option>
              <option value="high">高风险</option>
            </select>
            <select
              value={skillDraft.status}
              onChange={(event) =>
                setSkillDraft((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="public">公开</option>
              <option value="beta">灰度</option>
              <option value="internal">内部</option>
              <option value="draft">草稿</option>
            </select>
            <Button
              type="button"
              onClick={createSkill}
              disabled={savingSkill || !skillDraft.name || !skillDraft.summary}
              className="h-10 gap-2"
            >
              <Plus className="size-4" />
              新建
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {skills.length ? (
              skills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{skill.name}</span>
                      <Badge variant="outline" className="rounded-md">
                        {skillStatusText(skill.status)}
                      </Badge>
                    </div>
                    <div className="mt-1 max-w-[360px] truncate text-xs text-muted-foreground">
                      {skill.summary}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      updateSkillStatus(
                        skill,
                        skill.status === 'paused' ? 'public' : 'paused'
                      )
                    }
                  >
                    {skill.status === 'paused' ? '启用' : '暂停'}
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">
                还没有技能。先创建一个专业技能，再分配给员工。
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-lg">
        <CardHeader className="flex flex-row items-center justify-between border-b px-4 py-3">
          <CardTitle className="text-base font-semibold">员工目录</CardTitle>
          <span className="text-xs text-muted-foreground">
            灵魂文档由你维护，平台只同步快照
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="min-w-[220px] px-4">员工</TableHead>
                <TableHead className="min-w-[260px]">职责</TableHead>
                <TableHead className="min-w-[180px]">灵魂文档</TableHead>
                <TableHead className="min-w-[180px]">技能快照</TableHead>
                <TableHead className="min-w-[280px]">可控技能</TableHead>
                <TableHead className="min-w-[120px]">状态</TableHead>
                <TableHead className="min-w-[180px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-28 text-center">
                    正在读取员工目录...
                  </TableCell>
                </TableRow>
              ) : null}

              {!loading && employees.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-28 text-center text-muted-foreground"
                  >
                    暂无员工。点击“同步员工”从 one-worker-os 导入。
                  </TableCell>
                </TableRow>
              ) : null}

              {employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="px-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{employee.name}</span>
                      <code className="text-xs text-muted-foreground">
                        {employee.id}
                      </code>
                      <span className="text-xs text-muted-foreground">
                        {formatMoney(employee.monthlyAmount, employee.currency)}
                        /月
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="line-clamp-3 text-sm text-muted-foreground">
                      {employee.responsibility || employee.suitableTasks}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-[240px] flex-col gap-1">
                      {employee.latestVersionId ? (
                        <Badge className="w-fit rounded-md bg-emerald-600 hover:bg-emerald-600">
                          已有版本
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="w-fit rounded-md border-amber-200 bg-amber-50 text-amber-700"
                        >
                          缺少灵魂
                        </Badge>
                      )}
                      <code className="truncate text-xs text-muted-foreground">
                        {employee.soulPath || '-'}
                      </code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-[260px] flex-wrap gap-1">
                      {(employee.version?.skillsSummary || []).slice(0, 4).map((skill) => (
                        <Badge
                          key={skill}
                          variant="outline"
                          className="rounded-md"
                        >
                          {skill}
                        </Badge>
                      ))}
                      {!(employee.version?.skillsSummary || []).length ? (
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <div className="flex max-w-[280px] flex-wrap gap-1">
                        {(employee.skills || []).slice(0, 4).map((skill) => (
                          <Badge
                            key={skill.id}
                            variant="outline"
                            className="rounded-md"
                          >
                            {skill.name}
                            {skill.employeeSkill?.defaultEnabled ? ' 默认' : ''}
                          </Badge>
                        ))}
                        {!(employee.skills || []).length ? (
                          <span className="text-xs text-muted-foreground">
                            未分配
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={
                            employeeSkillSelection[employee.id] ||
                            skills[0]?.id ||
                            ''
                          }
                          onChange={(event) =>
                            setEmployeeSkillSelection((current) => ({
                              ...current,
                              [employee.id]: event.target.value,
                            }))
                          }
                          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                          disabled={!skills.length}
                        >
                          {skills.map((skill) => (
                            <option key={skill.id} value={skill.id}>
                              {skill.name}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Switch
                            checked={Boolean(employeeSkillDefault[employee.id])}
                            onCheckedChange={(checked) =>
                              setEmployeeSkillDefault((current) => ({
                                ...current,
                                [employee.id]: checked,
                              }))
                            }
                            aria-label={`${employee.name} 默认开启技能`}
                          />
                          默认
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            !skills.length ||
                            assigningKey ===
                              `${employee.id}:${
                                employeeSkillSelection[employee.id] ||
                                skills[0]?.id ||
                                ''
                              }`
                          }
                          onClick={() => assignSkill(employee)}
                        >
                          允许
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <EmployeeStatusBadge status={employee.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {employee.status === 'active' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => updateEmployeeStatus(employee, 'paused')}
                        >
                          <PauseCircle className="size-3.5" />
                          暂停
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1"
                          disabled={!employee.latestVersionId}
                          onClick={() => updateEmployeeStatus(employee, 'active')}
                        >
                          <Rocket className="size-3.5" />
                          上架
                        </Button>
                      )}
                      {employee.status !== 'draft' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => updateEmployeeStatus(employee, 'draft')}
                        >
                          草稿
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-lg">
        <CardHeader className="flex flex-row items-center justify-between border-b px-4 py-3">
          <CardTitle className="text-base font-semibold">雇佣实例</CardTitle>
          <span className="text-xs text-muted-foreground">
            用户只拥有自己的实例，记忆和微信绑定独立隔离
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="min-w-[220px] px-4">实例</TableHead>
                <TableHead className="min-w-[140px]">用户</TableHead>
                <TableHead className="min-w-[150px]">付款</TableHead>
                <TableHead className="min-w-[150px]">激活</TableHead>
                <TableHead className="min-w-[180px]">Hermes</TableHead>
                <TableHead className="min-w-[220px]">异常</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-28 text-center text-muted-foreground"
                  >
                    暂无雇佣实例
                  </TableCell>
                </TableRow>
              ) : null}

              {instances.map((instance) => (
                <TableRow key={instance.id}>
                  <TableCell className="px-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">
                        {instance.employee?.name || instance.employeeId}
                      </span>
                      <code className="max-w-[260px] truncate text-xs text-muted-foreground">
                        {instance.id}
                      </code>
                      <code className="max-w-[260px] truncate text-xs text-muted-foreground">
                        {instance.employeeVersionId}
                      </code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="max-w-[140px] truncate text-xs">
                      {instance.userId || '-'}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-md">
                      {instance.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <InstanceStatusBadge status={instance.status} />
                      <span className="text-xs text-muted-foreground">
                        {formatTime(instance.activatedAt || instance.updatedAt)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs">
                      <span>{instance.gatewayStatus || '-'}</span>
                      <code className="max-w-[180px] truncate text-muted-foreground">
                        {instance.profileName || instance.activationId || '-'}
                      </code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-[320px] truncate text-xs text-muted-foreground">
                      {instance.error || '-'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'slate',
}: {
  icon: typeof Bot;
  label: string;
  value?: number;
  detail: string;
  tone?: 'slate' | 'green' | 'blue' | 'amber' | 'red';
}) {
  return (
    <Card className="rounded-lg">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-muted-foreground">
              {label}
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-normal">
              {value ?? 0}
            </div>
          </div>
          <div
            className={cn(
              'flex size-9 items-center justify-center rounded-lg border',
              tone === 'green' &&
                'border-emerald-200 bg-emerald-50 text-emerald-700',
              tone === 'blue' && 'border-sky-200 bg-sky-50 text-sky-700',
              tone === 'amber' &&
                'border-amber-200 bg-amber-50 text-amber-700',
              tone === 'red' && 'border-red-200 bg-red-50 text-red-700',
              tone === 'slate' && 'border-border bg-muted text-foreground'
            )}
          >
            <Icon className="size-4" />
          </div>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

function EmployeeStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={status === 'active' ? 'default' : 'outline'}
      className={cn(
        'w-fit rounded-md',
        status === 'active' && 'bg-emerald-600 hover:bg-emerald-600',
        status === 'paused' && 'border-amber-200 bg-amber-50 text-amber-700'
      )}
    >
      {statusText(status)}
    </Badge>
  );
}

function InstanceStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'w-fit rounded-md',
        status === 'active' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        status.includes('failed') && 'border-red-200 bg-red-50 text-red-700',
        status.includes('expired') && 'border-amber-200 bg-amber-50 text-amber-700'
      )}
    >
      {statusText(status)}
    </Badge>
  );
}

function statusText(status: string) {
  const copy: Record<string, string> = {
    draft: '草稿',
    active: '已上架',
    paused: '已暂停',
    pending_payment: '待付款',
    payment_failed: '付款失败',
    ready_to_activate: '待激活',
    qr_ready: '待扫码',
    scanned: '已扫码',
    activation_expired: '二维码过期',
    activation_failed: '激活失败',
    version_upgrade_pending_activation: '新版待激活',
  };

  return copy[status] || status;
}

function skillStatusText(status: string) {
  const copy: Record<string, string> = {
    draft: '草稿',
    public: '公开',
    beta: '灰度',
    internal: '内部',
    paused: '暂停',
  };

  return copy[status] || status;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: currency || 'CNY',
  }).format((amount || 0) / 100);
}

function formatTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
