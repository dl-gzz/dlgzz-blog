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
    .replace(/[\s._:/\\-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
}

function intentTokens(value: string) {
  return normalizeIntent(value)
    .split(' ')
    .filter((token) => token.length > 1);
}

function scoreText(query: string, candidate: string) {
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
  if (overlap === 0) return 0;
  return Math.round(
    (overlap / Math.max(queryTokens.size, candidateTokens.length)) * 500
  );
}

function getIntentMatch(requestedIntent: string, intents: string[]) {
  let bestScore = 0;
  let matchedIntent: string | null = null;

  for (const intent of intents) {
    const score = scoreText(requestedIntent, intent);
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

  return rows
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
      const intentMatch = requestedIntent
        ? getIntentMatch(requestedIntent, intents)
        : { score: 0, matchedIntent: null };
      const descriptiveScore = requestedIntent
        ? Math.max(
            scoreText(requestedIntent, row.name),
            scoreText(requestedIntent, row.description)
          )
        : 0;

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
          score: Math.max(intentMatch.score, Math.floor(descriptiveScore / 2)),
          matchedIntent: intentMatch.matchedIntent,
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
    })
    .slice(0, limit);
}
