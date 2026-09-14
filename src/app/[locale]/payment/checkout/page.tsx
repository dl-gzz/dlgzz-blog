'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import QRCode from 'react-qr-code';

export default function CheckoutPage() {
  const params = useSearchParams();
  const router = useRouter();
  const aoid = params.get('aoid');
  const qr = params.get('qr');
  const expires = params.get('expires');
  const absoluteExpiry = params.get('expires_at');
  const returnUrl = params.get('return_url');
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);
  const [checking, setChecking] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const paidRef = useRef(false);

  const checkStatus = useCallback(async () => {
    if (!aoid || inFlight.current || paidRef.current) return;
    inFlight.current = true;
    const request = new AbortController();
    controller.current = request;
    const timeout = setTimeout(() => request.abort(), 10000);
    setChecking(true);
    try {
      const response = await fetch(
        '/api/xorpay/check-status?aoid=' + encodeURIComponent(aoid),
        {
          cache: 'no-store',
          signal: request.signal,
        }
      );
      const data = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok) {
        setAuthRequired(response.status === 401);
        throw new Error(
          response.status === 401
            ? '登录已失效，请重新登录后查看此订单。'
            : data.error || data.message || '查询失败，请重试'
        );
      }
      setError('');
      setAuthRequired(false);
      if (typeof data.data?.amount === 'number') setAmount(data.data.amount);
      if (data.status === 'completed') {
        paidRef.current = true;
        setPaid(true);
      } else if (['expired', 'canceled'].includes(data.status)) {
        setRemaining(0);
        setError(
          '订单已取消或过期。若已经扣款，请联系客服核对，不要重复付款。'
        );
      }
    } catch (reason) {
      if (!request.signal.aborted || controller.current === request) {
        setError(
          request.signal.aborted
            ? '查询超时，请重试；已付款请勿重复支付。'
            : reason instanceof Error
              ? reason.message
              : '查询失败，请重试'
        );
      }
    } finally {
      clearTimeout(timeout);
      if (controller.current === request) {
        controller.current = null;
        inFlight.current = false;
        setChecking(false);
      }
    }
  }, [aoid]);

  useEffect(() => {
    paidRef.current = false;
    setPaid(false);
    void checkStatus();
    const timer = setInterval(() => void checkStatus(), 3000);
    return () => {
      clearInterval(timer);
      const request = controller.current;
      controller.current = null;
      request?.abort();
      inFlight.current = false;
    };
  }, [checkStatus]);

  useEffect(() => {
    if (!aoid) return;
    // New orders include an absolute deadline. Preserve legacy URL deadlines
    // in this tab so refreshing an old checkout cannot restart its timer.
    const seconds = Number(expires);
    let deadline = Number(absoluteExpiry);
    if (!Number.isFinite(deadline) || deadline <= 0) {
      const key = 'checkout-expiry:' + aoid;
      try {
        deadline = Number(sessionStorage.getItem(key));
      } catch {}
      if (!Number.isFinite(deadline) || deadline <= 0) {
        deadline =
          Date.now() +
          (Number.isFinite(seconds) && seconds > 0 ? seconds : 7200) * 1000;
        try {
          sessionStorage.setItem(key, String(deadline));
        } catch {}
      }
    }
    const tick = () =>
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [aoid, expires, absoluteExpiry]);

  useEffect(() => {
    if (!paid || !aoid) return;
    let target = '/payment/success?aoid=' + encodeURIComponent(aoid);
    if (returnUrl) {
      try {
        const url = new URL(returnUrl, window.location.origin);
        if (
          url.origin === window.location.origin &&
          !url.pathname.includes('/payment/')
        ) {
          url.searchParams.set('checkout', 'success');
          url.searchParams.set('session_id', aoid);
          url.searchParams.set('aoid', aoid);
          target = url.pathname + url.search + url.hash;
        }
      } catch {}
    }
    const timer = setTimeout(() => router.push(target), 1200);
    return () => clearTimeout(timer);
  }, [paid, aoid, router, returnUrl]);

  const expired = remaining === 0;
  const checkoutUrl = '/payment/checkout?' + params.toString();
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-lg space-y-6 rounded-2xl border bg-background p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">
          {paid ? '支付已确认' : '完成支付'}
        </h1>
        {!aoid ? (
          <p role="alert">缺少订单号，请返回会员方案重新下单。</p>
        ) : (
          <>
            <p className="break-all text-sm text-muted-foreground">
              订单号：{aoid}
            </p>
            {amount !== null && (
              <p className="text-xl font-semibold">
                ¥{(amount / 100).toFixed(2)}
              </p>
            )}
            {paid ? (
              <p role="status">会员权益已发放，正在前往支付结果页…</p>
            ) : (
              <>
                {qr && !expired && !authRequired ? (
                  <>
                    <div className="mx-auto w-fit max-w-full rounded-lg bg-white p-4">
                      <QRCode
                        value={qr}
                        size={224}
                        style={{ maxWidth: '100%', height: 'auto' }}
                      />
                    </div>
                    <p className="text-center">请使用支付宝扫码支付</p>
                    <p className="text-sm text-muted-foreground">
                      手机操作可保存二维码后在支付宝扫一扫中从相册识别。付款后回到本页确认结果。
                    </p>
                  </>
                ) : (
                  !authRequired && (
                    <p role="status">
                      {expired
                        ? '二维码已过期，请勿继续扫码。'
                        : '二维码不可用，请返回会员方案重新下单。'}
                    </p>
                  )
                )}
                {remaining !== null && !expired && (
                  <p className="text-center text-sm">
                    二维码剩余 {Math.floor(remaining / 60)} 分 {remaining % 60}{' '}
                    秒
                  </p>
                )}
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                {authRequired ? (
                  <a
                    className="block underline"
                    href={
                      '/auth/login?callbackUrl=' +
                      encodeURIComponent(checkoutUrl)
                    }
                  >
                    重新登录并返回订单
                  </a>
                ) : (
                  <button
                    className="w-full rounded-lg bg-primary px-4 py-3 text-primary-foreground disabled:opacity-60"
                    disabled={checking}
                    onClick={() => void checkStatus()}
                  >
                    {checking ? '正在确认支付…' : '我已完成支付 / 重新查询'}
                  </button>
                )}
                <p className="text-sm text-muted-foreground">
                  系统会自动核对支付结果。若已经扣款，请勿重复支付。
                </p>
              </>
            )}
          </>
        )}
        <div className="flex flex-wrap gap-4 text-sm">
          <a className="underline" href="/pricing">
            返回会员方案
          </a>
          <a className="underline" href="/contact">
            联系支持
          </a>
        </div>
      </div>
    </main>
  );
}
