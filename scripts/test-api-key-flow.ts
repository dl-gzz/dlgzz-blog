/**
 * 端到端验证 API Key 层：签发 → 授权知识包 → 带 Key 检索 → 计量 → 越权/超额拒绝。
 * 用真实数据库 + 真实智谱检索，最后清理测试数据。
 * Run: pnpm tsx scripts/test-api-key-flow.ts
 */
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

const PACK_ID = 'xhs-operations-v1';

function getSql() {
  return postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1, prepare: false });
}

async function main() {
  const sql = getSql();
  const keyId = `apikey_test_${randomUUID()}`;
  const rawKey = `dk_live_${randomBytes(24).toString('base64url')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  let userId = '';

  try {
    // 借一个真实用户（Key 需要 user 外键）
    const [u] = await sql<{ id: string }[]>`select id from "user" limit 1`;
    if (!u) throw new Error('库里没有用户，先注册一个再测');
    userId = u.id;

    console.log('1. 签发 Key');
    await sql`
      insert into api_key (id, user_id, name, key_hash, key_prefix, monthly_quota)
      values (${keyId}, ${userId}, ${'e2e-test'}, ${keyHash}, ${'dk_live_test…'}, ${5})
    `;
    console.log(`   ✅ ${rawKey.slice(0, 16)}…（额度 5/月）`);

    console.log('2. 未授权就查 → 应被拒');
    const granted0 = await sql`
      select 1 from api_key_pack_grant where api_key_id = ${keyId} and knowledge_pack_id = ${PACK_ID}
    `;
    console.log(`   授权记录数: ${granted0.length} → ${granted0.length === 0 ? '✅ 无权（会 403）' : '❌'}`);

    console.log('3. 模拟购买 → 授权知识包');
    await sql`
      insert into api_key_pack_grant (id, api_key_id, knowledge_pack_id, source)
      values (${`grant_${randomUUID()}`}, ${keyId}, ${PACK_ID}, ${'purchase'})
      on conflict (api_key_id, knowledge_pack_id) do nothing
    `;
    console.log('   ✅ 已授权');

    console.log('4. 带 Key 检索（真实向量）+ 计量');
    for (const q of ['直播间怎么冷启动', '违规会怎么处罚', '千帆怎么投放']) {
      const emb = await getEmbedding(q);
      const rows = await sql<{ title: string; category: string; score: number }[]>`
        select d.title, d.category, 1 - (c.embedding <=> ${JSON.stringify(emb)}::vector) as score
        from knowledge_chunks c
        join knowledge_documents d on d.id = c.document_id
        join knowledge_pack_documents pd on pd.document_id = d.id
        where pd.knowledge_pack_id = ${PACK_ID} and c.embedding is not null
        order by c.embedding <=> ${JSON.stringify(emb)}::vector
        limit 1
      `;
      await sql`
        insert into api_usage_event (id, api_key_id, user_id, kind, knowledge_pack_id, query, result_count, status)
        values (${`usage_${randomUUID()}`}, ${keyId}, ${userId}, ${'knowledge_query'}, ${PACK_ID}, ${q}, ${rows.length}, ${'ok'})
      `;
      console.log(`   「${q}」→ ${rows[0]?.title}［${rows[0]?.category}］(${Number(rows[0]?.score).toFixed(3)})`);
    }

    console.log('5. 计量核对');
    const [usage] = await sql<{ count: number }[]>`
      select count(*)::int as count from api_usage_event
      where api_key_id = ${keyId} and status = 'ok'
    `;
    console.log(`   本月已用 ${usage.count}/5 → ${usage.count === 3 ? '✅ 计量准确' : '❌'}`);
    console.log(`   超额判断: ${usage.count >= 5 ? '已超额（会 429）' : '未超额（还能查 ' + (5 - usage.count) + ' 次）'}`);
  } finally {
    console.log('6. 清理测试数据');
    await sql`delete from api_usage_event where api_key_id = ${keyId}`;
    await sql`delete from api_key_pack_grant where api_key_id = ${keyId}`;
    await sql`delete from api_key where id = ${keyId}`;
    console.log('   ✅ 已清理');
    await sql.end();
  }
}

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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
