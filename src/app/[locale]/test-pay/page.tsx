'use client';

import { useState } from 'react';

export default function PaymentTestPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAlipayPayment = async () => {
    try {
      setLoading(true);
      setError('');

      // Call test payment API (defaults to Alipay)
      const response = await fetch('/api/test-payment');
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Payment creation failed');
      }

      // Redirect to checkout page
      window.location.href = data.data.checkoutUrl;
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || '创建支付失败');
      setLoading(false);
    }
  };

  const handleWeChatPayment = async () => {
    setError('微信支付功能开发中，请使用支付宝测试');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              选择支付方式
            </h1>
            <p className="text-gray-600">
              请选择您的支付方式完成测试订单
            </p>
          </div>

          {/* Test Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-blue-900 mb-2">
              测试订单信息
            </h3>
            <div className="text-sm text-blue-800 space-y-1">
              <p>• 套餐: Pro 月付</p>
              <p>• 金额: ¥0.01 (测试金额)</p>
              <p>• 测试邮箱: test@example.com</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex">
                <svg className="h-5 w-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Payment Buttons */}
          <div className="space-y-3 mb-6">
            {/* Alipay Button */}
            <button
              onClick={handleAlipayPayment}
              disabled={loading}
              className="w-full px-6 py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg flex items-center justify-center"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  创建订单中...
                </div>
              ) : (
                <>
                  <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5.5 3A2.5 2.5 0 003 5.5v13A2.5 2.5 0 005.5 21h13a2.5 2.5 0 002.5-2.5v-13A2.5 2.5 0 0018.5 3h-13z"/>
                    <path fill="white" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"/>
                  </svg>
                  支付宝支付 (推荐)
                </>
              )}
            </button>

            {/* WeChat Pay Button */}
            <button
              onClick={handleWeChatPayment}
              disabled={loading}
              className="w-full px-6 py-4 bg-green-600 text-white text-lg font-semibold rounded-lg hover:bg-green-700 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg flex items-center justify-center"
            >
              <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8.5 12.5c0 .28-.22.5-.5.5s-.5-.22-.5-.5.22-.5.5-.5.5.22.5.5zm2.5-.5c-.28 0-.5.22-.5.5s.22.5.5.5.5-.22.5-.5-.22-.5-.5-.5zm5 0c-.28 0-.5.22-.5.5s.22.5.5.5.5-.22.5-.5-.22-.5-.5-.5zm1.5 0c-.28 0-.5.22-.5.5s.22.5.5.5.5-.22.5-.5-.22-.5-.5-.5z"/>
                <path d="M22.5 10.5c0-1.93-1.57-3.5-3.5-3.5H5c-1.93 0-3.5 1.57-3.5 3.5S3.07 14 5 14h.17c-.11.32-.17.66-.17 1 0 1.66 1.34 3 3 3h.17c-.11.32-.17.66-.17 1 0 1.66 1.34 3 3 3h6c1.66 0 3-1.34 3-3 0-.34-.06-.68-.17-1H19c1.66 0 3-1.34 3-3 0-.34-.06-.68-.17-1H19c1.93 0 3.5-1.57 3.5-3.5z"/>
              </svg>
              微信支付 (开发中)
            </button>
          </div>

          {/* Additional Info */}
          <div className="text-center">
            <p className="text-sm text-gray-500">
              测试金额：0.01 元
            </p>
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-6 bg-white/80 backdrop-blur rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">
            支付方式说明
          </h3>
          <div className="text-sm text-gray-600 space-y-2">
            <div className="flex items-start">
              <span className="font-medium text-blue-600 mr-2">支付宝：</span>
              <span>扫码支付，任何浏览器都可使用（推荐测试）</span>
            </div>
            <div className="flex items-start">
              <span className="font-medium text-green-600 mr-2">微信支付：</span>
              <span>需在微信中打开并获取授权（功能开发中）</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
