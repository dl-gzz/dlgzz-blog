import { streamText, createDataStreamResponse } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { getSession } from '@/lib/server';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { searchBlogContent } from '@/lib/blog-search-vector';
import fs from 'fs';
import path from 'path';

/**
 * 从 MDX 原文中提取外部链接（http/https）
 * 返回去重后的 { text, url } 列表
 */
function extractLinksFromMdx(slug: string): Array<{ text: string; url: string }> {
  const contentDir = path.join(process.cwd(), 'content', 'blog');
  // 依次尝试 .zh.mdx → .mdx
  const candidates = [
    path.join(contentDir, `${slug}.zh.mdx`),
    path.join(contentDir, `${slug}.mdx`),
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const links: Array<{ text: string; url: string }> = [];
    const seen = new Set<string>();
    // 匹配 [text](https://...) 格式
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    let match;
    while ((match = linkRegex.exec(raw)) !== null) {
      const url = match[2];
      if (!seen.has(url)) {
        seen.add(url);
        links.push({ text: match[1], url });
      }
    }
    return links;
  }
  return [];
}

// 配置 DeepSeek API（使用 OpenAI 兼容接口）
const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
});

export const maxDuration = 60; // 设置最大执行时间 60 秒

/**
 * AI Chat API - 基于博客内容的问答
 *
 * 使用 RAG (Retrieval-Augmented Generation) 架构：
 * 1. 检查用户订阅权限
 * 2. 搜索相关博客内容
 * 3. 将相关内容作为上下文提供给 AI
 * 4. 生成答案并引用来源
 */
export async function POST(req: Request) {
  try {
    // 1. 验证用户登录状态
    const session = await getSession();
    if (!session?.user) {
      return new Response('Unauthorized - Please login', { status: 401 });
    }

    // 2. 检查付费订阅权限
    const hasPremiumAccess = await hasAccessToPremiumContent();
    if (!hasPremiumAccess) {
      return new Response(
        JSON.stringify({
          error: 'Premium feature',
          message: 'AI 问答功能仅限付费用户使用，请升级您的订阅。',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. 获取请求数据
    const { messages } = await req.json();

    if (!messages || messages.length === 0) {
      return new Response('No messages provided', { status: 400 });
    }

    // 4. 获取最后一条用户消息
    const lastMessage = messages[messages.length - 1];
    const userQuery = lastMessage.content;

    // 5. 搜索相关博客内容
    let relevantContext = '';
    let sources: Array<{
      title: string;
      url: string;
      excerpt: string;
      links: Array<{ text: string; url: string }>;
    }> = [];

    try {
      const searchResults = await searchBlogContent(userQuery);

      if (searchResults && searchResults.length > 0) {
        // 提取前 3-5 篇最相关的文章
        const topResults = searchResults.slice(0, 5);

        // 构建上下文
        relevantContext = topResults
          .map((result, index) => {
            return `[文章 ${index + 1}] ${result.title}\n${result.content}\n`;
          })
          .join('\n---\n\n');

        // 保存来源信息（含文章内部链接）
        sources = topResults.map((result) => {
          const excerpt = (result.description || result.content)
            .substring(0, 150)
            .trim();

          // 从 URL /blog/slug 解析 slug，再读原始 MDX 文件提取链接
          const slug = result.url.replace(/^\/blog\//, '');
          const links = extractLinksFromMdx(slug);

          return {
            title: result.title,
            url: result.url,
            excerpt: excerpt,
            links,
          };
        });
      }
    } catch (searchError) {
      console.error('Blog search error:', searchError);
      // 搜索失败不阻塞，继续使用空上下文
    }

    // 6. 构建系统提示词
    const systemPrompt = relevantContext
      ? `你是一个智能博客助手，基于提供的博客文章内容来回答用户问题。

## 重要规则：
1. **仅基于提供的文章内容回答**，不要编造信息
2. 如果文章中没有相关信息，请明确告知用户
3. 回答要准确、简洁、友好
4. 可以引用文章中的具体内容
5. 使用中文回答

## 可用的博客文章内容：

${relevantContext}

请基于以上文章内容回答用户的问题。如果文章中没有相关信息，请诚实地告知用户。`
      : `你是一个智能博客助手。目前没有找到相关的博客文章内容来回答这个问题。

请告诉用户：暂时没有找到相关的博客文章内容，建议：
1. 尝试用不同的关键词重新提问
2. 查看博客文章列表浏览相关内容
3. 或者直接询问具体的技术问题

请使用友好、专业的语气回复。`;

    // 7. 返回流式响应（包含来源数据）
    return createDataStreamResponse({
      execute: async (dataStream) => {
        // 先把来源数据写入流，前端可通过 useChat 的 data 字段读取
        if (sources.length > 0) {
          dataStream.writeData({ sources });
        }

        const result = streamText({
          model: deepseek(process.env.DEEPSEEK_MODEL || 'deepseek-chat'),
          system: systemPrompt,
          messages,
          maxTokens: 2000,
          temperature: 0.7,
          onFinish: ({ finishReason, usage }) => {
            console.log('AI Chat completed:', {
              userId: session?.user?.id || 'anonymous',
              query: userQuery.substring(0, 100),
              finishReason,
              usage,
              sourcesCount: sources.length,
            });
          },
        });

        result.mergeIntoDataStream(dataStream);
      },
    });
  } catch (error) {
    console.error('AI Chat API error:', error);

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
