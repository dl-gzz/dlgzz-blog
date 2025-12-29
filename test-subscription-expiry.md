# 订阅到期自动化检查测试文档

## 实现的自动化机制

### 📊 数据库字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | `subscription`（订阅类型） |
| `interval` | string | `month`（月付）或 `year`（年付） |
| `status` | string | `active`（订阅激活） |
| `periodStart` | timestamp | 订阅开始时间 |
| `periodEnd` | timestamp | 订阅结束时间 |

### ✅ 自动化逻辑实现

#### 1️⃣ 创建订单时自动计算到期时间

**位置**: `src/payment/provider/xorpay.ts:238-249`

```typescript
// 自动计算到期时间
const periodStart = new Date();
const periodEnd = new Date(periodStart);

if (price.interval === 'month') {
  periodEnd.setMonth(periodEnd.getMonth() + 1);  // 月付：+1个月
} else if (price.interval === 'year') {
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);  // 年付：+1年
}
```

**示例**:
- **月付**: 2025-01-01 购买 → periodEnd = 2025-02-01
- **年付**: 2025-01-01 购买 → periodEnd = 2026-01-01

#### 2️⃣ 支付成功后设置状态为 active

**位置**: `src/payment/provider/xorpay.ts:378-386`

```typescript
// 所有订阅支付成功后状态都设为 'active'
await db.update(payment).set({
  status: 'active',
  updatedAt: new Date(),
})
```

#### 3️⃣ 访问付费内容时自动检查是否过期

**位置**: `src/lib/premium-access.ts:15-67`

```typescript
// 只检查订阅类型且状态为 active
if (p.type !== 'subscription' || p.status !== 'active') {
  return false;
}

// 核心检查：订阅是否已过期
const isNotExpired = p.periodEnd > now;
return isNotExpired;
```

## 🧪 测试场景

### 场景 1：月付订阅（正常使用期）
\`\`\`
支付时间: 2025-01-01 10:00
到期时间: 2025-02-01 10:00
当前时间: 2025-01-15 10:00

type: 'subscription'
interval: 'month'
status: 'active'
periodEnd: 2025-02-01 10:00

结果: ✅ hasAccess = true（未过期）
\`\`\`

### 场景 2：月付订阅（已过期）
\`\`\`
支付时间: 2025-01-01 10:00
到期时间: 2025-02-01 10:00
当前时间: 2025-02-15 10:00

type: 'subscription'
interval: 'month'
status: 'active'
periodEnd: 2025-02-01 10:00

结果: ❌ hasAccess = false（已过期）
日志: "Subscription expired for user xxx, periodEnd: 2025-02-01, now: 2025-02-15"
\`\`\`

### 场景 3：年付订阅（正常使用期）
\`\`\`
支付时间: 2024-06-01 10:00
到期时间: 2025-06-01 10:00
当前时间: 2025-01-01 10:00

type: 'subscription'
interval: 'year'
status: 'active'
periodEnd: 2025-06-01 10:00

结果: ✅ hasAccess = true（未过期）
\`\`\`

### 场景 4：年付订阅（已过期）
\`\`\`
支付时间: 2024-01-01 10:00
到期时间: 2025-01-01 10:00
当前时间: 2025-02-01 10:00

type: 'subscription'
interval: 'year'
status: 'active'
periodEnd: 2025-01-01 10:00

结果: ❌ hasAccess = false（已过期）
日志: "Subscription expired for user xxx, periodEnd: 2025-01-01, now: 2025-02-01"
\`\`\`

## 🔍 数据库查询示例

### 查看所有订阅记录
\`\`\`sql
SELECT
  id,
  user_id,
  type,
  interval,
  status,
  period_start,
  period_end,
  created_at
FROM payment
WHERE user_id = 'your-user-id'
ORDER BY created_at DESC;
\`\`\`

### 查看有效的订阅
\`\`\`sql
SELECT
  id,
  user_id,
  interval,
  status,
  period_end,
  CASE
    WHEN period_end > NOW() THEN '有效订阅'
    ELSE '已过期'
  END as subscription_status
FROM payment
WHERE user_id = 'your-user-id'
  AND type = 'subscription'
  AND status = 'active';
\`\`\`

### 查找过期的订阅
\`\`\`sql
SELECT
  id,
  user_id,
  interval,
  period_end,
  NOW() as current_time,
  (period_end - NOW()) as time_until_expiry
FROM payment
WHERE type = 'subscription'
  AND status = 'active'
  AND period_end < NOW();
\`\`\`

## 📝 关键要点

### ✅ 优势
1. **完全自动化**：无需手动更新状态或运行定时任务
2. **实时检查**：每次访问付费内容时都会检查最新的到期状态
3. **数据库驱动**：所有逻辑基于数据库字段，可靠稳定
4. **支持月付和年付**：两种订阅周期都能正确处理
5. **有日志记录**：过期时会输出日志，方便调试和监控

### ⚠️ 注意事项
1. **服务器时间**：确保服务器时间准确，否则会影响过期判断
2. **数据库时区**：确保数据库和应用服务器时区一致
3. **宽限期**：当前没有宽限期，到期即刻失去访问权限
4. **续费逻辑**：用户续费时会创建新的 payment 记录

### 🔧 如果需要宽限期
可以在检查时增加宽限时间：

\`\`\`typescript
const GRACE_PERIOD_DAYS = 3;  // 3天宽限期
const gracePeriodEnd = new Date(p.periodEnd);
gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

const isNotExpired = gracePeriodEnd > now;
\`\`\`

## 🚀 下一步建议

### 1. 订阅到期提醒
在订阅快到期时发送邮件提醒：
- 到期前 7 天：第一次提醒
- 到期前 3 天：第二次提醒
- 到期前 1 天：最后提醒

### 2. 用户续费流程
XorPay 不支持自动续费，需要用户手动续费：
- 提供"续费"按钮
- 续费时创建新的 payment 记录
- 新的 periodStart 从上次 periodEnd 开始计算（如果在宽限期内）

### 3. 过期订阅状态更新（可选）
虽然过期订阅会自动失效，但可以定期将过期的 \`active\` 订阅状态更新为 \`expired\`：

\`\`\`typescript
// 定时任务：每天凌晨执行
UPDATE payment
SET status = 'expired'
WHERE type = 'subscription'
  AND status = 'active'
  AND period_end < NOW();
\`\`\`

这样可以：
- 更清晰地区分"活跃"和"过期"订阅
- 方便统计分析
- 但不是必需的，因为检查逻辑已经会自动排除过期订阅

## 📊 支持的订阅类型

| 类型 | interval | 有效期 | 到期检查 |
|------|----------|--------|----------|
| **月付** | \`month\` | 1个月 | 自动检查 periodEnd |
| **年付** | \`year\` | 1年 | 自动检查 periodEnd |
