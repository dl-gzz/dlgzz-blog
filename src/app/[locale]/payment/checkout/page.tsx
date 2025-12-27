'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const aoid = searchParams.get('aoid');
  const qrFromUrl = searchParams.get('qr');
  const expiresFromUrl = searchParams.get('expires');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'checking' | 'success'>('loading');
  const [error, setError] = useState<string>('');
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [checkCount, setCheckCount] = useState<number>(0);

  useEffect(() => {
    if (!aoid) {
      setError('缺少订单号');
      setStatus('error');
      return;
    }

    // If QR code is provided in URL, use it directly
    if (qrFromUrl) {
      const decodedQr = decodeURIComponent(qrFromUrl);
      console.log('QR URL from params:', decodedQr);
      setPaymentInfo({
        status: 'ok',
        info: { qr: decodedQr },
        expires_in: expiresFromUrl ? parseInt(expiresFromUrl) : 7200,
      });
      setCountdown(expiresFromUrl ? parseInt(expiresFromUrl) : 7200);
      setStatus('ready');
    } else {
      // Fallback: Fetch payment info from API
      fetchPaymentInfo();
    }

    // Check payment status every 3 seconds
    const checkInterval = setInterval(() => {
      checkPaymentStatus();
    }, 3000);

    return () => clearInterval(checkInterval);
  }, [aoid, qrFromUrl, expiresFromUrl]);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

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
      setCountdown(data.expires_in || 7200); // Set countdown
      setStatus('ready');
    } catch (err: any) {
      console.error('Payment info error:', err);
      setError(err.message || '获取支付信息失败');
      setStatus('error');
    }
  };

  const checkPaymentStatus = async () => {
    if (status === 'checking' || status === 'success') return;

    try {
      setStatus('checking');
      setCheckCount(prev => prev + 1);

      const response = await fetch(`/api/xorpay/check-status?aoid=${aoid}`);
      const data = await response.json();

      console.log('Payment status check:', data);

      if (data.status === 'completed' || data.status === 'paid') {
        // Payment successful
        setStatus('success');
        setTimeout(() => {
          router.push('/payment/success?aoid=' + aoid);
        }, 1500);
      } else if (data.status === 'canceled' || data.status === 'expired') {
        // Payment canceled or expired
        setError('订单已取消或过期');
        setStatus('error');
      } else {
        setStatus('ready');
      }
    } catch (err: any) {
      console.error('Check status error:', err);
      setError(err.message || '检查支付状态失败');
      setStatus('ready');
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              完成支付
            </h1>
            <p className="text-gray-600">
              请使用支付宝或微信扫描下方二维码完成支付
            </p>
          </div>

          {status === 'loading' && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-600">正在加载支付信息...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center py-12">
              <div className="rounded-full h-16 w-16 bg-red-100 flex items-center justify-center mx-auto mb-4">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                获取支付信息失败
              </h2>
              <p className="text-red-600 mb-6">{error}</p>
              <button
                onClick={() => window.location.href = '/pricing'}
                className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                返回价格页面
              </button>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center py-12">
              <div className="rounded-full h-16 w-16 bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                支付成功！
              </h2>
              <p className="text-gray-600 mb-4">正在跳转...</p>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
            </div>
          )}

          {(status === 'ready' || status === 'checking') && paymentInfo && (
            <div>
              {/* QR Code Section */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-8 mb-6 border border-blue-100">
                <div className="flex flex-col items-center">
                  {/* QR Code */}
                  <div className="bg-white p-6 rounded-xl shadow-lg mb-4 border-4 border-blue-100">
                    {paymentInfo.info.qr ? (
                      <QRCode
                        value={paymentInfo.info.qr}
                        size={256}
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                        viewBox={`0 0 256 256`}
                      />
                    ) : (
                      <div className="w-64 h-64 flex items-center justify-center text-gray-400">
                        加载二维码中...
                      </div>
                    )}
                  </div>

                  {/* Payment Instructions */}
                  <div className="text-center">
                    <p className="text-xl font-bold text-gray-900 mb-2">
                      使用支付宝扫码支付
                    </p>
                    <p className="text-sm text-gray-600 mb-3">
                      打开支付宝，扫描上方二维码完成支付
                    </p>
                    <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      支付完成后自动跳转
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-blue-900">
                      订单信息
                    </h3>
                    <div className="mt-2 text-sm text-blue-800 space-y-1">
                      <p>订单号: {aoid}</p>
                      {paymentInfo.info.qr && (
                        <p className="text-xs break-all">二维码链接: {paymentInfo.info.qr}</p>
                      )}
                      <p className="flex items-center">
                        <span>有效期: </span>
                        <span className="ml-2 font-mono font-semibold text-blue-900">
                          {formatTime(countdown)}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Indicator */}
              {status === 'checking' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-center text-sm text-yellow-800">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-600 mr-3"></div>
                    <span className="font-medium">正在检查支付状态... (第 {checkCount} 次检查)</span>
                  </div>
                </div>
              )}

              {status === 'ready' && checkCount > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-center text-sm text-gray-600">
                    <svg className="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>等待支付中，系统会自动检测支付状态</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={checkPaymentStatus}
                  disabled={status === 'checking'}
                  className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-lg font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg flex items-center justify-center"
                >
                  {status === 'checking' ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      检查中...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      我已完成支付
                    </>
                  )}
                </button>
                <button
                  onClick={() => router.push('/pricing')}
                  className="w-full px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors font-medium"
                >
                  取消支付
                </button>
              </div>

              {/* Help Text */}
              <div className="mt-6 text-center text-sm text-gray-500">
                <p>支付遇到问题？</p>
                <a href="/contact" className="text-primary hover:underline">
                  联系客服
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center text-sm text-gray-600">
          <div className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span>安全支付，由 XorPay 提供支付服务</span>
          </div>
        </div>
      </div>
    </div>
  );
}
