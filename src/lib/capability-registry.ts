import 'server-only';

import { getDb } from '@/db';
import { oneWorkCapability, workerSkillCapability } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';

const ENABLED_STATUSES = new Set(['active', 'allowed', 'enabled', 'published']);
const REDACTED_VALUE = '[redacted]';

export interface ResolveCapabilitiesInput {
  intent?: string;
  kind?: string;
  skillId?: string;
  limit?: number;
}

export interface ResolvedCapability {
  id: string;
  recordId: string;
  provider: string;
  kind: string;
  name: string;
  description: string;
  intents: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  runtime: Record<string, unknown>;
  riskLevel: string;
  requiresConfirmation: boolean;
  version: string;
  metadata: Record<string, unknown>;
  configuration: Record<string, unknown>;
  match: {
    score: number;
    matchedIntent: string | null;
    skillPriority: number;
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeIntent(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/([\p{Script=Han}])([a-z0-9])/gu, '$1 $2')
    .replace(/([a-z0-9])([\p{Script=Han}])/gu, '$1 $2')
    .replace(/[\s._:/\\-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
}

function intentTokens(value: string) {
  return normalizeIntent(value)
    .split(' ')
    .filter((token) => token.length > 1);
}

const CJK_BIGRAM_STOP_WORDS = new Set([
  '一个',
  '使用',
  '当前',
  '已经',
  '功能',
  '可以',
  '用户',
  '相关',
  '现在',
  '系统',
  '这个',
  '进行',
  '需要',
]);

const CJK_PROCEDURAL_BIGRAMS = new Set(['下一', '一步', '怎么', '如何']);

const CJK_SPECIFIC_INTENT_BIGRAMS = new Set([
  '上架',
  '下架',
  '制作',
  '创建',
  '发货',
  '增长',
  '安装',
  '官方',
  '幻灯',
  '库存',
  '执行',
  '排名',
  '推广',
  '操作',
  '教程',
  '查找',
  '查询',
  '检索',
  '比较',
  '流量',
  '物流',
  '生成',
  '统计',
  '自动',
  '资料',
  '趋势',
  '配置',
  '邮件',
  '邮箱',
]);

function cjkNgrams(value: string, size: number) {
  const grams = new Set<string>();
  const sequences = normalizeIntent(value).match(/\p{Script=Han}+/gu) ?? [];
  for (const sequence of sequences) {
    const characters = [...sequence];
    for (let index = 0; index <= characters.length - size; index += 1) {
      const gram = characters.slice(index, index + size).join('');
      const containsStoppedBigram =
        size === 3 &&
        [gram.slice(0, 2), gram.slice(1)].some((part) =>
          CJK_BIGRAM_STOP_WORDS.has(part)
        );
      if (
        !containsStoppedBigram &&
        (size !== 2 || !CJK_BIGRAM_STOP_WORDS.has(gram))
      ) {
        grams.add(gram);
      }
    }
  }
  return grams;
}

function intersect(left: Set<string>, right: Set<string>) {
  return [...left].filter((value) => right.has(value));
}

function scoreCjkText(query: string, candidate: string) {
  const queryTrigrams = cjkNgrams(query, 3);
  const candidateTrigrams = cjkNgrams(candidate, 3);
  const sharedTrigrams = intersect(queryTrigrams, candidateTrigrams);
  if (sharedTrigrams.length > 0) {
    const candidateCoverage =
      sharedTrigrams.length / Math.max(1, candidateTrigrams.size);
    return Math.min(
      650,
      420 + sharedTrigrams.length * 45 + Math.round(candidateCoverage * 100)
    );
  }

  const queryBigrams = cjkNgrams(query, 2);
  const candidateBigrams = cjkNgrams(candidate, 2);
  const sharedBigrams = intersect(queryBigrams, candidateBigrams);
  if (sharedBigrams.length === 0) return 0;

  const hasSpecificSignal = sharedBigrams.some((gram) =>
    CJK_SPECIFIC_INTENT_BIGRAMS.has(gram)
  );
  const hasProceduralSignal = sharedBigrams.some((gram) =>
    CJK_PROCEDURAL_BIGRAMS.has(gram)
  );
  if (!hasSpecificSignal && !hasProceduralSignal && sharedBigrams.length < 2) {
    return 0;
  }

  const candidateCoverage =
    sharedBigrams.length / Math.max(1, candidateBigrams.size);
  const signalScore = hasSpecificSignal ? 300 : hasProceduralSignal ? 180 : 140;
  return Math.min(
    410,
    signalScore + sharedBigrams.length * 40 + Math.round(candidateCoverage * 80)
  );
}

export function scoreCapabilityText(query: string, candidate: string) {
  const normalizedQuery = normalizeIntent(query);
  const normalizedCandidate = normalizeIntent(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedQuery === normalizedCandidate) return 1000;
  if (normalizedQuery.includes(normalizedCandidate)) return 800;
  if (normalizedCandidate.includes(normalizedQuery)) return 700;

  const queryTokens = new Set(intentTokens(normalizedQuery));
  const candidateTokens = intentTokens(normalizedCandidate);
  const overlap = candidateTokens.filter((token) =>
    queryTokens.has(token)
  ).length;
  const tokenScore =
    overlap === 0
      ? 0
      : Math.round(
          (overlap / Math.max(queryTokens.size, candidateTokens.length)) * 500
        );
  return Math.max(tokenScore, scoreCjkText(query, candidate));
}

export function scoreCapabilityCandidate(
  requestedIntent: string,
  candidate: { intents: string[]; name: string; description: string }
) {
  const intentMatch = getIntentMatch(requestedIntent, candidate.intents);
  const descriptiveScore = Math.max(
    scoreCapabilityText(requestedIntent, candidate.name),
    scoreCapabilityText(requestedIntent, candidate.description)
  );
  return {
    score: Math.max(intentMatch.score, Math.floor(descriptiveScore / 2)),
    matchedIntent: intentMatch.matchedIntent,
  };
}

function getIntentMatch(requestedIntent: string, intents: string[]) {
  let bestScore = 0;
  let matchedIntent: string | null = null;

  for (const intent of intents) {
    const score = scoreCapabilityText(requestedIntent, intent);
    if (
      score > bestScore ||
      (score === bestScore && intent < (matchedIntent ?? ''))
    ) {
      bestScore = score;
      matchedIntent = intent;
    }
  }

  return { score: bestScore, matchedIntent };
}

/**
 * Character n-grams deliberately allow low-confidence procedural matches such
 * as `怎么…` when no better registry entry exists. Once a more concrete match is
 * present, discard materially weaker rows so generic wording cannot turn a
 * single route into a false composite route.
 */
export function retainMeaningfulCapabilityMatches<
  T extends { match: { score: number } },
>(rows: T[]): T[] {
  const bestScore = rows.reduce(
    (maximum, row) => Math.max(maximum, row.match.score),
    0
  );
  if (bestScore <= 0) return [];

  const cutoff =
    bestScore >= 700
      ? Math.max(500, bestScore - 250)
      : bestScore >= 300
        ? Math.max(240, Math.floor(bestScore * 0.8))
        : bestScore;
  return rows.filter((row) => row.match.score >= cutoff);
}

/** Remove credentials before registry data leaves the server. */
function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      /(authorization|credential|password|secret|token|api[_-]?key)/i.test(key)
        ? REDACTED_VALUE
        : redactSecrets(nested),
    ])
  );
}

/**
 * Deterministic capability resolution. It only ranks registered intents and
 * never asks a model to invent a provider or runtime tool.
 */
export async function resolveCapabilities(
  input: ResolveCapabilitiesInput,
  userId: string
): Promise<ResolvedCapability[]> {
  const db = await getDb();
  const kind = input.kind?.trim() || '';
  const skillId = input.skillId?.trim() || '';
  const requestedIntent = input.intent?.trim() || '';
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 5), 20));

  const conditions = kind ? [eq(oneWorkCapability.kind, kind)] : [];
  const capabilityFields = {
    id: oneWorkCapability.id,
    capabilityKey: oneWorkCapability.capabilityKey,
    provider: oneWorkCapability.provider,
    kind: oneWorkCapability.kind,
    name: oneWorkCapability.name,
    description: oneWorkCapability.description,
    ownerUserId: oneWorkCapability.ownerUserId,
    scope: oneWorkCapability.scope,
    intents: oneWorkCapability.intents,
    inputSchema: oneWorkCapability.inputSchema,
    outputSchema: oneWorkCapability.outputSchema,
    runtime: oneWorkCapability.runtime,
    riskLevel: oneWorkCapability.riskLevel,
    requiresConfirmation: oneWorkCapability.requiresConfirmation,
    status: oneWorkCapability.status,
    version: oneWorkCapability.version,
    metadata: oneWorkCapability.metadata,
  };

  const rows = skillId
    ? await db
        .select({
          ...capabilityFields,
          skillStatus: workerSkillCapability.status,
          skillPriority: workerSkillCapability.priority,
          configuration: workerSkillCapability.configuration,
        })
        .from(oneWorkCapability)
        .innerJoin(
          workerSkillCapability,
          eq(workerSkillCapability.capabilityId, oneWorkCapability.id)
        )
        .where(and(eq(workerSkillCapability.skillId, skillId), ...conditions))
    : await db
        .select({
          ...capabilityFields,
          skillStatus: oneWorkCapability.status,
          skillPriority: sql<number>`0`,
          configuration: sql<Record<string, unknown>>`'{}'::jsonb`,
        })
        .from(oneWorkCapability)
        .where(conditions.length ? and(...conditions) : undefined);

  const seenCapabilityKeys = new Set<string>();

  const rankedRows = rows
    .filter(
      (row) =>
        ENABLED_STATUSES.has(row.status) &&
        (!skillId || ENABLED_STATUSES.has(row.skillStatus)) &&
        (row.ownerUserId === userId ||
          (!row.ownerUserId &&
            ['global', 'public', 'shared'].includes(row.scope)))
    )
    .map((row) => {
      const intents = asStringArray(row.intents);
      const capabilityMatch = requestedIntent
        ? scoreCapabilityCandidate(requestedIntent, {
            intents,
            name: row.name,
            description: row.description,
          })
        : { score: 0, matchedIntent: null };

      return {
        id: row.capabilityKey,
        recordId: row.id,
        provider: row.provider,
        kind: row.kind,
        name: row.name,
        description: row.description,
        intents,
        inputSchema: asRecord(row.inputSchema),
        outputSchema: asRecord(row.outputSchema),
        runtime: asRecord(redactSecrets(row.runtime)),
        riskLevel: row.riskLevel,
        requiresConfirmation: row.requiresConfirmation,
        version: row.version,
        metadata: asRecord(redactSecrets(row.metadata)),
        configuration: asRecord(redactSecrets(row.configuration)),
        match: {
          score: capabilityMatch.score,
          matchedIntent: capabilityMatch.matchedIntent,
          skillPriority: row.skillPriority ?? 0,
        },
      } satisfies ResolvedCapability;
    })
    .filter((row) => !requestedIntent || row.match.score > 0)
    .sort(
      (left, right) =>
        right.match.score - left.match.score ||
        right.match.skillPriority - left.match.skillPriority ||
        left.id.localeCompare(right.id) ||
        right.version.localeCompare(left.version, undefined, {
          numeric: true,
        }) ||
        left.recordId.localeCompare(right.recordId)
    )
    .filter((row) => {
      if (seenCapabilityKeys.has(row.id)) return false;
      seenCapabilityKeys.add(row.id);
      return true;
    });

  return retainMeaningfulCapabilityMatches(rankedRows).slice(0, limit);
}
