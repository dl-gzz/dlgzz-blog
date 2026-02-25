/**
 * 基于 pgvector 的博客语义搜索（含关键词兜底）
 */

import OpenAI from 'openai';
import postgres from 'postgres';

export interface BlogSearchResult {
  id: string;
  title: string;
  description?: string;
  content: string;
  url: string;
  score: number;
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getDb() {
  return postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1 });
}

/**
 * 关键词兜底搜索：当 OpenAI embedding 不可用时使用
 */
async function keywordSearch(
  query: string,
  limit: number
): Promise<BlogSearchResult[]> {
  const sql = getDb();
  try {
    // 把查询拆成词，用 ilike 做模糊匹配
    const keywords = query.trim().split(/\s+/).slice(0, 5);
    const conditions = keywords.map((kw) => `(title ilike '%${kw.replace(/'/g, "''")}%' or content ilike '%${kw.replace(/'/g, "''")}%' or description ilike '%${kw.replace(/'/g, "''")}%')`).join(' or ');

    const results = await sql<
      Array<{
        id: string;
        slug: string;
        title: string;
        description: string;
        content: string;
        url: string;
      }>
    >`
      select id, slug, title, description, content, url
      from blog_embeddings
      where ${sql.unsafe(conditions)}
      limit ${limit}
    `;
    await sql.end();

    console.log(`🔤 关键词兜底搜索 "${query}" → 找到 ${results.length} 条结果`);

    return results.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      content: r.content,
      url: r.url,
      score: 0.5,
    }));
  } catch (err) {
    await sql.end().catch(() => {});
    console.error('关键词搜索也失败:', err);
    return [];
  }
}

/**
 * 将查询文本转为向量，然后在 Supabase 中搜索最相似的文章；
 * 若 OpenAI embedding 失败，自动降级为关键词搜索。
 */
export async function searchBlogContent(
  query: string,
  limit = 5
): Promise<BlogSearchResult[]> {
  // 1. 尝试向量搜索
  try {
    const embeddingResponse = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      encoding_format: 'float',
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    const sql = getDb();
    const vecStr = `[${queryEmbedding.join(',')}]`;
    const results = await sql<
      Array<{
        id: string;
        slug: string;
        title: string;
        description: string;
        content: string;
        url: string;
        similarity: number;
      }>
    >`
      select * from (
        select
          id, slug, title, description, content, url,
          1 - (embedding <=> ${vecStr}::vector) as similarity
        from blog_embeddings
      ) ranked
      where similarity > 0.2
      order by similarity desc
      limit ${limit}
    `;
    await sql.end();

    console.log(`🔍 向量搜索 "${query}" → 找到 ${results.length} 条结果`);
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title} (相似度: ${r.similarity.toFixed(3)})`);
    });

    // 向量搜索有结果直接返回；无结果再用关键词兜底
    if (results.length > 0) {
      return results.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        content: r.content,
        url: r.url,
        score: r.similarity,
      }));
    }

    console.log('向量搜索无结果，降级为关键词搜索');
    return keywordSearch(query, limit);
  } catch (error) {
    console.error('向量搜索失败，降级为关键词搜索:', error);
    return keywordSearch(query, limit);
  }
}
