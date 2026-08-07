'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bot,
  CalendarClock,
  Droplets,
  HeartPulse,
  RefreshCw,
  Save,
  Scale,
  ShieldCheck,
  TestTube2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

interface HealthProfile {
  id: string;
  hermesAssistantId?: string | null;
  hermesActivationId?: string | null;
  hermesProfileName?: string | null;
  hermesConnectionMode?: string | null;
  hermesStatus: string;
}

interface HealthMeasurement {
  id: string;
  measuredAt: string;
  systolic?: number | null;
  diastolic?: number | null;
  heartRate?: number | null;
  fastingGlucoseMmol?: string | null;
  postprandialGlucoseMmol?: string | null;
  totalCholesterolMmol?: string | null;
  triglyceridesMmol?: string | null;
  hdlMmol?: string | null;
  ldlMmol?: string | null;
  weightKg?: string | null;
  waistCm?: string | null;
  notes?: string | null;
}

interface HealthSummary {
  totalRecords: number;
  latestMeasuredAt?: string | null;
  bloodPressure?: {
    measuredAt: string;
    systolic?: number | null;
    diastolic?: number | null;
    heartRate?: number | null;
  } | null;
  glucose?: {
    measuredAt: string;
    fastingGlucoseMmol?: string | null;
    postprandialGlucoseMmol?: string | null;
  } | null;
  lipids?: {
    measuredAt: string;
    totalCholesterolMmol?: string | null;
    triglyceridesMmol?: string | null;
    hdlMmol?: string | null;
    ldlMmol?: string | null;
  } | null;
  weight?: {
    measuredAt: string;
    weightKg?: string | null;
    waistCm?: string | null;
  } | null;
}

interface HealthDashboardData {
  profile: HealthProfile;
  measurements: HealthMeasurement[];
  summary: HealthSummary;
}

interface HealthDashboardProps {
  initialDashboard: HealthDashboardData | null;
}

type FormField =
  | 'measuredAt'
  | 'systolic'
  | 'diastolic'
  | 'heartRate'
  | 'fastingGlucoseMmol'
  | 'postprandialGlucoseMmol'
  | 'totalCholesterolMmol'
  | 'triglyceridesMmol'
  | 'hdlMmol'
  | 'ldlMmol'
  | 'weightKg'
  | 'waistCm'
  | 'notes';

type HealthForm = Record<FormField, string>;

const EMPTY_VALUE = '-';

function createEmptyForm(): HealthForm {
  return {
    measuredAt: toDateTimeLocal(new Date()),
    systolic: '',
    diastolic: '',
    heartRate: '',
    fastingGlucoseMmol: '',
    postprandialGlucoseMmol: '',
    totalCholesterolMmol: '',
    triglyceridesMmol: '',
    hdlMmol: '',
    ldlMmol: '',
    weightKg: '',
    waistCm: '',
    notes: '',
  };
}

export function HealthDashboard({ initialDashboard }: HealthDashboardProps) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [form, setForm] = useState<HealthForm>(() => createEmptyForm());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const summary = dashboard?.summary;
  const profile = dashboard?.profile;
  const measurements = dashboard?.measurements || [];
  const assistantStatus = profile?.hermesStatus || 'not_connected';

  const assistantLabel = useMemo(() => {
    if (assistantStatus === 'active') return '已连接';
    if (assistantStatus === 'failed') return '连接失败';
    return '未连接';
  }, [assistantStatus]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/health/records', {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || '三高数据读取失败');
      }
      setDashboard({
        profile: payload.profile,
        measurements: payload.measurements,
        summary: payload.summary,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '三高数据读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/health/records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || '三高记录保存失败');
      }

      setDashboard({
        profile: payload.profile,
        measurements: payload.measurements,
        summary: payload.summary,
      });
      setForm(createEmptyForm());
      setNotice('已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '三高记录保存失败');
    } finally {
      setSaving(false);
    }
  };

  const connectAssistant = async () => {
    setConnecting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/health/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locale: 'zh' }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Hermes 连接失败');
      }
      setNotice(payload.message || '三高健康管家已连接');
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hermes 连接失败');
    } finally {
      setConnecting(false);
    }
  };

  const updateForm = (field: FormField, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={HeartPulse}
            label="血压"
            value={formatBloodPressure(summary)}
            detail={formatMeasuredAt(summary?.bloodPressure?.measuredAt)}
            tone="rose"
          />
          <MetricCard
            icon={Droplets}
            label="血糖"
            value={formatGlucose(summary)}
            detail={formatMeasuredAt(summary?.glucose?.measuredAt)}
            tone="amber"
          />
          <MetricCard
            icon={TestTube2}
            label="血脂"
            value={formatLipids(summary)}
            detail={formatMeasuredAt(summary?.lipids?.measuredAt)}
            tone="sky"
          />
          <MetricCard
            icon={Bot}
            label="健康管家"
            value={assistantLabel}
            detail={profile?.hermesProfileName || '浏览器 Profile'}
            tone={assistantStatus === 'active' ? 'emerald' : 'slate'}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <section className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-base">录入记录</h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  仅保存个人健康数据，不替代医生诊断。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadDashboard}
                  disabled={loading}
                >
                  <RefreshCw
                    className={cn('size-4', loading && 'animate-spin')}
                  />
                  刷新
                </Button>
              </div>
            </div>

            <form onSubmit={saveRecord} className="grid gap-5 p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="记录时间">
                  <Input
                    type="datetime-local"
                    value={form.measuredAt}
                    onChange={(event) =>
                      updateForm('measuredAt', event.target.value)
                    }
                  />
                </Field>
                <Field label="收缩压 mmHg">
                  <Input
                    inputMode="numeric"
                    value={form.systolic}
                    onChange={(event) =>
                      updateForm('systolic', event.target.value)
                    }
                    placeholder="128"
                  />
                </Field>
                <Field label="舒张压 mmHg">
                  <Input
                    inputMode="numeric"
                    value={form.diastolic}
                    onChange={(event) =>
                      updateForm('diastolic', event.target.value)
                    }
                    placeholder="82"
                  />
                </Field>
                <Field label="心率 bpm">
                  <Input
                    inputMode="numeric"
                    value={form.heartRate}
                    onChange={(event) =>
                      updateForm('heartRate', event.target.value)
                    }
                    placeholder="72"
                  />
                </Field>
                <Field label="空腹血糖 mmol/L">
                  <Input
                    inputMode="decimal"
                    value={form.fastingGlucoseMmol}
                    onChange={(event) =>
                      updateForm('fastingGlucoseMmol', event.target.value)
                    }
                    placeholder="6.10"
                  />
                </Field>
                <Field label="餐后血糖 mmol/L">
                  <Input
                    inputMode="decimal"
                    value={form.postprandialGlucoseMmol}
                    onChange={(event) =>
                      updateForm('postprandialGlucoseMmol', event.target.value)
                    }
                    placeholder="8.20"
                  />
                </Field>
                <Field label="LDL-C mmol/L">
                  <Input
                    inputMode="decimal"
                    value={form.ldlMmol}
                    onChange={(event) =>
                      updateForm('ldlMmol', event.target.value)
                    }
                    placeholder="2.60"
                  />
                </Field>
                <Field label="甘油三酯 mmol/L">
                  <Input
                    inputMode="decimal"
                    value={form.triglyceridesMmol}
                    onChange={(event) =>
                      updateForm('triglyceridesMmol', event.target.value)
                    }
                    placeholder="1.50"
                  />
                </Field>
                <Field label="总胆固醇 mmol/L">
                  <Input
                    inputMode="decimal"
                    value={form.totalCholesterolMmol}
                    onChange={(event) =>
                      updateForm('totalCholesterolMmol', event.target.value)
                    }
                    placeholder="4.80"
                  />
                </Field>
                <Field label="HDL-C mmol/L">
                  <Input
                    inputMode="decimal"
                    value={form.hdlMmol}
                    onChange={(event) =>
                      updateForm('hdlMmol', event.target.value)
                    }
                    placeholder="1.20"
                  />
                </Field>
                <Field label="体重 kg">
                  <Input
                    inputMode="decimal"
                    value={form.weightKg}
                    onChange={(event) =>
                      updateForm('weightKg', event.target.value)
                    }
                    placeholder="68.5"
                  />
                </Field>
                <Field label="腰围 cm">
                  <Input
                    inputMode="decimal"
                    value={form.waistCm}
                    onChange={(event) =>
                      updateForm('waistCm', event.target.value)
                    }
                    placeholder="84"
                  />
                </Field>
              </div>

              <Field label="备注">
                <Textarea
                  value={form.notes}
                  onChange={(event) => updateForm('notes', event.target.value)}
                  className="min-h-20 resize-none"
                  placeholder="用药、饮食、运动或测量场景"
                />
              </Field>

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-h-5 text-sm">
                  {error ? (
                    <span className="text-destructive">{error}</span>
                  ) : notice ? (
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {notice}
                    </span>
                  ) : null}
                </div>
                <Button type="submit" disabled={saving}>
                  <Save className="size-4" />
                  {saving ? '保存中' : '保存记录'}
                </Button>
              </div>
            </form>
          </section>

          <section className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-4">
              <div>
                <h2 className="font-semibold text-base">Hermes 连接</h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  每个用户一个独立浏览器 Profile。
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0',
                  assistantStatus === 'active' &&
                    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200',
                  assistantStatus === 'failed' &&
                    'border-destructive/30 bg-destructive/10 text-destructive'
                )}
              >
                {assistantLabel}
              </Badge>
            </div>
            <div className="grid gap-4 p-4">
              <StatusLine
                icon={ShieldCheck}
                label="隔离方式"
                value={profile?.hermesConnectionMode || 'browser_profile'}
              />
              <StatusLine
                icon={Activity}
                label="Profile"
                value={profile?.hermesProfileName || EMPTY_VALUE}
              />
              <StatusLine
                icon={CalendarClock}
                label="最近记录"
                value={formatMeasuredAt(summary?.latestMeasuredAt)}
              />
              <StatusLine
                icon={Scale}
                label="记录数量"
                value={`${summary?.totalRecords || 0} 条`}
              />
              <Button
                type="button"
                variant={assistantStatus === 'active' ? 'outline' : 'default'}
                onClick={connectAssistant}
                disabled={connecting}
              >
                <Bot className="size-4" />
                {connecting
                  ? '连接中'
                  : assistantStatus === 'active'
                    ? '检查连接'
                    : '连接健康管家'}
              </Button>
            </div>
          </section>
        </div>

        <section className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-4">
            <h2 className="font-semibold text-base">最近记录</h2>
            <Badge variant="secondary">{measurements.length} 条</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>血压</TableHead>
                <TableHead>血糖</TableHead>
                <TableHead>血脂</TableHead>
                <TableHead>体重/腰围</TableHead>
                <TableHead className="min-w-48">备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {measurements.length ? (
                measurements.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{formatMeasuredAt(record.measuredAt)}</TableCell>
                    <TableCell>{formatBloodPressureRecord(record)}</TableCell>
                    <TableCell>{formatGlucoseRecord(record)}</TableCell>
                    <TableCell>{formatLipidsRecord(record)}</TableCell>
                    <TableCell>{formatWeightRecord(record)}</TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {record.notes || EMPTY_VALUE}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    暂无记录
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: 'rose' | 'amber' | 'sky' | 'emerald' | 'slate';
}) {
  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span
          className={cn(
            'flex size-9 items-center justify-center rounded-md border',
            tone === 'rose' &&
              'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200',
            tone === 'amber' &&
              'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200',
            tone === 'sky' &&
              'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200',
            tone === 'emerald' &&
              'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200',
            tone === 'slate' &&
              'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70'
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-4 truncate font-semibold text-2xl">{value}</div>
      <div className="mt-1 truncate text-muted-foreground text-xs">
        {detail || EMPTY_VALUE}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StatusLine({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-3">
      <Icon className="size-4 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="truncate font-medium text-sm">{value}</div>
      </div>
    </div>
  );
}

function formatBloodPressure(summary?: HealthSummary | null) {
  const item = summary?.bloodPressure;
  if (!item?.systolic && !item?.diastolic) return EMPTY_VALUE;
  return `${item.systolic || EMPTY_VALUE}/${item.diastolic || EMPTY_VALUE}`;
}

function formatGlucose(summary?: HealthSummary | null) {
  const item = summary?.glucose;
  if (!item?.fastingGlucoseMmol && !item?.postprandialGlucoseMmol) {
    return EMPTY_VALUE;
  }
  return item.fastingGlucoseMmol
    ? `${item.fastingGlucoseMmol} 空腹`
    : `${item.postprandialGlucoseMmol} 餐后`;
}

function formatLipids(summary?: HealthSummary | null) {
  const item = summary?.lipids;
  if (!item?.ldlMmol && !item?.triglyceridesMmol) return EMPTY_VALUE;
  return item.ldlMmol ? `LDL ${item.ldlMmol}` : `TG ${item.triglyceridesMmol}`;
}

function formatBloodPressureRecord(record: HealthMeasurement) {
  if (!record.systolic && !record.diastolic) return EMPTY_VALUE;
  const heartRate = record.heartRate ? ` / ${record.heartRate} bpm` : '';
  return `${record.systolic || EMPTY_VALUE}/${record.diastolic || EMPTY_VALUE}${heartRate}`;
}

function formatGlucoseRecord(record: HealthMeasurement) {
  const values = [
    record.fastingGlucoseMmol ? `空腹 ${record.fastingGlucoseMmol}` : '',
    record.postprandialGlucoseMmol
      ? `餐后 ${record.postprandialGlucoseMmol}`
      : '',
  ].filter(Boolean);
  return values.length ? values.join(' / ') : EMPTY_VALUE;
}

function formatLipidsRecord(record: HealthMeasurement) {
  const values = [
    record.ldlMmol ? `LDL ${record.ldlMmol}` : '',
    record.triglyceridesMmol ? `TG ${record.triglyceridesMmol}` : '',
    record.totalCholesterolMmol ? `TC ${record.totalCholesterolMmol}` : '',
    record.hdlMmol ? `HDL ${record.hdlMmol}` : '',
  ].filter(Boolean);
  return values.length ? values.join(' / ') : EMPTY_VALUE;
}

function formatWeightRecord(record: HealthMeasurement) {
  const values = [
    record.weightKg ? `${record.weightKg} kg` : '',
    record.waistCm ? `${record.waistCm} cm` : '',
  ].filter(Boolean);
  return values.length ? values.join(' / ') : EMPTY_VALUE;
}

function formatMeasuredAt(value?: string | null) {
  if (!value) return EMPTY_VALUE;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function toDateTimeLocal(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
