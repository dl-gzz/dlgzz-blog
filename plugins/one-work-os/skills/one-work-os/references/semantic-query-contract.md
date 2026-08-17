# Semantic Query Contract

Read this reference before querying structured data or interpreting analytics results.

## Contents

- [Purpose](#purpose)
- [Request](#request)
- [Allowed fields](#allowed-fields)
- [Success response](#success-response)
- [Interpretation rules](#interpretation-rules)
- [Errors](#errors)

## Purpose

Use `onework.semantic-query.v1` to request governed metrics without allowing the model to compose or execute raw SQL. Let the service validate registered models, metrics, dimensions, joins, filters, tenant scope, and row limits before Drizzle issues parameterized database queries.

## Request

Call:

```http
POST /api/analytics/query
Authorization: Bearer <key>
Content-Type: application/json
```

Send:

```json
{
  "semanticQuery": {
    "contract": "onework.semantic-query.v1",
    "model": "content_performance",
    "metrics": ["article_views", "conversion_rate"],
    "dimensions": ["content_category"],
    "filters": [
      {
        "field": "channel",
        "operator": "in",
        "value": ["official_account"]
      }
    ],
    "timeRange": {
      "preset": "last_30_days",
      "timezone": "Asia/Shanghai"
    },
    "orderBy": [
      {
        "field": "article_views",
        "direction": "desc"
      }
    ],
    "limit": 10
  },
  "mode": "execute"
}
```

Use `mode: "validate"` to validate names, permissions, and estimated scope without returning data.

## Allowed fields

- `contract`: use `onework.semantic-query.v1`.
- `model`: require one registered semantic model ID.
- `metrics`: require one or more registered metric IDs.
- `dimensions`: use zero or more registered dimension IDs.
- `filters`: use registered fields with allow-listed operators.
- `timeRange`: use a named preset or explicit ISO dates plus an IANA timezone.
- `orderBy`: sort only by requested metrics or dimensions.
- `limit`: use `1` through `500`; default to the smallest useful result.

Allow these filter operators: `eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `between`, `contains`, `is_null`, and `not_null`. Validate value shape for the chosen operator. Resolve relative presets on the server and return the resolved boundaries.

Reject `sql`, `rawSql`, `statement`, table names, column names, join clauses, expressions, and model-generated formulas. Add a metric or dimension to the governed semantic registry instead of bypassing it.

## Success response

Expect:

```json
{
  "success": true,
  "requestId": "sqr_123",
  "result": {
    "columns": [
      {
        "id": "content_category",
        "label": "内容类别",
        "type": "string",
        "role": "dimension"
      },
      {
        "id": "article_views",
        "label": "阅读量",
        "type": "number",
        "role": "metric"
      }
    ],
    "rows": [
      {
        "content_category": "AI 工作流",
        "article_views": 18200
      }
    ],
    "rowCount": 1,
    "truncated": false
  },
  "evidence": {
    "model": "content_performance",
    "modelVersion": 3,
    "metricDefinitions": [
      {
        "id": "article_views",
        "label": "阅读量",
        "definition": "已发布内容在选定时间窗口的有效阅读次数"
      }
    ],
    "resolvedTimeRange": {
      "start": "2026-07-05T00:00:00+08:00",
      "end": "2026-08-04T00:00:00+08:00",
      "timezone": "Asia/Shanghai"
    },
    "dataFreshness": "2026-08-03T12:00:00+08:00",
    "executedAt": "2026-08-03T12:05:00+08:00"
  }
}
```

Do not require generated SQL in the client response. Use an opaque query fingerprint for server-side auditing if needed.

## Interpretation rules

1. State the metric definition and resolved time range when either could change the conclusion.
2. Distinguish returned facts from model inference. Label causal explanations as hypotheses unless the query tests them.
3. Preserve units, currencies, timezone, and denominator definitions.
4. Mention truncation, stale data, suppressed values, or partial permissions.
5. Do not compare incompatible metric versions or tenant scopes.
6. Pass only the relevant rows and evidence to the next capability.

## Errors

- `MODEL_NOT_FOUND`: choose a registered model or request setup.
- `FIELD_NOT_FOUND`: correct the semantic ID; do not guess a database column.
- `INVALID_FILTER`: correct the operator or value shape.
- `PERMISSION_DENIED`: stop and report the restricted model or field.
- `QUERY_TOO_LARGE`: reduce dimensions, time range, or limit.
- `STALE_MODEL`: refresh metadata and validate once more.
- `429`: stop retries and report quota state.
- `5xx`: retry one read-only request once, then report failure.
