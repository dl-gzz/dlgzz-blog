/**
 * Generic manifest-driven knowledge pack importer.
 *
 * Each pack lives in its own content folder (Obsidian vault or any dir) with a
 * `pack.md` manifest (YAML frontmatter parsed by gray-matter). One importer
 * serves every pack — adding a new pack means writing content + a manifest,
 * not copying this script.
 *
 * Run:
 *   pnpm knowledge:import -- --pack /path/to/pack-folder
 *   pnpm knowledge:import -- --pack /path/to/pack-folder --dry-run
 *   pnpm knowledge:import -- --pack /path/to/pack-folder --no-embeddings
 *   pnpm knowledge:import -- --pack /path/to/pack-folder --force
 *
 * pack.md manifest format (frontmatter):
 *   ---
 *   id: jianying-v1                # required, pack primary key
 *   name: 剪映实操知识包            # required
 *   description: ...
 *   scope: jianying                # defaults to id
 *   status: active
 *   version: 1
 *   category: 剪映                 # default category for all sources
 *   sources:
 *     - dir: docs                  # folder of .md files, relative to pack folder
 *       source: howto              # source tag written to knowledge_documents
 *     - file: faq.md
 *       source: faq
 *   units:
 *     - type: heading_qa           # H2 heading = question, body = answer
 *       file: faq.md
 *       riskLevel: low
 *   ---
 *   (body = human-readable pack notes, not imported)
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import * as dotenv from 'dotenv';
import matter from 'gray-matter';
import postgres from 'postgres';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

const EMBEDDING_MODEL = 'embedding-3';
const EMBEDDING_DIMENSIONS = 2048;
const MAX_CHUNK_CHARS = 1400;
const EMBEDDING_DELAY_MS = 220;

type ManifestSource = {
  dir?: string;
  file?: string;
  source?: string;
  category?: string;
  recursive?: boolean;
  categoryFromFolder?: boolean;
  metadata?: Record<string, unknown>;
};

type ContentReplacement = {
  from: string;
  to: string;
};

type ManifestUnitRule = {
  type: 'heading_qa';
  file?: string;
  dir?: string;
  riskLevel?: string;
};

type PackManifest = {
  id: string;
  name: string;
  description: string;
  scope: string;
  status: string;
  version: number;
  category: string;
  metadata: Record<string, unknown>;
  sources: ManifestSource[];
  units: ManifestUnitRule[];
  contentReplacements: ContentReplacement[];
  packDir: string;
};

type SourceDoc = {
  source: string;
  category: string;
  filePath: string;
  storagePath: string;
  metadata: Record<string, unknown>;
};

type PreparedDoc = SourceDoc & {
  id: string;
  title: string;
  rawContent: string;
  bodyContent: string;
  contentHash: string;
};

type Chunk = {
  id: string;
  documentId: string;
  chunkIndex: number;
  heading: string | null;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
};

type QaUnit = {
  id: string;
  documentId: string;
  intent: string;
  title: string;
  answer: string;
  sourceQuote: string;
  riskLevel: string;
};

type CliOptions = {
  packDir: string;
  dryRun: boolean;
  noEmbeddings: boolean;
  force: boolean;
  limit?: number;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    packDir: '',
    dryRun: false,
    noEmbeddings: false,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') options.dryRun = true;
    if (arg === '--no-embeddings') options.noEmbeddings = true;
    if (arg === '--force') options.force = true;
    if (arg === '--pack') options.packDir = args[++i] || '';
    if (arg === '--limit') options.limit = Number(args[++i]);
  }

  if (!options.packDir) {
    throw new Error('缺少 --pack <pack-folder>（包含 pack.md 的目录）');
  }
  options.packDir = resolve(options.packDir);

  return options;
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readMetadataScalar(value: unknown): string | number | boolean | '' {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return '';
}

function loadManifest(packDir: string): PackManifest {
  const manifestPath = join(packDir, 'pack.md');
  if (!existsSync(manifestPath)) {
    throw new Error(`找不到 manifest：${manifestPath}`);
  }

  const parsed = matter(readFileSync(manifestPath, 'utf8'));
  const data = parsed.data as Record<string, unknown>;

  const id = readString(data.id);
  const name = readString(data.name);
  if (!id || !name) {
    throw new Error('pack.md frontmatter 必须包含 id 和 name');
  }

  const rawSources = Array.isArray(data.sources) ? data.sources : [];
  const sources: ManifestSource[] = rawSources
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object')
    )
    .map((item) => ({
      dir: readString(item.dir) || undefined,
      file: readString(item.file) || undefined,
      source: readString(item.source) || undefined,
      category: readString(item.category) || undefined,
      recursive: item.recursive === true,
      categoryFromFolder: item.categoryFromFolder === true,
      metadata:
        item.metadata &&
        typeof item.metadata === 'object' &&
        !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {},
    }))
    .filter((item) => item.dir || item.file);

  if (!sources.length) {
    throw new Error('pack.md 至少要声明一个 sources 条目（dir 或 file）');
  }

  const rawUnits = Array.isArray(data.units) ? data.units : [];
  const units: ManifestUnitRule[] = rawUnits
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object')
    )
    .filter(
      (item) =>
        readString(item.type) === 'heading_qa' &&
        (readString(item.file) || readString(item.dir))
    )
    .map((item) => ({
      type: 'heading_qa' as const,
      file: readString(item.file) || undefined,
      dir: readString(item.dir) || undefined,
      riskLevel: readString(item.riskLevel, 'low'),
    }));

  const rawReplacements = Array.isArray(data.content_replacements)
    ? data.content_replacements
    : [];
  const contentReplacements: ContentReplacement[] = rawReplacements
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object')
    )
    .map((item) => ({
      from: readString(item.from),
      to: readString(item.to),
    }))
    .filter((item) => item.from);

  return {
    id,
    name,
    description: readString(data.description),
    scope: readString(data.scope, id),
    status: readString(data.status, 'active'),
    version: Number(data.version) || 1,
    category: readString(data.category, name),
    metadata: Object.fromEntries(
      [
        ['visibility', readString(data.visibility)],
        ['knowledgeType', readString(data.knowledge_type)],
        ['product', readString(data.product)],
        ['persona', readString(data.persona)],
      ].filter((entry) => entry[1])
    ),
    sources,
    units,
    contentReplacements,
    packDir,
  };
}

function sha1(input: string) {
  return createHash('sha1').update(input).digest('hex');
}

function stableId(prefix: string, value: string) {
  return `${prefix}-${sha1(value).slice(0, 16)}`;
}

function cleanTitle(value: string) {
  return value
    .replace(/[#*_`[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTitle(filePath: string, content: string) {
  const parsed = matter(content);
  if (typeof parsed.data.title === 'string' && parsed.data.title.trim()) {
    return cleanTitle(parsed.data.title);
  }

  const firstHeading = parsed.content.match(/^#\s+(.+)$/m)?.[1];
  if (firstHeading) return cleanTitle(firstHeading);

  return basename(filePath, '.md');
}

function normalizeMarkdownForEmbedding(content: string) {
  return content
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|]+?)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+?)\]\]/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*\|[\s|:-]*\|\s*$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function estimateTokenCount(text: string) {
  return Math.ceil(text.length / 1.7);
}

function splitOversizedText(text: string, maxChars = MAX_CHUNK_CHARS) {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf('\n', maxChars);
    if (cut < maxChars * 0.55) cut = remaining.lastIndexOf('。', maxChars);
    if (cut < maxChars * 0.55) cut = maxChars;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitSectionIntoChunks(
  heading: string | null,
  sectionContent: string
) {
  const paragraphs = sectionContent
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CHUNK_CHARS) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      chunks.push(...splitOversizedText(paragraph));
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > MAX_CHUNK_CHARS && current.trim()) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks.map((chunk) => {
    if (!heading) return chunk;
    if (chunk.startsWith('#')) return chunk;
    return `## ${heading}\n\n${chunk}`;
  });
}

function isMeaningfulChunk(content: string) {
  const text = content
    .replace(/[#*_`>\-|\\.[\](){}:：。；;，,\s\d]/g, '')
    .trim();
  return text.length >= 24;
}

function splitIntoSections(bodyContent: string) {
  const text = normalizeMarkdownForEmbedding(bodyContent);
  const lines = text.split(/\r?\n/);
  const sections: Array<{ heading: string | null; content: string }> = [];
  let heading: string | null = null;
  let buffer: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch && buffer.join('\n').trim()) {
      sections.push({ heading, content: buffer.join('\n').trim() });
      heading = cleanTitle(headingMatch[2]);
      buffer = [line];
      continue;
    }

    if (headingMatch && !buffer.join('\n').trim()) {
      heading = cleanTitle(headingMatch[2]);
    }

    buffer.push(line);
  }

  if (buffer.join('\n').trim()) {
    sections.push({ heading, content: buffer.join('\n').trim() });
  }

  return sections;
}

function chunkMarkdown(doc: PreparedDoc): Chunk[] {
  const sections = splitIntoSections(doc.bodyContent);

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const pieces = splitSectionIntoChunks(section.heading, section.content);
    for (const piece of pieces) {
      if (!isMeaningfulChunk(piece)) continue;

      const index = chunks.length;
      chunks.push({
        id: `${doc.id}-chunk-${String(index + 1).padStart(4, '0')}`,
        documentId: doc.id,
        chunkIndex: index,
        heading: section.heading,
        content: piece,
        tokenCount: estimateTokenCount(piece),
        metadata: {
          ...doc.metadata,
          source: doc.source,
          category: doc.category,
          title: doc.title,
          filePath: doc.storagePath,
        },
      });
    }
  }

  return chunks;
}

/**
 * heading_qa 提取：文件里每个 H2 视为一个问题，H2 下的正文视为答案。
 * 适合 FAQ / 「怎么做」型原子知识文件。
 */
function extractHeadingQaUnits(
  doc: PreparedDoc,
  manifest: PackManifest,
  riskLevel: string
): QaUnit[] {
  const units: QaUnit[] = [];
  const lines = doc.bodyContent.split(/\r?\n/);
  let currentTitle = '';
  let buffer: string[] = [];

  const flush = () => {
    const answer = buffer.join('\n').trim();
    if (!currentTitle || !answer) return;
    units.push({
      id: `${manifest.id}-unit-${sha1(`${doc.id}:${currentTitle}`).slice(0, 16)}`,
      documentId: doc.id,
      intent: currentTitle,
      title: currentTitle,
      answer,
      sourceQuote: `## ${currentTitle}`,
      riskLevel,
    });
  };

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      flush();
      currentTitle = cleanTitle(match[1]);
      buffer = [];
      continue;
    }
    if (currentTitle) buffer.push(line);
  }
  flush();

  return units;
}

function listMarkdownFiles(dir: string, recursive = false): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir).sort((a, b) =>
    a.localeCompare(b, 'zh-Hans-CN')
  )) {
    if (entry.startsWith('.') || entry.startsWith('_')) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (recursive) results.push(...listMarkdownFiles(fullPath, true));
      continue;
    }
    if (entry.endsWith('.md') && entry !== 'pack.md') results.push(fullPath);
  }
  return results;
}

function collectSourceDocs(manifest: PackManifest): SourceDoc[] {
  const docs: SourceDoc[] = [];

  for (const entry of manifest.sources) {
    const source = entry.source || 'docs';
    const category = entry.category || manifest.category;

    if (entry.dir) {
      const dirPath = join(manifest.packDir, entry.dir);
      for (const filePath of listMarkdownFiles(dirPath, entry.recursive)) {
        // categoryFromFolder：用文件所在子目录名当分类（官方文档按目录分类的场景）
        const folderName = basename(join(filePath, '..'));
        const fileCategory =
          entry.categoryFromFolder && folderName !== basename(dirPath)
            ? folderName
            : category;
        docs.push({
          source,
          category: fileCategory,
          filePath,
          storagePath: `${source}/${relative(dirPath, filePath).replaceAll('\\', '/')}`,
          metadata: {
            ...manifest.metadata,
            ...entry.metadata,
            scope: manifest.scope,
            corpus: source,
            packStatus: manifest.status,
            packVersion: manifest.version,
            relativePath: `${source}/${relative(dirPath, filePath).replaceAll('\\', '/')}`,
          },
        });
      }
      continue;
    }

    if (entry.file) {
      const filePath = join(manifest.packDir, entry.file);
      if (!existsSync(filePath)) {
        console.warn(`Source file missing, skipped: ${filePath}`);
        continue;
      }
      docs.push({
        source,
        category,
        filePath,
        storagePath: `${source}/${basename(filePath)}`,
        metadata: {
          ...manifest.metadata,
          ...entry.metadata,
          scope: manifest.scope,
          corpus: source,
          packStatus: manifest.status,
          packVersion: manifest.version,
          relativePath: `${source}/${basename(filePath)}`,
        },
      });
    }
  }

  const seen = new Set<string>();
  return docs.filter((doc) => {
    if (seen.has(doc.filePath)) return false;
    seen.add(doc.filePath);
    return true;
  });
}

function applyContentReplacements(
  content: string,
  replacements: ContentReplacement[]
) {
  return replacements.reduce(
    (result, replacement) =>
      result.split(replacement.from).join(replacement.to),
    content
  );
}

function normalizePublisher(value: unknown) {
  return readString(value)
    .replaceAll('白杨', '独立工作者')
    .replace(/baiyang/gi, '独立工作者');
}

function extractMarkdownSourceUrl(content: string) {
  const labeled = content.match(
    /(?:^|\n)\s*(?:来源|官方来源|来源链接)\s*[:：]\s*\[?(https?:\/\/[^\s)\]>]+)/i
  );
  if (labeled?.[1]) return labeled[1].replace(/[。，、；;]+$/, '');

  const official = content.match(
    /https:\/\/(?:school|ark|zhaoshang)\.xiaohongshu\.com[^\s)\]>]*/i
  );
  return official?.[0]?.replace(/[。，、；;]+$/, '') || '';
}

function prepareDoc(doc: SourceDoc, manifest: PackManifest): PreparedDoc {
  const rawContent = applyContentReplacements(
    readFileSync(doc.filePath, 'utf8'),
    manifest.contentReplacements
  );
  const parsed = matter(rawContent);
  const frontmatter = parsed.data as Record<string, unknown>;
  const explicitSourceUrl = readString(frontmatter.source_url);
  const genericSource = readString(frontmatter.source);
  const sourceUrl =
    explicitSourceUrl ||
    (/^https?:\/\//.test(genericSource) ? genericSource : '') ||
    extractMarkdownSourceUrl(rawContent);

  // 保留可用于语义过滤、权限判断、事实新鲜度和答案溯源的稳定字段。
  // 不把完整 frontmatter 原样塞进 metadata，避免图片清单等大字段污染每个 chunk。
  const semanticFields = Object.fromEntries(
    [
      ['documentType', readString(frontmatter.type)],
      ['documentStatus', readString(frontmatter.status)],
      ['sourceUrl', sourceUrl],
      ['factsVerified', readMetadataScalar(frontmatter.facts_verified)],
      ['created', readMetadataScalar(frontmatter.created)],
      ['updated', readMetadataScalar(frontmatter.updated)],
      ['lastUpdated', readMetadataScalar(frontmatter.last_updated)],
      ['fetchedAt', readMetadataScalar(frontmatter.fetched_at)],
      ['navTitle', readString(frontmatter.nav_title)],
      ['section', readString(frontmatter.section)],
      ['route', readString(frontmatter.route)],
      ['license', readString(frontmatter.license)],
      ['sourceChapter', readMetadataScalar(frontmatter.source_chapter)],
      ['distilledAt', readMetadataScalar(frontmatter.distilled)],
      ['toolUrl', readString(frontmatter.tool)],
      ['series', readString(frontmatter.series)],
      ['episode', readMetadataScalar(frontmatter.episode)],
      ['sourceKind', readString(frontmatter.source_kind)],
      ['platform', readString(frontmatter.platform)],
      ['publisher', normalizePublisher(frontmatter.publisher)],
      [
        'publishedAt',
        readMetadataScalar(frontmatter.published_at ?? frontmatter.published),
      ],
    ].filter((entry) => entry[1] !== '')
  );
  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.filter(
        (tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())
      )
    : [];
  const metadata = {
    ...doc.metadata,
    ...semanticFields,
    ...(tags.length ? { tags } : {}),
  };

  return {
    ...doc,
    metadata,
    id: stableId('knowledge-doc', doc.filePath),
    title: getTitle(doc.filePath, rawContent),
    rawContent,
    bodyContent: parsed.content.trim(),
    contentHash: sha1(rawContent),
  };
}

async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    throw new Error('ZHIPU_API_KEY is not set');
  }

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
    const body = await resp.text().catch(() => '');
    throw new Error(
      `Zhipu embedding failed: ${resp.status} ${body.slice(0, 240)}`
    );
  }

  const data = (await resp.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const explicit = (process.env.DATABASE_SSL || '').toLowerCase();
  const ssl =
    explicit === 'false' || explicit === 'disable' || explicit === 'off'
      ? false
      : 'require';

  return postgres(connectionString, {
    ssl,
    max: 1,
    prepare: false,
    connect_timeout: 15,
  });
}

async function main() {
  const options = parseArgs();
  const manifest = loadManifest(options.packDir);
  const docs = collectSourceDocs(manifest)
    .slice(0, options.limit || undefined)
    .map((doc) => prepareDoc(doc, manifest));

  const unitFileSet = new Map<string, ManifestUnitRule>();
  for (const rule of manifest.units) {
    if (rule.file) {
      unitFileSet.set(resolve(join(manifest.packDir, rule.file)), rule);
    }
    if (rule.dir) {
      for (const filePath of listMarkdownFiles(
        join(manifest.packDir, rule.dir)
      )) {
        unitFileSet.set(resolve(filePath), rule);
      }
    }
  }

  console.log(`Knowledge pack import: ${manifest.name} (${manifest.id})`);
  console.log(`Pack dir: ${manifest.packDir}`);
  console.log(`Documents: ${docs.length}`);
  console.log(`Unit rules: ${manifest.units.length}`);
  console.log(
    `Embeddings: ${options.noEmbeddings ? 'disabled' : EMBEDDING_MODEL}`
  );

  if (options.dryRun) {
    console.log('\nDry run documents:');
    let dryRunChunks = 0;
    let dryRunUnits = 0;
    for (const doc of docs) {
      const unitRule = unitFileSet.get(resolve(doc.filePath));
      const chunks = chunkMarkdown(doc);
      const units = unitRule
        ? extractHeadingQaUnits(doc, manifest, unitRule.riskLevel || 'low')
        : [];
      dryRunChunks += chunks.length;
      dryRunUnits += units.length;
      console.log(
        `- [${doc.source}] ${doc.title} (${relative(manifest.packDir, doc.filePath)}) [${chunks.length} chunks, ${units.length} units]`
      );
    }
    console.log(`\nEstimated chunks: ${dryRunChunks}`);
    console.log(`Estimated QA units: ${dryRunUnits}`);
    return;
  }

  const sql = getSql();
  const ingestRunId = randomUUID();
  const errors: string[] = [];
  let importedDocuments = 0;
  let skippedDocuments = 0;
  let totalChunks = 0;
  let embeddedChunks = 0;
  let totalUnits = 0;

  try {
    await sql`
			insert into knowledge_packs (id, name, description, scope, status, metadata, updated_at)
			values (
				${manifest.id},
				${manifest.name},
				${manifest.description},
				${manifest.scope},
				${manifest.status},
				${sql.json({
          ...manifest.metadata,
          version: manifest.version,
          embeddingModel: EMBEDDING_MODEL,
          embeddingDimensions: EMBEDDING_DIMENSIONS,
        } as never)},
				now()
			)
			on conflict (id) do update set
				name = excluded.name,
				description = excluded.description,
				scope = excluded.scope,
				status = excluded.status,
				metadata = excluded.metadata,
				updated_at = now()
		`;

    await sql`
			insert into knowledge_ingest_run (
				id, knowledge_pack_id, source_root, status, total_documents, total_units, errors
			)
			values (
				${ingestRunId},
				${manifest.id},
				${`knowledge-pack:${manifest.id}`},
				${'running'},
				${docs.length},
				${0},
				${JSON.stringify([])}::jsonb
			)
		`;

    for (const doc of docs) {
      try {
        const existing = await sql<{ content_hash: string }[]>`
					select content_hash from knowledge_documents where id = ${doc.id}
				`;
        const unchanged = existing[0]?.content_hash === doc.contentHash;

        await sql`
					insert into knowledge_documents (
						id, source, category, title, file_path, content_hash, raw_content, status, metadata, updated_at
					)
					values (
						${doc.id},
						${doc.source},
						${doc.category},
						${doc.title},
						${doc.storagePath},
						${doc.contentHash},
						${doc.rawContent},
						${'active'},
						${sql.json(doc.metadata as never)},
						now()
					)
					on conflict (id) do update set
						source = excluded.source,
						category = excluded.category,
						title = excluded.title,
						file_path = excluded.file_path,
						content_hash = excluded.content_hash,
						raw_content = excluded.raw_content,
						status = excluded.status,
						metadata = excluded.metadata,
						updated_at = now()
				`;

        await sql`
					insert into knowledge_pack_documents (id, knowledge_pack_id, document_id)
					values (${`${manifest.id}-${doc.id}`}, ${manifest.id}, ${doc.id})
					on conflict (knowledge_pack_id, document_id) do nothing
				`;

        if (unchanged && !options.force) {
          await sql`
						update knowledge_chunks
						set metadata = metadata || ${sql.json({
              ...doc.metadata,
              source: doc.source,
              category: doc.category,
              title: doc.title,
              filePath: doc.storagePath,
            } as never)}
						where document_id = ${doc.id}
					`;
          skippedDocuments++;
          console.log(`Skip unchanged: ${doc.title}`);
          continue;
        }

        await sql`delete from knowledge_units where document_id = ${doc.id}`;
        await sql`delete from knowledge_chunks where document_id = ${doc.id}`;

        const chunks = chunkMarkdown(doc);
        for (const chunk of chunks) {
          let embedding: number[] | null = null;
          if (!options.noEmbeddings) {
            embedding = await getEmbedding(
              `${doc.title}\n${chunk.heading || ''}\n${chunk.content}`
            );
            embeddedChunks++;
            await wait(EMBEDDING_DELAY_MS);
          }

          if (embedding) {
            await sql`
							insert into knowledge_chunks (
								id, document_id, chunk_index, heading, content, token_count,
								embedding, embedding_model, embedding_dimensions, metadata
							)
							values (
								${chunk.id},
								${chunk.documentId},
								${chunk.chunkIndex},
								${chunk.heading},
								${chunk.content},
								${chunk.tokenCount},
								${JSON.stringify(embedding)}::vector,
								${EMBEDDING_MODEL},
								${EMBEDDING_DIMENSIONS},
								${sql.json(chunk.metadata as never)}
							)
						`;
          } else {
            await sql`
							insert into knowledge_chunks (
								id, document_id, chunk_index, heading, content, token_count,
								embedding_model, embedding_dimensions, metadata
							)
							values (
								${chunk.id},
								${chunk.documentId},
								${chunk.chunkIndex},
								${chunk.heading},
								${chunk.content},
								${chunk.tokenCount},
								${EMBEDDING_MODEL},
								${EMBEDDING_DIMENSIONS},
								${sql.json(chunk.metadata as never)}
							)
						`;
          }

          totalChunks++;
        }

        const unitRule = unitFileSet.get(resolve(doc.filePath));
        if (unitRule) {
          const units = extractHeadingQaUnits(
            doc,
            manifest,
            unitRule.riskLevel || 'low'
          );
          for (const unit of units) {
            await sql`
							insert into knowledge_units (
								id, document_id, unit_type, intent, title, answer, source_quote, risk_level, metadata
							)
							values (
								${unit.id},
								${unit.documentId},
								${'heading_qa'},
								${unit.intent},
								${unit.title},
								${unit.answer},
								${unit.sourceQuote},
								${unit.riskLevel},
								${sql.json({ scope: manifest.scope, packId: manifest.id } as never)}
							)
							on conflict (id) do update set
								document_id = excluded.document_id,
								intent = excluded.intent,
								title = excluded.title,
								answer = excluded.answer,
								source_quote = excluded.source_quote,
								metadata = excluded.metadata
						`;
            totalUnits++;
          }
        }

        importedDocuments++;
        console.log(`Imported: ${doc.title} (${chunks.length} chunks)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${doc.storagePath}: ${message}`);
        console.error(`Failed: ${doc.filePath}`);
        console.error(message);
      }
    }

    await sql`
			update knowledge_ingest_run set
				status = ${errors.length ? 'completed_with_errors' : 'completed'},
				imported_documents = ${importedDocuments},
				skipped_documents = ${skippedDocuments},
				total_chunks = ${totalChunks},
				embedded_chunks = ${embeddedChunks},
				total_units = ${totalUnits},
				errors = ${JSON.stringify(errors)}::jsonb,
				completed_at = now()
			where id = ${ingestRunId}
		`;

    console.log('\nImport complete');
    console.log(`Imported documents: ${importedDocuments}`);
    console.log(`Skipped documents: ${skippedDocuments}`);
    console.log(`Inserted chunks: ${totalChunks}`);
    console.log(`Embedded chunks: ${embeddedChunks}`);
    console.log(`QA units: ${totalUnits}`);
    if (errors.length) console.log(`Errors: ${errors.length}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
