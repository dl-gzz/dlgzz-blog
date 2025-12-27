'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const aoid = searchParams.get('aoid');
  const [orderInfo, setOrderInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (aoid) {
        try {
          const response = await fetch(`/api/xorpay/check-status?aoid=${aoid}`);
          const data = await response.json();

          if (data.status === 'completed' || data.status === 'paid') {
            setOrderInfo(data.data);
          }
        } catch (error) {
          console.error('Failed to fetch order details:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    fetchData();
  }, [aoid]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Success Header with Animation */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-8 py-12 text-center">
            <div className="mb-6 relative">
              <div className="mx-auto w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg animate-bounce">
                <svg className="w-14 h-14 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              {/* Confetti circles */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none">
                <div className="absolute top-0 left-1/4 w-3 h-3 bg-yellow-300 rounded-full animate-ping"></div>
                <div className="absolute top-4 right-1/4 w-2 h-2 bg-blue-300 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
                <div className="absolute bottom-4 left-1/3 w-2 h-2 bg-pink-300 rounded-full animate-ping" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>

            <h1 className="text-4xl font-bold text-white mb-3">
              支付成功！
            </h1>
            <p className="text-green-50 text-lg">
              🎉 恭喜！您的订单已完成支付
            </p>
          </div>

          {/* Order Details */}
          <div className="px-8 py-8">
            {loading && aoid ? (
              <div className="text-center py-6">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 mx-auto"></div>
                <p className="text-gray-600 mt-3">正在获取订单信息...</p>
              </div>
            ) : orderInfo ? (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  订单详情
                </h2>
                <div className="bg-gray-50 rounded-xl p-5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">订单号</span>
                    <span className="font-mono text-sm text-gray-900 font-medium">{aoid}</span>
                  </div>
                  <div className="border-t border-gray-200"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">套餐类型</span>
                    <span className="font-semibold text-gray-900 capitalize">{orderInfo.planId || '专业版'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">付款周期</span>
                    <span className="font-semibold text-gray-900">{orderInfo.interval === 'month' ? '月付' : orderInfo.interval === 'year' ? '年付' : '一次性'}</span>
                  </div>
                  <div className="border-t border-gray-200"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">支付金额</span>
                    <span className="text-2xl font-bold text-green-600">¥{orderInfo.amount}</span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Success Message */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="flex">
                <svg className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="ml-3">
                  <p className="text-sm text-green-800">
                    订单确认邮件已发送至您的注册邮箱，请注意查收。您现在可以开始使用会员功能了！
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-lg font-semibold rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all transform hover:scale-[1.02] shadow-lg flex items-center justify-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                开始使用会员功能
              </button>
              <button
                onClick={() => router.push('/settings/billing')}
                className="w-full px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors font-medium"
              >
                查看订单详情
              </button>
              <button
                onClick={() => router.push('/')}
                className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                返回首页
              </button>
            </div>

            {/* Additional Info */}
            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-500">
                如有任何问题，请
                <a href="/contact" className="text-green-600 hover:text-green-700 hover:underline ml-1 font-medium">
                  联系客服
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Security Badge */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-gray-600 bg-white px-4 py-2 rounded-full shadow-sm">
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
