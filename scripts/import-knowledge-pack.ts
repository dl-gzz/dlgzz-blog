/**
 * Generic manifest-driven knowledge pack importer.
 *
 * Each pack lives in its own content folder (Obsidian vault or any dir) with a
 * `pack.md` manifest (YAML frontmatter parsed by gray-matter). One importer
 * serves every pack — adding a new pack means writing content + a manifest,
 * not copying this script.
 *
 * Run:
 *   pnpm knowledge:import -- --pack /path/to/pack-folder --publish
 *   pnpm knowledge:import -- --pack /path/to/pack-folder --dry-run
 *   pnpm knowledge:import -- --pack /path/to/pack-folder --publish --no-embeddings
 *   pnpm knowledge:import -- --pack /path/to/pack-folder --publish --only-source docs/article.md --allow-embeddings
 *   pnpm knowledge:import -- --pack /path/to/pack-folder --publish --force
 *   pnpm knowledge:import -- --pack /path/to/pack-folder --publish --reconcile
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
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import {
  basename,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import * as dotenv from 'dotenv';
import matter from 'gray-matter';
import postgres from 'postgres';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

const EMBEDDING_MODEL = 'embedding-3';
const EMBEDDING_DIMENSIONS = 2048;
const MAX_CHUNK_CHARS = 1400;
const EMBEDDING_DELAY_MS = 220;
const MAX_SOURCE_BYTES = 1_000_000;
const DEFAULT_TEXT_EXTENSIONS = [
  '.md',
  '.txt',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.json',
  '.yaml',
  '.yml',
  '.sql',
  '.sh',
  '.css',
  '.html',
] as const;

type ManifestCollection = {
  id: string;
  name: string;
  description: string;
  status: string;
  sortOrder: number;
  metadata: Record<string, unknown>;
};

type ManifestSource = {
  dir?: string;
  file?: string;
  source?: string;
  category?: string;
  recursive?: boolean;
  categoryFromFolder?: boolean;
  extensions?: string[];
  metadata?: Record<string, unknown>;
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
  collection?: ManifestCollection;
  documentIdStrategy: 'absolute_path' | 'pack_relative';
  embeddingPolicy: 'automatic' | 'manual';
  sources: ManifestSource[];
  units: ManifestUnitRule[];
  packDir: string;
  sourceRoot: string;
};

type SourceDoc = {
  source: string;
  category: string;
  filePath: string;
  relativePath: string;
  contentType: 'markdown' | 'code' | 'text';
  language: string | null;
  metadata: Record<string, unknown>;
};

type PreparedDoc = SourceDoc & {
  id: string;
  title: string;
  rawContent: string;
  bodyContent: string;
  contentHash: string;
  storedPath: string;
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

type PreparedChunk = Chunk & {
  embedding: number[] | null;
};

type PreparedDocumentPlan = {
  doc: PreparedDoc;
  unchanged: boolean;
  chunks: PreparedChunk[];
  units: QaUnit[];
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
  sourceRoot?: string;
  onlySource?: string;
  dryRun: boolean;
  noEmbeddings: boolean;
  allowEmbeddings: boolean;
  publish: boolean;
  reconcile: boolean;
  force: boolean;
  limit?: number;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    packDir: '',
    dryRun: false,
    noEmbeddings: false,
    allowEmbeddings: false,
    publish: false,
    reconcile: false,
    force: false,
  };

  const readOptionValue = (index: number, flag: string) => {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} 缺少参数值`);
    }
    return value;
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--no-embeddings':
        options.noEmbeddings = true;
        break;
      case '--allow-embeddings':
        options.allowEmbeddings = true;
        break;
      case '--publish':
        options.publish = true;
        break;
      case '--reconcile':
        options.reconcile = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--pack':
        options.packDir = readOptionValue(i, arg);
        i++;
        break;
      case '--source-root':
        options.sourceRoot = readOptionValue(i, arg);
        i++;
        break;
      case '--only-source':
        options.onlySource = readOptionValue(i, arg);
        i++;
        break;
      case '--limit':
        options.limit = Number(readOptionValue(i, arg));
        i++;
        break;
      default:
        throw new Error(`未知参数：${arg}`);
    }
  }

  if (!options.packDir) {
    throw new Error('缺少 --pack <pack-folder>（包含 pack.md 的目录）');
  }
  options.packDir = resolve(options.packDir);
  if (options.sourceRoot) options.sourceRoot = resolve(options.sourceRoot);
  if (options.onlySource) {
    const normalized = options.onlySource
      .replaceAll('\\', '/')
      .replace(/^\.\//, '');
    if (
      !normalized ||
      normalized.includes('\0') ||
      isAbsolute(normalized) ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized) ||
      normalized.split('/').some((part) => part === '..')
    ) {
      throw new Error('--only-source 必须是 source root 内的安全相对路径');
    }
    options.onlySource = normalized;
  }
  if (options.noEmbeddings && options.allowEmbeddings) {
    throw new Error('--no-embeddings 与 --allow-embeddings 不能同时使用');
  }
  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) || options.limit < 1)
  ) {
    throw new Error('--limit 必须是大于 0 的整数');
  }
  if (
    options.reconcile &&
    (options.limit !== undefined || options.onlySource)
  ) {
    throw new Error(
      '--reconcile 只能用于未设置 --limit/--only-source 的全量发布'
    );
  }
  if (options.reconcile && (options.dryRun || !options.publish)) {
    throw new Error('--reconcile 必须与非 dry-run 的 --publish 一起使用');
  }

  return options;
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function loadManifest(
  packDir: string,
  sourceRootOverride?: string
): PackManifest {
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
      extensions: readStringArray(item.extensions).map((extension) =>
        extension.startsWith('.')
          ? extension.toLowerCase()
          : `.${extension.toLowerCase()}`
      ),
      metadata: readRecord(item.metadata),
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

  const collectionData = readRecord(data.collection);
  const collectionId = readString(collectionData.id);
  const collection = collectionId
    ? {
        id: collectionId,
        name: readString(collectionData.name, collectionId),
        description: readString(collectionData.description),
        status: readString(collectionData.status, 'active'),
        sortOrder: Math.max(
          0,
          Math.floor(Number(collectionData.sortOrder) || 0)
        ),
        metadata: readRecord(collectionData.metadata),
      }
    : undefined;
  const sourceRoot =
    sourceRootOverride || resolve(packDir, readString(data.sourceRoot, '.'));

  return {
    id,
    name,
    description: readString(data.description),
    scope: readString(data.scope, id),
    status: readString(data.status, 'active'),
    version: Number(data.version) || 1,
    category: readString(data.category, name),
    metadata: readRecord(data.metadata),
    collection,
    documentIdStrategy:
      readString(data.documentIdStrategy) === 'pack_relative'
        ? 'pack_relative'
        : 'absolute_path',
    embeddingPolicy:
      readString(data.embeddingPolicy) === 'automatic' ? 'automatic' : 'manual',
    sources,
    units,
    packDir,
    sourceRoot,
  };
}

function sha1(input: string) {
  return createHash('sha1').update(input).digest('hex');
}

function stableId(prefix: string, value: string) {
  return `${prefix}-${sha1(value).slice(0, 16)}`;
}

function haveSameValues(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
}

function cleanTitle(value: string) {
  return value
    .replace(/[#*_`[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTitle(
  filePath: string,
  content: string,
  contentType: SourceDoc['contentType']
) {
  if (contentType !== 'markdown') return basename(filePath);
  const parsed = matter(content);
  if (typeof parsed.data.title === 'string' && parsed.data.title.trim()) {
    return cleanTitle(parsed.data.title);
  }

  const firstHeading = parsed.content.match(/^#\s+(.+)$/m)?.[1];
  if (firstHeading) return cleanTitle(firstHeading);

  return basename(filePath, '.md');
}

function languageForExtension(extension: string) {
  const languages: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.sql': 'sql',
    '.sh': 'shell',
    '.css': 'css',
    '.html': 'html',
  };
  return languages[extension] || null;
}

function classifySourceFile(filePath: string) {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.md') {
    return {
      contentType: 'markdown' as const,
      language: 'markdown',
      mimeType: 'text/markdown',
    };
  }
  const language = languageForExtension(extension);
  if (language) {
    const mimeType =
      extension === '.json'
        ? 'application/json'
        : extension === '.yaml' || extension === '.yml'
          ? 'application/yaml'
          : 'text/plain';
    return { contentType: 'code' as const, language, mimeType };
  }
  return {
    contentType: 'text' as const,
    language: null,
    mimeType: 'text/plain',
  };
}

function assertSafePathWithinRoot(rootPath: string, candidatePath: string) {
  if (!existsSync(rootPath))
    throw new Error(`Source root missing: ${rootPath}`);
  if (!existsSync(candidatePath))
    throw new Error(`Source path missing: ${candidatePath}`);
  const rootReal = realpathSync(rootPath);
  const candidateReal = realpathSync(candidatePath);
  const relativePath = relative(rootReal, candidateReal);
  if (
    relativePath.startsWith(`..${sep}`) ||
    relativePath === '..' ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Source path escapes source root: ${candidatePath}`);
  }
  const segments = relativePath.split(sep).filter(Boolean);
  if (segments.some((segment) => segment.startsWith('.'))) {
    throw new Error(`Hidden source paths are not allowed: ${relativePath}`);
  }
  if (lstatSync(candidatePath).isSymbolicLink()) {
    throw new Error(`Symbolic-link sources are not allowed: ${relativePath}`);
  }
  return { rootReal, candidateReal, relativePath };
}

function isObviousSecretPlaceholder(value: string) {
  const normalized = value
    .trim()
    .replace(/^["'`]+|["'`,;]+$/g, '')
    .trim();
  if (!normalized) return true;
  const nestedAssignment = normalized.match(/^[A-Za-z0-9_.-]+=([^;,]+)$/)?.[1];
  if (nestedAssignment) return isObviousSecretPlaceholder(nestedAssignment);
  return /^(?:your(?:[-_ ][a-z0-9]+)*|replace(?:[-_ ]+me)?|example(?:[-_ ][a-z0-9]+)*|sample(?:[-_ ][a-z0-9]+)*|dummy(?:[-_ ][a-z0-9]+)*|test(?:[-_ ][a-z0-9]+)*|placeholder(?:[-_ ][a-z0-9]+)*|change(?:[-_ ]+me)?|changeme|redacted|user(?:name)?|password|pass|value|x{3,}|\*{3,}|\.{3,}|<[^>]+>|\$\{[^}]+\}|\{\{[^}]+\}\}|%[A-Za-z0-9_]+%|(?:process\.)?env(?:\.[A-Za-z0-9_]+)?|os\.environ(?:\[[^\]]+\])?)$/i.test(
    normalized
  );
}

function assertNoSensitiveUrls(filePath: string, content: string) {
  const sensitiveParameter =
    /(?:^|[-_.])(?:access[-_]?token|api[-_]?key|auth(?:orization)?|code|credential|key|password|passwd|secret|session(?:id)?|sig(?:nature)?|token|q[-_]?ak|q[-_]?signature|x[-_]?amz[-_]?(?:credential|signature|security[-_]?token))(?:$|[-_.])/i;
  const urls = content.match(/https?:\/\/[^\s<>"'`)\]]+/gi) ?? [];

  for (const rawUrl of urls) {
    try {
      const url = new URL(rawUrl.replaceAll('&amp;', '&'));
      const userInfo = [url.username, url.password].filter(Boolean);
      if (
        userInfo.length > 0 &&
        userInfo.some((value) => !isObviousSecretPlaceholder(value))
      ) {
        throw new Error(`Potential URL credentials found in ${filePath}`);
      }

      for (const [name, value] of url.searchParams) {
        if (
          sensitiveParameter.test(name) &&
          value &&
          !isObviousSecretPlaceholder(value)
        ) {
          throw new Error(
            `Potential secret URL parameter "${name}" found in ${filePath}`
          );
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes(filePath)) {
        throw error;
      }
      // Malformed example URLs are not imported as links. Other scanners below
      // still inspect their literal text for configured credentials.
    }
  }
}

function assertSafeTextContent(filePath: string, content: string) {
  const byteLength = Buffer.byteLength(content, 'utf8');
  if (byteLength > MAX_SOURCE_BYTES) {
    throw new Error(`Source exceeds ${MAX_SOURCE_BYTES} bytes: ${filePath}`);
  }
  const forbiddenPatterns: Array<[RegExp, string]> = [
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
    [
      /\bsk-(?:proj-|ant-[A-Za-z0-9_-]+-)?[A-Za-z0-9_-]{20,}\b/,
      'AI provider token',
    ],
    [
      /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{16,}\b/,
      'payment provider token',
    ],
    [/\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/, 'GitHub token'],
    [/\b(?:AKIA|ASIA|AKID)[A-Za-z0-9]{12,}\b/, 'cloud access key'],
    [/\bAIza[A-Za-z0-9_-]{30,}\b/, 'Google API key'],
    [/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/, 'Slack token'],
    [/\bnpm_[A-Za-z0-9]{30,}\b/, 'npm token'],
    [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}\b/, 'Supabase key'],
    [
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
      'JWT',
    ],
    [
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@/i,
      'database URL with credentials',
    ],
  ];
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(content))
      throw new Error(`Potential ${label} found in ${filePath}`);
  }

  const authorizationPattern =
    /^\s*["']?(?:authorization|proxy[-_]?authorization|cookie|set[-_]?cookie)["']?\s*[:=]\s*["'`]?(?:(?:bearer|basic)\s+)?([^"'`\s#]{12,})/gim;
  for (const match of content.matchAll(authorizationPattern)) {
    if (!isObviousSecretPlaceholder(match[1])) {
      throw new Error(
        `Potential authorization or cookie secret found in ${filePath}`
      );
    }
  }

  const bearerPattern = /\bbearer\s+([A-Za-z0-9._~+/=-]{12,})/gi;
  for (const match of content.matchAll(bearerPattern)) {
    if (!isObviousSecretPlaceholder(match[1])) {
      throw new Error(`Potential bearer token found in ${filePath}`);
    }
  }

  const assignmentPattern =
    /^\s*(?:export\s+)?(?:(?:const|let|var)\s+)?["']?[A-Za-z0-9_-]*(?:api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|token|authorization|password|passwd|cookie|session(?:[_-]?id)?)["']?\s*[:=]\s*["'`]?(?:bearer\s+)?([^"'`\s#]{12,})/gim;
  for (const match of content.matchAll(assignmentPattern)) {
    const value = match[1];
    if (!isObviousSecretPlaceholder(value)) {
      throw new Error(`Potential configured secret found in ${filePath}`);
    }
  }

  assertNoSensitiveUrls(filePath, content);
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
          relativePath: doc.relativePath,
          contentType: doc.contentType,
          language: doc.language,
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

function listSourceFiles(
  dir: string,
  recursive = false,
  extensions: readonly string[] = ['.md']
): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir).sort((a, b) =>
    a.localeCompare(b, 'zh-Hans-CN')
  )) {
    if (entry.startsWith('.') || entry.startsWith('_')) continue;
    const fullPath = join(dir, entry);
    const linkStat = lstatSync(fullPath);
    if (linkStat.isSymbolicLink()) continue;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (recursive)
        results.push(...listSourceFiles(fullPath, true, extensions));
      continue;
    }
    if (entry === 'pack.md') continue;
    if (extensions.includes(extname(entry).toLowerCase()))
      results.push(fullPath);
  }
  return results;
}

function collectSourceDocs(manifest: PackManifest): SourceDoc[] {
  const docs: SourceDoc[] = [];

  for (const entry of manifest.sources) {
    const source = entry.source || 'docs';
    const category = entry.category || manifest.category;

    if (entry.dir) {
      const dirPath = resolve(manifest.sourceRoot, entry.dir);
      assertSafePathWithinRoot(manifest.sourceRoot, dirPath);
      const extensions = entry.extensions?.length ? entry.extensions : ['.md'];
      for (const filePath of listSourceFiles(
        dirPath,
        entry.recursive,
        extensions
      )) {
        const safePath = assertSafePathWithinRoot(
          manifest.sourceRoot,
          filePath
        );
        // categoryFromFolder：用文件所在子目录名当分类（官方文档按目录分类的场景）
        const folderName = basename(join(filePath, '..'));
        const fileCategory =
          entry.categoryFromFolder && folderName !== basename(dirPath)
            ? folderName
            : category;
        const classification = classifySourceFile(filePath);
        docs.push({
          source,
          category: fileCategory,
          filePath: safePath.candidateReal,
          relativePath: safePath.relativePath,
          ...classification,
          metadata: {
            ...entry.metadata,
            scope: manifest.scope,
            corpus: source,
            relativePath: safePath.relativePath,
            contentType: classification.contentType,
            language: classification.language,
            mimeType: classification.mimeType,
          },
        });
      }
      continue;
    }

    if (entry.file) {
      const filePath = resolve(manifest.sourceRoot, entry.file);
      if (!existsSync(filePath)) {
        console.warn(`Source file missing, skipped: ${filePath}`);
        continue;
      }
      const safePath = assertSafePathWithinRoot(manifest.sourceRoot, filePath);
      const extension = extname(filePath).toLowerCase();
      if (
        !DEFAULT_TEXT_EXTENSIONS.includes(
          extension as (typeof DEFAULT_TEXT_EXTENSIONS)[number]
        )
      ) {
        throw new Error(`Unsupported text source extension: ${extension}`);
      }
      const classification = classifySourceFile(filePath);
      docs.push({
        source,
        category,
        filePath: safePath.candidateReal,
        relativePath: safePath.relativePath,
        ...classification,
        metadata: {
          ...entry.metadata,
          scope: manifest.scope,
          corpus: source,
          relativePath: safePath.relativePath,
          contentType: classification.contentType,
          language: classification.language,
          mimeType: classification.mimeType,
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

function safeFrontmatterMetadata(data: Record<string, unknown>) {
  const allowedKeys = [
    'author',
    'chapter',
    'created',
    'date',
    'license',
    'published',
    'source_url',
    'status',
    'tags',
    'type',
    'updated',
  ] as const;
  return Object.fromEntries(
    allowedKeys
      .filter((key) => data[key] !== undefined)
      .map((key) => [key, data[key]])
  );
}

function documentIdForSource(doc: SourceDoc, manifest: PackManifest) {
  const idInput =
    manifest.documentIdStrategy === 'pack_relative'
      ? `${manifest.id}:${doc.relativePath}`
      : doc.filePath;
  return stableId('knowledge-doc', idInput);
}

function prepareDoc(doc: SourceDoc, manifest: PackManifest): PreparedDoc {
  const rawContent = readFileSync(doc.filePath, 'utf8');
  assertSafeTextContent(doc.filePath, rawContent);
  const parsed =
    doc.contentType === 'markdown'
      ? matter(rawContent)
      : { data: {}, content: rawContent };
  const frontmatter = safeFrontmatterMetadata(
    parsed.data as Record<string, unknown>
  );

  // 采集类文档的 frontmatter 带原文链接（source_url），提进 metadata 用于答案溯源
  const sourceUrl = readString(
    (parsed.data as Record<string, unknown>).source_url
  );
  const metadata = {
    ...manifest.metadata,
    ...doc.metadata,
    ...frontmatter,
    ...(sourceUrl ? { source_url: sourceUrl } : {}),
    packId: manifest.id,
    packVersion: manifest.version,
  };
  return {
    ...doc,
    metadata,
    id: documentIdForSource(doc, manifest),
    title: getTitle(doc.filePath, rawContent, doc.contentType),
    rawContent,
    bodyContent: parsed.content.trim(),
    contentHash: sha1(rawContent),
    storedPath:
      manifest.documentIdStrategy === 'pack_relative'
        ? `knowledge://${manifest.id}/${doc.relativePath.split(sep).join('/')}`
        : doc.filePath,
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
  if (!options.dryRun && !options.publish) {
    throw new Error(
      '拒绝写入：非 dry-run 发布必须显式提供 --publish；可先用 --dry-run 检查'
    );
  }
  const manifest = loadManifest(options.packDir, options.sourceRoot);
  if (!options.dryRun && manifest.status !== 'active') {
    throw new Error(
      `拒绝发布：pack.md status 必须是 active，当前为 ${manifest.status || '(empty)'}`
    );
  }
  const sourceDocs = collectSourceDocs(manifest);
  const manifestDocumentIds = new Set(
    sourceDocs.map((doc) => documentIdForSource(doc, manifest))
  );
  const selectedDocs = sourceDocs.filter((doc) => {
    if (!options.onlySource) return true;
    return doc.relativePath.split(sep).join('/') === options.onlySource;
  });
  if (options.onlySource && selectedDocs.length !== 1) {
    throw new Error(
      `--only-source 必须精确命中一篇已声明来源，当前命中 ${selectedDocs.length} 篇`
    );
  }
  const docs = selectedDocs
    .slice(0, options.limit || undefined)
    .map((doc) => prepareDoc(doc, manifest));
  if (options.allowEmbeddings && (!options.onlySource || docs.length !== 1)) {
    throw new Error(
      '生成内容向量必须同时提供 --only-source，并且只能精确选择一篇文章'
    );
  }
  // Content embeddings are always opt-in. A manifest can describe a legacy
  // automatic policy, but it can never bypass the explicit CLI approval gate.
  const embeddingsEnabled = options.allowEmbeddings && !options.noEmbeddings;
  if (!options.dryRun && docs.length === 0) {
    throw new Error('拒绝发布空知识包：manifest 当前没有可发布文档');
  }

  const unitFileSet = new Map<string, ManifestUnitRule>();
  for (const rule of manifest.units) {
    if (rule.file) {
      unitFileSet.set(resolve(join(manifest.sourceRoot, rule.file)), rule);
    }
    if (rule.dir) {
      for (const filePath of listSourceFiles(
        join(manifest.sourceRoot, rule.dir)
      )) {
        unitFileSet.set(resolve(filePath), rule);
      }
    }
  }

  console.log(`Knowledge pack import: ${manifest.name} (${manifest.id})`);
  console.log(`Pack dir: ${manifest.packDir}`);
  console.log(`Source root: ${manifest.sourceRoot}`);
  console.log(`Documents: ${docs.length}`);
  console.log(`Unit rules: ${manifest.units.length}`);
  console.log(
    `Embeddings: ${embeddingsEnabled ? EMBEDDING_MODEL : 'disabled'}`
  );
  console.log(
    `Embedding policy: ${manifest.embeddingPolicy} (explicit opt-in required)`
  );
  if (options.onlySource) console.log(`Only source: ${options.onlySource}`);

  if (options.dryRun) {
    console.log('\nDry run documents:');
    for (const doc of docs) {
      const isUnitFile = unitFileSet.has(resolve(doc.filePath));
      console.log(
        `- [${doc.source}] ${doc.title} (${doc.relativePath})${isUnitFile ? ' [heading_qa units]' : ''}`
      );
    }
    return;
  }

  const sql = getSql();
  const ingestRunId = randomUUID();
  const errors: string[] = [];
  const fullPublish = options.limit === undefined && !options.onlySource;
  const selectedDocumentIds = new Set(docs.map((doc) => doc.id));
  const publishLockName = `knowledge-pack-publish:${manifest.id}`;
  let publishLockAcquired = false;
  let importedDocuments = 0;
  let skippedDocuments = 0;
  let totalChunks = 0;
  let embeddedChunks = 0;
  let totalUnits = 0;
  let reconciledMappings = 0;

  try {
    await sql`
      select pg_advisory_lock(hashtext(${publishLockName})::bigint)
    `;
    publishLockAcquired = true;

    const existingPack = await sql<{ status: string }[]>`
      select status
      from knowledge_packs
      where id = ${manifest.id}
    `;
    const originalPackStatus = existingPack[0]?.status ?? null;
    if (!fullPublish && originalPackStatus !== 'active') {
      throw new Error(
        `拒绝定向发布：partial/--only-source 只能更新原本 active 的 pack，当前为 ${originalPackStatus || '(missing)'}`
      );
    }

    const existingMappings = await sql<
      { document_id: string; document_status: string }[]
    >`
      select kpd.document_id, kd.status as document_status
      from knowledge_pack_documents kpd
      inner join knowledge_documents kd on kd.id = kpd.document_id
      where kpd.knowledge_pack_id = ${manifest.id}
    `;
    const initialMappingIds = new Set(
      existingMappings.map((row) => row.document_id)
    );
    const staleDocumentIds = [...initialMappingIds].filter(
      (documentId) => !manifestDocumentIds.has(documentId)
    );
    if (staleDocumentIds.length > 0 && (!fullPublish || !options.reconcile)) {
      const preview = staleDocumentIds.slice(0, 10).join(', ');
      const mode = fullPublish ? '全量' : '定向';
      throw new Error(
        `拒绝${mode}发布：发现 ${staleDocumentIds.length} 条 manifest 外旧 pack mapping（${preview}${staleDocumentIds.length > 10 ? ', ...' : ''}）。只有确认完整来源清单后的全量 --reconcile 才能移除这些 mapping；不会删除文档`
      );
    }
    if (staleDocumentIds.length > 0) {
      console.log(
        `Reconcile planned: ${staleDocumentIds.length} stale pack mappings (only after every document succeeds)`
      );
    }
    if (
      !fullPublish &&
      existingMappings.some((row) => row.document_status !== 'active')
    ) {
      throw new Error(
        '拒绝定向发布：起始 pack mapping 中存在非 active 文档，必须先用完整 manifest 做全量修复'
      );
    }

    const expectedFinalMappingIds = fullPublish
      ? new Set(manifestDocumentIds)
      : new Set([...initialMappingIds, ...selectedDocumentIds]);

    // Build the entire publication plan before the first write. In particular,
    // all embedding requests must succeed while the current active pack and
    // documents are still untouched.
    const documentPlans: PreparedDocumentPlan[] = [];
    for (const doc of docs) {
      const existing = await sql<{ content_hash: string; status: string }[]>`
        select content_hash, status
        from knowledge_documents
        where id = ${doc.id}
      `;
      const unchanged =
        existing[0]?.content_hash === doc.contentHash &&
        existing[0]?.status === 'active' &&
        !options.force &&
        !options.allowEmbeddings;
      if (unchanged) {
        documentPlans.push({ doc, unchanged: true, chunks: [], units: [] });
        continue;
      }

      const chunks = chunkMarkdown(doc);
      const preparedChunks: PreparedChunk[] = [];
      for (const chunk of chunks) {
        let embedding: number[] | null = null;
        if (embeddingsEnabled) {
          embedding = await getEmbedding(
            `${doc.title}\n${chunk.heading || ''}\n${chunk.content}`
          );
          await wait(EMBEDDING_DELAY_MS);
        }
        preparedChunks.push({ ...chunk, embedding });
      }

      const unitRule = unitFileSet.get(resolve(doc.filePath));
      const units = unitRule
        ? extractHeadingQaUnits(doc, manifest, unitRule.riskLevel || 'low')
        : [];
      documentPlans.push({
        doc,
        unchanged: false,
        chunks: preparedChunks,
        units,
      });
    }

    await sql.begin(async (tx) => {
      const lockedPack = await tx<{ status: string }[]>`
        select status
        from knowledge_packs
        where id = ${manifest.id}
        for update
      `;
      const lockedPackStatus = lockedPack[0]?.status ?? null;
      if (lockedPackStatus !== originalPackStatus) {
        throw new Error(
          `发布前 pack 状态已变化（${originalPackStatus || '(missing)'} -> ${lockedPackStatus || '(missing)'}），拒绝覆盖并发更新`
        );
      }

      const lockedMappings = await tx<
        { document_id: string; document_status: string }[]
      >`
        select kpd.document_id, kd.status as document_status
        from knowledge_pack_documents kpd
        inner join knowledge_documents kd on kd.id = kpd.document_id
        where kpd.knowledge_pack_id = ${manifest.id}
        for update
      `;
      const lockedMappingIds = new Set(
        lockedMappings.map((row) => row.document_id)
      );
      if (!haveSameValues(lockedMappingIds, initialMappingIds)) {
        throw new Error('发布前 pack mapping 已变化，拒绝覆盖并发更新');
      }
      if (
        !fullPublish &&
        lockedMappings.some((row) => row.document_status !== 'active')
      ) {
        throw new Error('发布前定向 pack mapping 出现非 active 文档，拒绝激活');
      }

      if (manifest.collection) {
        await tx`
          insert into knowledge_collections (id, name, description, status, metadata, updated_at)
          values (
            ${manifest.collection.id},
            ${manifest.collection.name},
            ${manifest.collection.description},
            ${manifest.collection.status},
            ${tx.json(manifest.collection.metadata as never)},
            now()
          )
          on conflict (id) do update set
            name = excluded.name,
            description = excluded.description,
            status = excluded.status,
            metadata = excluded.metadata,
            updated_at = now()
        `;
      }

      await tx`
        insert into knowledge_packs (id, name, description, scope, status, metadata, updated_at)
        values (
          ${manifest.id},
          ${manifest.name},
          ${manifest.description},
          ${manifest.scope},
          ${'draft'},
          ${tx.json({
            ...manifest.metadata,
            version: manifest.version,
            embeddingModel: EMBEDDING_MODEL,
            embeddingDimensions: EMBEDDING_DIMENSIONS,
            ...(manifest.collection
              ? { collectionId: manifest.collection.id }
              : {}),
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

      if (manifest.collection) {
        await tx`
          insert into knowledge_collection_packs (
            id, collection_id, knowledge_pack_id, sort_order, status, metadata, updated_at
          )
          values (
            ${`${manifest.collection.id}:${manifest.id}`},
            ${manifest.collection.id},
            ${manifest.id},
            ${manifest.collection.sortOrder},
            ${'active'},
            ${tx.json({} as never)},
            now()
          )
          on conflict (collection_id, knowledge_pack_id) do update set
            sort_order = excluded.sort_order,
            status = excluded.status,
            updated_at = now()
        `;
      }

      await tx`
        insert into knowledge_ingest_run (
          id, knowledge_pack_id, source_root, status, total_documents, total_units, errors
        )
        values (
          ${ingestRunId},
          ${manifest.id},
          ${manifest.packDir},
          ${'running'},
          ${docs.length},
          ${0},
          ${JSON.stringify([])}::jsonb
        )
      `;
    });

    for (const plan of documentPlans) {
      const { doc, chunks: preparedChunks, units } = plan;
      try {
        if (plan.unchanged) {
          await sql.begin(async (tx) => {
            await tx`
              insert into knowledge_pack_documents (id, knowledge_pack_id, document_id)
              values (${`${manifest.id}-${doc.id}`}, ${manifest.id}, ${doc.id})
              on conflict (knowledge_pack_id, document_id) do nothing
            `;
          });
          skippedDocuments++;
          console.log(`Skip unchanged: ${doc.title}`);
          continue;
        }

        // The whole plan (including embeddings) was prepared before the pack
        // entered draft. This transaction atomically swaps one document.
        await sql.begin(async (tx) => {
          await tx`
            insert into knowledge_documents (
              id, source, category, title, file_path, content_hash, raw_content, status, metadata, updated_at
            )
            values (
              ${doc.id},
              ${doc.source},
              ${doc.category},
              ${doc.title},
              ${doc.storedPath},
              ${doc.contentHash},
              ${doc.rawContent},
              ${'pending'},
              ${tx.json(doc.metadata as never)},
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

          await tx`
            insert into knowledge_pack_documents (id, knowledge_pack_id, document_id)
            values (${`${manifest.id}-${doc.id}`}, ${manifest.id}, ${doc.id})
            on conflict (knowledge_pack_id, document_id) do nothing
          `;

          await tx`delete from knowledge_units where document_id = ${doc.id}`;
          await tx`delete from knowledge_chunks where document_id = ${doc.id}`;

          for (const chunk of preparedChunks) {
            if (chunk.embedding) {
              await tx`
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
                  ${JSON.stringify(chunk.embedding)}::vector,
                  ${EMBEDDING_MODEL},
                  ${EMBEDDING_DIMENSIONS},
                  ${tx.json(chunk.metadata as never)}
                )
              `;
            } else {
              await tx`
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
                  ${tx.json(chunk.metadata as never)}
                )
              `;
            }
          }

          for (const unit of units) {
            await tx`
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
                ${tx.json({ scope: manifest.scope, packId: manifest.id } as never)}
              )
              on conflict (id) do update set
                document_id = excluded.document_id,
                intent = excluded.intent,
                title = excluded.title,
                answer = excluded.answer,
                source_quote = excluded.source_quote,
                metadata = excluded.metadata
            `;
          }

          await tx`
            update knowledge_documents
            set status = ${'active'}, updated_at = now()
            where id = ${doc.id}
          `;
        });

        importedDocuments++;
        totalChunks += preparedChunks.length;
        embeddedChunks += preparedChunks.filter(
          (chunk) => chunk.embedding !== null
        ).length;
        totalUnits += units.length;
        console.log(`Imported: ${doc.title} (${preparedChunks.length} chunks)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${doc.filePath}: ${message}`);
        console.error(`Failed: ${doc.filePath}`);
        console.error(message);
      }
    }

    if (errors.length === 0) {
      try {
        const reconciledCount = await sql.begin(async (tx) => {
          let transactionReconciledMappings = 0;
          await tx`
            select id
            from knowledge_packs
            where id = ${manifest.id}
            for update
          `;

          const currentMappings = await tx<
            { document_id: string; document_status: string }[]
          >`
            select kpd.document_id, kd.status as document_status
            from knowledge_pack_documents kpd
            inner join knowledge_documents kd on kd.id = kpd.document_id
            where kpd.knowledge_pack_id = ${manifest.id}
            for update
          `;
          const inactiveMappingIds = currentMappings
            .filter(
              (row) =>
                expectedFinalMappingIds.has(row.document_id) &&
                row.document_status !== 'active'
            )
            .map((row) => row.document_id);
          if (inactiveMappingIds.length > 0) {
            throw new Error(
              `发布收尾 mapping 含 ${inactiveMappingIds.length} 篇非 active 文档；已拒绝激活`
            );
          }
          const actualMappingIds = new Set(
            currentMappings.map((row) => row.document_id)
          );
          const unexpectedMappingIds = [...actualMappingIds].filter(
            (documentId) => !expectedFinalMappingIds.has(documentId)
          );

          if (unexpectedMappingIds.length > 0) {
            if (!fullPublish || !options.reconcile) {
              throw new Error(
                `发布收尾 mapping 集合不匹配：出现 ${unexpectedMappingIds.length} 条非预期 mapping；已拒绝激活`
              );
            }
            for (const documentId of unexpectedMappingIds) {
              await tx`
                delete from knowledge_pack_documents
                where knowledge_pack_id = ${manifest.id}
                and document_id = ${documentId}
              `;
              actualMappingIds.delete(documentId);
            }
            transactionReconciledMappings = unexpectedMappingIds.length;
          }

          const missingMappingIds = [...expectedFinalMappingIds].filter(
            (documentId) => !actualMappingIds.has(documentId)
          );
          if (
            missingMappingIds.length > 0 ||
            actualMappingIds.size !== expectedFinalMappingIds.size
          ) {
            throw new Error(
              `发布收尾 mapping 集合不完整：缺少 ${missingMappingIds.length} 条；已拒绝激活`
            );
          }

          await tx`
            update knowledge_packs
            set status = ${'active'}, updated_at = now()
            where id = ${manifest.id}
          `;
          return options.reconcile ? transactionReconciledMappings : 0;
        });
        reconciledMappings = reconciledCount;
      } catch (error) {
        reconciledMappings = 0;
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`publish-finalize: ${message}`);
        console.error(`Publish finalize failed: ${message}`);
      }
    } else if (options.reconcile) {
      console.error(
        'Reconcile skipped: at least one document failed; no stale mapping was removed'
      );
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
    if (options.reconcile) {
      console.log(`Reconciled stale mappings: ${reconciledMappings}`);
    }
    if (errors.length) {
      console.log(`Errors: ${errors.length}`);
      throw new Error(
        `知识包发布未完成：${errors.length} 个错误；pack 保持 draft，失败文档未暴露半写状态`
      );
    }
  } finally {
    if (publishLockAcquired) {
      try {
        await sql`
          select pg_advisory_unlock(hashtext(${publishLockName})::bigint)
        `;
      } catch (error) {
        console.error(
          `Failed to release publish lock: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
