import assert from 'node:assert/strict';
import {
  type OneWorkMcpDependencies,
  type OneWorkMcpResponse,
  handleOneWorkMcpMessage,
  isSupportedOneWorkMcpProtocolVersion,
  resolveKnowledgeSearchPackIds,
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
  catalogAllowedPackIds: [] as string[],
  sourceAllowedPackIds: [] as string[],
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
        contentHash: 'a'.repeat(40),
        updatedAt: new Date('2026-08-20T00:00:00.000Z'),
        sourceUrl:
          'https://docs.example.test/page?utm_source=test&b=2&X-Amz-Signature=secret#a',
        score: 0.9,
        metadata: { packId: options?.packId, sourceAccess: 'full' },
        packIds: options?.packIds || [options?.packId || 'pack.test'],
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
  async listKnowledgeCatalog(
    options: Parameters<OneWorkMcpDependencies['listKnowledgeCatalog']>[0]
  ) {
    calls.catalogAllowedPackIds = options.allowedPackIds || [];
    const pack = {
      id: 'pack.test',
      name: 'Test pack',
      description: 'Test knowledge',
      scope: 'test',
      metadata: { version: 1 },
      documentCount: 1,
      collectionIds: ['collection.test'],
      updatedAt: '2026-08-20T00:00:00.000Z',
    };
    return {
      collections: [
        {
          id: 'collection.test',
          name: 'Test collection',
          description: 'Test collection',
          metadata: {},
          packs: [pack],
          updatedAt: '2026-08-20T00:00:00.000Z',
        },
      ],
      ungroupedPacks: [],
      packs: [pack],
    };
  },
  async getKnowledgeSource(
    options: Parameters<OneWorkMcpDependencies['getKnowledgeSource']>[0]
  ) {
    calls.sourceAllowedPackIds = options.allowedPackIds || [];
    return {
      documentId: 'document_test',
      packIds: ['pack.test'],
      title: 'Test result',
      source: 'test',
      category: 'test',
      relativePath: 'docs/test.md',
      contentHash: 'a'.repeat(40),
      contentType: 'text/markdown',
      language: 'markdown',
      sourceUrl: null,
      metadata: { authority: 'first_party_author' },
      content: '# Test\n\n```ts\nconst value = 1;\n```',
      cursor: 0,
      nextCursor: null,
      complete: true,
      totalChars: 38,
      updatedAt: '2026-08-20T00:00:00.000Z',
    };
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
  overrides = principal,
  injectedDependencies: OneWorkMcpDependencies = dependencies
) {
  return handleOneWorkMcpMessage(
    { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) },
    overrides,
    injectedDependencies
  );
}

async function main() {
  assert(isSupportedOneWorkMcpProtocolVersion('2025-06-18'));
  assert(isSupportedOneWorkMcpProtocolVersion('2025-03-26'));
  assert(!isSupportedOneWorkMcpProtocolVersion('2099-01-01'));
  const catalog = await dependencies.listKnowledgeCatalog({
    allowedPackIds: ['*'],
  });
  assert.deepEqual(resolveKnowledgeSearchPackIds({}, catalog), ['pack.test']);
  assert.deepEqual(
    resolveKnowledgeSearchPackIds({ collectionId: 'collection.test' }, catalog),
    ['pack.test']
  );
  assert.throws(() =>
    resolveKnowledgeSearchPackIds({ packId: 'pack.denied' }, catalog)
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
    'onework_list_knowledge_catalog',
    'onework_search_knowledge',
    'onework_get_knowledge_source',
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

  const catalogResult = await request(4, 'tools/call', {
    name: 'onework_list_knowledge_catalog',
    arguments: {},
  });
  assert.equal(
    (
      asRecord(successResult(catalogResult.response).structuredContent)
        .packs as unknown[]
    ).length,
    1
  );
  assert.deepEqual(calls.catalogAllowedPackIds, ['pack.test']);

  const searched = await request(5, 'tools/call', {
    name: 'onework_search_knowledge',
    arguments: { query: 'test question', collectionId: 'collection.test' },
  });
  const searchContent = asRecord(
    successResult(searched.response).structuredContent
  );
  assert.equal(searchContent.success, true);
  assert.equal((searchContent.results as unknown[]).length, 1);
  const searchResult = asRecord((searchContent.results as unknown[])[0]);
  assert.equal(searchResult.documentId, 'document_test');
  assert.deepEqual(searchResult.matchedPackIds, ['pack.test']);
  assert.equal(searchResult.contentHash, 'a'.repeat(40));
  assert.equal(searchResult.untrustedReference, true);
  assert.equal(searchResult.fullSourceAvailable, true);
  assert.equal(searchResult.sourceUrl, 'https://docs.example.test/page?b=2');
  const image = asRecord((searchResult.assets as unknown[])[0]);
  assert.equal(
    image.url,
    'https://www.dlgzz.com/api/knowledge/assets/image_test'
  );
  assert.equal(image.originalUrl, 'https://raw.example.test/image.png');
  const resource = asRecord((searchResult.resources as unknown[])[0]);
  assert.equal(resource.url, 'https://video.example.test/watch');

  const source = await request(6, 'tools/call', {
    name: 'onework_get_knowledge_source',
    arguments: {
      documentId: 'document_test',
      expectedContentHash: 'a'.repeat(40),
    },
  });
  const sourceResult = asRecord(
    asRecord(successResult(source.response).structuredContent).source
  );
  assert.equal(sourceResult.complete, true);
  assert.match(String(sourceResult.content), /```ts/);
  assert.equal(sourceResult.relativePath, 'docs/test.md');
  assert.equal(sourceResult.untrustedReference, true);
  assert.deepEqual(calls.sourceAllowedPackIds, ['pack.test']);

  const analytics = await request(7, 'tools/call', {
    name: 'onework_query_analytics',
    arguments: { semanticQuery: { model: 'test', metrics: ['count'] } },
  });
  assert.equal(calls.analyticsUserId, principal.userId);
  assert.equal(
    asRecord(successResult(analytics.response).structuredContent).requestId,
    'run_test'
  );

  const entitlements = await request(8, 'tools/call', {
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

  const usage = await request(9, 'tools/call', {
    name: 'onework_get_usage',
    arguments: {},
  });
  assert.equal(
    asRecord(asRecord(successResult(usage.response).structuredContent).usage)
      .remaining,
    98
  );

  const insufficientScope = await request(
    10,
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

  const reservationsBeforeDeniedReads = calls.reservations;
  const unavailableSource = await request(
    11,
    'tools/call',
    {
      name: 'onework_get_knowledge_source',
      arguments: { documentId: 'document_denied' },
    },
    principal,
    {
      ...dependencies,
      async getKnowledgeSource() {
        return null;
      },
    }
  );
  const unavailableResult = successResult(unavailableSource.response);
  assert.equal(unavailableResult.isError, true);
  assert.equal(
    asRecord(unavailableResult.structuredContent).code,
    'KNOWLEDGE_SOURCE_UNAVAILABLE'
  );

  const changedSource = await request(12, 'tools/call', {
    name: 'onework_get_knowledge_source',
    arguments: {
      documentId: 'document_test',
      expectedContentHash: 'b'.repeat(40),
    },
  });
  const changedResult = successResult(changedSource.response);
  assert.equal(changedResult.isError, true);
  assert.equal(
    asRecord(changedResult.structuredContent).code,
    'KNOWLEDGE_SOURCE_VERSION_CHANGED'
  );
  assert.equal(calls.reservations, reservationsBeforeDeniedReads);

  const timeoutEventId = 'usage_timeout';
  const timeoutUsageStatus = new Map([[timeoutEventId, 'pending']]);
  const timeoutCompletionAttempts: string[] = [];
  const timeoutAppliedCompletions: string[] = [];
  const delayedDependencies = {
    ...dependencies,
    async reserveUsage() {
      return { eventId: timeoutEventId, usedThisMonth: 2 };
    },
    async searchKnowledge(
      query: string,
      options: Parameters<OneWorkMcpDependencies['searchKnowledge']>[1]
    ) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return dependencies.searchKnowledge(query, options);
    },
    async completeUsage(
      event: Parameters<OneWorkMcpDependencies['completeUsage']>[0]
    ) {
      timeoutCompletionAttempts.push(event.status);
      if (event.status === 'error') {
        // Keep the timeout write in flight after the business work resolves.
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      // Mirrors completeApiKeyUsage's `status = pending` update guard.
      if (timeoutUsageStatus.get(event.eventId) !== 'pending') return;
      timeoutUsageStatus.set(event.eventId, event.status);
      timeoutAppliedCompletions.push(event.status);
    },
  } as OneWorkMcpDependencies;
  const timedOut = await handleOneWorkMcpMessage(
    {
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: {
        name: 'onework_search_knowledge',
        arguments: { query: 'slow query' },
      },
    },
    principal,
    delayedDependencies,
    { toolTimeoutMs: 10 }
  );
  const timeoutResult = successResult(timedOut.response);
  assert.equal(timeoutResult.isError, true);
  assert.equal(asRecord(timeoutResult.structuredContent).code, 'TOOL_TIMEOUT');
  assert.equal(timeoutUsageStatus.get(timeoutEventId), 'error');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(timeoutCompletionAttempts, ['error', 'ok']);
  assert.deepEqual(timeoutAppliedCompletions, ['error']);
  assert.equal(timeoutUsageStatus.get(timeoutEventId), 'error');

  const okFirstEventId = 'usage_timeout_ok_first';
  const okFirstUsageStatus = new Map([[okFirstEventId, 'pending']]);
  const okFirstCompletionAttempts: string[] = [];
  const okFirstAppliedCompletions: string[] = [];
  const okFirstDependencies = {
    ...dependencies,
    async reserveUsage() {
      return { eventId: okFirstEventId, usedThisMonth: 2 };
    },
    async completeUsage(
      event: Parameters<OneWorkMcpDependencies['completeUsage']>[0]
    ) {
      okFirstCompletionAttempts.push(event.status);
      await new Promise((resolve) =>
        setTimeout(resolve, event.status === 'ok' ? 20 : 40)
      );
      if (okFirstUsageStatus.get(event.eventId) !== 'pending') return;
      okFirstUsageStatus.set(event.eventId, event.status);
      okFirstAppliedCompletions.push(event.status);
    },
  } as OneWorkMcpDependencies;
  const okFirstCompleted = await handleOneWorkMcpMessage(
    {
      jsonrpc: '2.0',
      id: 14,
      method: 'tools/call',
      params: {
        name: 'onework_search_knowledge',
        arguments: { query: 'fast query, slow successful accounting' },
      },
    },
    principal,
    okFirstDependencies,
    { toolTimeoutMs: 10 }
  );
  const okFirstResult = successResult(okFirstCompleted.response);
  assert.equal(okFirstResult.isError, undefined);
  assert.equal(asRecord(okFirstResult.structuredContent).success, true);
  assert.deepEqual(okFirstCompletionAttempts, ['ok']);
  assert.deepEqual(okFirstAppliedCompletions, ['ok']);
  assert.equal(okFirstUsageStatus.get(okFirstEventId), 'ok');

  const malformed = await handleOneWorkMcpMessage([], principal, dependencies);
  assert(malformed.response && 'error' in malformed.response);
  assert.equal(malformed.response.error.code, -32600);
  assert.equal(calls.reservations, 3);
  assert.equal(calls.completions, 3);

  console.log('one-worker-os MCP protocol tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
