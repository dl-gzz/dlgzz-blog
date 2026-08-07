-- 网页 AI 问答「试吃」额度：未登录访客按 IP 哈希计数，需要 visitor_id 列。
-- schema.ts 已定义 apiUsageEvent.visitorId + api_usage_event_visitor_created_idx，
-- 但 0011 生成时该字段尚不存在，这里补上。

ALTER TABLE "api_usage_event" ADD COLUMN IF NOT EXISTS "visitor_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_usage_event_visitor_created_idx" ON "api_usage_event" ("visitor_id", "created_at");
