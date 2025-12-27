'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function CheckoutDemoPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const aoid = searchParams.get('aoid');
  const [countdown, setCountdown] = useState<number>(5);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Auto redirect to success page after countdown
      router.push('/payment/success-demo?aoid=' + aoid);
    }
  }, [countdown, aoid, router]);

  const handleSkipCountdown = () => {
    router.push('/payment/success-demo?aoid=' + aoid);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mb-4">
              <div className="mx-auto w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-12 h-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              演示模式
            </h1>
            <p className="text-gray-600">
              这是一个演示页面，无需实际支付
            </p>
          </div>

          {/* Demo QR Code */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-8 mb-6 border border-blue-100">
            <div className="flex flex-col items-center">
              {/* Mock QR Code */}
              <div className="bg-white p-6 rounded-xl shadow-lg mb-4 border-4 border-blue-100">
                <div className="w-64 h-64 bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center rounded-lg">
                  <div className="text-center">
                    <svg className="w-32 h-32 mx-auto text-blue-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    <p className="text-blue-600 font-semibold">演示二维码</p>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900 mb-2">
                  演示支付流程
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  这是一个演示页面，展示支付页面的 UI 设计
                </p>
              </div>
            </div>
          </div>

          {/* Demo Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-blue-900">
                  演示信息
                </h3>
                <div className="mt-2 text-sm text-blue-800 space-y-1">
                  <p>订单号: {aoid}</p>
                  <p>套餐: Pro 月付</p>
                  <p>金额: ¥0.01（演示）</p>
                  <p className="font-semibold">{countdown} 秒后自动跳转到成功页面...</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleSkipCountdown}
              className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-lg font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all transform hover:scale-[1.02] shadow-lg flex items-center justify-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              立即查看成功页面
            </button>
            <button
              onClick={() => router.push('/')}
              className="w-full px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors font-medium"
            >
              返回首页
            </button>
          </div>

          {/* Note */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              💡 这是演示模式，无需配置数据库即可查看支付页面效果
            </p>
          </div>
        </div>

        {/* Info Badge */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-gray-600 bg-white px-4 py-2 rounded-full shadow-sm">
            <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <span>演示模式 - UI 预览</span>
          </div>
        </div>
      </div>
    </div>
  );
}
