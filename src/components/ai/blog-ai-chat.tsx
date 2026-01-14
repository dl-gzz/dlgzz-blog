'use client';

import { useChat } from 'ai/react';
import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Send, Sparkles, Book, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface BlogSource {
  title: string;
  url: string;
  excerpt: string;
}

/**
 * 博客 AI 问答组件
 *
 * 使用 Vercel AI SDK 的 useChat hook 实现流式对话
 */
export function BlogAIChat() {
  const [sources, setSources] = useState<BlogSource[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } =
    useChat({
      api: '/api/ai/chat',
      onResponse: (response) => {
        // 从响应头中提取来源信息（Base64 编码）
        const sourcesHeader = response.headers.get('X-AI-Sources');
        if (sourcesHeader) {
          try {
            // 正确解码 Base64 中的 UTF-8 内容
            const sourcesJson = decodeURIComponent(
              atob(sourcesHeader)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
            );
            const parsedSources = JSON.parse(sourcesJson);
            setSources(parsedSources);
          } catch (e) {
            console.error('Failed to parse sources:', e);
          }
        }
      },
      onError: (error) => {
        console.error('Chat error:', error);
      },
    });

  // 清除所有聊天记录
  const handleClearChat = () => {
    setMessages([]);
    setSources([]);
  };

  // 自动滚动到最新消息
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <Card className="flex h-[600px] w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b p-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">AI 博客助手</h3>
        <Badge variant="secondary" className="ml-auto">
          基于博客内容
        </Badge>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearChat}
            className="ml-2"
            title="清除所有聊天记录"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 overflow-x-hidden p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center space-y-4 text-center">
            <Book className="h-12 w-12 text-muted-foreground" />
            <div className="space-y-2">
              <h4 className="text-lg font-medium">问我任何关于博客的问题</h4>
              <p className="text-sm text-muted-foreground">
                我会根据博客文章的实际内容来回答您的问题
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Badge variant="outline" className="cursor-pointer">
                Next.js 最佳实践？
              </Badge>
              <Badge variant="outline" className="cursor-pointer">
                如何实现支付？
              </Badge>
              <Badge variant="outline" className="cursor-pointer">
                用户认证方案？
              </Badge>
            </div>
          </div>
        )}

        <div className="space-y-4 overflow-hidden">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[85%] overflow-hidden rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
                style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
              >
                <div className="overflow-hidden">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ wordBreak: 'break-word' }}>
                    {message.content}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">正在思考...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <p className="text-sm text-destructive">
                {error.message === 'Premium feature'
                  ? 'AI 问答功能仅限付费用户使用，请升级您的订阅。'
                  : `错误: ${error.message}`}
              </p>
            </div>
          )}

          {/* 滚动锚点 */}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Sources Section */}
      {sources.length > 0 && (
        <div className="border-t p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            参考来源：
          </p>
          <div className="space-y-2">
            {sources.map((source, index) => (
              <a
                key={index}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md border p-2 text-sm transition-colors hover:bg-muted"
              >
                <div className="font-medium">{source.title}</div>
                <div className="line-clamp-1 text-xs text-muted-foreground">
                  {source.excerpt}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder="输入您的问题..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </Card>
  );
}
