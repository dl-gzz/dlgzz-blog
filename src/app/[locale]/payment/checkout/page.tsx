'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';

const PaymentQrCard = memo(function PaymentQrCard({ qrValue }: { qrValue: string | null }) {
  return (
    <div className="mb-4 rounded-xl border-4 border-blue-100 bg-white p-6 shadow-lg">
      <div className="flex h-64 w-64 items-center justify-center">
        {qrValue ? (
          <QRCode
            value={qrValue}
            size={224}
            style={{ display: 'block', height: 224, width: 224 }}
            viewBox="0 0 256 256"
          />
        ) : (
          <div className="flex h-56 w-56 items-center justify-center text-gray-400">加载二维码中...</div>
        )}
      </div>
    </div>
  );
});

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const aoid = searchParams.get('aoid');
  const qrFromUrl = searchParams.get('qr');
  const expiresFromUrl = searchParams.get('expires');
  const returnUrlFromUrl = searchParams.get('return_url');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'success'>('loading');
  const [error, setError] = useState<string>('');
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [checkCount, setCheckCount] = useState<number>(0);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!aoid) {
      setError('缺少订单号');
      setStatus('error');
      return;
    }

    if (qrFromUrl) {
      const decodedQr = decodeURIComponent(qrFromUrl);
      console.log('QR URL from params:', decodedQr);
      setPaymentInfo({
        status: 'ok',
        info: { qr: decodedQr },
        expires_in: expiresFromUrl ? parseInt(expiresFromUrl, 10) : 7200,
      });
      setCountdown(expiresFromUrl ? parseInt(expiresFromUrl, 10) : 7200);
      setStatus('ready');
    } else {
      void fetchPaymentInfo();
    }

    const checkInterval = setInterval(() => {
      void checkPaymentStatus();
    }, 3000);

    return () => clearInterval(checkInterval);
  }, [aoid, qrFromUrl, expiresFromUrl]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const buildSuccessTarget = () => {
    const fallback = aoid ? `/payment/success?aoid=${encodeURIComponent(aoid)}` : '/payment/success';
    if (!returnUrlFromUrl) return fallback;

    try {
      const url = new URL(returnUrlFromUrl, window.location.origin);

      if (!url.searchParams.get('checkout')) {
        url.searchParams.set('checkout', 'success');
      }

      if (aoid) {
        const sessionId = url.searchParams.get('session_id');
        if (!sessionId || sessionId.includes('{CHECKOUT_SESSION_ID}')) {
          url.searchParams.set('session_id', aoid);
        }
        if (!url.searchParams.get('aoid')) {
          url.searchParams.set('aoid', aoid);
        }
      }

      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return fallback;
    }
  };

  const fetchPaymentInfo = async () => {
    try {
      const response = await fetch(`/api/xorpay/get-pay-params?aoid=${aoid}`);

      if (!response.ok) {
        throw new Error('获取支付信息失败');
      }

      const data = await response.json();

      if (data.status !== 'ok') {
        throw new Error(data.info || '订单不存在');
      }

      setPaymentInfo(data);
      setCountdown(data.expires_in || 7200);
      setStatus('ready');
    } catch (err: any) {
      console.error('Payment info error:', err);
      setError(err.message || '获取支付信息失败');
      setStatus('error');
    }
  };

  const checkPaymentStatus = async () => {
    if (!aoid || isChecking || status === 'loading' || status === 'error' || status === 'success') {
      return;
    }

    try {
      setIsChecking(true);
      setCheckCount((prev) => prev + 1);

      const response = await fetch(`/api/xorpay/check-status?aoid=${aoid}`);
      const data = await response.json();

      console.log('Payment status check:', data);

      if (data.status === 'completed' || data.status === 'paid' || data.status === 'active') {
        setStatus('success');
        setTimeout(() => {
          router.push(buildSuccessTarget());
        }, 1500);
        return;
      }

      if (data.status === 'canceled' || data.status === 'expired') {
        setError('订单已取消或过期');
        setStatus('error');
      }
    } catch (err: any) {
      console.error('Check status error:', err);
      setError(err.message || '检查支付状态失败');
    } finally {
      setIsChecking(false);
    }
  };

  const formatTime = (seconds: number) => {
    const safeSeconds = Math.max(0, seconds);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const qrValue = useMemo(() => paymentInfo?.info?.qr || null, [paymentInfo]);
  const showPaymentPanel = (status === 'ready' || isChecking) && paymentInfo;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-3xl font-bold text-gray-900">完成支付</h1>
            <p className="text-gray-600">请使用支付宝或微信扫描下方二维码完成支付</p>
          </div>

          {status === 'loading' && (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-b-2 border-primary"></div>
              <p className="text-gray-600">正在加载支付信息...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="mb-2 text-xl font-semibold text-gray-900">获取支付信息失败</h2>
              <p className="mb-6 text-red-600">{error}</p>
              <button
                onClick={() => window.location.href = '/pricing'}
                className="rounded-lg bg-primary px-6 py-3 text-white transition-colors hover:bg-primary/90"
              >
                返回价格页面
              </button>
            </div>
          )}

          {status === 'success' && (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-gray-900">支付成功！</h2>
              <p className="mb-4 text-gray-600">
                {returnUrlFromUrl ? '正在返回组件成交页并校验授权...' : '正在跳转...'}
              </p>
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-green-600"></div>
            </div>
          )}

          {showPaymentPanel && (
            <div>
              <div className="mb-6 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-8">
                <div className="flex flex-col items-center">
                  <PaymentQrCard qrValue={qrValue} />

                  <div className="text-center">
                    <p className="mb-2 text-xl font-bold text-gray-900">使用支付宝扫码支付</p>
                    <p className="mb-3 text-sm text-gray-600">打开支付宝，扫描上方二维码完成支付</p>
                    <div className="inline-flex items-center rounded-full bg-blue-100 px-4 py-2 text-sm font-medium text-blue-800">
                      <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      {returnUrlFromUrl ? '支付完成后自动返回组件成交页' : '支付完成后自动跳转'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="mt-0.5 h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-blue-900">订单信息</h3>
                    <div className="mt-2 space-y-1 text-sm text-blue-800">
                      <p>订单号: {aoid}</p>
                      {qrValue && <p className="break-all text-xs">二维码链接: {qrValue}</p>}
                      <p className="flex items-center">
                        <span>有效期:</span>
                        <span className="ml-2 font-mono font-semibold text-blue-900">{formatTime(countdown)}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-6 min-h-[72px] rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex h-full items-center justify-center text-sm">
                  {isChecking ? (
                    <div className="flex items-center text-amber-800">
                      <div className="mr-3 h-5 w-5 animate-spin rounded-full border-b-2 border-amber-600"></div>
                      <span className="font-medium">正在后台检查支付状态... (第 {checkCount} 次检查)</span>
                    </div>
                  ) : checkCount > 0 ? (
                    <div className="flex items-center text-gray-600">
                      <svg className="mr-2 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>等待支付中，系统会自动检测支付状态</span>
                    </div>
                  ) : (
                    <div className="flex items-center text-gray-600">
                      <svg className="mr-2 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>扫码后保持本页即可，系统会自动确认是否支付成功</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => void checkPaymentStatus()}
                  disabled={isChecking}
                  className="flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:scale-[1.02] hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none"
                >
                  {isChecking ? (
                    <>
                      <div className="mr-2 h-5 w-5 animate-spin rounded-full border-b-2 border-white"></div>
                      检查中...
                    </>
                  ) : (
                    <>
                      <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      我已完成支付
                    </>
                  )}
                </button>
                <button
                  onClick={() => router.push('/pricing')}
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
                >
                  取消支付
                </button>
              </div>

              <div className="mt-6 text-center text-sm text-gray-500">
                <p>支付遇到问题？</p>
                <a href="/contact" className="text-primary hover:underline">
                  联系客服
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">
          <div className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2V7a3 3 0 00-6 0v2h6z" clipRule="evenodd" />
            </svg>
            <span>安全支付，由 XorPay 提供支付服务</span>
          </div>
        </div>
      </div>
    </div>
  );
}
