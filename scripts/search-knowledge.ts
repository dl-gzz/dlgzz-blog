import { join } from 'node:path';
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

const args = process.argv.slice(2);
let packId = 'xhs-operations-v1';
const queryParts: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--') continue;
  if (args[i] === '--pack') packId = args[++i] || packId;
  else queryParts.push(args[i]);
}
const PACK_ID = packId;
const QUERY = queryParts.join(' ') || '怎么写出爆款笔记';

async function getEmbedding(text: string): Promise<number[]> {
  const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ZHIPU_API_KEY}`,
    },
    body: JSON.stringify({ model: 'embedding-3', input: text }),
  });
  const data = (await resp.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, {
    ssl: 'require',
    max: 1,
    prepare: false,
  });
  const queryEmbedding = await getEmbedding(QUERY);

  const rows = await sql`
		select c.heading, c.content, d.title, d.category,
			1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
		from knowledge_chunks c
		join knowledge_documents d on d.id = c.document_id
		join knowledge_pack_documents pd on pd.document_id = d.id
		where pd.knowledge_pack_id = ${PACK_ID}
			and c.embedding is not null
		order by c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
		limit 3
	`;

  console.log(`问题：${QUERY}\n`);
  for (const [index, row] of rows.entries()) {
    console.log(
      `── 第 ${index + 1} 名（相似度 ${Number(row.similarity).toFixed(3)}）`
    );
    console.log(`   文档：${row.title}［${row.category}］`);
    console.log(
      `   片段：${String(row.content).slice(0, 150).replace(/\n+/g, ' ')}…\n`
    );
  }
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
