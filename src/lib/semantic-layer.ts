import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import {
  oneWorkCapability,
  semanticModel,
  semanticQueryRun,
} from '@/db/schema';
import { type SQL, and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SERVER_MAX_LIMIT = 500;
const DEFAULT_MAX_TIME_RANGE_DAYS = 366;
const MAX_FILTERS = 20;
const MAX_IN_VALUES = 100;
const DEFAULT_QUERY_TIMEOUT_MS = 10_000;

const scalarSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
]);

const filterOperatorSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'not_in',
  'between',
  'contains',
  'starts_with',
  'ends_with',
  'is_null',
  'not_null',
]);

const explicitTimeRangeSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const alternateTimeRangeSchema = z
  .object({
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const presetTimeRangeSchema = z
  .object({
    preset: z.enum([
      'last_7_days',
      'last_30_days',
      'last_90_days',
      'last_365_days',
    ]),
    timezone: z.string().trim().min(1).max(100).default('UTC'),
  })
  .strict();

const querySchema = z
  .object({
    contract: z.literal('onework.semantic-query.v1').optional(),
    modelId: z.string().trim().min(1).max(160).optional(),
    model: z.string().trim().min(1).max(160).optional(),
    capabilityId: z.string().trim().min(1).max(160).optional(),
    metrics: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    dimensions: z.array(z.string().trim().min(1).max(100)).max(12).default([]),
    filters: z
      .array(
        z
          .object({
            field: z.string().trim().min(1).max(100),
            operator: filterOperatorSchema,
            value: z
              .union([
                scalarSchema,
                z.array(scalarSchema).min(1).max(MAX_IN_VALUES),
              ])
              .optional(),
          })
          .strict()
      )
      .max(MAX_FILTERS)
      .default([]),
    timeRange: z
      .union([
        explicitTimeRangeSchema,
        alternateTimeRangeSchema,
        presetTimeRangeSchema,
      ])
      .optional(),
    orderBy: z
      .array(
        z
          .object({
            field: z.string().trim().min(1).max(100),
            direction: z.enum(['asc', 'desc']).default('asc'),
          })
          .strict()
      )
      .max(5)
      .default([]),
    limit: z.number().int().positive().max(SERVER_MAX_LIMIT).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.modelId || value.model), {
    message: '缺少 model 或 modelId',
    path: ['model'],
  });

const fieldTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'date',
  'timestamp',
]);
const identifierSchema = z.string().regex(IDENTIFIER_PATTERN);

const definitionSchema = z
  .object({
    source: z
      .object({
        schema: identifierSchema.default('public'),
        table: identifierSchema,
      })
      .strict(),
    metrics: z.record(
      identifierSchema,
      z
        .object({
          aggregation: z.enum([
            'count',
            'count_distinct',
            'sum',
            'avg',
            'min',
            'max',
          ]),
          column: identifierSchema.optional(),
          label: z.string().max(200).optional(),
          description: z.string().max(1000).optional(),
          type: fieldTypeSchema.optional(),
        })
        .strict()
    ),
    dimensions: z
      .record(
        identifierSchema,
        z
          .object({
            column: identifierSchema,
            type: fieldTypeSchema,
            label: z.string().max(200).optional(),
          })
          .strict()
      )
      .default({}),
    filters: z
      .record(
        identifierSchema,
        z
          .object({
            column: identifierSchema,
            type: fieldTypeSchema,
            operators: z.array(filterOperatorSchema).min(1).optional(),
          })
          .strict()
      )
      .default({}),
    timeRange: z
      .object({
        field: identifierSchema,
        required: z.boolean().default(false),
        defaultDays: z
          .number()
          .int()
          .positive()
          .max(DEFAULT_MAX_TIME_RANGE_DAYS)
          .optional(),
        maxDays: z
          .number()
          .int()
          .positive()
          .max(3650)
          .default(DEFAULT_MAX_TIME_RANGE_DAYS),
      })
      .strict()
      .optional(),
    userScope: z
      .object({
        column: identifierSchema,
      })
      .strict()
      .optional(),
    defaultLimit: z
      .number()
      .int()
      .positive()
      .max(SERVER_MAX_LIMIT)
      .default(100),
    maxLimit: z
      .number()
      .int()
      .positive()
      .max(SERVER_MAX_LIMIT)
      .default(SERVER_MAX_LIMIT),
  })
  .strict();

export type SemanticQueryInput = z.input<typeof querySchema>;
type ParsedSemanticQuery = Omit<z.output<typeof querySchema>, 'modelId'> & {
  modelId: string;
};
type SemanticDefinition = z.output<typeof definitionSchema>;
type FilterOperator = z.output<typeof filterOperatorSchema>;
type Scalar = z.output<typeof scalarSchema>;

export class SemanticQueryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'SemanticQueryError';
  }
}

function fail(code: string, message: string, status = 400): never {
  throw new SemanticQueryError(code, message, status);
}

function parseQuery(input: unknown): ParsedSemanticQuery {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail(
      'INVALID_QUERY',
      issue
        ? `${issue.path.join('.') || '请求'}: ${issue.message}`
        : '语义查询格式无效'
    );
  }
  return {
    ...parsed.data,
    modelId: parsed.data.modelId || parsed.data.model!,
  };
}

function parseDefinition(value: unknown): SemanticDefinition {
  const parsed = definitionSchema.safeParse(value);
  if (!parsed.success) {
    fail('INVALID_MODEL', '语义模型定义无效，请联系管理员', 500);
  }

  for (const [name, metric] of Object.entries(parsed.data.metrics)) {
    if (metric.aggregation !== 'count' && !metric.column) {
      fail('INVALID_MODEL', `指标 ${name} 缺少 column`, 500);
    }
  }

  const timeField = parsed.data.timeRange?.field;
  if (
    timeField &&
    !(timeField in parsed.data.filters) &&
    !(timeField in parsed.data.dimensions)
  ) {
    fail('INVALID_MODEL', '时间范围字段未注册为 filter 或 dimension', 500);
  }

  return parsed.data;
}

function identifier(value: string) {
  if (!IDENTIFIER_PATTERN.test(value)) {
    fail('INVALID_MODEL', `非法数据库标识符: ${value}`, 500);
  }
  return sql.raw(`"${value}"`);
}

function qualifiedIdentifier(schema: string, table: string) {
  return sql.raw(`"${schema}"."${table}"`);
}

function metricExpression(metric: SemanticDefinition['metrics'][string]) {
  const column = metric.column ? identifier(metric.column) : null;
  switch (metric.aggregation) {
    case 'count':
      return column ? sql`count(${column})` : sql`count(*)`;
    case 'count_distinct':
      return sql`count(distinct ${column!})`;
    case 'sum':
      return sql`sum(${column!})`;
    case 'avg':
      return sql`avg(${column!})`;
    case 'min':
      return sql`min(${column!})`;
    case 'max':
      return sql`max(${column!})`;
  }
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function normalizeScalar(
  value: Scalar,
  type: z.output<typeof fieldTypeSchema>
) {
  if (type === 'string') {
    if (typeof value !== 'string')
      fail('INVALID_FILTER_VALUE', '过滤值必须是字符串');
    return value;
  }
  if (type === 'number') {
    if (typeof value !== 'number')
      fail('INVALID_FILTER_VALUE', '过滤值必须是数字');
    return value;
  }
  if (type === 'boolean') {
    if (typeof value !== 'boolean')
      fail('INVALID_FILTER_VALUE', '过滤值必须是布尔值');
    return value;
  }
  if (typeof value !== 'string')
    fail('INVALID_FILTER_VALUE', '日期过滤值必须是 ISO 时间字符串');
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    fail('INVALID_FILTER_VALUE', '日期过滤值无效');
  return date.toISOString();
}

function requireFilterValue(value: Scalar | Scalar[] | undefined) {
  if (value === undefined || Array.isArray(value)) {
    fail('INVALID_FILTER_VALUE', '该过滤操作需要单个值');
  }
  return value;
}

function buildFilter(
  columnName: string,
  operator: FilterOperator,
  rawValue: Scalar | Scalar[] | undefined,
  type: z.output<typeof fieldTypeSchema>
): SQL {
  const column = identifier(columnName);
  if (operator === 'is_null') return sql`${column} is null`;
  if (operator === 'not_null') return sql`${column} is not null`;

  if (operator === 'in' || operator === 'not_in') {
    if (!Array.isArray(rawValue) || rawValue.length === 0) {
      fail('INVALID_FILTER_VALUE', `${operator} 需要非空数组`);
    }
    const values = rawValue.map(
      (value) => sql`${normalizeScalar(value, type)}`
    );
    return operator === 'in'
      ? sql`${column} in (${sql.join(values, sql`, `)})`
      : sql`${column} not in (${sql.join(values, sql`, `)})`;
  }

  if (operator === 'between') {
    if (!Array.isArray(rawValue) || rawValue.length !== 2) {
      fail('INVALID_FILTER_VALUE', 'between 需要两个值');
    }
    const [from, to] = rawValue.map((value) => normalizeScalar(value, type));
    return sql`${column} between ${from} and ${to}`;
  }

  const value = normalizeScalar(requireFilterValue(rawValue), type);
  switch (operator) {
    case 'eq':
      return sql`${column} = ${value}`;
    case 'neq':
      return sql`${column} <> ${value}`;
    case 'gt':
      return sql`${column} > ${value}`;
    case 'gte':
      return sql`${column} >= ${value}`;
    case 'lt':
      return sql`${column} < ${value}`;
    case 'lte':
      return sql`${column} <= ${value}`;
    case 'contains':
      if (typeof value !== 'string')
        fail('INVALID_FILTER_VALUE', 'contains 只适用于字符串');
      return sql`${column} ilike ${`%${escapeLike(value)}%`} escape '\\'`;
    case 'starts_with':
      if (typeof value !== 'string')
        fail('INVALID_FILTER_VALUE', 'starts_with 只适用于字符串');
      return sql`${column} ilike ${`${escapeLike(value)}%`} escape '\\'`;
    case 'ends_with':
      if (typeof value !== 'string')
        fail('INVALID_FILTER_VALUE', 'ends_with 只适用于字符串');
      return sql`${column} ilike ${`%${escapeLike(value)}`} escape '\\'`;
    default:
      fail('INVALID_FILTER', '未支持的过滤操作');
  }
}

function getFieldDefinition(definition: SemanticDefinition, field: string) {
  return definition.filters[field] ?? definition.dimensions[field] ?? null;
}

function resolveTimeRange(
  query: ParsedSemanticQuery,
  definition: SemanticDefinition
) {
  const config = definition.timeRange;
  if (!config) {
    if (query.timeRange)
      fail('TIME_RANGE_NOT_REGISTERED', '该语义模型未注册时间范围');
    return null;
  }

  let timezone = 'UTC';
  let to = new Date();
  let from: Date | null = null;
  if (query.timeRange && 'preset' in query.timeRange) {
    timezone = query.timeRange.timezone;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(to);
    } catch {
      fail('INVALID_TIMEZONE', '无效的 IANA 时区');
    }
    const days = Number(query.timeRange.preset.match(/\d+/)?.[0] ?? 0);
    from = new Date(to.getTime() - days * 86_400_000);
  } else if (query.timeRange && 'from' in query.timeRange) {
    timezone = query.timeRange.timezone ?? 'UTC';
    to = new Date(query.timeRange.to);
    from = new Date(query.timeRange.from);
  } else if (query.timeRange && 'start' in query.timeRange) {
    timezone = query.timeRange.timezone ?? 'UTC';
    to = new Date(query.timeRange.end);
    from = new Date(query.timeRange.start);
  } else if (config.defaultDays) {
    from = new Date(to.getTime() - config.defaultDays * 86_400_000);
  }

  if (!from) {
    if (config.required)
      fail('TIME_RANGE_REQUIRED', '该查询必须指定 timeRange');
    return null;
  }
  if (from >= to) fail('INVALID_TIME_RANGE', 'timeRange.from 必须早于 to');
  if (to.getTime() - from.getTime() > config.maxDays * 86_400_000) {
    fail('TIME_RANGE_TOO_LARGE', `时间范围不能超过 ${config.maxDays} 天`);
  }

  return { from, to, field: config.field, timezone };
}

function compileQuery(
  query: ParsedSemanticQuery,
  definition: SemanticDefinition,
  userId: string
) {
  const metrics = [...new Set(query.metrics)];
  const dimensions = [...new Set(query.dimensions)];

  for (const metric of metrics) {
    if (!definition.metrics[metric])
      fail('METRIC_NOT_REGISTERED', `指标未注册: ${metric}`);
  }
  for (const dimension of dimensions) {
    if (!definition.dimensions[dimension]) {
      fail('DIMENSION_NOT_REGISTERED', `维度未注册: ${dimension}`);
    }
  }
  if (dimensions.some((dimension) => metrics.includes(dimension))) {
    fail('FIELD_CONFLICT', '指标和维度不能使用同一个 ID');
  }

  const selectParts: SQL[] = [
    ...dimensions.map((name) => {
      const field = definition.dimensions[name];
      return sql`${identifier(field.column)} as ${identifier(name)}`;
    }),
    ...metrics.map(
      (name) =>
        sql`${metricExpression(definition.metrics[name])} as ${identifier(name)}`
    ),
  ];
  const whereParts: SQL[] = [];

  for (const filter of query.filters) {
    const registered = definition.filters[filter.field];
    if (!registered)
      fail('FILTER_NOT_REGISTERED', `过滤器未注册: ${filter.field}`);
    if (
      registered.operators &&
      !registered.operators.includes(filter.operator)
    ) {
      fail(
        'FILTER_OPERATOR_NOT_ALLOWED',
        `${filter.field} 不允许 ${filter.operator}`
      );
    }
    whereParts.push(
      buildFilter(
        registered.column,
        filter.operator,
        filter.value,
        registered.type
      )
    );
  }

  const timeRange = resolveTimeRange(query, definition);
  if (timeRange) {
    const registered = getFieldDefinition(definition, timeRange.field);
    if (!registered) fail('INVALID_MODEL', '时间范围字段未注册', 500);
    if (registered.type !== 'date' && registered.type !== 'timestamp') {
      fail('INVALID_MODEL', '时间范围字段类型必须是 date 或 timestamp', 500);
    }
    whereParts.push(
      sql`${identifier(registered.column)} >= ${timeRange.from.toISOString()}`
    );
    whereParts.push(
      sql`${identifier(registered.column)} < ${timeRange.to.toISOString()}`
    );
  }

  if (definition.userScope) {
    whereParts.push(
      sql`${identifier(definition.userScope.column)} = ${userId}`
    );
  }

  const selectedFields = new Set([...metrics, ...dimensions]);
  for (const order of query.orderBy) {
    if (!selectedFields.has(order.field)) {
      fail('ORDER_FIELD_NOT_SELECTED', `排序字段必须已被选中: ${order.field}`);
    }
  }

  const limit = Math.min(
    query.limit ?? definition.defaultLimit,
    definition.maxLimit,
    SERVER_MAX_LIMIT
  );
  let statement = sql`select ${sql.join(selectParts, sql`, `)} from ${qualifiedIdentifier(
    definition.source.schema,
    definition.source.table
  )}`;
  if (whereParts.length)
    statement = sql`${statement} where ${sql.join(whereParts, sql` and `)}`;
  if (dimensions.length) {
    statement = sql`${statement} group by ${sql.join(
      dimensions.map((name) => identifier(definition.dimensions[name].column)),
      sql`, `
    )}`;
  }
  if (query.orderBy.length) {
    statement = sql`${statement} order by ${sql.join(
      query.orderBy.map(
        (item) => sql`${identifier(item.field)} ${sql.raw(item.direction)}`
      ),
      sql`, `
    )}`;
  }
  // Fetch one extra row so callers can report truncation without returning
  // more than the governed model limit to the client.
  statement = sql`${statement} limit ${limit + 1}`;

  const normalizedRequest = {
    ...query,
    metrics,
    dimensions,
    limit,
    ...(timeRange
      ? {
          timeRange: {
            from: timeRange.from.toISOString(),
            to: timeRange.to.toISOString(),
            timezone: timeRange.timezone,
          },
        }
      : { timeRange: undefined }),
  };
  const preview = {
    source: `${definition.source.schema}.${definition.source.table}`,
    metrics,
    dimensions,
    filters: query.filters.map(({ field, operator }) => ({ field, operator })),
    timeField: timeRange?.field ?? null,
    userScoped: Boolean(definition.userScope),
    orderBy: query.orderBy,
    limit,
  };
  const auditRequest = {
    contract: query.contract ?? 'onework.semantic-query.v1',
    modelId: query.modelId,
    capabilityId: query.capabilityId ?? null,
    metrics,
    dimensions,
    filters: query.filters.map(({ field, operator, value }) => ({
      field,
      operator,
      valueShape: Array.isArray(value)
        ? { type: 'array', count: value.length }
        : value === undefined
          ? { type: 'none' }
          : { type: typeof value },
    })),
    timeRange: normalizedRequest.timeRange ?? null,
    orderBy: query.orderBy,
    limit,
  };

  const columns = [
    ...dimensions.map((name) => ({
      id: name,
      label: definition.dimensions[name].label ?? name,
      type: definition.dimensions[name].type,
      role: 'dimension' as const,
    })),
    ...metrics.map((name) => ({
      id: name,
      label: definition.metrics[name].label ?? name,
      type: definition.metrics[name].type ?? 'number',
      role: 'metric' as const,
    })),
  ];

  return {
    statement,
    normalizedRequest,
    auditRequest,
    preview,
    columns,
    timeRange,
  };
}

function modelCanBeRead(
  model: { ownerUserId: string | null; scope: string },
  userId: string
) {
  if (model.ownerUserId) return model.ownerUserId === userId;
  return ['global', 'public', 'shared'].includes(model.scope);
}

function queryHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function queryTimeoutMs() {
  const configured = Number(process.env.ONEWORK_ANALYTICS_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_QUERY_TIMEOUT_MS;
  return Math.max(1_000, Math.min(Math.floor(configured), 30_000));
}

export type SemanticQueryMode = 'execute' | 'validate';

export async function executeSemanticQuery(
  input: unknown,
  userId: string,
  mode: SemanticQueryMode = 'execute'
) {
  const request = parseQuery(input);
  const db = await getDb();
  let [model] = await db
    .select()
    .from(semanticModel)
    .where(eq(semanticModel.id, request.modelId))
    .limit(1);

  if (!model) {
    [model] = await db
      .select()
      .from(semanticModel)
      .where(
        and(
          eq(semanticModel.modelKey, request.modelId),
          inArray(semanticModel.status, ['active', 'published'])
        )
      )
      .orderBy(desc(semanticModel.updatedAt), desc(semanticModel.version))
      .limit(1);
  }

  if (!model) fail('MODEL_NOT_FOUND', '语义模型不存在', 404);
  if (!['active', 'published'].includes(model.status)) {
    fail('MODEL_NOT_ACTIVE', '语义模型尚未启用', 403);
  }
  if (!modelCanBeRead(model, userId)) {
    fail('MODEL_FORBIDDEN', '无权访问该语义模型', 403);
  }

  const definition = parseDefinition(model.definition);
  const compiled = compileQuery(request, definition, userId);
  let capabilityRecordId: string | null = null;
  if (request.capabilityId) {
    const [capability] = await db
      .select({
        id: oneWorkCapability.id,
        ownerUserId: oneWorkCapability.ownerUserId,
        scope: oneWorkCapability.scope,
        status: oneWorkCapability.status,
      })
      .from(oneWorkCapability)
      .where(
        and(
          eq(oneWorkCapability.capabilityKey, request.capabilityId),
          inArray(oneWorkCapability.status, ['active', 'published'])
        )
      )
      .orderBy(
        desc(oneWorkCapability.updatedAt),
        desc(oneWorkCapability.version)
      )
      .limit(1);
    if (
      !capability ||
      !['active', 'published'].includes(capability.status) ||
      !modelCanBeRead(capability, userId)
    ) {
      fail('CAPABILITY_NOT_FOUND', '分析能力不存在或不可用', 404);
    }
    capabilityRecordId = capability.id;
  }
  const runId = `semantic_run_${randomUUID()}`;
  const hash = queryHash(compiled.normalizedRequest);
  const startedAt = Date.now();

  await db.insert(semanticQueryRun).values({
    id: runId,
    semanticModelId: model.id,
    capabilityId: capabilityRecordId,
    userId,
    request: compiled.auditRequest,
    compiledQuery: compiled.preview,
    queryHash: hash,
    status: mode === 'validate' ? 'validating' : 'running',
    metadata: {},
  });

  if (mode === 'validate') {
    const durationMs = Date.now() - startedAt;
    await db
      .update(semanticQueryRun)
      .set({
        status: 'validated',
        durationMs,
        completedAt: new Date(),
      })
      .where(eq(semanticQueryRun.id, runId));

    return {
      mode,
      runId,
      model: {
        id: model.id,
        key: model.modelKey,
        name: model.name,
        version: model.version,
      },
      request: compiled.normalizedRequest,
      columns: compiled.columns,
      rows: null,
      rowCount: 0,
      truncated: false,
      durationMs,
      queryHash: hash,
      resolvedTimeRange: compiled.timeRange
        ? {
            start: compiled.timeRange.from.toISOString(),
            end: compiled.timeRange.to.toISOString(),
            timezone: compiled.timeRange.timezone,
          }
        : null,
      metricDefinitions: request.metrics.map((id) => ({
        id,
        label: definition.metrics[id].label ?? id,
        definition: definition.metrics[id].description ?? '',
      })),
    };
  }

  try {
    const result = await db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select set_config('statement_timeout', ${`${queryTimeoutMs()}ms`}, true)`
      );
      return transaction.execute(compiled.statement);
    });
    const fetchedRows = Array.from(result as Iterable<Record<string, unknown>>);
    const requestedLimit = compiled.normalizedRequest.limit;
    const truncated = fetchedRows.length > requestedLimit;
    const rows = truncated ? fetchedRows.slice(0, requestedLimit) : fetchedRows;
    const durationMs = Date.now() - startedAt;
    await db
      .update(semanticQueryRun)
      .set({
        status: 'ok',
        rowCount: rows.length,
        durationMs,
        completedAt: new Date(),
      })
      .where(eq(semanticQueryRun.id, runId));

    return {
      mode,
      runId,
      model: {
        id: model.id,
        key: model.modelKey,
        name: model.name,
        version: model.version,
      },
      request: compiled.normalizedRequest,
      rows,
      columns: compiled.columns,
      rowCount: rows.length,
      truncated,
      durationMs,
      queryHash: hash,
      resolvedTimeRange: compiled.timeRange
        ? {
            start: compiled.timeRange.from.toISOString(),
            end: compiled.timeRange.to.toISOString(),
            timezone: compiled.timeRange.timezone,
          }
        : null,
      metricDefinitions: request.metrics.map((id) => ({
        id,
        label: definition.metrics[id].label ?? id,
        definition: definition.metrics[id].description ?? '',
      })),
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    await db
      .update(semanticQueryRun)
      .set({
        status: 'error',
        durationMs,
        error:
          error instanceof Error ? error.message.slice(0, 2000) : '查询失败',
        completedAt: new Date(),
      })
      .where(eq(semanticQueryRun.id, runId));
    throw error;
  }
}
