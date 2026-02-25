import { BlogAIChat } from '@/components/ai/blog-ai-chat';

export default function AIChatPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="mx-auto w-full max-w-3xl h-full flex flex-col px-4 py-6">
        <BlogAIChat />
      </div>
    </div>
  );
}
