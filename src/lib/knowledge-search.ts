import postgres from "postgres";

const DEFAULT_KNOWLEDGE_PACK_ID = "xhs-open-shop-v1";
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
}

function getSql() {
	const explicit = (process.env.DATABASE_SSL || "").toLowerCase();
	const ssl = explicit === "false" || explicit === "disable" || explicit === "off" ? false : "require";

	return postgres(process.env.DATABASE_URL!, {
		ssl,
		max: 1,
		prepare: false,
		connect_timeout: 10,
	});
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
			score: 0.55 + Math.min(row.keyword_score, 6) * 0.04,
			metadata: row.metadata,
		}));
	} finally {
		await sql.end().catch(() => {});
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
				metadata: Record<string, unknown>;
				similarity: number;
				rank_score: number;
			}>>`
				select * from (
					select
						kc.id,
						kc.document_id,
						kd.title,
						kd.source,
						kd.category,
						kc.heading,
						kc.content,
						kd.file_path,
						kc.metadata,
						1 - (kc.embedding <=> ${vector}::vector) as similarity,
						1 - (kc.embedding <=> ${vector}::vector)
							+ case
								when kd.source = 'xhs_official' then 0.04
								when kd.source = 'xhs_28_questions' then -0.02
								else 0
							end as rank_score
					from knowledge_chunks kc
					join knowledge_documents kd on kd.id = kc.document_id
					where exists (
						select 1 from knowledge_pack_documents kpd
						where kpd.document_id = kd.id
							and kpd.knowledge_pack_id in ${sql(packIds)}
					)
						and kc.embedding is not null
				) ranked
				where similarity >= ${minScore}
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
				score: row.rank_score,
				metadata: row.metadata,
			}));
			const keywordResults = await keywordSearch(query, packIds, limit);

			if (vectorResults.length === 0) return keywordResults.slice(0, limit);

			return mergeSearchResults(vectorResults, keywordResults, limit);
		} finally {
			await sql.end().catch(() => {});
		}
	} catch (error) {
		console.error("Knowledge vector search failed, falling back to keyword search:", error);
		return keywordSearch(query, packIds, limit);
	}
}
