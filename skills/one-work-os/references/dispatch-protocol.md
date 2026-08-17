# OneWorkerOS Dispatch Protocol

Read this reference before routing composite, mutating, external, or ambiguous work.

## Contents

- [Roles](#roles)
- [Dispatch frame](#dispatch-frame)
- [Resolver call](#resolver-call)
- [Route classes](#route-classes)
- [Plan and execute](#plan-and-execute)
- [Capability record](#capability-record)
- [Failure handling](#failure-handling)

## Roles

- Treat OneWorkerOS as the control plane: resolve intent, select capabilities, order work, enforce policy, and verify completion.
- Treat `knowledge.search` as governed unstructured memory. WorkBuddy is one searchable pack with ID `onework-workbuddy-v1`.
- Treat `analytics.query` as a governed semantic query engine over structured data.
- Treat `workbuddy.execute` and `presentation.create` as action capabilities that still require an available host tool.
- Treat host Skills, connectors, and tools as the action plane. A registry entry describes a capability; it does not install or grant that capability.
- Keep the host model responsible for interpreting user intent and combining compact results.

## Dispatch frame

Send only the context required to choose a route:

```json
{
  "goal": "分析过去 30 天表现最好的内容并生成 PPT",
  "intentHint": "analyze_then_create",
  "context": {
    "currentState": "已连接内容数据",
    "constraints": ["使用统一阅读量口径"],
    "successCriteria": ["返回排名与可打开的 PPT"]
  },
  "availableCapabilities": [
    "knowledge.search",
    "analytics.query",
    "presentation.create",
    "workbuddy.execute"
  ],
  "executionRequested": true
}
```

Do not include credentials, raw screenshots, full chat history, or customer records that are not needed for routing.

## Resolver call

Call:

```http
POST /api/capabilities/resolve
Authorization: Bearer <key>
Content-Type: application/json
```

Expect:

```json
{
  "success": true,
  "resolution": {
    "intent": "analyze_then_create",
    "route": "composite",
    "risk": "external_write",
    "capabilities": [
      {
        "id": "analytics.query",
        "operation": "query",
        "reason": "需要受管理的内容表现指标"
      },
      {
        "id": "presentation.create",
        "operation": "create",
        "reason": "用户要求产出 PPT"
      }
    ],
    "successCriteria": ["指标口径已返回", "PPT 可打开"],
    "requiresConfirmation": false,
    "missingCapabilities": []
  }
}
```

Treat the resolver response as a routing recommendation subject to host policy and actual tool availability.

## Route classes

| Route | Use for | Required behavior |
| --- | --- | --- |
| `knowledge` | Facts, methods, tutorials, product guidance | Query a licensed pack; cite used evidence |
| `analytics` | Metrics, rankings, trends, segments, comparisons | Use a registered semantic model; never emit raw SQL |
| `action` | Create, update, send, publish, install, or navigate | Check the actual host tool, authorization, and success signal |
| `composite` | More than one dependency or evidence followed by action | Plan a dependency order and pass compact outputs |
| `human_required` | Login, OAuth, CAPTCHA, payment, secrets, unresolved account choice | Stop at the exact human step |

## Plan and execute

1. Remove capabilities that are absent from the host or not licensed.
2. Order read-only evidence before analysis and analysis before writes.
3. Use the smallest result needed by the next capability. Pass IDs, selected fields, citations, and decisions instead of full documents.
4. Reconfirm immediately before a consequential operation when confirmation is required.
5. Execute one consequential boundary at a time. Do not silently substitute a different provider or account.
6. Verify every terminal output against the success criteria.
7. Return partial results when a later capability is missing; name the missing capability and the next safe step.

## Capability record

Use a registry record shaped like:

```json
{
  "id": "analytics.query",
  "kind": "analytics",
  "provider": "onework",
  "operations": ["query", "validate"],
  "inputContract": "onework.semantic-query.v1",
  "risk": "read_only",
  "requires": ["ONEWORK_API_KEY"],
  "fallback": "guided_setup",
  "enabled": true
}
```

Keep registry state on the OneWorkerOS service. Keep provider credentials and runtime tool grants in the user's host environment.

## Failure handling

- On `401`, request valid OneWorkerOS credentials without asking the user to paste the secret into chat.
- On `403`, report the missing license or permission.
- On `404` or `CAPABILITY_NOT_FOUND`, fall back only to an actually installed equivalent and disclose the substitution.
- On `409`, refresh the capability record and resolve once more.
- On `429`, stop automatic retries and report quota state.
- On `5xx`, retry a read-only request once; never automatically repeat a write.
- When the resolver is unavailable, use local route classification and label it as an unregistered fallback.
