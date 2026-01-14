'use client';

export default function PaymentCancelPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* Cancel Icon */}
          <div className="mb-6">
            <div className="mx-auto w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>

          {/* Cancel Message */}
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            支付已取消
          </h1>
          <p className="text-gray-600 mb-8">
            您已取消本次支付。如需继续购买，请重新选择您需要的服务。
          </p>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => window.location.href = '/pricing'}
              className="w-full px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              重新选择套餐
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              返回首页
            </button>
          </div>

          {/* Additional Info */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              遇到问题？
              <a href="/contact" className="text-primary hover:underline ml-1">
                联系客服获取帮助
              </a>
            </p>
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-6 bg-white/80 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">
            常见问题
          </h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• 支付过程中遇到问题？请刷新页面重试</li>
            <li>• 需要帮助？查看我们的 <a href="/docs" className="text-primary hover:underline">帮助文档</a></li>
            <li>• 有疑问？<a href="/contact" className="text-primary hover:underline">联系我们的客服团队</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
