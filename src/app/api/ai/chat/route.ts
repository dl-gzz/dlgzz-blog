import fs from 'fs';
import path from 'path';
import { createOpenAICompatibleSdk } from '@/lib/ai/openai-compatible';
import { searchBlogContent } from '@/lib/blog-search-vector';
import {
  FREE_DAILY_LIMIT,
  checkTrialQuota,
  recordTrialUsage,
  visitorIdFromRequest,
} from '@/lib/free-trial-quota';
import { searchKnowledgeChunks } from '@/lib/knowledge-search';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getSession } from '@/lib/server';
import { createDataStreamResponse, streamText } from 'ai';

// 网页问答检索的知识包（试吃）。与会员 API Key 检索共用同一份知识库。
const WEB_CHAT_KNOWLEDGE_PACK_IDS = (
  process.env.AI_CHAT_KNOWLEDGE_PACK_IDS || 'xhs-operations-v1'
)
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

/**
 * 从 MDX 原文中提取外部链接（http/https）
 * 返回去重后的 { text, url } 列表
 */
function extractLinksFromMdx(
  slug: string
): Array<{ text: string; url: string }> {
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
    let match = linkRegex.exec(raw);
    while (match !== null) {
      const url = match[2];
      if (!seen.has(url)) {
        seen.add(url);
        links.push({ text: match[1], url });
      }
      match = linkRegex.exec(raw);
    }
    return links;
  }
  return [];
}

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
    const { sdk, config: aiConfig } = createOpenAICompatibleSdk({
      defaultOpenAIModel: 'gpt-4o-mini',
    });

    // 1. 身份识别：会员无限，其余（登录/游客）走试吃日额度
    const session = await getSession();
    const userId = session?.user?.id ?? null;
    const isMember = userId ? await hasAccessToPremiumContent() : false;
    const visitorId = userId ? null : visitorIdFromRequest(req);

    // 2. 试吃额度检查：免费用户当日超额 → 引导开通会员
    const quota = await checkTrialQuota({ userId, visitorId, isMember });
    if (!quota.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Trial limit reached',
          code: 'TRIAL_LIMIT',
          message: `今天的免费体验次数已用完（每天 ${FREE_DAILY_LIMIT} 次）。开通会员即可无限畅查，并获得 API Key 装进你自己的 AI。`,
          upgradeUrl: '/pricing',
          limit: quota.limit,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
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

    // 5. 检索：知识包（主）+ 博客文章（辅），合并成上下文
    const searchStartedAt = Date.now();
    const contextBlocks: string[] = [];
    let knowledgeHitCount = 0;
    let sources: Array<{
      title: string;
      url: string;
      excerpt: string;
      links: Array<{ text: string; url: string }>;
    }> = [];

    // 5a. 知识包检索（这是要"试吃"给用户的核心资产）
    try {
      const knowledgeResults = await searchKnowledgeChunks(userQuery, {
        packIds: WEB_CHAT_KNOWLEDGE_PACK_IDS,
        limit: 5,
      });
      knowledgeHitCount = knowledgeResults.length;
      if (knowledgeResults.length > 0) {
        contextBlocks.push(
          knowledgeResults
            .map(
              (r, i) =>
                `[知识库 ${i + 1}] ${r.title || r.heading || '知识片段'}\n${r.content}\n`
            )
            .join('\n---\n\n')
        );

        // 答案溯源：按文档去重，链接到采集时的官方原文（source_url）。
        // 这是"官方知识库"可信度的关键——用户可点开验证答案出处。
        const seenDocs = new Set<string>();
        for (const r of knowledgeResults) {
          if (seenDocs.has(r.documentId)) continue;
          seenDocs.add(r.documentId);
          if (!r.sourceUrl) continue;
          sources.push({
            title: r.title || r.heading || '官方文档',
            url: r.sourceUrl,
            excerpt: `${r.category ? `[${r.category}] ` : ''}${r.content.slice(0, 120).trim()}`,
            links: [],
          });
        }
      }
    } catch (knowledgeError) {
      console.error('Knowledge search error:', knowledgeError);
    }

    // 5b. 博客文章检索：仅当知识包没命中时才用作兜底补充，避免博客内容稀释知识库答案
    if (knowledgeHitCount === 0) {
      try {
        const searchResults = await searchBlogContent(userQuery);
        if (searchResults && searchResults.length > 0) {
          const topResults = searchResults.slice(0, 3);
          contextBlocks.push(
            topResults
              .map(
                (result, index) =>
                  `[文章 ${index + 1}] ${result.title}\n${result.content}\n`
              )
              .join('\n---\n\n')
          );
          sources = topResults.map((result) => {
            const excerpt = (result.description || result.content)
              .substring(0, 150)
              .trim();
            const slug = result.url.replace(/^\/blog\//, '');
            return {
              title: result.title,
              url: result.url,
              excerpt,
              links: extractLinksFromMdx(slug),
            };
          });
        }
      } catch (searchError) {
        console.error('Blog search error:', searchError);
      }
    }

    const relevantContext = contextBlocks.join('\n\n===\n\n');

    // 6. 构建系统提示词
    const systemPrompt = relevantContext
      ? `你是「OneWorkerOS」知识库的问答助手。下方是针对用户问题检索到的知识库内容，请充分利用它来回答。

## 回答规则：
1. **默认下方内容就是相关的**——检索已按语义匹配，请把它当作对这个问题有用的材料，整合成有条理的答案，不要说"没有直接针对性内容"这类话
2. 如实转述其中的步骤、方法、参数、条件，尽量具体、可操作、分点清晰
3. 只有当下方内容**完全**与问题无关时，才说"知识库暂未收录"；否则一律基于它作答
4. 不要编造下方没有的内容；用中文，语气专业友好

## 检索到的知识库内容：

${relevantContext}

现在请综合以上内容，正面回答用户的问题。`
      : `你是「OneWorkerOS」知识库的问答助手。这次没有检索到相关的知识库内容。

请诚实告诉用户：知识库里暂时没有匹配到相关内容，可以换个说法再问，或浏览博客了解已收录的主题。语气友好专业，用中文。`;

    // 7. 返回流式响应（来源 + 试吃额度 + 转化提示）
    const remainingAfter = quota.isMember
      ? null
      : Math.max(0, quota.remaining - 1);

    return createDataStreamResponse({
      execute: async (dataStream) => {
        if (sources.length > 0) {
          dataStream.writeData({ sources });
        }
        // 把试吃状态写进流，前端据此显示"今日剩余 N 次 / 开通会员畅查"
        dataStream.writeData({
          trial: {
            isMember: quota.isMember,
            fromKnowledgeBase: knowledgeHitCount > 0,
            knowledgeHits: knowledgeHitCount,
            remaining: remainingAfter,
            limit: quota.isMember ? null : quota.limit,
            upgradeUrl: '/pricing',
          },
        });

        const result = streamText({
          model: sdk(aiConfig.model),
          system: systemPrompt,
          messages,
          maxTokens: 2000,
          temperature: 0.7,
          onFinish: ({ finishReason, usage }) => {
            console.log('AI Chat completed:', {
              identity: userId || `visitor:${visitorId?.slice(0, 8)}`,
              isMember: quota.isMember,
              knowledgeHits: knowledgeHitCount,
              finishReason,
              usage,
            });
            // 非会员才计入日额度（会员无限，不记 web_chat）
            if (!quota.isMember) {
              void recordTrialUsage({
                userId,
                visitorId,
                knowledgePackId: WEB_CHAT_KNOWLEDGE_PACK_IDS[0] ?? null,
                query: userQuery,
                resultCount: knowledgeHitCount + sources.length,
                latencyMs: Date.now() - searchStartedAt,
              });
            }
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
