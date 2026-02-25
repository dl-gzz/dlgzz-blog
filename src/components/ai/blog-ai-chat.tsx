'use client';

import { useChat } from 'ai/react';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Send, Sparkles, Trash2, BookOpen, ExternalLink } from 'lucide-react';

interface BlogSource {
  title: string;
  url: string;
  excerpt: string;
}

const QUICK_QUESTIONS = [
  '这个博客主要写什么内容？',
  '有哪些关于 AI 工具的文章？',
  '独立工作者应该关注哪些方法论？',
];

/**
 * 博客 AI 问答组件 - 现代全高度聊天界面
 */
export function BlogAIChat() {
  const [sources, setSources] = useState<BlogSource[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, input, setInput, handleInputChange, handleSubmit, isLoading, error, setMessages } =
    useChat({
      api: '/api/ai/chat',
      onResponse: (response) => {
        const sourcesHeader = response.headers.get('X-AI-Sources');
        if (sourcesHeader) {
          try {
            const sourcesJson = decodeURIComponent(
              atob(sourcesHeader)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
            );
            setSources(JSON.parse(sourcesJson));
          } catch (e) {
            console.error('Failed to parse sources:', e);
          }
        }
      },
    });

  const handleClearChat = () => {
    setMessages([]);
    setSources([]);
  };

  const handleQuickQuestion = (q: string) => {
    setInput(q);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex h-full flex-col rounded-2xl border bg-background shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold leading-none">AI 博客助手</h2>
            <p className="mt-1 text-xs text-muted-foreground">基于博客内容语义搜索回答</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearChat}
            className="text-muted-foreground hover:text-foreground gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            新对话
          </Button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex min-h-full flex-col items-center justify-center gap-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold">向我提问博客相关问题</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                我会根据博客文章内容为你提供准确的回答，并注明来源
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleQuickQuestion(q)}
                  className="rounded-xl border bg-muted/50 px-4 py-2.5 text-sm text-left hover:bg-muted transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-muted rounded-tl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">正在思考...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error.message === 'Premium feature'
                  ? 'AI 问答功能仅限付费用户使用，请升级订阅。'
                  : `出错了：${error.message}`}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Sources */}
      {sources.length > 0 && (
        <div className="border-t px-6 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">参考来源</p>
          <div className="flex flex-wrap gap-2">
            {sources.map((source, i) => (
              <a
                key={i}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-3 py-1 text-xs hover:bg-muted transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                {source.title}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t px-6 py-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="输入你的问题..."
            disabled={isLoading}
            className="flex-1 rounded-xl border bg-muted/50 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background transition-colors disabled:opacity-50"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            size="icon"
            className="h-10 w-10 rounded-xl shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          基于博客语义搜索 · Powered by DeepSeek
        </p>
      </div>
    </div>
  );
}
