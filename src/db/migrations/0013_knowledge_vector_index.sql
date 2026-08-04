-- 知识库向量检索性能修复。
--
-- 问题：knowledge_chunks 有 3625 个 2048 维向量，但没有任何向量索引，
-- 每次语义检索都退化成全表扫描（实测 ~9 秒），导致网页问答首字要等 13 秒。
--
-- 方案：建 HNSW 索引（pgvector >= 0.5）。HNSW 比 ivfflat 召回率更高、
-- 无需预先训练聚类中心，写入后立即可用，适合会持续增量导入的知识包。
-- 距离算子用 vector_cosine_ops，与 knowledge-search.ts 的 `<=>` (cosine) 一致。
--
-- 注意：pgvector 的 hnsw 索引对维度有上限（2000）。本表是 2048 维，
-- 超出 hnsw/ivfflat 的索引维度上限，因此改用 halfvec（16 位浮点，上限 4000 维）
-- 做索引表达式：精度损失可忽略，检索质量基本不变，速度提升一到两个数量级。

CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_hnsw_idx"
	ON "knowledge_chunks"
	USING hnsw ((embedding::halfvec(2048)) halfvec_cosine_ops);
