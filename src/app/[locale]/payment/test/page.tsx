'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

type TestPaymentResponse = {
  success: boolean;
  message?: string;
  data?: {
    checkoutUrl: string;
    orderId: string;
  };
  error?: string;
};

export default function PaymentTestPage() {
  const searchParams = useSearchParams();
  const planId = searchParams.get('planId') || 'pro';
  const priceId = searchParams.get('priceId') || 'xorpay_pro_monthly';
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );
  const [result, setResult] = useState<TestPaymentResponse | null>(null);

  const handleCreateTestOrder = async () => {
    try {
      setStatus('loading');
      setResult(null);

      const response = await fetch(
        `/api/test-payment?planId=${encodeURIComponent(
          planId
        )}&priceId=${encodeURIComponent(priceId)}`,
        {
          method: 'GET',
        }
      );
      const data = (await response.json()) as TestPaymentResponse;

      if (!response.ok || !data.success || !data.data?.checkoutUrl) {
        setStatus('error');
        setResult(data);
        return;
      }

      setResult(data);
      setStatus('ready');

      window.location.href = data.data.checkoutUrl;
    } catch (error) {
      setStatus('error');
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="mx-auto max-w-xl space-y-6 rounded-2xl bg-white p-8 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            XorPay 支付测试
          </h1>
          <p className="text-sm text-slate-600">
            创建测试订单并跳转到收银台页面。
          </p>
        </div>

        <button
          type="button"
          onClick={handleCreateTestOrder}
          disabled={status === 'loading'}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === 'loading' ? '正在创建测试订单...' : '创建测试订单'}
        </button>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          当前测试套餐: {planId} / {priceId}
        </div>

        {status === 'ready' && result?.data && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">订单创建成功。</p>
            <p className="mt-2 break-all">
              支付链接: {result.data.checkoutUrl}
            </p>
            <p className="mt-1">订单号: {result.data.orderId}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <p className="font-medium">创建测试订单失败。</p>
            <p className="mt-2 break-all">
              {result?.error || result?.message || '未知错误'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
