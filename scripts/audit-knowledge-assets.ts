/**
 * Build a private, manifest-scoped inventory of images referenced by a
 * knowledge pack and preflight them with local macOS Vision OCR/barcode scans.
 *
 * This script does not upload files, call a paid model, or write local source
 * paths into the importable catalog. Its report is private and may contain
 * local paths, so choose an output location that will never be published.
 *
 * Run:
 *   pnpm knowledge:assets:audit -- --pack /path/to/pack --out /tmp/audit.json
 *   pnpm knowledge:assets:audit -- --pack /path/to/pack --out /tmp/audit.json --scan
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const IMAGE_EXTENSIONS = new Set([
  '.apng',
  '.avif',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
]);
const LOCAL_SCAN_EXTENSIONS = new Set([
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
]);
const MIME_TYPES: Record<string, string> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

type JsonObject = Record<string, unknown>;

type ManifestSource = {
  dir?: string;
  file?: string;
  source?: string;
  category?: string;
  recursive?: boolean;
  metadata?: JsonObject;
};

type ContentReplacement = {
  from: string;
  to: string;
};

type PackManifest = {
  id: string;
  name: string;
  packDir: string;
  sources: ManifestSource[];
  replacements: ContentReplacement[];
};

type SourceDocument = {
  filePath: string;
  documentPath: string;
  source: string;
  category: string;
  metadata: JsonObject;
};

type ImageOccurrence = {
  rawRef: string;
  altText: string;
  line: number;
  heading: string;
  context: string;
  documentPath: string;
  documentTitle: string;
  source: string;
  category: string;
  authority: string;
};

type LocalAsset = {
  kind: 'local';
  key: string;
  sourceRef: string;
  sourceFile: string;
  contentHash: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  assetClass: string;
  licenseState: 'owned' | 'manual_review';
  occurrences: ImageOccurrence[];
  resolutionMethod: string;
};

type RemoteAsset = {
  kind: 'remote';
  key: string;
  sourceRef: string;
  remoteUrl: string;
  extension: string;
  mimeType: string;
  assetClass: 'remote';
  licenseState: 'manual_review';
  occurrences: ImageOccurrence[];
};

type UnresolvedAsset = {
  kind: 'unresolved';
  key: string;
  sourceRef: string;
  rawRef: string;
  occurrences: ImageOccurrence[];
  candidates: string[];
};

type InventoryAsset = LocalAsset | RemoteAsset | UnresolvedAsset;

type VisionBarcode = {
  frameIndex?: number;
  symbology: string;
  payload?: string | null;
};

type VisionResult = {
  id: string;
  width?: number | null;
  height?: number | null;
  framesTotal?: number;
  framesInspected?: number;
  ocrText?: string;
  barcodes?: VisionBarcode[];
  error?: string | null;
};

type RiskLevel = 'blocking' | 'review';

type RiskFinding = {
  flag: string;
  level: RiskLevel;
  evidence: string;
};

type AuditStatus = 'ready' | 'needs_review' | 'blocked';

type CliOptions = {
  packDir: string;
  outputPath: string;
  scan: boolean;
  concurrency: number;
  limit?: number;
};

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const valueAfter = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] || '' : '';
  };
  const packDir = valueAfter('--pack');
  const outputPath = valueAfter('--out');
  if (!packDir || !outputPath) {
    throw new Error('需要 --pack <pack-folder> 和 --out <private-report.json>');
  }

  const concurrency = Number(valueAfter('--concurrency') || 3);
  const limitValue = Number(valueAfter('--limit'));
  return {
    packDir: resolve(packDir),
    outputPath: resolve(outputPath),
    scan: args.includes('--scan'),
    concurrency: Number.isFinite(concurrency)
      ? Math.max(1, Math.min(Math.floor(concurrency), 6))
      : 3,
    limit:
      Number.isInteger(limitValue) && limitValue > 0 ? limitValue : undefined,
  };
}

function sanitizeIdentity(value: string, replacements: ContentReplacement[]) {
  const replaced = replacements.reduce(
    (result, replacement) =>
      result.split(replacement.from).join(replacement.to),
    value
  );
  return replaced
    .replaceAll('白杨', '独立工作者')
    .replace(/baiyang/gi, '独立工作者')
    .replace(/dlgzz/gi, '独立工作者');
}

function loadManifest(packDir: string): PackManifest {
  const manifestPath = join(packDir, 'pack.md');
  if (!existsSync(manifestPath)) {
    throw new Error(`找不到 manifest：${manifestPath}`);
  }
  const parsed = matter(readFileSync(manifestPath, 'utf8'));
  const data = parsed.data as JsonObject;
  const id = readString(data.id);
  const name = readString(data.name);
  if (!id || !name) throw new Error('pack.md 必须包含 id 和 name');

  const sources = (Array.isArray(data.sources) ? data.sources : [])
    .filter((item): item is JsonObject =>
      Boolean(item && typeof item === 'object' && !Array.isArray(item))
    )
    .map((item) => ({
      dir: readString(item.dir) || undefined,
      file: readString(item.file) || undefined,
      source: readString(item.source) || undefined,
      category: readString(item.category) || undefined,
      recursive: item.recursive === true,
      metadata:
        item.metadata &&
        typeof item.metadata === 'object' &&
        !Array.isArray(item.metadata)
          ? (item.metadata as JsonObject)
          : {},
    }))
    .filter((item) => item.dir || item.file);
  if (!sources.length) throw new Error('pack.md 至少需要一个 sources 条目');

  const replacements = (
    Array.isArray(data.content_replacements) ? data.content_replacements : []
  )
    .filter((item): item is JsonObject =>
      Boolean(item && typeof item === 'object' && !Array.isArray(item))
    )
    .map((item) => ({
      from: readString(item.from),
      to: readString(item.to),
    }))
    .filter((item) => item.from);

  return { id, name, packDir, sources, replacements };
}

function listMarkdownFiles(dirPath: string, recursive: boolean): string[] {
  if (!existsSync(dirPath)) return [];
  const results: string[] = [];
  for (const name of readdirSync(dirPath).sort((a, b) =>
    a.localeCompare(b, 'zh-Hans-CN')
  )) {
    if (name.startsWith('.') || name.startsWith('_')) continue;
    const filePath = join(dirPath, name);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      if (recursive) results.push(...listMarkdownFiles(filePath, true));
      continue;
    }
    if (name.endsWith('.md') && name !== 'pack.md') results.push(filePath);
  }
  return results;
}

function collectDocuments(manifest: PackManifest): SourceDocument[] {
  const documents: SourceDocument[] = [];
  for (const entry of manifest.sources) {
    const source = entry.source || 'docs';
    const category = entry.category || manifest.name;
    if (entry.dir) {
      const sourceDir = resolve(manifest.packDir, entry.dir);
      for (const filePath of listMarkdownFiles(
        sourceDir,
        entry.recursive === true
      )) {
        documents.push({
          filePath,
          documentPath: `${source}/${relative(sourceDir, filePath).replaceAll('\\', '/')}`,
          source,
          category,
          metadata: entry.metadata || {},
        });
      }
      continue;
    }
    if (entry.file) {
      const filePath = resolve(manifest.packDir, entry.file);
      if (!existsSync(filePath)) continue;
      documents.push({
        filePath,
        documentPath: `${source}/${basename(filePath)}`,
        source,
        category,
        metadata: entry.metadata || {},
      });
    }
  }

  const seen = new Set<string>();
  return documents.filter((document) => {
    if (seen.has(document.filePath)) return false;
    seen.add(document.filePath);
    return true;
  });
}

function findVaultRoot(packDir: string) {
  let cursor = resolve(packDir);
  while (true) {
    if (existsSync(join(cursor, '.obsidian'))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) return packDir;
    cursor = parent;
  }
}

function indexVaultImages(vaultRoot: string) {
  const byBasename = new Map<string, string[]>();
  const visit = (dirPath: string) => {
    for (const name of readdirSync(dirPath)) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const fullPath = join(dirPath, name);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!IMAGE_EXTENSIONS.has(extname(name).toLowerCase())) continue;
      const candidates = byBasename.get(name) || [];
      candidates.push(fullPath);
      byBasename.set(name, candidates);
    }
  };
  visit(vaultRoot);
  return byBasename;
}

function cleanHeading(value: string) {
  return value
    .replace(/[#*_`[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDocumentTitle(filePath: string, rawContent: string) {
  const parsed = matter(rawContent);
  const title = readString(parsed.data.title);
  if (title) return cleanHeading(title);
  const heading = parsed.content.match(/^#\s+(.+)$/m)?.[1];
  return heading ? cleanHeading(heading) : basename(filePath, '.md');
}

function extractMarkdownImages(content: string) {
  const matches: Array<{
    rawRef: string;
    altText: string;
    index: number;
  }> = [];
  const occupied: Array<[number, number]> = [];

  const wikiPattern = /!\[\[([^\]]+)\]\]/g;
  for (const match of content.matchAll(wikiPattern)) {
    const index = match.index ?? 0;
    const [rawRef, alias = ''] = match[1].split('|', 2);
    matches.push({ rawRef: rawRef.trim(), altText: alias.trim(), index });
    occupied.push([index, index + match[0].length]);
  }

  const markdownPattern =
    /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g;
  for (const match of content.matchAll(markdownPattern)) {
    const index = match.index ?? 0;
    if (occupied.some(([start, end]) => index >= start && index < end)) {
      continue;
    }
    matches.push({
      rawRef: (match[2] || match[3] || '').trim(),
      altText: match[1].trim(),
      index,
    });
  }

  return matches.sort((a, b) => a.index - b.index);
}

function nearestHeading(content: string, index: number) {
  const before = content.slice(0, index);
  let heading = '';
  for (const match of before.matchAll(/^(#{1,3})\s+(.+)$/gm)) {
    heading = cleanHeading(match[2]);
  }
  return heading;
}

function nearbyContext(content: string, index: number) {
  const before = content.slice(Math.max(0, index - 800), index);
  const after = content.slice(index, index + 800);
  const beforeParagraphs = before
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter((item) => item && !item.startsWith('!'));
  const afterParagraphs = after
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter((item) => item && !item.startsWith('!'));
  return [beforeParagraphs.at(-1), afterParagraphs[0]]
    .filter(Boolean)
    .join('\n')
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 600)
    .trim();
}

function decodeImageRef(rawRef: string) {
  const withoutAnchor = rawRef.split('#', 1)[0].split('?', 1)[0];
  try {
    return decodeURIComponent(withoutAnchor);
  } catch {
    return withoutAnchor;
  }
}

function classifyLocalAsset(filePath: string, packDir: string) {
  const normalized = filePath.replaceAll('\\', '/');
  const packNormalized = packDir.replaceAll('\\', '/');
  if (
    normalized.startsWith(`${packNormalized}/配图/`) ||
    normalized.includes('/WorkBuddy课程/配图/')
  ) {
    return {
      assetClass: 'owned_course_illustration',
      licenseState: 'owned' as const,
    };
  }
  if (normalized.includes('/WorkBuddy官方文档/assets/')) {
    return {
      assetClass: 'official_product_screenshot',
      licenseState: 'manual_review' as const,
    };
  }
  if (normalized.includes('/公众号文章/')) {
    return {
      assetClass: 'reference_case_media',
      licenseState: 'manual_review' as const,
    };
  }
  return {
    assetClass: 'unclassified_local_media',
    licenseState: 'manual_review' as const,
  };
}

function resolveImage(
  rawRef: string,
  documentPath: string,
  vaultRoot: string,
  byBasename: Map<string, string[]>
) {
  if (/^https:\/\//i.test(rawRef)) {
    return { kind: 'remote' as const, url: rawRef };
  }
  const decoded = decodeImageRef(rawRef).replace(/^file:\/\//i, '');
  const directCandidates = [
    isAbsolute(decoded) ? decoded : '',
    resolve(dirname(documentPath), decoded),
    resolve(vaultRoot, decoded.replace(/^\/+/, '')),
  ].filter(Boolean);
  for (const candidate of directCandidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return {
        kind: 'local' as const,
        filePath: resolve(candidate),
        method: 'direct',
      };
    }
  }

  const basenameCandidates = byBasename.get(basename(decoded)) || [];
  if (basenameCandidates.length === 1) {
    return {
      kind: 'local' as const,
      filePath: basenameCandidates[0],
      method: 'unique_basename',
    };
  }
  return {
    kind: 'unresolved' as const,
    candidates: basenameCandidates,
  };
}

function sha256File(filePath: string) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function safeEvidence(value: string) {
  return value.replace(/\s+/g, ' ').slice(0, 120).trim();
}

function detectRisks(ocrText: string, barcodes: VisionBarcode[]) {
  const findings: RiskFinding[] = [];
  const add = (flag: string, level: RiskLevel, evidence: string) => {
    if (findings.some((finding) => finding.flag === flag)) return;
    findings.push({ flag, level, evidence: safeEvidence(evidence) });
  };

  if (barcodes.length) {
    add(
      'qr_code',
      'blocking',
      barcodes.map((barcode) => barcode.symbology).join(', ')
    );
  }
  const email = ocrText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) add('email', 'blocking', email[0]);
  const phone = ocrText.match(/(?<!\d)1[3-9]\d{9}(?!\d)/);
  if (phone) add('phone', 'blocking', phone[0]);
  const localPath = ocrText.match(
    /(?:\/Users\/[^\s/]+|\/home\/[^\s/]+|[A-Z]:\\Users\\[^\s\\]+)/i
  );
  if (localPath) add('local_user_path', 'blocking', localPath[0]);
  const identity = ocrText.match(/白杨|baiyang|dlgzz/i);
  if (identity) add('personal_identity', 'blocking', identity[0]);
  const directSecret = ocrText.match(
    /(?:sk-[A-Za-z0-9_-]{12,}|AKID[A-Za-z0-9]{12,}|AIza[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{12,})/
  );
  if (directSecret) add('unmasked_secret', 'blocking', directSecret[0]);
  const labeledSecret = ocrText.match(
    /(?:api\s*key|app\s*secret|access\s*token|secret\s*key|令牌|密钥)\s*[:：=]\s*([A-Za-z0-9_/-]{16,})/i
  );
  if (labeledSecret && !/^([*•xX.])\1+$/.test(labeledSecret[1])) {
    add('unmasked_secret', 'blocking', labeledSecret[0]);
  }
  const sessionUrl = ocrText.match(
    /https?:\/\/\S+\?\S*(?:session|token|auth|ticket|code|state|key)=\S+/i
  );
  if (sessionUrl) add('session_query', 'blocking', sessionUrl[0]);
  const sensitiveField = ocrText.match(
    /api\s*key|app\s*secret|access\s*token|secret\s*key|令牌|密钥/i
  );
  if (
    sensitiveField &&
    !findings.some((item) => item.flag === 'unmasked_secret')
  ) {
    add('sensitive_field', 'review', sensitiveField[0]);
  }
  const account = ocrText.match(/微信号|手机号|账号(?:名)?|用户名|用户\s*ID/i);
  if (account && !email && !phone) add('account_field', 'review', account[0]);
  const personalMemory = ocrText.match(
    /个人记忆|我的记忆|关于我的记忆|memory\s+page/i
  );
  if (personalMemory) add('personal_memory', 'review', personalMemory[0]);
  return findings;
}

async function runProcess(
  command: string,
  args: string[],
  options: { input?: string; env?: NodeJS.ProcessEnv } = {}
) {
  return await new Promise<{ stdout: string; stderr: string }>(
    (resolvePromise, reject) => {
      const child = spawn(command, args, {
        env: options.env || process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolvePromise({ stdout, stderr });
          return;
        }
        reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 500)}`));
      });
      child.stdin.end(options.input || '');
    }
  );
}

async function scanLocalAssets(assets: LocalAsset[], concurrency: number) {
  const scannable = assets.filter((asset) =>
    LOCAL_SCAN_EXTENSIONS.has(asset.extension)
  );
  if (!scannable.length) return new Map<string, VisionResult>();

  const helperPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    'scan-image-privacy.swift'
  );
  const helperHash = createHash('sha256')
    .update(readFileSync(helperPath))
    .digest('hex')
    .slice(0, 16);
  const binaryPath = join(tmpdir(), `onework-image-privacy-${helperHash}`);
  if (!existsSync(binaryPath)) {
    await runProcess('/usr/bin/swiftc', ['-O', '-o', binaryPath, helperPath]);
  }

  const input = scannable
    .map((asset) => JSON.stringify({ id: asset.key, path: asset.sourceFile }))
    .join('\n');
  const { stdout } = await runProcess(binaryPath, [], {
    input: `${input}\n`,
    env: {
      ...process.env,
      ONEWORK_VISION_CONCURRENCY: String(concurrency),
    },
  });
  const results = new Map<string, VisionResult>();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const result = JSON.parse(line) as VisionResult;
    results.set(result.id, result);
  }
  return results;
}

function summarize<T extends string>(values: T[]) {
  return Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [value, values.filter((item) => item === value).length])
  );
}

function pendingWorkflow(decision: AuditStatus) {
  return {
    screening: {
      decision,
      checks: {
        licenseOk: 'unknown',
        noQr: 'unknown',
        noContact: 'unknown',
        noLocalUserPath: 'unknown',
        noUnmaskedSecret: 'unknown',
        noSessionQuery: 'unknown',
        noPersonalMemory: 'unknown',
        identitySafe: 'unknown',
        allFramesInspected: 'unknown',
      },
      evidence: [],
    },
    approval: {
      status: 'pending',
      reviewerType: null,
      approvedAt: null,
    },
    publication: {
      status: 'not_uploaded',
      visibility: 'private',
    },
  };
}

async function main() {
  const options = parseArgs();
  const manifest = loadManifest(options.packDir);
  const documents = collectDocuments(manifest).slice(0, options.limit);
  const vaultRoot = findVaultRoot(options.packDir);
  const byBasename = indexVaultImages(vaultRoot);
  const assets = new Map<string, InventoryAsset>();
  let occurrenceCount = 0;

  for (const document of documents) {
    const rawContent = readFileSync(document.filePath, 'utf8');
    const parsed = matter(rawContent);
    const body = parsed.content;
    const documentTitle = sanitizeIdentity(
      getDocumentTitle(document.filePath, rawContent),
      manifest.replacements
    );
    for (const image of extractMarkdownImages(body)) {
      occurrenceCount += 1;
      const occurrence: ImageOccurrence = {
        rawRef: image.rawRef,
        altText: sanitizeIdentity(image.altText, manifest.replacements),
        line: body.slice(0, image.index).split(/\r?\n/).length,
        heading: sanitizeIdentity(
          nearestHeading(body, image.index),
          manifest.replacements
        ),
        context: sanitizeIdentity(
          nearbyContext(body, image.index),
          manifest.replacements
        ),
        documentPath: document.documentPath,
        documentTitle,
        source: document.source,
        category: document.category,
        authority: readString(document.metadata.authority),
      };
      const resolved = resolveImage(
        image.rawRef,
        document.filePath,
        vaultRoot,
        byBasename
      );
      if (resolved.kind === 'remote') {
        const key = `remote:${resolved.url}`;
        const current = assets.get(key) as RemoteAsset | undefined;
        if (current) {
          current.occurrences.push(occurrence);
          continue;
        }
        const extension = extname(new URL(resolved.url).pathname).toLowerCase();
        assets.set(key, {
          kind: 'remote',
          key,
          sourceRef: resolved.url,
          remoteUrl: resolved.url,
          extension,
          mimeType: MIME_TYPES[extension] || 'image/unknown',
          assetClass: 'remote',
          licenseState: 'manual_review',
          occurrences: [occurrence],
        });
        continue;
      }
      if (resolved.kind === 'unresolved') {
        const key = `unresolved:${document.documentPath}:${image.rawRef}`;
        assets.set(key, {
          kind: 'unresolved',
          key,
          sourceRef: `workbuddy-assets/unresolved/${createHash('sha256')
            .update(key)
            .digest('hex')
            .slice(0, 20)}`,
          rawRef: image.rawRef,
          candidates: resolved.candidates,
          occurrences: [occurrence],
        });
        continue;
      }

      const contentHash = sha256File(resolved.filePath);
      const extension = extname(resolved.filePath).toLowerCase();
      const key = `sha256:${contentHash}`;
      const current = assets.get(key) as LocalAsset | undefined;
      if (current) {
        current.occurrences.push(occurrence);
        continue;
      }
      const classification = classifyLocalAsset(
        resolved.filePath,
        options.packDir
      );
      assets.set(key, {
        kind: 'local',
        key,
        sourceRef: `workbuddy-assets/${contentHash}${extension}`,
        sourceFile: resolved.filePath,
        contentHash,
        extension,
        mimeType: MIME_TYPES[extension] || 'image/unknown',
        sizeBytes: statSync(resolved.filePath).size,
        ...classification,
        occurrences: [occurrence],
        resolutionMethod: resolved.method,
      });
    }
  }

  const localAssets = [...assets.values()].filter(
    (asset): asset is LocalAsset => asset.kind === 'local'
  );
  const visionResults = options.scan
    ? await scanLocalAssets(localAssets, options.concurrency)
    : new Map<string, VisionResult>();

  const auditedAssets = [...assets.values()].map((asset) => {
    if (asset.kind === 'unresolved') {
      return {
        ...asset,
        status: 'blocked' as AuditStatus,
        reasons: ['reference_unresolved'],
        findings: [] as RiskFinding[],
        ...pendingWorkflow('blocked'),
      };
    }
    if (asset.kind === 'remote') {
      return {
        ...asset,
        status: 'needs_review' as AuditStatus,
        reasons: ['remote_asset_not_scanned', 'license_manual_review'],
        findings: [] as RiskFinding[],
        ...pendingWorkflow('needs_review'),
      };
    }

    const scanResult = visionResults.get(asset.key);
    const findings = detectRisks(
      scanResult?.ocrText || '',
      scanResult?.barcodes || []
    );
    const reasons: string[] = [];
    if (!LOCAL_SCAN_EXTENSIONS.has(asset.extension)) {
      reasons.push('format_requires_manual_review');
    } else if (!options.scan) {
      reasons.push('local_vision_scan_not_run');
    } else if (!scanResult || scanResult.error) {
      reasons.push(scanResult?.error || 'local_vision_result_missing');
    }
    if (asset.licenseState !== 'owned') reasons.push('license_manual_review');
    for (const finding of findings) reasons.push(finding.flag);

    const status: AuditStatus = findings.some(
      (finding) => finding.level === 'blocking'
    )
      ? 'blocked'
      : reasons.length
        ? 'needs_review'
        : 'ready';

    const scanComplete = Boolean(
      scanResult &&
        !scanResult.error &&
        scanResult.framesTotal &&
        scanResult.framesInspected === scanResult.framesTotal
    );
    const checkState = (flag: string) => {
      if (!scanComplete) return 'unknown';
      return findings.some((finding) => finding.flag === flag)
        ? 'fail'
        : 'pass';
    };

    return {
      kind: asset.kind,
      key: asset.key,
      sourceRef: asset.sourceRef,
      privateSourceFile: asset.sourceFile,
      contentHash: asset.contentHash,
      extension: asset.extension,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      assetClass: asset.assetClass,
      licenseState: asset.licenseState,
      resolutionMethod: asset.resolutionMethod,
      occurrences: asset.occurrences,
      scan: scanResult
        ? {
            width: scanResult.width || null,
            height: scanResult.height || null,
            framesTotal: scanResult.framesTotal || 0,
            framesInspected: scanResult.framesInspected || 0,
            ocrText: scanResult.ocrText || '',
            barcodes: scanResult.barcodes || [],
            error: scanResult.error || null,
            provider: 'macos_vision_local',
          }
        : null,
      status,
      reasons: [...new Set(reasons)],
      findings,
      screening: {
        decision: status,
        checks: {
          licenseOk: asset.licenseState === 'owned' ? 'pass' : 'unknown',
          noQr: checkState('qr_code'),
          noContact:
            checkState('email') === 'pass' && checkState('phone') === 'pass'
              ? 'pass'
              : checkState('email') === 'fail' || checkState('phone') === 'fail'
                ? 'fail'
                : 'unknown',
          noLocalUserPath: checkState('local_user_path'),
          noUnmaskedSecret: checkState('unmasked_secret'),
          noSessionQuery: checkState('session_query'),
          noPersonalMemory: checkState('personal_memory'),
          identitySafe: checkState('personal_identity'),
          allFramesInspected: scanComplete ? 'pass' : 'unknown',
        },
        evidence: scanResult
          ? [
              {
                method: 'macos_vision_ocr_barcode_regex',
                analyzedAt: new Date().toISOString(),
              },
            ]
          : [],
      },
      approval: {
        status: 'pending',
        reviewerType: null,
        approvedAt: null,
      },
      publication: {
        status: 'not_uploaded',
        visibility: 'private',
      },
    };
  });

  const statuses = auditedAssets.map((asset) => asset.status);
  const report = {
    version: 1,
    policyVersion: 'onework-public-media-v1',
    privateReport: true,
    generatedAt: new Date().toISOString(),
    pack: { id: manifest.id, name: manifest.name },
    scan: {
      enabled: options.scan,
      provider: options.scan ? 'macos_vision_local' : null,
      paidModelCalls: 0,
      concurrency: options.scan ? options.concurrency : 0,
    },
    summary: {
      documents: documents.length,
      imageOccurrences: occurrenceCount,
      uniqueAssets: auditedAssets.length,
      localAssets: localAssets.length,
      remoteAssets: auditedAssets.filter((asset) => asset.kind === 'remote')
        .length,
      unresolvedAssets: auditedAssets.filter(
        (asset) => asset.kind === 'unresolved'
      ).length,
      totalLocalBytes: localAssets.reduce(
        (total, asset) => total + asset.sizeBytes,
        0
      ),
      statusCounts: summarize(statuses),
      formatCounts: summarize(
        auditedAssets.map((asset) =>
          'extension' in asset ? asset.extension || '(none)' : '(unresolved)'
        )
      ),
      assetClassCounts: summarize(
        auditedAssets.map((asset) =>
          'assetClass' in asset && typeof asset.assetClass === 'string'
            ? asset.assetClass
            : 'unresolved'
        )
      ),
    },
    policy: {
      readyMeaning:
        '本地自动初筛通过；approval 仍为 pending，人工或受信多模态模型批准后才能写 safeToPublish=true。',
      publicRule:
        '未知即复核；命中二维码、联系方式、本地用户路径、未遮盖密钥、会话链接或个人身份时禁止公开。',
      databaseRule: 'privateSourceFile 只存在于本地审核报告，禁止导入数据库。',
    },
    assets: auditedAssets,
  };

  writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Pack: ${manifest.id}`);
  console.log(`Documents: ${documents.length}`);
  console.log(`Image occurrences: ${occurrenceCount}`);
  console.log(`Unique assets: ${auditedAssets.length}`);
  console.log(`Local assets: ${localAssets.length}`);
  console.log(
    `Remote / unresolved: ${report.summary.remoteAssets} / ${report.summary.unresolvedAssets}`
  );
  console.log(`Statuses: ${JSON.stringify(report.summary.statusCounts)}`);
  console.log('Paid model calls: 0');
  console.log(`Private report: ${options.outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
