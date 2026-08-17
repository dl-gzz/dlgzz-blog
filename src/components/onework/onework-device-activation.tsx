'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CheckCircle2, KeyRound, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type DeviceAuthorization = {
  eligible: boolean;
  clientId: string;
  clientName: string;
  scopes: string[];
  status: string;
  expiresAt: string;
};

function normalizeCode(value: string) {
  const raw = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

function errorMessage(value: unknown) {
  if (!value || typeof value !== 'object') return '设备授权暂时不可用';
  const record = value as Record<string, unknown>;
  return typeof record.error_description === 'string'
    ? record.error_description
    : '设备授权暂时不可用';
}

export function OneWorkDeviceActivation() {
  const [code, setCode] = useState('');
  const [authorization, setAuthorization] =
    useState<DeviceAuthorization | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [completed, setCompleted] = useState<'approved' | 'denied' | null>(
    null
  );
  const [error, setError] = useState('');

  const lookup = useCallback(async (value: string) => {
    const normalized = normalizeCode(value);
    if (normalized.replace('-', '').length !== 8) {
      setError('请输入 WorkBuddy 显示的 8 位授权码。');
      return;
    }
    setLoading(true);
    setError('');
    setAuthorization(null);
    try {
      const response = await fetch(
        `/api/onework/oauth/device/authorize?user_code=${encodeURIComponent(normalized)}`,
        { cache: 'no-store' }
      );
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(payload));
      const record = payload as { success?: boolean } & DeviceAuthorization;
      if (!record.success) throw new Error(errorMessage(payload));
      setAuthorization(record);
      setCode(normalized);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '设备授权码无效');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialCode = normalizeCode(
      new URLSearchParams(window.location.search).get('user_code') || ''
    );
    if (!initialCode) return;
    setCode(initialCode);
    void lookup(initialCode);
  }, [lookup]);

  async function decide(decision: 'approve' | 'deny') {
    setBusy(decision);
    setError('');
    try {
      const response = await fetch('/api/onework/oauth/device/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, user_code: code }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      const record = payload as { success?: boolean; status?: unknown };
      if (
        !response.ok ||
        !record.success ||
        typeof record.status !== 'string'
      ) {
        throw new Error(errorMessage(payload));
      }
      setCompleted(record.status === 'approved' ? 'approved' : 'denied');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '设备授权失败');
    } finally {
      setBusy(null);
    }
  }

  if (completed) {
    return (
      <Card className="mx-auto max-w-lg border-primary/20 text-center shadow-xl shadow-primary/5">
        <CardContent className="space-y-4 py-12">
          {completed === 'approved' ? (
            <CheckCircle2 className="mx-auto size-14 text-primary" />
          ) : (
            <XCircle className="mx-auto size-14 text-muted-foreground" />
          )}
          <h1 className="text-2xl font-bold">
            {completed === 'approved' ? '连接已授权' : '已拒绝连接'}
          </h1>
          <p className="text-muted-foreground">
            {completed === 'approved'
              ? '请回到 WorkBuddy，它会自动完成连接。你可以关闭本页。'
              : '没有任何 OneWorkOS 数据被授权给该客户端。'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg overflow-hidden border-primary/20 shadow-xl shadow-primary/5">
      <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <KeyRound className="size-6" />
        </div>
        <CardTitle className="text-2xl">连接 OneWorkOS</CardTitle>
        <CardDescription>
          输入 WorkBuddy 中显示的授权码。不需要复制 API Key。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(event) => setCode(normalizeCode(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void lookup(code);
            }}
            className="h-12 text-center font-mono text-xl tracking-[0.18em]"
            placeholder="ABCD-EFGH"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            maxLength={9}
          />
          <Button
            className="h-12"
            variant="secondary"
            disabled={loading}
            onClick={() => void lookup(code)}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : '继续'}
          </Button>
        </div>

        {authorization && (
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{authorization.clientName}</p>
                <p className="text-xs text-muted-foreground">
                  正在请求连接你的 OneWorkOS
                </p>
              </div>
              <Badge variant="secondary">
                {authorization.scopes.length} 项权限
              </Badge>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {authorization.scopes.map((scope) => (
                <li key={scope} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" />
                  {scope}
                </li>
              ))}
            </ul>
          </div>
        )}

        {authorization && !authorization.eligible && (
          <Alert variant="destructive">
            <AlertTitle>账号权益已过期或尚未开通</AlertTitle>
            <AlertDescription>
              <Link className="underline underline-offset-4" href="/onework">
                先去兑换或续费
              </Link>
            </AlertDescription>
          </Alert>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      {authorization && (
        <CardFooter className="grid grid-cols-2 gap-3 border-t bg-muted/20 py-5">
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => void decide('deny')}
          >
            {busy === 'deny' && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            拒绝
          </Button>
          <Button
            disabled={busy !== null || !authorization.eligible}
            onClick={() => void decide('approve')}
          >
            {busy === 'approve' && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            允许连接
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
