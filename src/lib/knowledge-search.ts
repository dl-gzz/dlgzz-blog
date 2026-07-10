import postgres from "postgres";

// 未显式传 packId 时的兜底知识包。可用 env 覆盖，避免把默认值写死在代码里。
const DEFAULT_KNOWLEDGE_PACK_ID =
	process.env.DEFAULT_KNOWLEDGE_PACK_ID || "xhs-operations-v1";
const EMBEDDING_MODEL = "embedding-3";

export interface KnowledgeSearchResult {
	id: string;
	documentId: string;
	title: string;
	source: string;
	category: string;
	heading: string | null;
	content: string;
	filePath: string;
	score: number;
	metadata: Record<string, unknown>;
	/** 官方原文链接（采集时的 source_url），用于答案溯源 */
	sourceUrl: string | null;
}

// 模块级单例：每次调用都新建 postgres() 意味着一次完整的 TCP+TLS 握手
// （到云端库 1-2 秒），一次检索会握手两次，是首字延迟的主要来源之一。
// idle_timeout 让空闲连接自动收回，客户端仍可复用（会自动重连）。
let sqlSingleton: ReturnType<typeof postgres> | null = null;

function getSql() {
	if (sqlSingleton) return sqlSingleton;

	const explicit = (process.env.DATABASE_SSL || "").toLowerCase();
	const ssl = explicit === "false" || explicit === "disable" || explicit === "off" ? false : "require";

	sqlSingleton = postgres(process.env.DATABASE_URL!, {
		ssl,
		max: 3,
		prepare: false,
		connect_timeout: 10,
		idle_timeout: 30,
	});
	return sqlSingleton;
}

async function getZhipuEmbedding(text: string): Promise<number[]> {
	const apiKey = process.env.ZHIPU_API_KEY;
	if (!apiKey) throw new Error("ZHIPU_API_KEY is not set");

	const resp = await fetch("https://open.bigmodel.cn/api/paas/v4/embeddings", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 8000) }),
	});

	if (!resp.ok) {
		throw new Error(`Zhipu embedding request failed: ${resp.status}`);
	}

	const data = (await resp.json()) as { data: Array<{ embedding: number[] }> };
	return data.data[0].embedding;
}

function normalizePackIds(options: { packId?: string; packIds?: string[] }) {
	const packIds = options.packIds?.filter(Boolean);
	return packIds?.length ? [...new Set(packIds)] : [options.packId || DEFAULT_KNOWLEDGE_PACK_ID];
}

async function keywordSearch(query: string, packIds: string[], limit: number): Promise<KnowledgeSearchResult[]> {
	const sql = getSql();
	try {
		const keywords = getKeywordTerms(query)
			.map((keyword) => keyword.replace(/'/g, "''"))
			.slice(0, 12);

		const condition = keywords.length
			? keywords
					.map(
						(keyword) =>
							`(kc.content ilike '%${keyword}%' or kd.title ilike '%${keyword}%' or coalesce(kc.heading, '') ilike '%${keyword}%')`,
					)
					.join(" or ")
			: "true";
		const rankExpression = keywords.length
			? keywords
					.map(
						(keyword) =>
							`case when kc.content ilike '%${keyword}%' or kd.title ilike '%${keyword}%' or coalesce(kc.heading, '') ilike '%${keyword}%' then 1 else 0 end`,
					)
					.join(" + ")
			: "0";

		const rows = await sql<Array<{
			id: string;
			document_id: string;
			title: string;
			source: string;
			category: string;
			heading: string | null;
			content: string;
			file_path: string;
			source_url: string | null;
			metadata: Record<string, unknown>;
			keyword_score: number;
		}>>`
			select
				kc.id,
				kc.document_id,
				kd.title,
				kd.source,
				kd.category,
				kc.heading,
				kc.content,
				kd.file_path,
				kd.metadata->>'source_url' as source_url,
				kc.metadata,
				(${sql.unsafe(rankExpression)})::int as keyword_score
			from knowledge_chunks kc
			join knowledge_documents kd on kd.id = kc.document_id
			where exists (
				select 1 from knowledge_pack_documents kpd
				where kpd.document_id = kd.id
					and kpd.knowledge_pack_id in ${sql(packIds)}
			)
				and ${sql.unsafe(condition)}
			order by keyword_score desc,
				case when kd.source = 'xhs_official' then 1 else 0 end desc,
				kd.title asc
			limit ${Math.max(limit * 3, 12)}
		`;

		return rows.map((row) => ({
			id: row.id,
			documentId: row.document_id,
			title: row.title,
			source: row.source,
			category: row.category,
			heading: row.heading,
			content: row.content,
			filePath: row.file_path,
			sourceUrl: row.source_url ?? null,
			score: 0.55 + Math.min(row.keyword_score, 6) * 0.04,
			metadata: row.metadata,
		}));
	} finally {
		// 连接为模块级单例，这里不再销毁（销毁会让下次调用重新 TLS 握手）
	}
}

function getKeywordTerms(query: string) {
	const normalized = query.replace(/[，。！？、；：,.!?;:]/g, " ");
	const terms = new Set(
		normalized
			.trim()
			.split(/\s+/)
			.map((term) => term.trim())
			.filter((term) => term.length >= 2),
	);
	if (/预包装|食品|许可证|备案|资质|酒|母婴|保健|医疗器械/.test(query)) {
		[
			"行业入驻系列相关指南",
			"店铺经营类目对应的资质",
			"食品经营许可证",
			"食品生产许可证",
			"备案凭证",
			"预包装食品备案凭证",
			"仅销售预包装食品",
		].forEach((term) => terms.add(term));
	}
	if (/预包装/.test(query)) {
		[
			"预包装食品",
			"预包装食品，无生产资质",
			"可提供《预包装食品备案凭证》",
			"预包装食品备案回执",
			"备案编号",
		].forEach((term) => terms.add(term));
	}
	return [...terms].sort((a, b) => b.length - a.length);
}

function mergeSearchResults(
	vectorResults: KnowledgeSearchResult[],
	keywordResults: KnowledgeSearchResult[],
	limit: number,
) {
	const merged = new Map<string, KnowledgeSearchResult>();
	for (const result of vectorResults) {
		merged.set(result.id, result);
	}
	for (const result of keywordResults) {
		const existing = merged.get(result.id);
		if (!existing || result.score > existing.score) {
			merged.set(result.id, {
				...result,
				score: Math.max(result.score, existing?.score || 0),
			});
		}
	}
	return [...merged.values()]
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}

export async function searchKnowledgeChunks(
	query: string,
	options: { packId?: string; packIds?: string[]; limit?: number; minScore?: number } = {},
): Promise<KnowledgeSearchResult[]> {
	const packIds = normalizePackIds(options);
	const limit = options.limit || 6;
	const minScore = options.minScore ?? 0.2;

	try {
		const embedding = await getZhipuEmbedding(query);
		const vector = `[${embedding.join(",")}]`;
		const sql = getSql();

		try {
			const rows = await sql<Array<{
				id: string;
				document_id: string;
				title: string;
				source: string;
				category: string;
				heading: string | null;
				content: string;
				file_path: string;
				source_url: string | null;
				metadata: Record<string, unknown>;
				similarity: number;
				rank_score: number;
			}>>`
				with nearest as materialized (
					-- 第一阶段：纯向量近邻，不带任何过滤 → 规划器必走 HNSW 索引
					-- （knowledge_chunks_embedding_hnsw_idx）。order by 表达式与索引
					-- 表达式完全一致（halfvec + cosine）。
					-- materialized 必不可少：否则规划器会把外层的包过滤内联推回
					-- 这里，放弃索引退化成全表扫描（实测 11s vs 0.4s）。
					select
						kc.id,
						kc.document_id,
						kc.heading,
						kc.content,
						kc.metadata,
						kc.embedding::halfvec(2048) <=> ${vector}::halfvec(2048) as distance
					from knowledge_chunks kc
					order by kc.embedding::halfvec(2048) <=> ${vector}::halfvec(2048)
					limit 150
				),
				candidates as (
					-- 第二阶段：在 150 个近邻里做包过滤（超采样弥补过滤损耗；
					-- 当前包覆盖率 >90%，召回几乎无损）
					select n.*
					from nearest n
					where exists (
						select 1 from knowledge_pack_documents kpd
						where kpd.document_id = n.document_id
							and kpd.knowledge_pack_id in ${sql(packIds)}
					)
					limit ${Math.max(limit * 6, 30)}
				)
				-- 第二阶段：在候选池里按来源加权重排（候选池很小，代价可忽略）
				select
					c.id,
					c.document_id,
					kd.title,
					kd.source,
					kd.category,
					c.heading,
					c.content,
					kd.metadata->>'source_url' as source_url,
					kd.file_path,
					c.metadata,
					1 - c.distance as similarity,
					1 - c.distance
						+ case
							when kd.source = 'xhs_official' then 0.04
							when kd.source = 'xhs_28_questions' then -0.02
							else 0
						end as rank_score
				from candidates c
				join knowledge_documents kd on kd.id = c.document_id
				where 1 - c.distance >= ${minScore}
				order by rank_score desc
				limit ${limit}
			`;

			const vectorResults = rows.map((row) => ({
				id: row.id,
				documentId: row.document_id,
				title: row.title,
				source: row.source,
				category: row.category,
				heading: row.heading,
				content: row.content,
				filePath: row.file_path,
				sourceUrl: row.source_url ?? null,
				score: row.rank_score,
				metadata: row.metadata,
			}));
			// 向量已足量命中时跳过关键词兜底：36 个 ilike 全表扫要花数秒，
			// 只在向量召回不足（<limit 一半）时才值得补充。
			if (vectorResults.length >= Math.max(2, Math.ceil(limit / 2))) {
				return vectorResults;
			}

			const keywordResults = await keywordSearch(query, packIds, limit);

			if (vectorResults.length === 0) return keywordResults.slice(0, limit);

			return mergeSearchResults(vectorResults, keywordResults, limit);
		} finally {
			// 连接为模块级单例，这里不再销毁
		}
	} catch (error) {
		console.error("Knowledge vector search failed, falling back to keyword search:", error);
		return keywordSearch(query, packIds, limit);
	}
}
