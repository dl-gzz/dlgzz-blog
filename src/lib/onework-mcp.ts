import 'server-only';

import { completeApiKeyUsage, reserveOneWorkUserUsage } from '@/lib/api-key';
import {
  type KnowledgeAssetResult,
  type KnowledgeSearchResult,
  searchKnowledgeChunks,
} from '@/lib/knowledge-search';
import { listOneWorkAccess } from '@/lib/onework-access';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';
import { resolveDispatch } from '@/lib/onework-dispatcher';
import {
  type SemanticQueryMode,
  executeSemanticQuery,
} from '@/lib/semantic-layer';
import { getBaseUrl } from '@/lib/urls/urls';

export const ONEWORK_MCP_PROTOCOL_VERSION = '2025-06-18';
export const ONEWORK_MCP_MAX_BODY_BYTES = 100_000;

const WORKBUDDY_PACK_ID = 'onework-workbuddy-v1';
const XHS_OPEN_SHOP_PACK_ID = 'xhs-open-shop-v1';
const XHS_OPERATIONS_PACK_ID = 'xhs-operations-v1';

const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  '2024-11-05',
  '2025-03-26',
  ONEWORK_MCP_PROTOCOL_VERSION,
]);

export function isSupportedOneWorkMcpProtocolVersion(value: string) {
  return SUPPORTED_PROTOCOL_VERSIONS.has(value);
}

const TOOL_SCOPES = {
  onework_resolve_capability: 'onework:resolve',
  onework_search_knowledge: 'onework:knowledge',
  onework_query_analytics: 'onework:analytics',
  onework_get_entitlements: 'onework:account',
  onework_get_usage: 'onework:account',
} as const;

export type OneWorkMcpToolName = keyof typeof TOOL_SCOPES;

/**
 * Minimal contract expected from `@/lib/onework-oauth` by the MCP route.
 * Keeping it here lets the OAuth implementation and protocol layer agree
 * without coupling MCP tools to a particular token library.
 */
export interface OneWorkOAuthPrincipal {
  tokenId: string;
  userId: string;
  clientId: string;
  scopes: ReadonlySet<string>;
  expiresAt: Date;
}

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}

interface JsonRpcFailure {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: Record<string, unknown>;
  };
}

export type OneWorkMcpResponse = JsonRpcSuccess | JsonRpcFailure;

export interface OneWorkMcpResult {
  response: OneWorkMcpResponse | null;
  status: number;
}

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
}

export interface OneWorkMcpDependencies {
  resolveCapability: typeof resolveDispatch;
  searchKnowledge: typeof searchKnowledgeChunks;
  queryAnalytics: typeof executeSemanticQuery;
  getAccountAccess: typeof listOneWorkAccess;
  reserveUsage: typeof reserveOneWorkUserUsage;
  completeUsage: typeof completeApiKeyUsage;
}

const DEFAULT_DEPENDENCIES: OneWorkMcpDependencies = {
  resolveCapability: resolveDispatch,
  searchKnowledge: searchKnowledgeChunks,
  queryAnalytics: executeSemanticQuery,
  getAccountAccess: listOneWorkAccess,
  reserveUsage: reserveOneWorkUserUsage,
  completeUsage: completeApiKeyUsage,
};

class McpRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly status = 400,
    readonly data?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'McpRpcError';
  }
}

class McpToolError extends Error {
  constructor(
    readonly toolCode: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

class McpTimeoutError extends Error {
  constructor() {
    super('MCP tool execution timed out');
    this.name = 'McpTimeoutError';
  }
}

const TOOLS = [
  {
    name: 'onework_resolve_capability',
    description:
      'Resolve a goal to governed OneWorkOS capabilities and an execution route.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['goal'],
      properties: {
        goal: { type: 'string', minLength: 1, maxLength: 2000 },
        intentHint: { type: 'string', maxLength: 200 },
        context: { type: 'object' },
        availableCapabilities: {
          type: 'array',
          maxItems: 100,
          items: { type: 'string', minLength: 1, maxLength: 200 },
        },
        executionRequested: { type: 'boolean' },
        kind: { type: 'string', maxLength: 80 },
        skillId: { type: 'string', maxLength: 160 },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
  },
  {
    name: 'onework_search_knowledge',
    description:
      'Search a licensed OneWorkOS knowledge pack using the governed retrieval service.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 5000 },
        packId: {
          type: 'string',
          minLength: 1,
          maxLength: 160,
          description:
            'Optional licensed pack ID. Omit or pass auto so OneWorkOS routes WorkBuddy and Xiaohongshu automatically.',
        },
        context: {
          type: 'string',
          maxLength: 1000,
          description: 'Latest explicit topic for a short follow-up.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
        includeAssets: { type: 'boolean' },
        includeResources: { type: 'boolean' },
      },
    },
  },
  {
    name: 'onework_query_analytics',
    description:
      'Validate or execute a governed OneWorkOS semantic analytics query.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['semanticQuery'],
      properties: {
        semanticQuery: { type: 'object' },
        mode: { type: 'string', enum: ['execute', 'validate'] },
      },
    },
  },
  {
    name: 'onework_get_entitlements',
    description: 'Get the current account entitlements and device allowance.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'onework_get_usage',
    description: 'Get current-month OneWorkOS usage and remaining quota.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rpcSuccess(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result };
}

export function oneWorkMcpRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: Record<string, unknown>
): JsonRpcFailure {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data ? { data } : {}) },
  };
}

function parseRequest(value: unknown): JsonRpcRequest {
  if (!isRecord(value) || Array.isArray(value)) {
    throw new McpRpcError(-32600, 'Invalid Request');
  }
  if (value.jsonrpc !== '2.0' || typeof value.method !== 'string') {
    throw new McpRpcError(-32600, 'Invalid Request');
  }
  if (
    'id' in value &&
    value.id !== null &&
    typeof value.id !== 'string' &&
    typeof value.id !== 'number'
  ) {
    throw new McpRpcError(-32600, 'Invalid Request');
  }
  return value as unknown as JsonRpcRequest;
}

function stringArg(
  args: Record<string, unknown>,
  name: string,
  maxLength: number,
  required = false
) {
  const value = args[name];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string') {
    throw new McpRpcError(-32602, `${name} must be a string`);
  }
  const normalized = value.trim();
  if ((required && !normalized) || value.length > maxLength) {
    throw new McpRpcError(-32602, `${name} is invalid`);
  }
  return normalized;
}

function integerArg(
  args: Record<string, unknown>,
  name: string,
  defaultValue: number,
  maximum: number
) {
  const value = args[name] ?? defaultValue;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    throw new McpRpcError(
      -32602,
      `${name} must be an integer from 1 to ${maximum}`
    );
  }
  return value;
}

function hasScope(principal: OneWorkOAuthPrincipal, scope: string) {
  return (
    principal.scopes.has(scope) ||
    principal.scopes.has('onework:*') ||
    principal.scopes.has('*')
  );
}

function requireToolScope(
  principal: OneWorkOAuthPrincipal,
  tool: OneWorkMcpToolName
) {
  const requiredScope = TOOL_SCOPES[tool];
  if (!hasScope(principal, requiredScope)) {
    throw new McpRpcError(-32003, 'Insufficient OAuth scope', 403, {
      tool,
      requiredScope,
    });
  }
}

function toolTimeoutMs() {
  const configured = Number(process.env.ONEWORK_MCP_TOOL_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return 20_000;
  return Math.max(1_000, Math.min(Math.floor(configured), 30_000));
}

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new McpTimeoutError()),
          toolTimeoutMs()
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function asToolResult(value: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function asToolError(error: McpToolError | McpTimeoutError): ToolResult {
  const structuredContent = {
    success: false,
    code: error instanceof McpTimeoutError ? 'TOOL_TIMEOUT' : error.toolCode,
    error: error.message,
    ...(error instanceof McpToolError && error.details
      ? { details: error.details }
      : {}),
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError: true,
  };
}

function activePackIds(access: Awaited<ReturnType<typeof listOneWorkAccess>>) {
  const now = Date.now();
  return new Set(
    access.entitlements
      .filter(
        (item) =>
          item.status === 'active' &&
          (!item.expiresAt || item.expiresAt.getTime() > now)
      )
      .map((item) => item.knowledgePackId)
  );
}

function ensureQuota(access: Awaited<ReturnType<typeof listOneWorkAccess>>) {
  if (access.usage.limit < 1 || access.usage.remaining < 1) {
    throw new McpToolError(
      'QUOTA_EXCEEDED',
      'Monthly OneWorkOS quota exhausted'
    );
  }
}

function isShortKnowledgeFollowUp(query: string) {
  return (
    query.length <= 24 &&
    /^(?:那|那么|然后|接下来|下一步|这个|这里|怎么做|怎么办|继续|对|可以|不行|没有|还有|呢|为什么)/.test(
      query
    )
  );
}

function effectiveKnowledgeQuery(query: string, context?: string) {
  if (!context || !isShortKnowledgeFollowUp(query)) return query;
  return `上一个明确主题：${context}\n用户追问：${query}`.slice(0, 5000);
}

export function resolveOneWorkKnowledgePackId(
  requestedPackId: string | undefined,
  query: string,
  licensedPackIds: ReadonlySet<string>
) {
  const requested = requestedPackId?.trim() || 'auto';
  if (requested !== 'auto') {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(requested)) {
      throw new McpRpcError(-32602, 'packId is invalid');
    }
    return requested;
  }

  const normalized = query.toLowerCase();
  const operationsIntent =
    /发货|物流|运费模板|订单|售后|退换|商品|上架|下架|库存|笔记|直播|千帆|推广|广告|流量|账号运营|运费宝/.test(
      normalized
    );
  const openingIntent =
    /开店|入驻|个人店|个体店|店铺类型|店铺升级|营业执照|主体变更|资质|品牌授权|商标|入驻审核|开店审核|保证金/.test(
      normalized
    );
  const isXhs =
    /小红书|xiaohongshu|\bxhs\b|\bred\b/.test(normalized) ||
    operationsIntent ||
    openingIntent;
  let routed = WORKBUDDY_PACK_ID;
  if (isXhs) {
    routed =
      openingIntent && !operationsIntent
        ? XHS_OPEN_SHOP_PACK_ID
        : XHS_OPERATIONS_PACK_ID;
  }

  if (licensedPackIds.has(ALL_PACKS_GRANT) || licensedPackIds.has(routed)) {
    return routed;
  }
  const specificPacks = [...licensedPackIds].filter(
    (packId) => packId !== ALL_PACKS_GRANT
  );
  return specificPacks.length === 1 ? specificPacks[0] : routed;
}

function serializeKnowledgeAsset(
  asset: KnowledgeAssetResult,
  assetProxyBaseUrl: string | null
) {
  const publicUrl = assetProxyBaseUrl
    ? `${assetProxyBaseUrl}/${encodeURIComponent(asset.id)}`
    : asset.publicUrl;
  return {
    id: asset.id,
    type: asset.assetType,
    url: publicUrl,
    ...(publicUrl !== asset.publicUrl ? { originalUrl: asset.publicUrl } : {}),
    mimeType: asset.mimeType,
    ...(asset.title ? { title: asset.title } : {}),
    ...(asset.platform ? { platform: asset.platform } : {}),
    ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
    ...(asset.embedUrl ? { embedUrl: asset.embedUrl } : {}),
    width: asset.width,
    height: asset.height,
    ...(asset.durationSeconds !== null
      ? { durationSeconds: asset.durationSeconds }
      : {}),
    ...(asset.publishedAt
      ? { publishedAt: asset.publishedAt.toISOString() }
      : {}),
    ...(asset.official ? { official: true } : {}),
    ...(asset.publisher ? { publisher: asset.publisher } : {}),
    ...(asset.sourceType ? { sourceType: asset.sourceType } : {}),
    alt: asset.altText || asset.caption,
    caption: asset.caption,
    role: asset.role,
  };
}

function serializeSourceUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(name)) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function isInternalOrigin(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === 'host.docker.internal'
    );
  } catch {
    return true;
  }
}

function getAssetProxyBaseUrl() {
  const configuredOrigin =
    process.env.KNOWLEDGE_PUBLIC_ORIGIN ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    getBaseUrl();
  if (configuredOrigin && !isInternalOrigin(configuredOrigin)) {
    return new URL('/api/knowledge/assets', configuredOrigin)
      .toString()
      .replace(/\/$/, '');
  }
  return 'https://www.dlgzz.com/api/knowledge/assets';
}

function serializeKnowledgeResult(
  result: KnowledgeSearchResult,
  includeAssets: boolean,
  includeResources: boolean,
  assetProxyBaseUrl: string
) {
  return {
    title: result.title,
    source: result.source,
    sourceUrl: serializeSourceUrl(result.sourceUrl),
    category: result.category,
    heading: result.heading,
    content: result.content,
    score: result.score,
    metadata: result.metadata,
    assets: includeAssets
      ? (result.assets || [])
          .filter((asset) => asset.assetType === 'image')
          .map((asset) => serializeKnowledgeAsset(asset, assetProxyBaseUrl))
      : [],
    resources: includeResources
      ? (result.assets || [])
          .filter((asset) => asset.assetType !== 'image')
          .map((asset) => serializeKnowledgeAsset(asset, null))
      : [],
  };
}

async function callTool(
  name: OneWorkMcpToolName,
  args: Record<string, unknown>,
  principal: OneWorkOAuthPrincipal,
  dependencies: OneWorkMcpDependencies
): Promise<ToolResult> {
  requireToolScope(principal, name);

  if (name === 'onework_resolve_capability') {
    const goal = stringArg(args, 'goal', 2000, true)!;
    const intentHint = stringArg(args, 'intentHint', 200);
    const kind = stringArg(args, 'kind', 80);
    const skillId = stringArg(args, 'skillId', 160);
    const context = args.context ?? {};
    const available = args.availableCapabilities ?? [];
    if (!isRecord(context)) {
      throw new McpRpcError(-32602, 'context must be an object');
    }
    if (
      !Array.isArray(available) ||
      available.length > 100 ||
      available.some(
        (item) => typeof item !== 'string' || !item.trim() || item.length > 200
      )
    ) {
      throw new McpRpcError(-32602, 'availableCapabilities is invalid');
    }
    if (
      args.executionRequested !== undefined &&
      typeof args.executionRequested !== 'boolean'
    ) {
      throw new McpRpcError(-32602, 'executionRequested must be a boolean');
    }
    const result = await dependencies.resolveCapability(
      {
        goal,
        ...(intentHint ? { intentHint } : {}),
        context,
        availableCapabilities: available.map((item) => item.trim()),
        executionRequested: args.executionRequested === true,
        ...(kind ? { kind } : {}),
        ...(skillId ? { skillId } : {}),
        limit: integerArg(args, 'limit', 8, 20),
      },
      principal.userId
    );
    return asToolResult({ success: true, resolution: result.resolution });
  }

  if (name === 'onework_search_knowledge') {
    const startedAt = Date.now();
    const query = stringArg(args, 'query', 5000, true)!;
    const requestedPackId = stringArg(args, 'packId', 160);
    const context = stringArg(args, 'context', 1000);
    if (
      args.includeAssets !== undefined &&
      typeof args.includeAssets !== 'boolean'
    ) {
      throw new McpRpcError(-32602, 'includeAssets must be a boolean');
    }
    if (
      args.includeResources !== undefined &&
      typeof args.includeResources !== 'boolean'
    ) {
      throw new McpRpcError(-32602, 'includeResources must be a boolean');
    }
    const includeAssets = args.includeAssets !== false;
    const includeResources =
      typeof args.includeResources === 'boolean'
        ? args.includeResources
        : includeAssets;
    const access = await dependencies.getAccountAccess(principal.userId);
    ensureQuota(access);
    const packs = activePackIds(access);
    const effectiveQuery = effectiveKnowledgeQuery(query, context);
    const packId = resolveOneWorkKnowledgePackId(
      requestedPackId,
      effectiveQuery,
      packs
    );
    if (!packs.has(ALL_PACKS_GRANT) && !packs.has(packId)) {
      throw new McpToolError(
        'PACK_NOT_LICENSED',
        'The account is not entitled to this knowledge pack',
        { packId }
      );
    }
    const reservation = await dependencies.reserveUsage({
      userId: principal.userId,
      monthlyQuota: access.usage.limit,
      kind: 'knowledge_query',
      knowledgePackId: packId,
      query: effectiveQuery,
    });
    if (!reservation) {
      throw new McpToolError(
        'QUOTA_EXCEEDED',
        'Monthly OneWorkOS quota exhausted'
      );
    }
    try {
      const results = await dependencies.searchKnowledge(effectiveQuery, {
        packId,
        limit: integerArg(args, 'limit', 6, 20),
        includeAssets: includeAssets || includeResources,
      });
      await dependencies.completeUsage({
        eventId: reservation.eventId,
        resultCount: results.length,
        status: 'ok',
        latencyMs: Date.now() - startedAt,
      });
      return asToolResult({
        success: true,
        packId,
        query,
        ...(effectiveQuery !== query ? { effectiveQuery } : {}),
        results: results.map((result) =>
          serializeKnowledgeResult(
            result,
            includeAssets,
            includeResources,
            getAssetProxyBaseUrl()
          )
        ),
      });
    } catch (error) {
      if (error instanceof McpRpcError || error instanceof McpToolError) {
        throw error;
      }
      await dependencies.completeUsage({
        eventId: reservation.eventId,
        status: 'error',
        latencyMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  if (name === 'onework_query_analytics') {
    const startedAt = Date.now();
    if (!isRecord(args.semanticQuery)) {
      throw new McpRpcError(-32602, 'semanticQuery must be an object');
    }
    const mode = args.mode ?? 'execute';
    if (mode !== 'execute' && mode !== 'validate') {
      throw new McpRpcError(-32602, 'mode must be execute or validate');
    }
    const access = await dependencies.getAccountAccess(principal.userId);
    ensureQuota(access);
    const reservation = await dependencies.reserveUsage({
      userId: principal.userId,
      monthlyQuota: access.usage.limit,
      kind: 'analytics_query',
      serviceId: 'analytics.query',
      query: JSON.stringify(args.semanticQuery),
    });
    if (!reservation) {
      throw new McpToolError(
        'QUOTA_EXCEEDED',
        'Monthly OneWorkOS quota exhausted'
      );
    }
    try {
      const result = await dependencies.queryAnalytics(
        args.semanticQuery,
        principal.userId,
        mode as SemanticQueryMode
      );
      await dependencies.completeUsage({
        eventId: reservation.eventId,
        resultCount: result.rowCount,
        status: 'ok',
        latencyMs: Date.now() - startedAt,
      });
      return asToolResult({
        success: true,
        requestId: result.runId,
        mode: result.mode,
        result: {
          columns: result.columns,
          rows: result.rows,
          rowCount: result.rowCount,
          truncated: result.truncated,
        },
        evidence: {
          model: result.model.key,
          modelId: result.model.id,
          modelVersion: result.model.version,
          metricDefinitions: result.metricDefinitions,
          resolvedTimeRange: result.resolvedTimeRange,
        },
      });
    } catch (error) {
      await dependencies.completeUsage({
        eventId: reservation.eventId,
        status: 'error',
        latencyMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  const access = await dependencies.getAccountAccess(principal.userId);
  if (name === 'onework_get_entitlements') {
    return asToolResult({
      success: true,
      entitlements: access.entitlements,
      deviceLimit: access.deviceLimit,
    });
  }
  return asToolResult({ success: true, usage: access.usage });
}

function parseToolCall(params: unknown) {
  if (!isRecord(params) || typeof params.name !== 'string') {
    throw new McpRpcError(-32602, 'tools/call requires a tool name');
  }
  if (!(params.name in TOOL_SCOPES)) {
    throw new McpRpcError(-32602, 'Unknown tool', 400, { tool: params.name });
  }
  const args = params.arguments ?? {};
  if (!isRecord(args)) {
    throw new McpRpcError(-32602, 'tool arguments must be an object');
  }
  return { name: params.name as OneWorkMcpToolName, args };
}

/** Handle one MCP JSON-RPC message. JSON-RPC batching is intentionally rejected. */
export async function handleOneWorkMcpMessage(
  value: unknown,
  principal: OneWorkOAuthPrincipal,
  dependencies: OneWorkMcpDependencies = DEFAULT_DEPENDENCIES
): Promise<OneWorkMcpResult> {
  let request: JsonRpcRequest;
  try {
    request = parseRequest(value);
  } catch (error) {
    const rpcError =
      error instanceof McpRpcError
        ? error
        : new McpRpcError(-32600, 'Invalid Request');
    return {
      response: oneWorkMcpRpcError(
        null,
        rpcError.code,
        rpcError.message,
        rpcError.data
      ),
      status: rpcError.status,
    };
  }

  const id = request.id ?? null;
  const notification = request.id === undefined;
  try {
    if (request.method === 'initialize') {
      if (!isRecord(request.params)) {
        throw new McpRpcError(-32602, 'initialize params must be an object');
      }
      const requestedVersion = request.params.protocolVersion;
      const protocolVersion =
        typeof requestedVersion === 'string' &&
        SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion)
          ? requestedVersion
          : ONEWORK_MCP_PROTOCOL_VERSION;
      return {
        response: rpcSuccess(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'OneWorkOS', version: '1.0.0' },
          instructions:
            'Use OneWorkOS tools only within the OAuth scopes granted to this connection.',
        }),
        status: 200,
      };
    }

    if (request.method === 'notifications/initialized') {
      return { response: null, status: 202 };
    }

    if (request.method === 'ping') {
      return notification
        ? { response: null, status: 202 }
        : { response: rpcSuccess(id, {}), status: 200 };
    }

    if (request.method === 'tools/list') {
      if (request.params !== undefined && !isRecord(request.params)) {
        throw new McpRpcError(-32602, 'tools/list params must be an object');
      }
      return notification
        ? { response: null, status: 202 }
        : { response: rpcSuccess(id, { tools: TOOLS }), status: 200 };
    }

    if (request.method === 'tools/call') {
      const { name, args } = parseToolCall(request.params);
      if (notification) {
        return { response: null, status: 202 };
      }
      try {
        const result = await withTimeout(
          callTool(name, args, principal, dependencies)
        );
        return { response: rpcSuccess(id, result), status: 200 };
      } catch (error) {
        if (error instanceof McpRpcError) throw error;
        if (error instanceof McpToolError || error instanceof McpTimeoutError) {
          return { response: rpcSuccess(id, asToolError(error)), status: 200 };
        }
        console.error(`[mcp] ${name} failed`, error);
        return {
          response: rpcSuccess(
            id,
            asToolError(
              new McpToolError(
                'TOOL_EXECUTION_FAILED',
                'The OneWorkOS tool could not complete the request'
              )
            )
          ),
          status: 200,
        };
      }
    }

    throw new McpRpcError(-32601, 'Method not found');
  } catch (error) {
    if (notification) return { response: null, status: 202 };
    const rpcError =
      error instanceof McpRpcError
        ? error
        : new McpRpcError(-32603, 'Internal error', 500);
    return {
      response: oneWorkMcpRpcError(
        id,
        rpcError.code,
        rpcError.message,
        rpcError.data
      ),
      status: rpcError.status,
    };
  }
}
