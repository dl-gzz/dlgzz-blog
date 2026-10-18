import assert from 'node:assert/strict';
import Module from 'node:module';

async function main() {
  const drizzleEntry = require.resolve('drizzle-orm/pglite');
  const drizzleRequire = Module.createRequire(drizzleEntry);
  const { PGlite } = drizzleRequire('@electric-sql/pglite');
  const { drizzle } = require('drizzle-orm/pglite');
  const client = new PGlite();
  const database = drizzle(client);

  await client.exec(`
    create table "user" (
      id text primary key,
      banned boolean,
      ban_expires timestamptz
    );
    create table onework_entitlement (
      id text primary key,
      user_id text not null,
      status text not null,
      monthly_quota integer not null,
      starts_at timestamptz not null,
      expires_at timestamptz
    );
    create table onework_usage_credit_grant (
      id text primary key,
      user_id text not null,
      credits_granted integer not null,
      credits_remaining integer not null,
      expires_at timestamptz,
      created_at timestamptz not null default now()
    );
    create table api_usage_event (
      id text primary key,
      api_key_id text,
      user_id text not null,
      visitor_id text,
      kind text not null,
      knowledge_pack_id text,
      service_id text,
      billing_source text not null default 'subscription',
      credit_grant_id text,
      query text not null default '',
      status text not null,
      result_count integer not null default 0,
      embedding_tokens integer not null default 0,
      latency_ms integer not null default 0,
      created_at timestamptz not null default now()
    );
  `);

  const moduleWithLoad = Module as unknown as {
    _load: (
      request: string,
      parent: { filename?: string } | null,
      isMain: boolean
    ) => unknown;
  };
  const originalLoad = moduleWithLoad._load;
  let injectedDatabase = false;
  moduleWithLoad._load = function (request, parent, isMain) {
    const fromBillingOrOAuth =
      parent?.filename?.endsWith('/src/lib/api-key.ts') ||
      parent?.filename?.endsWith('/src/lib/onework-oauth.ts');
    if (
      fromBillingOrOAuth &&
      (request === '@/db' || request.endsWith('/src/db'))
    ) {
      injectedDatabase = true;
      return { getDb: async () => database };
    }
    return originalLoad.call(this, request, parent as NodeModule, isMain);
  };

  try {
    const { reserveOneWorkUserUsage, completeApiKeyUsage } = await import(
      '../src/lib/api-key'
    );
    const now = new Date();
    const anchor = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    await client.query(
      `insert into "user" (id, banned, ban_expires) values ('shared-user', false, null)`
    );
    await client.query(
      `insert into onework_entitlement
         (id, user_id, status, monthly_quota, starts_at, expires_at)
       values ('entitlement-1', 'shared-user', 'active', 1, $1, $2)`,
      [anchor, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)]
    );
    await client.query(
      `insert into onework_usage_credit_grant
         (id, user_id, credits_granted, credits_remaining, expires_at)
       values ('credits-1', 'shared-user', 2, 2, null)`
    );

    const first = await reserveOneWorkUserUsage({
      userId: 'shared-user',
      monthlyQuota: 1,
      kind: 'knowledge_query',
    });
    assert(first, 'first call should use the monthly allowance');

    const secondExpert = await reserveOneWorkUserUsage({
      userId: 'shared-user',
      monthlyQuota: 1,
      kind: 'knowledge_query',
    });
    assert(secondExpert, 'second expert should use the shared credit pool');

    const afterReservations = await client.query(
      `select e.billing_source, e.credit_grant_id, c.credits_remaining
       from api_usage_event e cross join onework_usage_credit_grant c
       where e.id = $1 and c.id = 'credits-1'`,
      [secondExpert.eventId]
    );
    assert.equal(afterReservations.rows[0].billing_source, 'credit');
    assert.equal(afterReservations.rows[0].credit_grant_id, 'credits-1');
    assert.equal(afterReservations.rows[0].credits_remaining, 1);

    await completeApiKeyUsage({
      eventId: secondExpert.eventId,
      status: 'error',
    });
    const afterRefund = await client.query(
      `select credits_remaining from onework_usage_credit_grant where id = 'credits-1'`
    );
    assert.equal(afterRefund.rows[0].credits_remaining, 2);

    const retried = await reserveOneWorkUserUsage({
      userId: 'shared-user',
      monthlyQuota: 1,
      kind: 'knowledge_query',
    });
    assert(retried, 'a refunded credit should be available for retry');
    await completeApiKeyUsage({ eventId: retried.eventId, status: 'ok' });

    const lastCredit = await reserveOneWorkUserUsage({
      userId: 'shared-user',
      monthlyQuota: 1,
      kind: 'knowledge_query',
    });
    assert(lastCredit, 'the remaining account credit should be shared');
    await completeApiKeyUsage({ eventId: lastCredit.eventId, status: 'ok' });

    const exhausted = await reserveOneWorkUserUsage({
      userId: 'shared-user',
      monthlyQuota: 1,
      kind: 'knowledge_query',
    });
    assert.equal(
      exhausted,
      null,
      'all experts should be blocked after exhaustion'
    );

    const usage = await client.query(
      `select billing_source, count(*)::int as count
       from api_usage_event where user_id = 'shared-user'
       group by billing_source order by billing_source`
    );
    assert.deepEqual(
      usage.rows.map((row: { billing_source: string; count: number }) => [
        row.billing_source,
        row.count,
      ]),
      [
        ['credit', 3],
        ['subscription', 1],
      ]
    );

    await client.query(
      `insert into "user" (id, banned, ban_expires) values ('concurrent-user', false, null)`
    );
    await client.query(
      `insert into onework_entitlement
         (id, user_id, status, monthly_quota, starts_at, expires_at)
       values ('entitlement-concurrent', 'concurrent-user', 'active', 1, $1, $2)`,
      [anchor, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)]
    );
    await client.query(
      `insert into onework_usage_credit_grant
         (id, user_id, credits_granted, credits_remaining, expires_at)
       values ('credits-concurrent', 'concurrent-user', 2, 2, null)`
    );
    const concurrentReservations = await Promise.all(
      Array.from({ length: 5 }, () =>
        reserveOneWorkUserUsage({
          userId: 'concurrent-user',
          monthlyQuota: 1,
          kind: 'knowledge_query',
        })
      )
    );
    assert.equal(
      concurrentReservations.filter(Boolean).length,
      3,
      'concurrent experts must share one quota and the same two credits'
    );
    assert.equal(
      concurrentReservations.filter((reservation) => reservation === null)
        .length,
      2,
      'excess concurrent calls must be denied without overdraw'
    );
    const concurrentLedger = await client.query(
      `select billing_source, count(*)::int as count
       from api_usage_event where user_id = 'concurrent-user'
       group by billing_source order by billing_source`
    );
    assert.deepEqual(
      concurrentLedger.rows.map(
        (row: { billing_source: string; count: number }) => [
          row.billing_source,
          row.count,
        ]
      ),
      [
        ['credit', 2],
        ['subscription', 1],
      ]
    );

    await client.query(
      `insert into "user" (id, banned, ban_expires) values ('mcp-user', false, null)`
    );
    await client.query(
      `insert into onework_entitlement
         (id, user_id, status, monthly_quota, starts_at, expires_at)
       values ('entitlement-mcp', 'mcp-user', 'active', 1, $1, $2)`,
      [anchor, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)]
    );
    await client.query(
      `insert into onework_usage_credit_grant
         (id, user_id, credits_granted, credits_remaining, expires_at)
       values ('credits-mcp', 'mcp-user', 1, 1, null)`
    );
    const { handleOneWorkMcpMessage } = await import('../src/lib/onework-mcp');
    const mcpDependencies = {
      resolveCapability: async () => ({ resolution: {} }),
      searchKnowledge: async () => [],
      listKnowledgeCatalog: async () => ({
        collections: [],
        ungroupedPacks: [],
        packs: [
          {
            id: 'pack-test',
            name: 'Test pack',
            description: 'Isolated test pack',
            metadata: {},
          },
        ],
      }),
      getKnowledgeSource: async () => null,
      queryAnalytics: async () => ({ rowCount: 0 }),
      getAccountAccess: async () => ({
        entitlements: [
          { knowledgePackId: 'pack-test', status: 'active', expiresAt: null },
        ],
        devices: [],
        usage: {
          usedThisMonth: 0,
          limit: 1,
          remaining: 1,
          monthlyRemaining: 1,
          creditBalance: 1,
          totalRemaining: 2,
        },
        legacyDeviceLimit: 3,
      }),
      reserveUsage: reserveOneWorkUserUsage,
      completeUsage: completeApiKeyUsage,
    } as unknown as Parameters<typeof handleOneWorkMcpMessage>[2];
    const callMcpSearch = (clientId: string, id: number) =>
      handleOneWorkMcpMessage(
        {
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: {
            name: 'onework_search_knowledge',
            arguments: { query: 'test query', packId: 'pack-test' },
          },
        },
        {
          tokenId: `token-${clientId}`,
          userId: 'mcp-user',
          clientId,
          scopes: new Set(['onework:knowledge']),
          expiresAt: new Date(now.getTime() + 60_000),
        },
        mcpDependencies
      );
    const fromFirstExpert = await callMcpSearch('expert-a', 1);
    const fromSecondExpert = await callMcpSearch('expert-b', 2);
    assert.equal(
      fromFirstExpert.response && 'error' in fromFirstExpert.response,
      false
    );
    assert.equal(
      fromSecondExpert.response && 'error' in fromSecondExpert.response,
      false
    );
    const fromThirdExpert = await callMcpSearch('expert-c', 3);
    const thirdToolResult = fromThirdExpert.response as {
      result?: { isError?: boolean; structuredContent?: { code?: string } };
    };
    assert.equal(thirdToolResult.result?.isError, true);
    assert.equal(
      thirdToolResult.result?.structuredContent?.code,
      'QUOTA_EXCEEDED'
    );
    const mcpLedger = await client.query(
      `select billing_source, count(*)::int as count
       from api_usage_event where user_id = 'mcp-user'
       group by billing_source order by billing_source`
    );
    assert.deepEqual(
      mcpLedger.rows.map((row: { billing_source: string; count: number }) => [
        row.billing_source,
        row.count,
      ]),
      [
        ['credit', 1],
        ['subscription', 1],
      ]
    );

    await client.query(
      `insert into "user" (id, banned, ban_expires)
       values ('expert-gate-user', false, null)`
    );
    await client.query(
      `insert into onework_entitlement
         (id, user_id, status, monthly_quota, starts_at, expires_at)
       values ('expert-gate-entitlement', 'expert-gate-user', 'active', 1, $1, $2)`,
      [anchor, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)]
    );
    await client.query(
      `insert into onework_usage_credit_grant
         (id, user_id, credits_granted, credits_remaining, expires_at)
       values ('expert-gate-credit', 'expert-gate-user', 1, 1, null)`
    );
    const callExpertGate = (clientId: string, id: number) =>
      handleOneWorkMcpMessage(
        {
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name: 'onework_begin_expert_use', arguments: {} },
        },
        {
          tokenId: `token-${clientId}`,
          userId: 'expert-gate-user',
          clientId,
          scopes: new Set(['onework:account']),
          expiresAt: new Date(now.getTime() + 60_000),
        },
        mcpDependencies
      );
    const expertAUse = await callExpertGate('xhs-expert-a', 1);
    const expertBUse = await callExpertGate('xhs-expert-b', 2);
    const expertCUse = await callExpertGate('xhs-expert-c', 3);
    const expertUsePayload = (
      expertAUse.response as {
        result?: {
          structuredContent?: { authorized?: boolean; chargedCalls?: number };
        };
      }
    ).result?.structuredContent;
    assert.equal(expertUsePayload?.authorized, true);
    assert.equal(expertUsePayload?.chargedCalls, 1);
    assert.equal(
      expertBUse.response && 'error' in expertBUse.response,
      false,
      'a second Expert OAuth client shares the same account usage balance'
    );
    const exhaustedExpertUse = expertCUse.response as {
      result?: { isError?: boolean; structuredContent?: { code?: string } };
    };
    assert.equal(exhaustedExpertUse.result?.isError, true);
    assert.equal(
      exhaustedExpertUse.result?.structuredContent?.code,
      'QUOTA_EXCEEDED'
    );
    const expertUseLedger = await client.query(
      `select kind, billing_source, count(*)::int as count
       from api_usage_event where user_id = 'expert-gate-user'
       group by kind, billing_source order by billing_source`
    );
    assert.deepEqual(
      expertUseLedger.rows.map(
        (row: { kind: string; billing_source: string; count: number }) => [
          row.kind,
          row.billing_source,
          row.count,
        ]
      ),
      [
        ['expert_use', 'credit', 1],
        ['expert_use', 'subscription', 1],
      ]
    );

    await client.query(
      `insert into "user" (id, banned, ban_expires)
       values ('no-access-user', false, null),
              ('credit-only-user', false, null),
              ('expired-user', false, null)`
    );
    await client.query(
      `insert into onework_entitlement
         (id, user_id, status, monthly_quota, starts_at, expires_at)
       values ('entitlement-expired', 'expired-user', 'active', 1000, $1, $2)`,
      [anchor, new Date(now.getTime() - 1000)]
    );
    await client.query(
      `insert into onework_usage_credit_grant
         (id, user_id, credits_granted, credits_remaining, expires_at)
       values ('credits-only', 'credit-only-user', 1, 1, null)`
    );
    const { userHasActiveOneWorkEntitlement } = await import(
      '../src/lib/onework-oauth'
    );
    assert.equal(
      await userHasActiveOneWorkEntitlement('no-access-user'),
      false,
      'OAuth eligibility must reject an account with no paid entitlement'
    );
    assert.equal(
      await userHasActiveOneWorkEntitlement('credit-only-user'),
      true,
      'a purchased credit pack should allow OAuth connection without a subscription'
    );
    assert.equal(
      await userHasActiveOneWorkEntitlement('expired-user'),
      false,
      'expired subscriptions without remaining credits must lose OAuth eligibility'
    );
    assert(injectedDatabase, 'reservation code must use the isolated database');
    console.log('one-worker-os isolated OAuth usage reservation tests passed');
  } finally {
    moduleWithLoad._load = originalLoad;
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
