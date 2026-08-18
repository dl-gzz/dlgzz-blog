import assert from 'node:assert/strict';
import {
  type OneWorkMcpDependencies,
  type OneWorkMcpResponse,
  handleOneWorkMcpMessage,
  isSupportedOneWorkMcpProtocolVersion,
  resolveOneWorkKnowledgePackId,
} from '@/lib/onework-mcp';

const principal = {
  tokenId: 'token_test',
  userId: 'user_test',
  clientId: 'client_test',
  scopes: new Set([
    'onework:resolve',
    'onework:knowledge',
    'onework:analytics',
    'onework:account',
  ]),
  expiresAt: new Date(Date.now() + 60_000),
};

const calls = {
  resolverUserId: '',
  analyticsUserId: '',
  reservations: 0,
  completions: 0,
};

function accountAccess(packIds = ['pack.test']) {
  return {
    entitlements: packIds.map((knowledgePackId, index) => ({
      id: `entitlement_${index}`,
      userId: principal.userId,
      knowledgePackId,
      source: 'test',
      status: 'active',
      monthlyQuota: 100,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    devices: [],
    keys: [],
    usage: { usedThisMonth: 2, limit: 100, remaining: 98 },
    deviceLimit: 3,
  };
}

const dependencies = {
  async resolveCapability(
    _input: Parameters<OneWorkMcpDependencies['resolveCapability']>[0],
    userId: string
  ) {
    calls.resolverUserId = userId;
    return {
      resolution: {
        intent: 'test',
        route: 'knowledge',
        risk: 'read_only',
        capabilities: [],
        successCriteria: [],
        requiresConfirmation: false,
        missingCapabilities: [],
      },
      matches: [],
    };
  },
  async searchKnowledge(
    query: string,
    options: Parameters<OneWorkMcpDependencies['searchKnowledge']>[1]
  ) {
    return [
      {
        id: 'chunk_test',
        documentId: 'document_test',
        title: 'Test result',
        source: 'test',
        category: 'test',
        heading: null,
        content: `Answer for ${query}`,
        filePath: '/test.md',
        sourceUrl: 'https://docs.example.test/page?utm_source=test&b=2#a',
        score: 0.9,
        metadata: { packId: options?.packId },
        assets: [
          {
            id: 'image_test',
            assetType: 'image',
            publicUrl: 'https://raw.example.test/image.png',
            mimeType: 'image/png',
            title: 'Screenshot',
            platform: null,
            thumbnailUrl: null,
            embedUrl: null,
            width: 100,
            height: 80,
            durationSeconds: null,
            publishedAt: null,
            official: true,
            publisher: null,
            sourceType: null,
            altText: 'Screenshot',
            caption: 'Screenshot',
            role: 'evidence',
          },
          {
            id: 'video_test',
            assetType: 'video',
            publicUrl: 'https://video.example.test/watch',
            mimeType: 'video/mp4',
            title: 'Tutorial',
            platform: 'test',
            thumbnailUrl: null,
            embedUrl: null,
            width: null,
            height: null,
            durationSeconds: 30,
            publishedAt: null,
            official: true,
            publisher: null,
            sourceType: null,
            altText: 'Tutorial',
            caption: 'Tutorial',
            role: 'reference',
          },
        ],
      },
    ];
  },
  async queryAnalytics(
    _input: unknown,
    userId: string,
    mode: Parameters<OneWorkMcpDependencies['queryAnalytics']>[2]
  ) {
    calls.analyticsUserId = userId;
    return {
      mode,
      runId: 'run_test',
      model: { id: 'model_test', key: 'test', name: 'Test', version: 1 },
      request: {},
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
      durationMs: 1,
      queryHash: 'hash',
      resolvedTimeRange: null,
      metricDefinitions: [],
    };
  },
  async getAccountAccess() {
    return accountAccess();
  },
  async reserveUsage() {
    calls.reservations += 1;
    return { eventId: `usage_${calls.reservations}`, usedThisMonth: 2 };
  },
  async completeUsage() {
    calls.completions += 1;
  },
} as unknown as OneWorkMcpDependencies;

function asRecord(value: unknown): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function successResult(response: OneWorkMcpResponse | null) {
  assert(
    response && 'result' in response,
    'expected JSON-RPC success response'
  );
  return asRecord(response.result);
}

async function request(
  id: number,
  method: string,
  params?: Record<string, unknown>,
  overrides = principal
) {
  return handleOneWorkMcpMessage(
    { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) },
    overrides,
    dependencies
  );
}

async function main() {
  assert(isSupportedOneWorkMcpProtocolVersion('2025-06-18'));
  assert(isSupportedOneWorkMcpProtocolVersion('2025-03-26'));
  assert(!isSupportedOneWorkMcpProtocolVersion('2099-01-01'));
  const allPacks = new Set(['*']);
  assert.equal(
    resolveOneWorkKnowledgePackId(undefined, 'WorkBuddy 怎么做 PPT', allPacks),
    'onework-workbuddy-v1'
  );
  assert.equal(
    resolveOneWorkKnowledgePackId('auto', '小红书开店需要什么', allPacks),
    'xhs-open-shop-v1'
  );
  assert.equal(
    resolveOneWorkKnowledgePackId('auto', '小红书店铺怎么设置发货', allPacks),
    'xhs-operations-v1'
  );
  assert.equal(
    resolveOneWorkKnowledgePackId(undefined, '怎么设置发货', allPacks),
    'xhs-operations-v1'
  );
  process.env.KNOWLEDGE_PUBLIC_ORIGIN = 'https://www.dlgzz.com';
  const initialized = await request(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' },
  });
  assert.equal(initialized.status, 200);
  assert.equal(
    successResult(initialized.response).protocolVersion,
    '2025-06-18'
  );

  const notification = await handleOneWorkMcpMessage(
    { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
    principal,
    dependencies
  );
  assert.equal(notification.status, 202);
  assert.equal(notification.response, null);

  const listed = await request(2, 'tools/list', {});
  const toolNames = (
    successResult(listed.response).tools as Array<{ name: string }>
  ).map((tool) => tool.name);
  assert.deepEqual(toolNames, [
    'onework_resolve_capability',
    'onework_search_knowledge',
    'onework_query_analytics',
    'onework_get_entitlements',
    'onework_get_usage',
  ]);

  const resolved = await request(3, 'tools/call', {
    name: 'onework_resolve_capability',
    arguments: { goal: 'Find the right knowledge capability' },
  });
  assert.equal(calls.resolverUserId, principal.userId);
  assert.equal(
    asRecord(successResult(resolved.response).structuredContent).success,
    true
  );

  const searched = await request(4, 'tools/call', {
    name: 'onework_search_knowledge',
    arguments: { query: 'test question', packId: 'pack.test' },
  });
  const searchContent = asRecord(
    successResult(searched.response).structuredContent
  );
  assert.equal(searchContent.success, true);
  assert.equal((searchContent.results as unknown[]).length, 1);
  const searchResult = asRecord((searchContent.results as unknown[])[0]);
  assert.equal(searchResult.sourceUrl, 'https://docs.example.test/page?b=2');
  const image = asRecord((searchResult.assets as unknown[])[0]);
  assert.equal(
    image.url,
    'https://www.dlgzz.com/api/knowledge/assets/image_test'
  );
  assert.equal(image.originalUrl, 'https://raw.example.test/image.png');
  const resource = asRecord((searchResult.resources as unknown[])[0]);
  assert.equal(resource.url, 'https://video.example.test/watch');

  const analytics = await request(5, 'tools/call', {
    name: 'onework_query_analytics',
    arguments: { semanticQuery: { model: 'test', metrics: ['count'] } },
  });
  assert.equal(calls.analyticsUserId, principal.userId);
  assert.equal(
    asRecord(successResult(analytics.response).structuredContent).requestId,
    'run_test'
  );

  const entitlements = await request(6, 'tools/call', {
    name: 'onework_get_entitlements',
    arguments: {},
  });
  assert.equal(
    (
      asRecord(successResult(entitlements.response).structuredContent)
        .entitlements as unknown[]
    ).length,
    1
  );

  const usage = await request(7, 'tools/call', {
    name: 'onework_get_usage',
    arguments: {},
  });
  assert.equal(
    asRecord(asRecord(successResult(usage.response).structuredContent).usage)
      .remaining,
    98
  );

  const insufficientScope = await request(
    8,
    'tools/call',
    {
      name: 'onework_query_analytics',
      arguments: { semanticQuery: { model: 'test', metrics: [] } },
    },
    { ...principal, scopes: new Set(['onework:knowledge']) }
  );
  assert.equal(insufficientScope.status, 403);
  assert(
    insufficientScope.response && 'error' in insufficientScope.response,
    'scope rejection must be a JSON-RPC error'
  );
  assert.equal(insufficientScope.response.error.code, -32003);

  const malformed = await handleOneWorkMcpMessage([], principal, dependencies);
  assert(malformed.response && 'error' in malformed.response);
  assert.equal(malformed.response.error.code, -32600);
  assert.equal(calls.reservations, 2);
  assert.equal(calls.completions, 2);

  console.log('one-worker-os MCP protocol tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
