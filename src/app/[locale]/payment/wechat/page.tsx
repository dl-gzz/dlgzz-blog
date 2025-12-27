'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function WeChatPaymentPage() {
  const searchParams = useSearchParams();
  const aoid = searchParams.get('aoid');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!aoid) {
      setError('Missing payment order ID');
      setStatus('error');
      return;
    }

    // Check if we're in WeChat browser
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    if (!isWeChat) {
      setError('Please open this page in WeChat');
      setStatus('error');
      return;
    }

    // Fetch payment parameters
    fetchPaymentParams();
  }, [aoid]);

  const fetchPaymentParams = async () => {
    try {
      const response = await fetch(`/api/xorpay/get-pay-params?aoid=${aoid}`);

      if (!response.ok) {
        throw new Error('Failed to fetch payment parameters');
      }

      const data = await response.json();

      if (data.status !== 'ok') {
        throw new Error(data.info || 'Payment order not found');
      }

      setStatus('ready');

      // Prepare payment parameters for WeixinJSBridge
      const payParams = {
        appId: data.appId,
        timeStamp: data.timeStamp,
        nonceStr: data.nonceStr,
        package: data.package,
        signType: data.signType,
        paySign: data.paySign,
      };

      // Call WeChat payment
      callWeChatPay(payParams);
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Failed to initiate payment');
      setStatus('error');
    }
  };

  const callWeChatPay = (params: any) => {
    // Check if WeixinJSBridge is available
    if (typeof (window as any).WeixinJSBridge === 'undefined') {
      if (document.addEventListener) {
        document.addEventListener(
          'WeixinJSBridgeReady',
          () => onBridgeReady(params),
          false
        );
      } else if ((document as any).attachEvent) {
        (document as any).attachEvent('WeixinJSBridgeReady', () => onBridgeReady(params));
        (document as any).attachEvent('onWeixinJSBridgeReady', () => onBridgeReady(params));
      }
    } else {
      onBridgeReady(params);
    }
  };

  const onBridgeReady = (params: any) => {
    (window as any).WeixinJSBridge.invoke(
      'getBrandWCPayRequest',
      params,
      (res: any) => {
        if (res.err_msg === 'get_brand_wcpay_request:ok') {
          // Payment successful
          window.location.href = '/payment/success';
        } else if (res.err_msg === 'get_brand_wcpay_request:cancel') {
          // User canceled
          window.location.href = '/payment/cancel';
        } else {
          // Payment failed
          setError('Payment failed: ' + res.err_msg);
          setStatus('error');
        }
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center">
          {status === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                正在准备支付...
              </h2>
              <p className="text-gray-600">
                请稍候，正在加载微信支付
              </p>
            </>
          )}

          {status === 'ready' && (
            <>
              <div className="animate-pulse rounded-full h-16 w-16 bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                正在调起微信支付...
              </h2>
              <p className="text-gray-600">
                请在微信支付页面完成支付
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="rounded-full h-16 w-16 bg-red-100 flex items-center justify-center mx-auto mb-4">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                支付失败
              </h2>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={() => window.location.href = '/pricing'}
                className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                返回价格页面
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
