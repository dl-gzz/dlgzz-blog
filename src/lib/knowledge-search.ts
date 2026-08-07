import postgres from 'postgres';

// 未显式传 packId 时的兜底知识包。可用 env 覆盖，避免把默认值写死在代码里。
const DEFAULT_KNOWLEDGE_PACK_ID =
  process.env.DEFAULT_KNOWLEDGE_PACK_ID || 'xhs-operations-v1';
const EMBEDDING_MODEL = 'embedding-3';
const MAX_IMAGES_PER_RESULT = 1;
const MAX_RESOURCES_PER_RESULT = 1;
const MAX_IMAGES_PER_RESPONSE = 2;
const MAX_RESOURCES_PER_RESPONSE = 1;
const ASSET_SEMANTIC_LIMIT = 3;
const ASSET_MIN_SCORE = 0.25;

export interface KnowledgeAssetResult {
  id: string;
  assetType: string;
  mimeType: string;
  publicUrl: string;
  title: string | null;
  platform: string | null;
  thumbnailUrl: string | null;
  embedUrl: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  publishedAt: Date | null;
  official: boolean;
  publisher: string | null;
  sourceType: string | null;
  caption: string | null;
  ocrText: string | null;
  visualFacts: Record<string, unknown>;
  analysisProvider: string | null;
  analysisModel: string | null;
  analysisVersion: string | null;
  role: string;
  sourceRef: string;
  altText: string | null;
  context: string | null;
}

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
  /** 仅在 includeAssets=true 时填充；默认检索路径不会增加资产查询。 */
  assets?: KnowledgeAssetResult[];
}

// 模块级单例：每次调用都新建 postgres() 意味着一次完整的 TCP+TLS 握手
// （到云端库 1-2 秒），一次检索会握手两次，是首字延迟的主要来源之一。
// idle_timeout 让空闲连接自动收回，客户端仍可复用（会自动重连）。
let sqlSingleton: ReturnType<typeof postgres> | null = null;

function getSql() {
  if (sqlSingleton) return sqlSingleton;

  const explicit = (process.env.DATABASE_SSL || '').toLowerCase();
  const ssl =
    explicit === 'false' || explicit === 'disable' || explicit === 'off'
      ? false
      : 'require';

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
  if (!apiKey) throw new Error('ZHIPU_API_KEY is not set');

  const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000),
    }),
  });

  if (!resp.ok) {
    throw new Error(`Zhipu embedding request failed: ${resp.status}`);
  }

  const data = (await resp.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

function normalizePackIds(options: { packId?: string; packIds?: string[] }) {
  const packIds = options.packIds?.filter(Boolean);
  return packIds?.length
    ? [...new Set(packIds)]
    : [options.packId || DEFAULT_KNOWLEDGE_PACK_ID];
}

async function keywordSearch(
  query: string,
  packIds: string[],
  limit: number
): Promise<KnowledgeSearchResult[]> {
  const sql = getSql();
  try {
    const keywords = getKeywordTerms(query)
      .map((keyword) => keyword.replace(/'/g, "''"))
      .slice(0, 12);

    const condition = keywords.length
      ? keywords
          .map(
            (keyword) =>
              `(kc.content ilike '%${keyword}%' or kd.title ilike '%${keyword}%' or coalesce(kc.heading, '') ilike '%${keyword}%')`
          )
          .join(' or ')
      : 'true';
    const rankExpression = keywords.length
      ? keywords
          .map(
            (keyword) =>
              `case when kc.content ilike '%${keyword}%' or kd.title ilike '%${keyword}%' or coalesce(kc.heading, '') ilike '%${keyword}%' then 1 else 0 end`
          )
          .join(' + ')
      : '0';

    const rows = await sql<
      Array<{
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
      }>
    >`
			select
				kc.id,
				kc.document_id,
				kd.title,
				kd.source,
				kd.category,
				kc.heading,
				kc.content,
				kd.file_path,
				coalesce(kd.metadata->>'sourceUrl', kd.metadata->>'source_url') as source_url,
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
      score:
        0.55 +
        Math.min(row.keyword_score, 6) * 0.04 +
        getRetrievalBoost(row.metadata),
      metadata: row.metadata,
    }));
  } finally {
    // 连接为模块级单例，这里不再销毁（销毁会让下次调用重新 TLS 握手）
  }
}

function getRetrievalBoost(metadata: Record<string, unknown>) {
  const value = Number(metadata.retrievalBoost);
  if (!Number.isFinite(value)) return 0;
  return Math.max(-0.1, Math.min(value, 0.1));
}

function getKeywordTerms(query: string) {
  const normalized = query.replace(/[，。！？、；：,.!?;:]/g, ' ');
  const terms = new Set(
    normalized
      .trim()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2)
  );
  if (/预包装|食品|许可证|备案|资质|酒|母婴|保健|医疗器械/.test(query)) {
    [
      '行业入驻系列相关指南',
      '店铺经营类目对应的资质',
      '食品经营许可证',
      '食品生产许可证',
      '备案凭证',
      '预包装食品备案凭证',
      '仅销售预包装食品',
    ].forEach((term) => terms.add(term));
  }
  if (/预包装/.test(query)) {
    [
      '预包装食品',
      '预包装食品，无生产资质',
      '可提供《预包装食品备案凭证》',
      '预包装食品备案回执',
      '备案编号',
    ].forEach((term) => terms.add(term));
  }
  return [...terms].sort((a, b) => b.length - a.length);
}

function mergeSearchResults(
  vectorResults: KnowledgeSearchResult[],
  keywordResults: KnowledgeSearchResult[],
  limit: number
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
  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function hasVisualAssetIntent(query: string) {
  return /图片|配图|截图|图示|图解|插图|封面|蓝猫|首领|视觉/.test(query);
}

function hasUiInstructionIntent(query: string) {
  if (/怎么理解|如何理解|是什么意思|什么原理|概念/.test(query)) {
    return false;
  }
  return /怎么|如何|哪里|哪一步|下一步|点击|打开|进入|设置|配置|安装|使用|操作|按钮|页面|界面|步骤|开始|创建|添加|开启|我要|我想|帮我|实现|完成/.test(
    query
  );
}

/**
 * 操作指导必须先区分“界面证据”和“概念插画”。不同来源的图片即使
 * 语义很接近，也不能让课程插画越级替代官方或用户实际上传的截图。
 */
function uiEvidenceTier(sourceType: string | null) {
  switch (sourceType) {
    case 'official_product_screenshot':
    case 'official_platform_screenshot':
      return 400;
    case 'user_uploaded_screenshot':
    case 'user_provided_screenshot':
      return 300;
    case 'product_ui_screenshot':
    case 'ui_screenshot':
    case 'screenshot':
    case 'catalog':
      return 200;
    case 'owned_course_illustration':
      return 0;
    default:
      return 100;
  }
}

function instructionalRoleTier(role: string) {
  switch (role) {
    case 'ui_step':
      return 500;
    case 'configuration_diagram':
      return 450;
    case 'safety_diagram':
      return 400;
    case 'workflow_diagram':
      return 350;
    case 'concept_diagram':
      return 250;
    case 'inline':
      return 200;
    case 'cover':
      return 50;
    default:
      return 150;
  }
}

function isUiScreenshotEvidence(sourceType: string | null) {
  return [
    'official_product_screenshot',
    'official_platform_screenshot',
    'user_uploaded_screenshot',
    'user_provided_screenshot',
    'product_ui_screenshot',
    'ui_screenshot',
    'screenshot',
    'catalog',
  ].includes(sourceType || '');
}

function mergeSemanticAssetResults(
  textResults: KnowledgeSearchResult[],
  assetResults: KnowledgeSearchResult[],
  limit: number,
  allowSeedChunk: boolean
) {
  const merged = new Map(textResults.map((result) => [result.id, result]));
  const seededIds = new Set<string>();
  let seeded = 0;

  for (const assetResult of assetResults) {
    const existing = merged.get(assetResult.id);
    if (existing) {
      merged.set(assetResult.id, {
        ...existing,
        score: Math.max(existing.score, assetResult.score),
        metadata: {
          ...existing.metadata,
          ...(!existing.metadata.matchedAssetId
            ? {
                matchedAssetId: assetResult.metadata.matchedAssetId,
                assetSemanticScore: assetResult.metadata.assetSemanticScore,
              }
            : {}),
        },
      });
      continue;
    }
    if (allowSeedChunk && seeded < 1) {
      merged.set(assetResult.id, assetResult);
      seededIds.add(assetResult.id);
      seeded += 1;
    }
  }

  const ranked = [...merged.values()].sort((a, b) => b.score - a.score);
  const limited = ranked.slice(0, limit);
  // UI/图片检索命中的证据块不能仅因文字分数略低而被 top-k 裁掉。
  // 只保留一个 seed，不扩大最终上下文数量。
  for (const seededId of seededIds) {
    if (limited.some((result) => result.id === seededId)) continue;
    const seededResult = merged.get(seededId);
    if (!seededResult) continue;
    if (limited.length >= limit) limited[limited.length - 1] = seededResult;
    else limited.push(seededResult);
  }
  return limited.sort((a, b) => b.score - a.score);
}

async function searchKnowledgeAssetVectors(
  query: string,
  vector: string,
  packIds: string[],
  limit: number
) {
  const sql = getSql();
  const visualIntentBoost = hasVisualAssetIntent(query) ? 0.06 : 0;

  try {
    const rows = await sql<
      Array<{
        asset_id: string;
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
      }>
    >`
			with nearest as materialized (
				select
					ka.id as asset_id,
					ka.embedding::halfvec(2048) <=> ${vector}::halfvec(2048) as distance
				from knowledge_assets ka
				where ka.embedding is not null
					and ka.embedding_model = ${EMBEDDING_MODEL}
					and ka.embedding_dimensions = 2048
					and ka.asset_type = 'image'
					and ka.status = 'active'
					and ka.visibility = 'public'
					and ka.public_url is not null
					and ka.public_url <> ''
				order by ka.embedding::halfvec(2048) <=> ${vector}::halfvec(2048)
				limit 100
			),
			scoped as materialized (
				select n.*
				from nearest n
				where exists (
					select 1
					from knowledge_asset_links kal
					join knowledge_pack_documents kpd
						on kpd.document_id = kal.document_id
					where kal.asset_id = n.asset_id
						and kpd.knowledge_pack_id in ${sql(packIds)}
				)
				limit ${Math.max(limit * 10, 30)}
			)
			select
				s.asset_id,
				kc.id,
				kc.document_id,
				kd.title,
				kd.source,
				kd.category,
				kc.heading,
				kc.content,
				kd.file_path,
				coalesce(kd.metadata->>'sourceUrl', kd.metadata->>'source_url') as source_url,
				kc.metadata,
				1 - (ka.embedding <=> ${vector}::vector(2048)) as similarity
			from scoped s
			join knowledge_assets ka on ka.id = s.asset_id
			join lateral (
				select
					kal.document_id,
					coalesce(
						kal.chunk_id,
						(
							select fallback.id
							from knowledge_chunks fallback
							where fallback.document_id = kal.document_id
							order by fallback.chunk_index
							limit 1
						)
					) as chunk_id
				from knowledge_asset_links kal
				where kal.asset_id = s.asset_id
					and exists (
						select 1
						from knowledge_pack_documents kpd
						where kpd.document_id = kal.document_id
							and kpd.knowledge_pack_id in ${sql(packIds)}
					)
				order by
					case when kal.chunk_id is not null then 0 else 1 end,
					kal.sort_order,
					kal.created_at
				limit 1
			) selected_link on selected_link.chunk_id is not null
			join knowledge_chunks kc on kc.id = selected_link.chunk_id
			join knowledge_documents kd on kd.id = kc.document_id
			where 1 - (ka.embedding <=> ${vector}::vector(2048)) >= ${ASSET_MIN_SCORE}
			order by similarity desc
			limit ${limit}
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
      score: Math.min(1, Number(row.similarity) + visualIntentBoost),
      metadata: {
        ...row.metadata,
        matchedAssetId: row.asset_id,
        assetSemanticScore: Number(row.similarity),
      },
    }));
  } catch (error) {
    console.error('Knowledge asset vector search failed:', error);
    return [];
  }
}

type KnowledgeAssetRow = {
  id: string;
  asset_type: string;
  mime_type: string;
  public_url: string;
  title: string | null;
  platform: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  published_at: Date | null;
  official: boolean;
  publisher: string | null;
  source_type: string | null;
  caption: string | null;
  ocr_text: string | null;
  visual_facts: Record<string, unknown>;
  analysis_provider: string | null;
  analysis_model: string | null;
  analysis_version: string | null;
  document_id: string;
  chunk_id: string | null;
  role: string;
  source_ref: string;
  alt_text: string | null;
  context: string | null;
  sort_order: number;
  semantic_score: number | null;
};

function mapKnowledgeAsset(row: KnowledgeAssetRow): KnowledgeAssetResult {
  return {
    id: row.id,
    assetType: row.asset_type,
    mimeType: row.mime_type,
    publicUrl: row.public_url,
    title: row.title,
    platform: row.platform,
    thumbnailUrl: row.thumbnail_url,
    embedUrl: row.embed_url,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
    publishedAt: row.published_at,
    official: row.official,
    publisher: row.publisher,
    sourceType: row.source_type,
    caption: row.caption,
    ocrText: row.ocr_text,
    visualFacts: row.visual_facts,
    analysisProvider: row.analysis_provider,
    analysisModel: row.analysis_model,
    analysisVersion: row.analysis_version,
    role: row.role,
    sourceRef: row.source_ref,
    altText: row.alt_text,
    context: row.context,
  };
}

async function hydrateKnowledgeAssets(
  results: KnowledgeSearchResult[],
  queryVector: string | null = null,
  query = ''
): Promise<KnowledgeSearchResult[]> {
  if (results.length === 0) return results;

  const chunkIds = [...new Set(results.map((result) => result.id))];
  const documentIds = [...new Set(results.map((result) => result.documentId))];
  const sql = getSql();

  try {
    // 一次取回最终 top-k 所需的媒体：精确 chunk 关联优先；同文档 cover
    // 只做兜底。一个 chunk 有多张图片时用图片说明向量与问题的相似度
    // 排序，避免按导入时间随机拿图。
    const rows = await sql<KnowledgeAssetRow[]>`
			select
				ka.id,
				ka.asset_type,
				ka.mime_type,
				ka.public_url,
				ka.title,
				ka.platform,
				ka.thumbnail_url,
				ka.embed_url,
				ka.width,
				ka.height,
				ka.duration_seconds,
				ka.published_at,
				coalesce(ka.metadata->>'official' = 'true', false) as official,
				ka.metadata->>'publisher' as publisher,
				ka.source_type,
				ka.caption,
				ka.ocr_text,
				ka.visual_facts,
				ka.analysis_provider,
				ka.analysis_model,
				ka.analysis_version,
				kal.document_id,
				kal.chunk_id,
				kal.role,
				kal.source_ref,
				kal.alt_text,
				kal.context,
				kal.sort_order,
				case
					when ${queryVector}::text is not null
						and ka.embedding is not null
						and ka.embedding_model = ${EMBEDDING_MODEL}
						and ka.embedding_dimensions = 2048
					then 1 - (ka.embedding <=> ${queryVector}::vector(2048))
					else null
				end as semantic_score
			from knowledge_asset_links kal
			join knowledge_assets ka on ka.id = kal.asset_id
			where ka.status = 'active'
				and ka.visibility = 'public'
				and ka.public_url is not null
				and ka.public_url <> ''
				and (
					kal.chunk_id in ${sql(chunkIds)}
					or (
						kal.role = 'cover'
						and kal.document_id in ${sql(documentIds)}
					)
				)
			order by
				case when kal.chunk_id in ${sql(chunkIds)} then 0 else 1 end,
				semantic_score desc nulls last,
				kal.sort_order asc,
				kal.created_at asc
		`;

    const exactByChunk = new Map<string, KnowledgeAssetRow[]>();
    const coversByDocument = new Map<string, KnowledgeAssetRow[]>();
    const resultChunkIds = new Set(chunkIds);
    for (const row of rows) {
      if (row.chunk_id && resultChunkIds.has(row.chunk_id)) {
        const exact = exactByChunk.get(row.chunk_id) || [];
        exact.push(row);
        exactByChunk.set(row.chunk_id, exact);
      }
      if (row.role === 'cover') {
        const covers = coversByDocument.get(row.document_id) || [];
        covers.push(row);
        coversByDocument.set(row.document_id, covers);
      }
    }
    const seenAssets = new Set<string>();
    let responseImageCount = 0;
    let responseResourceCount = 0;

    const hydratedResults = results.map((result) => {
      const candidates = [
        ...(exactByChunk.get(result.id) || []),
        ...(coversByDocument.get(result.documentId) || []),
      ];
      const preferredAssetId =
        typeof result.metadata.matchedAssetId === 'string'
          ? result.metadata.matchedAssetId
          : null;
      const uiInstructionIntent = hasUiInstructionIntent(query);
      candidates.sort((a, b) => {
        const exactDifference =
          Number(b.chunk_id === result.id) - Number(a.chunk_id === result.id);
        if (exactDifference !== 0) return exactDifference;

        const aEvidenceTier = uiEvidenceTier(a.source_type);
        const bEvidenceTier = uiEvidenceTier(b.source_type);
        if (uiInstructionIntent && aEvidenceTier !== bEvidenceTier) {
          return bEvidenceTier - aEvidenceTier;
        }

        // 向量命中的图片只能在同一证据层内提前，不能让插画越级覆盖截图。
        if (preferredAssetId && aEvidenceTier === bEvidenceTier) {
          const preferredDifference =
            Number(b.id === preferredAssetId) -
            Number(a.id === preferredAssetId);
          if (preferredDifference !== 0) return preferredDifference;
        }

        const roleDifference =
          instructionalRoleTier(b.role) - instructionalRoleTier(a.role);
        if (roleDifference !== 0) return roleDifference;

        const semanticDifference =
          (b.semantic_score ?? Number.NEGATIVE_INFINITY) -
          (a.semantic_score ?? Number.NEGATIVE_INFINITY);
        if (semanticDifference !== 0) return semanticDifference;

        return a.sort_order - b.sort_order;
      });
      const assets: KnowledgeAssetResult[] = [];
      let imageCount = 0;
      let resourceCount = 0;
      for (const candidate of candidates) {
        if (seenAssets.has(candidate.id)) continue;
        const isImage = candidate.asset_type === 'image';
        if (isImage && imageCount >= MAX_IMAGES_PER_RESULT) continue;
        if (!isImage && resourceCount >= MAX_RESOURCES_PER_RESULT) continue;
        if (isImage && responseImageCount >= MAX_IMAGES_PER_RESPONSE) continue;
        if (!isImage && responseResourceCount >= MAX_RESOURCES_PER_RESPONSE)
          continue;
        seenAssets.add(candidate.id);
        assets.push(mapKnowledgeAsset(candidate));
        if (isImage) {
          imageCount += 1;
          responseImageCount += 1;
        } else {
          resourceCount += 1;
          responseResourceCount += 1;
        }
        if (
          imageCount >= MAX_IMAGES_PER_RESULT &&
          resourceCount >= MAX_RESOURCES_PER_RESULT
        ) {
          break;
        }
      }
      return { ...result, assets };
    });
    if (!hasUiInstructionIntent(query)) return hydratedResults;

    // 操作类问题绝不把课程插画当成当前产品界面的证据。即使下游宿主
    // 没有执行 Skill 的选图规则，API 也只会暴露真实 UI 截图。
    return hydratedResults.map((result) => ({
      ...result,
      assets: (result.assets || []).filter(
        (asset) =>
          asset.assetType !== 'image' ||
          isUiScreenshotEvidence(asset.sourceType)
      ),
    }));
  } catch (error) {
    // 图片是检索结果的增强信息，资产表尚未迁移或 COS 元数据异常时，
    // 仍保留文本答案，避免把整个知识 API 一起打断。
    console.error('Knowledge asset hydration failed:', error);
    return results.map((result) => ({ ...result, assets: [] }));
  }
}

async function enrichWithKnowledgeAssets(
  query: string,
  vector: string,
  packIds: string[],
  results: KnowledgeSearchResult[],
  limit: number
) {
  const semanticResults = await searchKnowledgeAssetVectors(
    query,
    vector,
    packIds,
    Math.min(ASSET_SEMANTIC_LIMIT, limit)
  );
  const merged = mergeSemanticAssetResults(
    results,
    semanticResults,
    limit,
    hasVisualAssetIntent(query) || hasUiInstructionIntent(query)
  );
  return hydrateKnowledgeAssets(merged, vector, query);
}

export async function searchKnowledgeChunks(
  query: string,
  options: {
    packId?: string;
    packIds?: string[];
    limit?: number;
    minScore?: number;
    includeAssets?: boolean;
  } = {}
): Promise<KnowledgeSearchResult[]> {
  const packIds = normalizePackIds(options);
  const limit = options.limit || 6;
  const minScore = options.minScore ?? 0.2;
  const includeAssets = options.includeAssets ?? false;
  let queryVector: string | null = null;

  try {
    const embedding = await getZhipuEmbedding(query);
    const vector = `[${embedding.join(',')}]`;
    queryVector = vector;
    const sql = getSql();

    try {
      const rows = await sql<
        Array<{
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
        }>
      >`
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
					coalesce(kd.metadata->>'sourceUrl', kd.metadata->>'source_url') as source_url,
					kd.file_path,
					c.metadata,
					1 - c.distance as similarity,
					1 - c.distance
						+ case
							when kd.source = 'xhs_official' then 0.04
							when kd.source = 'xhs_28_questions' then -0.02
							else 0
						end
						+ case
							when c.metadata->>'retrievalBoost' ~ '^-?[0-9]+(\\.[0-9]+)?$'
							then greatest(-0.1, least((c.metadata->>'retrievalBoost')::double precision, 0.1))
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
        return includeAssets
          ? enrichWithKnowledgeAssets(
              query,
              vector,
              packIds,
              vectorResults,
              limit
            )
          : vectorResults;
      }

      const keywordResults = await keywordSearch(query, packIds, limit);

      if (vectorResults.length === 0) {
        const results = keywordResults.slice(0, limit);
        return includeAssets
          ? enrichWithKnowledgeAssets(query, vector, packIds, results, limit)
          : results;
      }

      const results = mergeSearchResults(vectorResults, keywordResults, limit);
      return includeAssets
        ? enrichWithKnowledgeAssets(query, vector, packIds, results, limit)
        : results;
    } finally {
      // 连接为模块级单例，这里不再销毁
    }
  } catch (error) {
    console.error(
      'Knowledge vector search failed, falling back to keyword search:',
      error
    );
    const results = (await keywordSearch(query, packIds, limit)).slice(
      0,
      limit
    );
    return includeAssets && queryVector
      ? enrichWithKnowledgeAssets(query, queryVector, packIds, results, limit)
      : includeAssets
        ? hydrateKnowledgeAssets(results, queryVector, query)
        : results;
  }
}
