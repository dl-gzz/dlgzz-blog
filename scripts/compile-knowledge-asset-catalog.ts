/**
 * Compile an importable media catalog from a private audit report plus an
 * explicit approval file. The audit report is evidence; the approval file is
 * a deliberate publication decision. Neither state is inferred from defaults.
 *
 * Run:
 *   pnpm knowledge:assets:compile -- \
 *     --audit /private/audit.json \
 *     --approvals scripts/fixtures/workbuddy-assets.approvals.json \
 *     --out /private/catalog.json \
 *     --public-base-url https://img.example.com
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

type JsonObject = Record<string, unknown>;

type AuditOccurrence = {
  altText?: string;
  line?: number;
  heading: string;
  context?: string;
  documentPath: string;
  documentTitle?: string;
  authority?: string;
};

type AuditAsset = {
  kind: 'local' | 'remote' | 'unresolved';
  status: 'ready' | 'needs_review' | 'blocked';
  sourceRef: string;
  privateSourceFile?: string;
  contentHash?: string;
  mimeType?: string;
  assetClass?: string;
  licenseState?: 'owned' | 'manual_review';
  occurrences: AuditOccurrence[];
  findings?: Array<{ flag: string; level: 'blocking' | 'review' }>;
  scan?: {
    width?: number | null;
    height?: number | null;
    framesTotal?: number;
    framesInspected?: number;
    ocrText?: string;
    error?: string | null;
    provider?: string;
  } | null;
};

type AuditReport = {
  version: number;
  policyVersion: string;
  privateReport: true;
  pack: { id: string; name: string };
  assets: AuditAsset[];
};

type Approval = {
  contentHash: string;
  status: 'approved' | 'rejected';
  reviewerType: string;
  approvedAt: string;
  title?: string;
  altText: string;
  caption: string;
  role?: string;
  platform?: string;
  usageContexts?: string[];
  official?: boolean;
  publisher?: string;
  sourceType?: string;
  visualFacts: JsonObject;
  objectKey?: string;
  publicUrl?: string;
  confirmations: {
    licenseOk: boolean;
    noSensitiveData: boolean;
    meaningVerified: boolean;
  };
};

type ApprovalFile = {
  version: number;
  packId: string;
  approvals: Approval[];
};

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const valueAfter = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] || '' : '';
  };
  const auditPath = valueAfter('--audit');
  const approvalsPath = valueAfter('--approvals');
  const outputPath = valueAfter('--out');
  if (!auditPath || !approvalsPath || !outputPath) {
    throw new Error('需要 --audit、--approvals 和 --out');
  }
  return {
    auditPath: resolve(auditPath),
    approvalsPath: resolve(approvalsPath),
    outputPath: resolve(outputPath),
    publicBaseUrl: valueAfter('--public-base-url').replace(/\/+$/, ''),
  };
}

function readJson<T>(filePath: string): T {
  if (!existsSync(filePath)) throw new Error(`文件不存在：${filePath}`);
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function sanitizeText(value: unknown) {
  return readString(value)
    .replaceAll('白杨', '独立工作者')
    .replace(/baiyang/gi, '独立工作者')
    .replace(/\/Users\/[^\s/]+/g, '<用户目录>')
    .replace(/\/home\/[^\s/]+/g, '<用户目录>')
    .replace(/[A-Z]:\\Users\\[^\s\\]+/gi, '<用户目录>');
}

function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.map((item) => sanitizeText(item)).filter((item) => Boolean(item))
    ),
  ];
}

function sanitizeJson(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeJson(item)])
    );
  }
  return value;
}

function assertHttps(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('publicUrl 必须使用 HTTPS');
  return url.toString();
}

function buildPublicUrl(baseUrl: string, objectKey: string) {
  return assertHttps(
    `${baseUrl}/${objectKey
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')}`
  );
}

function main() {
  const options = parseArgs();
  const auditBuffer = readFileSync(options.auditPath);
  const audit = JSON.parse(auditBuffer.toString('utf8')) as AuditReport;
  const approvals = readJson<ApprovalFile>(options.approvalsPath);
  if (audit.version !== 1 || audit.privateReport !== true) {
    throw new Error('audit 必须是 version=1 的 private report');
  }
  if (approvals.version !== 1 || approvals.packId !== audit.pack.id) {
    throw new Error('approval 文件版本或 packId 与 audit 不一致');
  }

  const seenApprovals = new Set<string>();
  const approvedAssets = approvals.approvals
    .filter((approval) => approval.status === 'approved')
    .map((approval) => {
      if (seenApprovals.has(approval.contentHash)) {
        throw new Error(`重复 approval：${approval.contentHash}`);
      }
      seenApprovals.add(approval.contentHash);
      const asset = audit.assets.find(
        (candidate) => candidate.contentHash === approval.contentHash
      );
      if (!asset) throw new Error(`audit 中找不到：${approval.contentHash}`);
      if (asset.kind !== 'local' || !asset.privateSourceFile) {
        throw new Error(`只允许编译本地资产：${approval.contentHash}`);
      }
      if (asset.status !== 'ready') {
        throw new Error(`资产尚未通过自动初筛：${approval.contentHash}`);
      }
      if (asset.findings?.some((finding) => finding.level === 'blocking')) {
        throw new Error(`资产存在阻断风险：${approval.contentHash}`);
      }
      if (
        !asset.scan ||
        asset.scan.error ||
        !asset.scan.framesTotal ||
        asset.scan.framesInspected !== asset.scan.framesTotal
      ) {
        throw new Error(`资产未完成全帧扫描：${approval.contentHash}`);
      }
      if (
        approval.confirmations.licenseOk !== true ||
        approval.confirmations.noSensitiveData !== true ||
        approval.confirmations.meaningVerified !== true
      ) {
        throw new Error(
          `approval confirmations 不完整：${approval.contentHash}`
        );
      }
      if (!readString(approval.altText) || !readString(approval.caption)) {
        throw new Error(
          `approval 缺少 altText 或 caption：${approval.contentHash}`
        );
      }
      if (!asset.occurrences.length) {
        throw new Error(
          `资产没有 Markdown occurrence：${approval.contentHash}`
        );
      }

      const perDocumentOccurrence = new Map<string, number>();
      const links = asset.occurrences.map((occurrence) => {
        const occurrenceIndex =
          perDocumentOccurrence.get(occurrence.documentPath) || 0;
        perDocumentOccurrence.set(occurrence.documentPath, occurrenceIndex + 1);
        return {
          documentPath: occurrence.documentPath,
          heading: sanitizeText(occurrence.heading),
          role: readString(approval.role, 'concept_diagram'),
          context: sanitizeText(occurrence.context),
          // Preserve the source occurrence order so multiple images linked to
          // one chunk are deterministic instead of falling back to import time.
          sortOrder: occurrence.line ?? occurrenceIndex,
          occurrenceIndex,
          metadata: {
            occurrenceType: 'markdown',
            ...(occurrence.line ? { sourceLine: occurrence.line } : {}),
          },
        };
      });

      const extension = extname(asset.privateSourceFile).toLowerCase();
      const objectKey =
        readString(approval.objectKey) ||
        `knowledge/workbuddy/${approval.contentHash}${extension}`;
      const publicUrl = approval.publicUrl
        ? assertHttps(approval.publicUrl)
        : options.publicBaseUrl
          ? buildPublicUrl(options.publicBaseUrl, objectKey)
          : undefined;
      const publisher = sanitizeText(
        approval.publisher ||
          (asset.assetClass === 'owned_course_illustration' ? '独立工作者' : '')
      );
      const platform = sanitizeText(approval.platform);
      const usageContexts = sanitizeStringArray(approval.usageContexts);

      return {
        contentHash: approval.contentHash,
        sourceRef: asset.sourceRef,
        sourceFile: asset.privateSourceFile,
        objectKey,
        ...(publicUrl ? { publicUrl } : {}),
        assetType: 'image',
        mimeType: asset.mimeType,
        width: asset.scan.width || undefined,
        height: asset.scan.height || undefined,
        title: sanitizeText(
          approval.title || asset.occurrences[0]?.heading || ''
        ),
        ...(platform ? { platform } : {}),
        official:
          approval.official ??
          asset.assetClass === 'official_product_screenshot',
        publisher,
        sourceType: readString(
          approval.sourceType,
          asset.assetClass || 'knowledge_image'
        ),
        altText: sanitizeText(approval.altText),
        caption: sanitizeText(approval.caption),
        visualFacts: sanitizeJson(approval.visualFacts),
        analysis: {
          provider: `${asset.scan.provider || 'local_vision'}+trusted_multimodal_review`,
          model: sanitizeText(approval.reviewerType),
          version: audit.policyVersion,
          analyzedAt: approval.approvedAt,
        },
        riskFlags: [],
        visibility: 'public',
        safeToPublish: true,
        publishChecks: {
          licenseOk: true,
          noQr: true,
          noContact: true,
          noLocalUserPath: true,
          noUnmaskedSecret: true,
          noSessionQuery: true,
          noPersonalMemory: true,
          identitySafe: true,
          allFramesInspected: true,
        },
        metadata: {
          policyVersion: audit.policyVersion,
          auditHash: createHash('sha256').update(auditBuffer).digest('hex'),
          approvalStatus: 'approved',
          reviewerType: sanitizeText(approval.reviewerType),
          framesTotal: asset.scan.framesTotal,
          ...(usageContexts.length ? { usageContexts } : {}),
        },
        links,
      };
    });

  if (!approvedAssets.length) throw new Error('没有可编译的 approved assets');
  const catalog = {
    version: 1,
    packId: audit.pack.id,
    defaults: {
      objectPrefix: 'knowledge/workbuddy',
      visibility: 'private',
      safeToPublish: false,
    },
    assets: approvedAssets,
  };
  writeFileSync(options.outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Pack: ${audit.pack.id}`);
  console.log(`Approved assets: ${approvedAssets.length}`);
  console.log(`Catalog: ${options.outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
