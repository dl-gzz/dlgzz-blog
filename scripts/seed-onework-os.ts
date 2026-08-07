import { join } from 'node:path';
import { getDb } from '@/db';
import {
  oneWorkCapability,
  semanticModel,
  workerSkill,
  workerSkillCapability,
} from '@/db/schema';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

const SKILL_ID = 'one-work-os';
const VERSION = '1.0.0';

const capabilities = [
  {
    id: 'cap_onework_knowledge_search',
    capabilityKey: 'knowledge.search',
    name: '知识检索',
    description:
      '检索已授权的 OneWorkOS 知识包，返回文本、出处和相关媒体资产。',
    provider: 'onework',
    kind: 'knowledge',
    intents: [
      '查找教程',
      '检索知识',
      '查官方资料',
      'WorkBuddy 怎么用',
      '下一步点什么',
      '查找出处',
    ],
    inputSchema: {
      type: 'object',
      required: ['query', 'packId'],
      properties: {
        query: { type: 'string' },
        packId: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      required: ['results'],
      properties: { results: { type: 'array' } },
    },
    runtime: {
      adapter: 'http',
      endpoint: '/api/knowledge/query',
      method: 'POST',
      auth: 'bearer',
    },
    riskLevel: 'low',
    requiresConfirmation: false,
    metadata: { executionMode: 'read_only', packAware: true },
  },
  {
    id: 'cap_onework_analytics_query',
    capabilityKey: 'analytics.query',
    name: '受治理的数据分析',
    description:
      '使用已注册的指标、维度和筛选条件分析结构化数据，不接受任意 SQL。',
    provider: 'onework',
    kind: 'analytics',
    intents: [
      '数据分析',
      '统计数量',
      '查看趋势',
      '计算增长',
      '排名对比',
      'KPI',
      '过去 30 天表现',
    ],
    inputSchema: {
      type: 'object',
      required: ['modelId', 'metrics'],
      properties: {
        modelId: { type: 'string' },
        metrics: { type: 'array', items: { type: 'string' } },
        dimensions: { type: 'array', items: { type: 'string' } },
        filters: { type: 'array' },
        timeRange: { type: 'object' },
        limit: { type: 'integer', minimum: 1, maximum: 500 },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      required: ['rows', 'rowCount'],
      properties: {
        rows: { type: 'array' },
        rowCount: { type: 'integer' },
      },
    },
    runtime: {
      adapter: 'http',
      endpoint: '/api/analytics/query',
      method: 'POST',
      auth: 'bearer',
      contract: 'onework.semantic-query.v1',
    },
    riskLevel: 'low',
    requiresConfirmation: false,
    metadata: {
      executionMode: 'read_only',
      defaultModelId: 'onework_usage_v1',
    },
  },
  {
    id: 'cap_onework_presentation_create',
    capabilityKey: 'presentation.create',
    name: '创建演示文稿',
    description: '调用用户 AI 环境已安装的演示文稿能力生成并验证 PPT。',
    provider: 'host',
    kind: 'action',
    intents: ['生成 PPT', '制作幻灯片', '创建演示文稿', '整理成 PPT'],
    inputSchema: {
      type: 'object',
      required: ['brief'],
      properties: { brief: { type: 'string' } },
    },
    outputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        verified: { type: 'boolean' },
      },
    },
    runtime: {
      adapter: 'host_capability',
      capability: 'presentations',
      operation: 'create',
      availability: 'runtime',
    },
    riskLevel: 'low',
    requiresConfirmation: false,
    metadata: { fallback: 'guided_setup' },
  },
  {
    id: 'cap_onework_workbuddy_execute',
    capabilityKey: 'workbuddy.execute',
    name: 'WorkBuddy 操作',
    description:
      '在宿主环境具备 WorkBuddy 操作能力时执行，否则降级为可验证的界面引导。',
    provider: 'workbuddy',
    kind: 'action',
    intents: [
      '操作 WorkBuddy',
      '在 WorkBuddy 中执行',
      '帮我点 WorkBuddy',
      '配置 WorkBuddy',
      '安装 WorkBuddy 功能',
    ],
    inputSchema: {
      type: 'object',
      required: ['goal'],
      properties: { goal: { type: 'string' } },
    },
    outputSchema: {
      type: 'object',
      properties: {
        mode: { enum: ['tool_call', 'guided_ui', 'human_required'] },
        verified: { type: 'boolean' },
      },
    },
    runtime: {
      adapter: 'host_capability',
      capability: 'workbuddy',
      availability: 'runtime',
      fallback: 'guided_ui',
    },
    riskLevel: 'medium',
    requiresConfirmation: true,
    metadata: { knowledgePackId: 'onework-workbuddy-v1' },
  },
] as const;

const usageModelDefinition = {
  source: { schema: 'public', table: 'api_usage_event' },
  metrics: {
    request_count: {
      aggregation: 'count',
      label: '调用次数',
      description: '选定时间范围内的 OneWorkOS API 调用数量。',
      type: 'number',
    },
    result_count: {
      aggregation: 'sum',
      column: 'result_count',
      label: '返回结果数',
      description: '选定时间范围内各次调用返回的结果数合计。',
      type: 'number',
    },
    embedding_tokens: {
      aggregation: 'sum',
      column: 'embedding_tokens',
      label: '向量 Token',
      description: '选定时间范围内记录的向量化 Token 合计。',
      type: 'number',
    },
    average_latency_ms: {
      aggregation: 'avg',
      column: 'latency_ms',
      label: '平均延迟（毫秒）',
      description: '选定时间范围内 OneWorkOS API 的平均处理时间。',
      type: 'number',
    },
  },
  dimensions: {
    kind: { column: 'kind', type: 'string', label: '调用类型' },
    status: { column: 'status', type: 'string', label: '执行状态' },
    service: { column: 'service_id', type: 'string', label: '服务' },
  },
  filters: {
    kind: {
      column: 'kind',
      type: 'string',
      operators: ['eq', 'neq', 'in', 'not_in'],
    },
    status: {
      column: 'status',
      type: 'string',
      operators: ['eq', 'neq', 'in', 'not_in'],
    },
    service: {
      column: 'service_id',
      type: 'string',
      operators: ['eq', 'neq', 'in', 'not_in', 'contains'],
    },
    created_at: {
      column: 'created_at',
      type: 'timestamp',
      operators: ['gt', 'gte', 'lt', 'lte'],
    },
  },
  timeRange: {
    field: 'created_at',
    required: false,
    defaultDays: 30,
    maxDays: 366,
  },
  userScope: { column: 'user_id' },
  defaultLimit: 20,
  maxLimit: 100,
} as const;

async function main() {
  const db = await getDb();

  await db
    .insert(workerSkill)
    .values({
      id: SKILL_ID,
      name: 'OneWorkOS',
      summary: '为独立工作者调度知识、数据和宿主工具。',
      category: 'orchestration',
      skillType: 'orchestrator',
      riskLevel: 'medium',
      status: 'active',
      defaultEnabled: true,
      requiresUserConfig: true,
    })
    .onConflictDoUpdate({
      target: workerSkill.id,
      set: {
        name: 'OneWorkOS',
        summary: '为独立工作者调度知识、数据和宿主工具。',
        category: 'orchestration',
        skillType: 'orchestrator',
        riskLevel: 'medium',
        status: 'active',
        defaultEnabled: true,
        requiresUserConfig: true,
        updatedAt: new Date(),
      },
    });

  for (const capability of capabilities) {
    await db
      .insert(oneWorkCapability)
      .values({
        ...capability,
        intents: [...capability.intents],
        scope: 'global',
        status: 'active',
        version: VERSION,
      })
      .onConflictDoUpdate({
        target: oneWorkCapability.id,
        set: {
          capabilityKey: capability.capabilityKey,
          name: capability.name,
          description: capability.description,
          scope: 'global',
          provider: capability.provider,
          kind: capability.kind,
          intents: [...capability.intents],
          inputSchema: capability.inputSchema,
          outputSchema: capability.outputSchema,
          runtime: capability.runtime,
          riskLevel: capability.riskLevel,
          requiresConfirmation: capability.requiresConfirmation,
          status: 'active',
          version: VERSION,
          metadata: capability.metadata,
          updatedAt: new Date(),
        },
      });

    await db
      .insert(workerSkillCapability)
      .values({
        id: `skillcap_${SKILL_ID}_${capability.capabilityKey.replaceAll('.', '_')}`,
        skillId: SKILL_ID,
        capabilityId: capability.id,
        status: 'enabled',
        priority: capability.kind === 'knowledge' ? 100 : 90,
        configuration: {},
      })
      .onConflictDoUpdate({
        target: [
          workerSkillCapability.skillId,
          workerSkillCapability.capabilityId,
        ],
        set: {
          status: 'enabled',
          priority: capability.kind === 'knowledge' ? 100 : 90,
          configuration: {},
          updatedAt: new Date(),
        },
      });
  }

  await db
    .insert(semanticModel)
    .values({
      id: 'onework_usage_v1',
      modelKey: 'onework_usage',
      name: 'OneWorkOS 用量分析',
      description: '按当前 API Key 所属用户隔离的 OneWorkOS 调用量与延迟指标。',
      scope: 'global',
      provider: 'postgres',
      definition: usageModelDefinition,
      status: 'active',
      version: VERSION,
      metadata: { userScoped: true, source: 'api_usage_event' },
    })
    .onConflictDoUpdate({
      target: semanticModel.id,
      set: {
        name: 'OneWorkOS 用量分析',
        description:
          '按当前 API Key 所属用户隔离的 OneWorkOS 调用量与延迟指标。',
        scope: 'global',
        provider: 'postgres',
        definition: usageModelDefinition,
        status: 'active',
        version: VERSION,
        metadata: { userScoped: true, source: 'api_usage_event' },
        updatedAt: new Date(),
      },
    });

  console.log(
    `Seeded OneWorkOS: ${capabilities.length} capabilities, 1 semantic model.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
