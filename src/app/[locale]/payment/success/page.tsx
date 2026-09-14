'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type OrderInfo = { amount: number; interval: string; planName?: string };
export default function PaymentSuccessPage() {
  const params = useSearchParams();
  const aoid = params.get('aoid');
  const [state, setState] = useState<
    'checking' | 'success' | 'pending' | 'error'
  >('checking');
  const [message, setMessage] = useState('');
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    setState('checking');
    setOrder(null);
    setAuthRequired(false);
    if (!aoid) {
      setState('error');
      setMessage('缺少订单号，无法确认付款结果。');
      clearTimeout(timeout);
      return;
    }
    fetch('/api/xorpay/check-status?aoid=' + encodeURIComponent(aoid), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!alive) return;
        if (!response.ok) {
          setAuthRequired(response.status === 401);
          throw new Error(
            response.status === 401
              ? '请重新登录后查看此订单。'
              : data.error || data.message || '订单查询失败'
          );
        }
        if (data.status === 'completed') {
          setOrder(data.data);
          setState('success');
          setMessage(
            '付款和会员权益发放已确认。网站与已关联的小程序共享会员身份。'
          );
        } else {
          setState('pending');
          setMessage(
            '尚未确认付款或权益仍在处理中。若已经扣款，请稍后重查，不要重复付款。'
          );
        }
      })
      .catch((reason) => {
        if (!alive) return;
        setState('error');
        setMessage(
          controller.signal.aborted
            ? '查询超时，请重新查询。'
            : reason instanceof Error
              ? reason.message
              : '查询失败，请重试'
        );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [aoid, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-lg space-y-5 rounded-2xl border bg-background p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">
          {state === 'success'
            ? '支付成功'
            : state === 'checking'
              ? '正在核验付款'
              : '付款尚未确认'}
        </h1>
        <p role={state === 'error' ? 'alert' : 'status'}>
          {state === 'checking' ? '正在查询订单及权益发放结果…' : message}
        </p>
        {state === 'success' && order && (
          <div className="space-y-2 rounded-lg bg-muted p-4">
            <p className="break-all text-sm">订单号：{aoid}</p>
            <p>会员方案：{order.planName || '会员'}</p>
            <p>金额：¥{(order.amount / 100).toFixed(2)}</p>
          </div>
        )}
        {state !== 'success' && aoid && (
          <button
            disabled={state === 'checking'}
            className="rounded-lg bg-primary px-4 py-3 text-primary-foreground disabled:opacity-60"
            onClick={retry}
          >
            重新查询
          </button>
        )}
        {authRequired && (
          <a
            className="block underline"
            href={
              '/auth/login?callbackUrl=' +
              encodeURIComponent(
                '/payment/success?aoid=' + encodeURIComponent(aoid || '')
              )
            }
          >
            登录后返回订单
          </a>
        )}
        <div className="flex flex-wrap gap-4 text-sm">
          {state === 'success' && (
            <a className="underline" href="/settings/onework">
              查看会员 / 关联小程序
            </a>
          )}
          <a className="underline" href="/blog">
            公开阅读文章
          </a>
          <a className="underline" href="/settings/billing">
            支付记录
          </a>
          <a className="underline" href="/contact">
            联系支持
          </a>
        </div>
      </div>
    </main>
  );
}
