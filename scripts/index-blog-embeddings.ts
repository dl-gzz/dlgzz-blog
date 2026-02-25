/**
 * 博客文章向量化脚本
 * 运行: npx tsx scripts/index-blog-embeddings.ts
 *
 * 功能: 读取所有中文博客文章 → 生成 OpenAI 向量 → 存入 Supabase
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import OpenAI from 'openai';
import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

/**
 * 读取所有中文博客文章
 */
function loadBlogPosts() {
  const blogDir = join(process.cwd(), 'content/blog');
  const files = readdirSync(blogDir).filter(
    (f) => f.endsWith('.mdx') && !f.endsWith('.en.mdx')
  );

  return files.map((file) => {
    const { data, content } = matter(
      readFileSync(join(blogDir, file), 'utf-8')
    );

    // 清理 Markdown 符号，保留纯文字
    const cleanContent = content
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/[*_~`#>]/g, '')
      .replace(/\n+/g, ' ')
      .trim()
      .substring(0, 8000); // OpenAI 限制

    const slug = file
      .replace(/\.(en|zh)\.mdx?$/, '')
      .replace(/\.mdx?$/, '');

    return {
      id: file.replace(/\.mdx?$/, ''),
      slug,
      title: data.title || file,
      description: data.description || '',
      content: cleanContent,
      url: `/blog/${slug}`,
    };
  });
}

/**
 * 生成单条文本的嵌入向量
 */
async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  });
  return response.data[0].embedding;
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始生成博客文章向量...\n');

  const posts = loadBlogPosts();
  console.log(`📚 找到 ${posts.length} 篇中文博客文章\n`);

  let successCount = 0;
  let skipCount = 0;

  for (const post of posts) {
    try {
      // 检查是否已存在
      const existing = await sql`
        select id from blog_embeddings where id = ${post.id}
      `;

      if (existing.length > 0) {
        console.log(`⏭️  跳过（已存在）: ${post.title}`);
        skipCount++;
        continue;
      }

      // 生成向量：标题 + 描述 + 正文 合并，提高检索质量
      const textToEmbed = `${post.title}\n${post.description}\n${post.content}`;
      const embedding = await getEmbedding(textToEmbed);

      // 存入 Supabase
      await sql`
        insert into blog_embeddings (id, slug, title, description, content, url, embedding)
        values (
          ${post.id},
          ${post.slug},
          ${post.title},
          ${post.description},
          ${post.content},
          ${post.url},
          ${JSON.stringify(embedding)}::vector
        )
      `;

      console.log(`✅ 已处理: ${post.title}`);
      successCount++;

      // 每篇文章之间稍作等待，避免触发 rate limit
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`❌ 失败: ${post.title}`, err);
    }
  }

  console.log(`\n🎉 完成！成功 ${successCount} 篇，跳过 ${skipCount} 篇`);
  await sql.end();
}

main().catch(console.error);
