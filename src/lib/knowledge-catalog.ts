import 'server-only';

import { getDb } from '@/db';
import {
  knowledgeCollection,
  knowledgeCollectionPack,
  knowledgeDocument,
  knowledgePack,
  knowledgePackDocument,
} from '@/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';

const ALL_PACKS_GRANT = '*';

const SAFE_CATALOG_METADATA_KEYS = new Set([
  'author',
  'version',
  'slug',
  'summary',
  'topics',
  'intents',
  'routingKeywords',
  'audience',
  'contentKinds',
  'authority',
  'licenseStatus',
  'language',
  'publishedAt',
  'lastUpdated',
  'updated',
  'permittedUse',
  'prohibitedUse',
  'publisher',
  'releaseChannel',
  'seriesId',
  'supersedes',
  'versionPolicy',
]);

export interface KnowledgePackCatalogItem {
  id: string;
  name: string;
  description: string;
  scope: string;
  metadata: Record<string, unknown>;
  documentCount: number;
  collectionIds: string[];
  updatedAt: string;
}

export interface KnowledgeCollectionCatalogItem {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, unknown>;
  packs: KnowledgePackCatalogItem[];
  updatedAt: string;
}

export interface KnowledgeCatalog {
  collections: KnowledgeCollectionCatalogItem[];
  ungroupedPacks: KnowledgePackCatalogItem[];
  packs: KnowledgePackCatalogItem[];
}

export interface ListKnowledgeCatalogOptions {
  /** Pass `*` only for an explicitly resolved all-packs entitlement. */
  allowedPackIds: string[];
}

export function normalizeKnowledgeCatalogGrants(allowedPackIds?: string[]) {
  if (allowedPackIds === undefined) {
    return { allPacks: false, explicitPackIds: [] as string[] };
  }

  const normalized = [
    ...new Set(
      allowedPackIds
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
  return {
    allPacks: normalized.includes(ALL_PACKS_GRANT),
    explicitPackIds: normalized.filter((id) => id !== ALL_PACKS_GRANT),
  };
}

function isSafeMetadataValue(value: unknown, depth = 0): boolean {
  if (value === null) return true;
  if (typeof value === 'string') {
    return !(
      value.startsWith('/') ||
      value.startsWith('~/') ||
      /^[A-Za-z]:[\\/]/.test(value) ||
      /^\\\\/.test(value)
    );
  }
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (depth >= 3) return false;
  if (Array.isArray(value)) {
    return (
      value.length <= 100 &&
      value.every((item) => isSafeMetadataValue(item, depth + 1))
    );
  }
  if (!value || typeof value !== 'object') return false;

  const entries = Object.entries(value as Record<string, unknown>);
  return (
    entries.length <= 50 &&
    entries.every(
      ([key, nested]) =>
        !/(?:path|root|directory|filename|locator|bucket|objectKey)/i.test(
          key
        ) && isSafeMetadataValue(nested, depth + 1)
    )
  );
}

function safeCatalogMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, nested]) =>
        SAFE_CATALOG_METADATA_KEYS.has(key) && isSafeMetadataValue(nested)
    )
  );
}

/**
 * Wildcard subscribers see the newest active immutable release in each
 * series. Explicit per-pack entitlements keep their exact requested versions.
 * Malformed immutable metadata fails closed for wildcard access while an
 * explicit grant can still preserve a legacy customer's exact pack.
 */
export function selectCurrentKnowledgePackVersions<
  T extends { id: string; metadata: Record<string, unknown> },
>(packs: T[], explicitPackIds: readonly string[] = []) {
  const releaseInfo = (pack: T) => {
    if (pack.metadata.versionPolicy !== 'immutable') {
      return { kind: 'legacy' as const };
    }
    const seriesId = pack.metadata.seriesId;
    const version = pack.metadata.version;
    if (
      typeof seriesId !== 'string' ||
      !/^[a-z0-9][a-z0-9._-]{0,159}$/.test(seriesId) ||
      typeof version !== 'number' ||
      !Number.isSafeInteger(version) ||
      version < 1 ||
      pack.id !== `${seriesId}-v${version}`
    ) {
      return { kind: 'invalid' as const };
    }
    return { kind: 'release' as const, seriesId, version };
  };

  const latestBySeries = new Map<string, number>();
  for (const pack of packs) {
    const release = releaseInfo(pack);
    if (release.kind !== 'release') continue;
    latestBySeries.set(
      release.seriesId,
      Math.max(latestBySeries.get(release.seriesId) || 0, release.version)
    );
  }
  const explicit = new Set(explicitPackIds);
  return packs.filter((pack) => {
    if (explicit.has(pack.id)) return true;
    const release = releaseInfo(pack);
    if (release.kind === 'legacy') return true;
    if (release.kind === 'invalid') return false;
    return latestBySeries.get(release.seriesId) === release.version;
  });
}

export function selectKnowledgePacksForGrants<
  T extends { id: string; metadata: Record<string, unknown> },
>(packs: T[], allowedPackIds?: string[]) {
  const { allPacks, explicitPackIds } =
    normalizeKnowledgeCatalogGrants(allowedPackIds);
  if (!allPacks && explicitPackIds.length === 0) return [];

  const explicit = new Set(explicitPackIds);
  const entitled = allPacks
    ? packs
    : packs.filter((pack) => explicit.has(pack.id));
  return allPacks
    ? selectCurrentKnowledgePackVersions(entitled, explicitPackIds)
    : entitled;
}

/**
 * Return the active knowledge catalog inside an already-resolved entitlement
 * boundary. This function deliberately does not resolve users or memberships;
 * callers must pass the current account's allowed pack IDs.
 */
export async function listKnowledgeCatalog(
  options: ListKnowledgeCatalogOptions
): Promise<KnowledgeCatalog> {
  const { allPacks, explicitPackIds } = normalizeKnowledgeCatalogGrants(
    options.allowedPackIds
  );
  if (!allPacks && explicitPackIds.length === 0) {
    return { collections: [], ungroupedPacks: [], packs: [] };
  }

  const db = await getDb();
  const packFilter = allPacks
    ? eq(knowledgePack.status, 'active')
    : and(
        eq(knowledgePack.status, 'active'),
        inArray(knowledgePack.id, explicitPackIds)
      );
  const rawPackRows = await db
    .select({
      id: knowledgePack.id,
      name: knowledgePack.name,
      description: knowledgePack.description,
      scope: knowledgePack.scope,
      metadata: knowledgePack.metadata,
      updatedAt: knowledgePack.updatedAt,
    })
    .from(knowledgePack)
    .where(packFilter)
    .orderBy(asc(knowledgePack.name), asc(knowledgePack.id));
  const packRows = selectKnowledgePacksForGrants(
    rawPackRows,
    options.allowedPackIds
  );

  if (packRows.length === 0) {
    return { collections: [], ungroupedPacks: [], packs: [] };
  }

  const packIds = packRows.map((pack) => pack.id);
  const [documentRows, membershipRows] = await Promise.all([
    db
      .select({
        packId: knowledgePackDocument.knowledgePackId,
        documentId: knowledgePackDocument.documentId,
      })
      .from(knowledgePackDocument)
      .innerJoin(
        knowledgeDocument,
        and(
          eq(knowledgeDocument.id, knowledgePackDocument.documentId),
          eq(knowledgeDocument.status, 'active')
        )
      )
      .where(inArray(knowledgePackDocument.knowledgePackId, packIds)),
    db
      .select({
        collectionId: knowledgeCollection.id,
        collectionName: knowledgeCollection.name,
        collectionDescription: knowledgeCollection.description,
        collectionMetadata: knowledgeCollection.metadata,
        collectionUpdatedAt: knowledgeCollection.updatedAt,
        packId: knowledgeCollectionPack.knowledgePackId,
        sortOrder: knowledgeCollectionPack.sortOrder,
      })
      .from(knowledgeCollectionPack)
      .innerJoin(
        knowledgeCollection,
        and(
          eq(knowledgeCollection.id, knowledgeCollectionPack.collectionId),
          eq(knowledgeCollection.status, 'active')
        )
      )
      .where(
        and(
          eq(knowledgeCollectionPack.status, 'active'),
          inArray(knowledgeCollectionPack.knowledgePackId, packIds)
        )
      )
      .orderBy(
        asc(knowledgeCollection.name),
        asc(knowledgeCollection.id),
        asc(knowledgeCollectionPack.sortOrder),
        asc(knowledgeCollectionPack.knowledgePackId)
      ),
  ]);

  const documentIdsByPack = new Map<string, Set<string>>();
  for (const row of documentRows) {
    const ids = documentIdsByPack.get(row.packId) ?? new Set<string>();
    ids.add(row.documentId);
    documentIdsByPack.set(row.packId, ids);
  }

  const collectionIdsByPack = new Map<string, string[]>();
  for (const row of membershipRows) {
    const collectionIds = collectionIdsByPack.get(row.packId) ?? [];
    if (!collectionIds.includes(row.collectionId)) {
      collectionIds.push(row.collectionId);
    }
    collectionIdsByPack.set(row.packId, collectionIds);
  }

  const packs = packRows.map<KnowledgePackCatalogItem>((pack) => ({
    id: pack.id,
    name: pack.name,
    description: pack.description,
    scope: pack.scope,
    metadata: safeCatalogMetadata(pack.metadata),
    documentCount: documentIdsByPack.get(pack.id)?.size ?? 0,
    collectionIds: collectionIdsByPack.get(pack.id) ?? [],
    updatedAt: pack.updatedAt.toISOString(),
  }));
  const packById = new Map(packs.map((pack) => [pack.id, pack]));

  const collectionById = new Map<string, KnowledgeCollectionCatalogItem>();
  for (const row of membershipRows) {
    const pack = packById.get(row.packId);
    if (!pack) continue;

    const collection = collectionById.get(row.collectionId) ?? {
      id: row.collectionId,
      name: row.collectionName,
      description: row.collectionDescription,
      metadata: safeCatalogMetadata(row.collectionMetadata),
      packs: [],
      updatedAt: row.collectionUpdatedAt.toISOString(),
    };
    collection.packs.push(pack);
    collectionById.set(row.collectionId, collection);
  }

  return {
    collections: [...collectionById.values()],
    ungroupedPacks: packs.filter((pack) => pack.collectionIds.length === 0),
    packs,
  };
}
