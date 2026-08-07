# 卖数据库：知识包即付费 Skill —— 完整架构

> 状态：核心链路已实现并端到端验证（2026-07-10）。
> 一句话商业模式：你每天创作 → 内容进知识包 → 会员买 Key → 他的 Hermes 带 Key 调你的知识库 → 按次计量。你卖的是**可检索的数据库**，不是 AI；客户的模型负责说话，你的库负责知道。

## 全链路（每一环的落点）

```
① 写作（Obsidian）
   └ blog:sync 发博客 / knowledge:distill 提炼 / knowledge:import 向量入库
② 知识包（Postgres + pgvector，按 packId 隔离）
   └ 已建成：xhs-operations-v1（724 篇小红书官方教程，3412 向量块）
③ 上架（组件商店：一篇文章 = 一个商品，free/premium/license 三态收费）
   └ 文章带 service_manifest（安装协议）+ agent_spec（给 AI 的说明书）
④ 交付：文章 → SKILL.md → 客户 Hermes 一条 curl 安装
   └ /api/services/hermes-skill（src/lib/hermes-skill-md.ts 生成标准 SKILL.md）
⑤ 收费闸门：API Key 层  ← 本文档新增的最后一块
   └ 买包 → 发 Key → 授权 pack → 带 Key 检索 → 按次计量
```

## API Key 层（⑤）

### 数据表（src/db/schema.ts）

| 表 | 作用 |
|---|---|
| `api_key` | 用户的 Key，库里只存 sha256（明文签发时返回一次）；带月度额度、吊销状态 |
| `api_key_pack_grant` | Key ↔ 知识包授权：买了哪个包，Key 就只能查哪个包 |
| `api_usage_event` | 用量计量：每次检索/安装记一条 —— 这就是"能不能算账"的地基 |

建表：`pnpm db:apply-api-keys`（幂等；drizzle-kit 因删表歧义走交互，故用直连脚本）。

### 核心库（src/lib/api-key.ts）

- `issueApiKey` 签发；`verifyApiKey` 校验（存在/未吊销/当月未超额，附带已用量）
- `keyHasPackAccess` / `grantPackToKey` 包级授权
- `recordUsage` 记一条用量（绝不抛错影响主流程）
- `listUserApiKeys` / `revokeApiKey` 用户自助管理

### 接口

| 路由 | 谁调 | 作用 |
|---|---|---|
| `POST /api/knowledge/query` | **客户的 Hermes**（带 Bearer Key） | 收银机：校验 Key → 校验买没买这个包 → 检索 → 计量。数据库永不离开服务器 |
| `GET/POST/DELETE /api/keys` | 网站已登录用户 | 自助签发/列出/吊销 Key |
| `GET /api/services/hermes-skill` | 客户安装时 | 下发 SKILL.md（复用商店三态收费校验） |

### 检索调用示例（客户端 Hermes Skill 里）

```bash
curl -s -X POST "https://www.dlgzz.com/api/knowledge/query" \
  -H "Authorization: Bearer dk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"query":"直播间怎么冷启动","packId":"xhs-operations-v1","limit":6}'
```

拒绝码：`MISSING`/`INVALID`(401)、`REVOKED`(403)、`QUOTA_EXCEEDED`(429)、`PACK_NOT_LICENSED`(403)。

### 端到端验证

`pnpm test:api-key` —— 真实库 + 真实向量走完整链：签发 → 未授权拒绝 → 授权 → 带 Key 检索(3 次全部命中正确文档) → 计量准确(3/5) → 超额判断 → 清理。已通过。

## 还差的一个连接点（内容任务，非工程）

**购买 → 自动发 Key + 授权 pack** 尚未接线，因为它依赖"哪个知识包作为商品上架、对应哪个 priceId"——这是上架决策，不是代码：

1. 为知识包写一篇商店文章（service_manifest.pricing.mode = license，配真实价格）
2. 在 XorPay webhook（src/app/api/webhooks/xorpay/route.ts，`status: 'completed'` 处）加一段：若该 priceId 对应某知识包 → `issueApiKey` + `grantPackToKey`
3. 需要一张 priceId ↔ packId 的映射（配置或小表）

在此之前，可用 `grantPackToKey` 手动给早期用户授权（内测冷启动 10 人的做法）。

## 固有边界（选 A 模式时已接受）

- SKILL.md 下发后拦不住转发 → 所以**值钱的东西（知识库、检索）留在服务端被 Key 门控**，SKILL.md 只是说明书。
- 检索质量 = 产品质量；库的策展和更新是唯一护城河。
- 有人可系统性爬库 → 靠额度 + 计量 + 盯异常缓解，杜绝不了。
