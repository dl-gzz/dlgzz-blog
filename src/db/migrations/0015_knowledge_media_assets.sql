-- 将知识图片扩展为统一的内容资产：图片、视频和官方链接都可以挂到
-- document/chunk。检索仍以文字 chunk 为入口，命中后再返回这些轻量元数据。

ALTER TABLE "knowledge_assets" ADD COLUMN IF NOT EXISTS "title" text;
--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD COLUMN IF NOT EXISTS "platform" text;
--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD COLUMN IF NOT EXISTS "thumbnail_url" text;
--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD COLUMN IF NOT EXISTS "embed_url" text;
--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD COLUMN IF NOT EXISTS "duration_seconds" integer;
--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD COLUMN IF NOT EXISTS "published_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_assets_type_status_idx" ON "knowledge_assets" ("asset_type", "status", "visibility");
