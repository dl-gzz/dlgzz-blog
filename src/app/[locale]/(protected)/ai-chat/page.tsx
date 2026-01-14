import { useTranslations } from 'next-intl';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { BlogAIChat } from '@/components/ai/blog-ai-chat';

/**
 * AI 博客问答页面
 */
export default function AIChatPage() {
  const t = useTranslations();

  const breadcrumbs = [
    {
      label: t('Dashboard.dashboard.title'),
      href: '/dashboard',
    },
    {
      label: 'AI 博客问答',
      isCurrentPage: true,
    },
  ];

  return (
    <>
      <DashboardHeader breadcrumbs={breadcrumbs} />

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="px-4 lg:px-6">
              {/* Page Header */}
              <div className="mb-6">
                <h1 className="text-3xl font-bold">AI 博客问答</h1>
                <p className="mt-2 text-muted-foreground">
                  基于博客内容的智能问答系统，使用 DeepSeek API 提供准确回答
                </p>
              </div>

              {/* AI Chat Component */}
              <div className="mx-auto max-w-4xl">
                <BlogAIChat />
              </div>

              {/* Usage Tips */}
              <div className="mx-auto mt-6 max-w-4xl">
                <div className="rounded-lg border bg-muted/50 p-6">
                  <h3 className="mb-3 font-semibold">使用提示</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>
                      • AI 会根据博客文章的实际内容来回答您的问题
                    </li>
                    <li>• 可以询问关于技术实现、最佳实践等问题</li>
                    <li>• 每个回答都会显示参考的博客文章来源</li>
                    <li>
                      • 如果博客中没有相关内容，AI 会诚实告知
                    </li>
                    <li>• 这是付费功能，需要有效的订阅</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
