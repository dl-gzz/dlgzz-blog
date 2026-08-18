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
import {
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type ConsentData = {
  eligible: boolean;
  client: { id: string; name: string; dynamicallyRegistered: boolean };
  scopes: string[];
  redirectUri: string;
  resource: string;
  user: { id: string; name: string; email: string };
};

const SCOPE_LABELS: Record<string, { title: string; description: string }> = {
  'onework:resolve': {
    title: '理解任务并选择能力',
    description: '判断你想做什么，并选择合适的 OneWorkOS 路径。',
  },
  'onework:knowledge': {
    title: '检索 OneWorkOS 知识库',
    description: '查找 WorkBuddy、小红书等图文教程、官方出处与视频资源。',
  },
  'onework:analytics': {
    title: '查询受控数据指标',
    description: '根据 OneWorkOS 已注册的语义模型查询数据，不执行任意 SQL。',
  },
  'onework:account': {
    title: '查看权益与用量',
    description: '读取当前账号的知识包权益、本月额度和剩余次数。',
  },
};

function errorMessage(value: unknown) {
  if (!value || typeof value !== 'object') return '授权服务暂时不可用';
  const record = value as Record<string, unknown>;
  return typeof record.error_description === 'string'
    ? record.error_description
    : '授权服务暂时不可用';
}

export function OneWorkOAuthConsent() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<ConsentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const authorizationQuery = window.location.search;
    setQuery(authorizationQuery);
    const controller = new AbortController();
    void fetch(`/api/onework/oauth/authorize${authorizationQuery}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorMessage(payload));
        const record = payload as { success?: boolean } & ConsentData;
        if (!record.success) throw new Error(errorMessage(payload));
        setData(record);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError')
          return;
        setError(reason instanceof Error ? reason.message : '授权请求无效');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function decide(decision: 'approve' | 'deny') {
    setBusy(decision);
    setError('');
    try {
      const response = await fetch('/api/onework/oauth/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision,
          authorization_query: query,
        }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      const record = payload as {
        success?: boolean;
        redirectTo?: unknown;
      };
      if (
        !response.ok ||
        !record.success ||
        typeof record.redirectTo !== 'string'
      ) {
        throw new Error(errorMessage(payload));
      }
      window.location.assign(record.redirectTo);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '授权失败，请重试');
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex min-h-72 items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          正在校验连接请求…
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-xl">
        <XCircle className="size-4" />
        <AlertTitle>无法连接 OneWorkOS</AlertTitle>
        <AlertDescription>{error || '授权请求无效或已过期。'}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="mx-auto max-w-xl overflow-hidden border-primary/20 shadow-xl shadow-primary/5">
      <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
          <ShieldCheck className="size-6" />
        </div>
        <CardTitle className="text-2xl">连接 {data.client.name}</CardTitle>
        <CardDescription>
          使用{' '}
          <span className="font-medium text-foreground">{data.user.email}</span>{' '}
          连接 OneWorkOS。你可以随时在账号中撤销授权。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        {!data.eligible && (
          <Alert variant="destructive">
            <AlertTitle>当前账号没有有效权益</AlertTitle>
            <AlertDescription>
              请先兑换或续费 OneWorkOS，然后回到本页继续。{' '}
              <Link className="underline underline-offset-4" href="/onework">
                前往权益页
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {data.client.dynamicallyRegistered && (
          <Alert
            variant="destructive"
            className="border-amber-500/60 bg-amber-500/10 text-foreground [&>svg]:text-amber-600"
          >
            <ShieldAlert className="size-4" />
            <AlertTitle>未验证的动态客户端</AlertTitle>
            <AlertDescription>
              OneWorkOS 没有审核这个客户端的发布者。只有在你主动发起连接，
              并确认下方返回地址属于你正在使用的应用时才允许。
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">将允许以下能力</h2>
            <Badge variant="secondary">{data.scopes.length} 项</Badge>
          </div>
          <div className="space-y-2">
            {data.scopes.map((scope) => {
              const label = SCOPE_LABELS[scope] ?? {
                title: scope,
                description: '由 OneWorkOS 管理的授权范围。',
              };
              return (
                <div
                  key={scope}
                  className="flex gap-3 rounded-xl border bg-muted/30 p-3"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{label.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      {label.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="break-all rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          完成后返回：{data.redirectUri}
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="grid grid-cols-2 gap-3 border-t bg-muted/20 py-5">
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() => void decide('deny')}
        >
          {busy === 'deny' && <Loader2 className="mr-2 size-4 animate-spin" />}
          拒绝
        </Button>
        <Button
          disabled={busy !== null || !data.eligible}
          onClick={() => void decide('approve')}
        >
          {busy === 'approve' && (
            <Loader2 className="mr-2 size-4 animate-spin" />
          )}
          允许连接
        </Button>
      </CardFooter>
    </Card>
  );
}
