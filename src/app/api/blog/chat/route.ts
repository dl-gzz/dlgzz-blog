/**
 * 博客文章 AI 问答 API
 * 方案 A: 全文上下文
 * 支持 DeepSeek API (OpenAI 兼容格式)
 */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { blogSource } from '@/lib/source';
import { getSession } from '@/lib/server';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import fs from 'fs';
import path from 'path';

// 估算 token 数量 (粗略估算: 1 token ≈ 4 字符)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// 初始化 OpenAI 客户端 (DeepSeek 兼容)
const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '',
  baseURL: process.env.DEEPSEEK_API_KEY
    ? 'https://api.deepseek.com'
    : 'https://api.openai.com/v1',
});

export async function POST(req: NextRequest) {
  try {
    const { slug, question, locale = 'zh' } = await req.json();

    // 验证必填参数
    if (!slug || !question) {
      return NextResponse.json(
        { error: '缺少必需参数: slug 和 question' },
        { status: 400 }
      );
    }

    // 验证 API Key
    if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'API 密钥未配置，请设置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY' },
        { status: 500 }
      );
    }

    // 获取文章元数据
    const post = blogSource.getPage([slug], locale);

    if (!post) {
      return NextResponse.json(
        { error: '文章不存在' },
        { status: 404 }
      );
    }

    const articleTitle = post.data.title;
    const articleDescription = post.data.description;
    const isPremium = post.data.premium || false;

    // 如果是付费文章，检查用户权限
    if (isPremium) {
      const session = await getSession();

      // 检查是否登录
      if (!session?.user) {
        return NextResponse.json(
          { error: '请先登录才能使用付费文章的 AI 问答功能' },
          { status: 401 }
        );
      }

      // 检查是否有付费权限
      const hasPremiumAccess = await hasAccessToPremiumContent();
      if (!hasPremiumAccess) {
        return NextResponse.json(
          { error: '此文章为付费内容，请升级订阅后使用 AI 问答功能' },
          { status: 403 }
        );
      }
    }

    // 读取 MDX 原始文件内容
    const contentDir = path.join(process.cwd(), 'content', 'blog');

    // 尝试读取带 locale 后缀的文件，如果不存在则尝试不带后缀的文件
    let filePath = path.join(contentDir, `${slug}.${locale}.mdx`);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(contentDir, `${slug}.mdx`);
    }

    let articleContent = '';
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      // 移除 frontmatter (--- 之间的内容)
      const contentWithoutFrontmatter = fileContent.replace(/^---[\s\S]*?---\n/, '');
      // 移除 import 语句
      articleContent = contentWithoutFrontmatter.replace(/^import\s+.*$/gm, '').trim();
    } catch (error) {
      console.error('读取文件失败:', error);
      return NextResponse.json(
        { error: '无法读取文章内容' },
        { status: 500 }
      );
    }

    // Token 限制检查 (8000 tokens 约 32000 字符)
    const contentTokens = estimateTokens(articleContent);
    const TOKEN_LIMIT = 8000;

    if (contentTokens > TOKEN_LIMIT) {
      return NextResponse.json(
        {
          error: '文章过长，暂不支持 AI 问答',
          suggestion: '请尝试更具体的问题，或直接阅读文章相关段落',
          tokenCount: contentTokens,
          tokenLimit: TOKEN_LIMIT,
        },
        { status: 413 } // Payload Too Large
      );
    }

    // 构建 prompt
    const systemPrompt = `你是一个专业的博客文章助手。你的任务是基于给定的文章内容回答用户的问题。

重要提示: 用户已通过身份验证和付费权限验证，有权访问文章的所有内容（包括付费部分）。

规则:
1. 只根据文章内容回答,不要添加文章中没有的信息
2. 如果文章中没有相关信息,明确告诉用户
3. 回答要简洁、准确、友好
4. 使用中文回答
5. 可以引用文章中的具体段落来支持你的回答
6. 文章中的所有内容（包括代码示例、技术细节等）都可以自由引用和解释`;

    const userPrompt = `文章标题: ${articleTitle}

文章简介: ${articleDescription}

文章内容:
${articleContent}

---

用户问题: ${question}

请根据上述文章内容回答用户的问题。`;

    // 选择模型
    const model = process.env.DEEPSEEK_API_KEY
      ? 'deepseek-chat'  // DeepSeek 模型
      : 'gpt-3.5-turbo'; // OpenAI 模型

    // 调用 API - 启用流式输出
    const stream = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      max_tokens: 1024,
      temperature: 0.7,
      stream: true, // 启用流式输出
    });

    // 创建 ReadableStream 用于流式响应
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              const data = `data: ${JSON.stringify({ content })}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          }
          // 发送结束信号
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    // 返回流式响应
    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('AI 问答错误:', error);

    // 处理 API 错误
    if (error?.status === 401) {
      return NextResponse.json(
        { error: 'API 密钥无效' },
        { status: 401 }
      );
    }

    if (error?.status === 429) {
      return NextResponse.json(
        { error: 'API 调用频率超限,请稍后重试' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        error: '服务器错误,请稍后重试',
        details: error?.message || '未知错误'
      },
      { status: 500 }
    );
  }
}
