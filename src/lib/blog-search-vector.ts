/**
 * 基于 pgvector 的博客语义搜索
 * 替代原有的 Orama 关键词搜索
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
 * 将查询文本转为向量，然后在 Supabase 中搜索最相似的文章
 */
export async function searchBlogContent(
  query: string,
  limit = 5
): Promise<BlogSearchResult[]> {
  try {
    // 1. 生成查询向量
    const embeddingResponse = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      encoding_format: 'float',
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2. 在 Supabase 中做向量相似度搜索（直接 SQL，避免存储过程参数问题）
    const sql = getDb();
    const vecStr = `[${queryEmbedding.join(',')}]`;
    // 用子查询计算相似度，避免 IVFFlat 索引在小数据集上的干扰
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

    return results.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      content: r.content,
      url: r.url,
      score: r.similarity,
    }));
  } catch (error) {
    console.error('向量搜索失败，降级为空结果:', error);
    return [];
  }
}
