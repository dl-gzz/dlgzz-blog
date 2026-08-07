import 'server-only';

import {
  type ResolvedCapability,
  resolveCapabilities,
} from '@/lib/capability-registry';

export interface DispatchInput {
  goal: string;
  intentHint?: string;
  context?: Record<string, unknown>;
  availableCapabilities?: string[];
  executionRequested?: boolean;
  kind?: string;
  skillId?: string;
  limit?: number;
}

function routeFor(capabilities: ResolvedCapability[]) {
  const routes = new Set(
    capabilities.map((capability) => {
      if (capability.kind === 'knowledge') return 'knowledge';
      if (capability.kind === 'analytics') return 'analytics';
      return 'action';
    })
  );
  if (routes.size === 0) return 'human_required';
  if (routes.size > 1) return 'composite';
  return [...routes][0];
}

function operationFor(capability: ResolvedCapability) {
  const configured = capability.runtime.operation;
  if (typeof configured === 'string' && configured.trim()) return configured;
  if (capability.kind === 'knowledge') return 'search';
  if (capability.kind === 'analytics') return 'query';
  return 'execute';
}

function successCriteria(context: Record<string, unknown> | undefined) {
  const value = context?.successCriteria;
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

/** Build a deterministic dispatch recommendation from registered capabilities. */
export async function resolveDispatch(input: DispatchInput, userId: string) {
  const primaryIntent = input.intentHint?.trim() || input.goal;
  let matches = await resolveCapabilities(
    {
      intent: primaryIntent,
      kind: input.kind,
      skillId: input.skillId,
      limit: input.limit ?? 8,
    },
    userId
  );

  // An intent hint is advisory. Fall back to the full goal if it is not a
  // registered intent rather than asking a model to invent a route.
  if (matches.length === 0 && input.intentHint?.trim()) {
    matches = await resolveCapabilities(
      {
        intent: input.goal,
        kind: input.kind,
        skillId: input.skillId,
        limit: input.limit ?? 8,
      },
      userId
    );
  }

  const available = new Set(input.availableCapabilities ?? []);
  const availableWasDeclared = available.size > 0;
  const selected = availableWasDeclared
    ? matches.filter((capability) => available.has(capability.id))
    : matches;
  const missingCapabilities = availableWasDeclared
    ? matches
        .filter((capability) => !available.has(capability.id))
        .map((capability) => capability.id)
    : [];
  const requiresConfirmation = Boolean(
    input.executionRequested &&
      selected.some((capability) => capability.requiresConfirmation)
  );
  const route = routeFor(matches);

  return {
    resolution: {
      intent:
        input.intentHint?.trim() ||
        matches[0]?.match.matchedIntent ||
        (matches.length ? matches[0].id : 'unresolved'),
      route,
      risk: matches.some((capability) => capability.kind === 'action')
        ? 'external_write'
        : 'read_only',
      capabilities: selected.map((capability) => ({
        id: capability.id,
        operation: operationFor(capability),
        reason: capability.description,
      })),
      successCriteria: successCriteria(input.context),
      requiresConfirmation,
      missingCapabilities,
    },
    matches,
  };
}
