import { BlogAIChat } from '@/components/ai/blog-ai-chat';

/**
 * AI 博客问答页面 - 全屏聊天布局，无侧边栏
 */
export default function AIChatPage() {
  return (
    <div className="flex h-[calc(100svh-5rem)] flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 flex flex-col px-4 py-6">
        <BlogAIChat />
      </div>
    </div>
  );
}
