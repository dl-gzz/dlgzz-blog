/**
 * Build a public knowledge-asset catalog from a curated WorkBuddy manifest.
 *
 * Official screenshots stay on the official CDN. The private audit report is
 * used only to verify bytes and safety checks; local source paths are never
 * copied into the generated catalog.
 *
 * Run:
 *   pnpm knowledge:assets:official-catalog -- \
 *     --manifest scripts/fixtures/workbuddy-official-media-batch-02.manifest.json \
 *     --audit /private/WorkBuddy-image-audit.json \
 *     --out /private/workbuddy-official-media-batch-02.catalog.json
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

type JsonObject = Record<string, unknown>;

type CuratedAsset = {
  id?: string;
  localBasename: string;
  officialUrl: string;
  sourcePage: string;
  title: string;
  altText: string;
  caption: string;
  documentPath: string;
  heading: string;
  role?: string;
  context: string;
  sortOrder: number;
  occurrenceIndex?: number;
  visualFacts?: JsonObject;
  additionalLinks?: Array<{
    documentPath: string;
    heading: string;
    role?: string;
    context: string;
    sortOrder: number;
    occurrenceIndex?: number;
  }>;
};

type CuratedManifest = {
  version: number;
  packId: string;
  approvedAt: string;
  reviewerType: string;
  assets: CuratedAsset[];
};

type AuditAsset = {
  privateSourceFile?: string;
  contentHash: string;
  mimeType: string;
  assetClass: string;
  findings?: unknown[];
  scan: {
    width: number;
    height: number;
    framesTotal: number;
    framesInspected: number;
    ocrText?: string;
    provider?: string;
  };
  screening: {
    checks: Record<string, string>;
  };
};

type AuditReport = {
  version: number;
  policyVersion: string;
  assets: AuditAsset[];
};

const REQUIRED_PASS_CHECKS = [
  'noQr',
  'noContact',
  'noLocalUserPath',
  'noUnmaskedSecret',
  'noSessionQuery',
  'noPersonalMemory',
  'identitySafe',
  'allFramesInspected',
] as const;

function requiredArg(name: string) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1]?.trim() : '';
  if (!value) throw new Error(`Missing ${name}`);
  return resolve(value);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validateOfficialUrl(value: string, field: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'www.codebuddy.cn') {
    throw new Error(`${field} must be an official codebuddy.cn HTTPS URL`);
  }
  return url.toString();
}

function validateAuditAsset(asset: AuditAsset, sourceRef: string) {
  if (asset.assetClass !== 'official_product_screenshot') {
    throw new Error(`${sourceRef} is not classified as an official screenshot`);
  }
  if ((asset.findings || []).length > 0) {
    throw new Error(`${sourceRef} still has audit findings`);
  }
  for (const check of REQUIRED_PASS_CHECKS) {
    if (asset.screening.checks[check] !== 'pass') {
      throw new Error(`${sourceRef} did not pass ${check}`);
    }
  }
  if (
    asset.scan.framesTotal < 1 ||
    asset.scan.framesInspected !== asset.scan.framesTotal
  ) {
    throw new Error(`${sourceRef} was not fully inspected`);
  }
  if (!/^[a-f0-9]{64}$/.test(asset.contentHash)) {
    throw new Error(`${sourceRef} has an invalid audit content hash`);
  }
}

async function fetchVerifiedImage(url: string, expectedHash: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Official image returned ${response.status}: ${url}`);
  const contentType = (
    response.headers.get('content-type') || ''
  ).toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new Error(`Official URL is not an image: ${url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actualHash = sha256(bytes);
  if (actualHash !== expectedHash) {
    throw new Error(
      `Official image bytes do not match the audited file: ${url}`
    );
  }
}

async function main() {
  const manifestPath = requiredArg('--manifest');
  const auditPath = requiredArg('--audit');
  const outPath = requiredArg('--out');
  const manifest = readJson<CuratedManifest>(manifestPath);
  const audit = readJson<AuditReport>(auditPath);

  if (manifest.version !== 1 || !manifest.packId || !manifest.assets?.length) {
    throw new Error('Manifest must be version 1 with packId and assets');
  }
  if (!manifest.reviewerType || Number.isNaN(Date.parse(manifest.approvedAt))) {
    throw new Error('Manifest requires reviewerType and a valid approvedAt');
  }

  const auditByBasename = new Map(
    audit.assets
      .filter((asset) => asset.privateSourceFile)
      .map((asset) => [basename(asset.privateSourceFile!), asset])
  );
  const seenOfficialUrls = new Set<string>();
  const assets = [];

  for (const curated of manifest.assets) {
    const officialUrl = validateOfficialUrl(curated.officialUrl, 'officialUrl');
    const sourcePage = validateOfficialUrl(curated.sourcePage, 'sourcePage');
    if (seenOfficialUrls.has(officialUrl)) {
      throw new Error(`Duplicate officialUrl: ${officialUrl}`);
    }
    seenOfficialUrls.add(officialUrl);

    const audited = auditByBasename.get(curated.localBasename);
    if (!audited)
      throw new Error(`Audit asset not found: ${curated.localBasename}`);
    validateAuditAsset(audited, officialUrl);
    await fetchVerifiedImage(officialUrl, audited.contentHash);

    const links = [
      {
        documentPath: curated.documentPath,
        heading: curated.heading,
        role: curated.role || 'ui_step',
        context: curated.context,
        sortOrder: curated.sortOrder,
        occurrenceIndex: curated.occurrenceIndex || 0,
      },
      ...(curated.additionalLinks || []).map((link) => ({
        ...link,
        role: link.role || 'ui_step',
        occurrenceIndex: link.occurrenceIndex || 0,
      })),
    ];

    assets.push({
      id:
        curated.id || `workbuddy-official-${audited.contentHash.slice(0, 20)}`,
      contentHash: audited.contentHash,
      sourceRef: officialUrl,
      publicUrl: officialUrl,
      assetType: 'image',
      mimeType: audited.mimeType,
      width: audited.scan.width,
      height: audited.scan.height,
      title: curated.title,
      platform: 'workbuddy_official_documentation',
      official: true,
      publisher: 'WorkBuddy 官方文档',
      sourceType: 'official_product_screenshot',
      altText: curated.altText,
      caption: curated.caption,
      ocrText: audited.scan.ocrText || '',
      visualFacts: curated.visualFacts || {},
      analysis: {
        provider: `${audited.scan.provider || 'local_vision'}+trusted_multimodal_review`,
        model: manifest.reviewerType,
        version: audit.policyVersion,
        analyzedAt: manifest.approvedAt,
      },
      riskFlags: [],
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
      visibility: 'public',
      safeToPublish: true,
      storageProvider: 'external',
      metadata: {
        sourcePage,
        licenseBasis: 'official_documentation_direct_link_with_attribution',
        licenseBasisNote:
          'The catalog stores the official CDN URL with attribution; it does not copy, modify, or re-host the image.',
        auditPolicyVersion: audit.policyVersion,
        externalHotlink: true,
        copiedToOwnStorage: false,
        verifiedAt: manifest.approvedAt.slice(0, 10),
      },
      links: links.map((link) => ({
        ...link,
        metadata: { sourceImageOrder: link.sortOrder },
      })),
    });
  }

  const catalog = {
    version: 1,
    packId: manifest.packId,
    defaults: {
      visibility: 'public',
      safeToPublish: true,
      role: 'ui_step',
      official: true,
      publisher: 'WorkBuddy 官方文档',
      sourceType: 'official_product_screenshot',
    },
    assets,
  };
  writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        success: true,
        packId: manifest.packId,
        assets: assets.length,
        out: outPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
