-- 为知识图片增加独立文本向量检索。
--
-- embedding_text 由 title、去重后的 link alt_text、caption 和
-- visual_facts 稳定拼接而成。它和哈希一起保留，用于审计、
-- 增量更新和防止资产描述改变后继续使用旧向量。

ALTER TABLE "knowledge_assets" ADD COLUMN IF NOT EXISTS "embedding_text" text;
--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD COLUMN IF NOT EXISTS "embedding_text_hash" text;
--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD COLUMN IF NOT EXISTS "embedding" vector(2048);
--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD COLUMN IF NOT EXISTS "embedding_model" text;
--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD COLUMN IF NOT EXISTS "embedding_dimensions" integer;
--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD COLUMN IF NOT EXISTS "embedded_at" timestamp;
--> statement-breakpoint

-- vector HNSW 最多支持 2000 维；智谱 embedding-3 为 2048 维，
-- 因此与 knowledge_chunks 一样，用 halfvec(2048) 表达式建索引。
-- 检索 SQL 必须保留下列谓词，并使用完全相同的 ORDER BY 表达式。
CREATE INDEX IF NOT EXISTS "knowledge_assets_embedding_hnsw_idx"
	ON "knowledge_assets"
	USING hnsw ((embedding::halfvec(2048)) halfvec_cosine_ops)
	WHERE embedding IS NOT NULL
		AND embedding_model = 'embedding-3'
		AND embedding_dimensions = 2048
		AND asset_type = 'image'
		AND status = 'active'
		AND visibility = 'public'
		AND public_url IS NOT NULL
		AND public_url <> '';
