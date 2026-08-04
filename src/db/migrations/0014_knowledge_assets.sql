-- 模型无关的知识资产基础表。
--
-- 媒体本体可存储在对象存储（当前为腾讯云 COS），数据库只保存稳定地址、
-- 结构化识别结果及来源信息。识别提供方/模型仅作为溯源字段，因此以后
-- 更换 Gemini、Qwen、Claude 或宿主多模态模型都不需要重建知识库。

CREATE TABLE IF NOT EXISTS "knowledge_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"asset_type" text DEFAULT 'image' NOT NULL,
	"mime_type" text NOT NULL,
	"storage_provider" text DEFAULT 'cos' NOT NULL,
	"storage_bucket" text,
	"object_key" text,
	"public_url" text,
	"width" integer,
	"height" integer,
	"caption" text,
	"ocr_text" text,
	"visual_facts" jsonb NOT NULL,
	"analysis_provider" text,
	"analysis_model" text,
	"analysis_version" text,
	"analyzed_at" timestamp,
	"source_type" text,
	"source_locator" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_asset_links" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"document_id" text NOT NULL,
	"chunk_id" text,
	"role" text DEFAULT 'inline' NOT NULL,
	"source_ref" text NOT NULL,
	"occurrence_index" integer DEFAULT 0 NOT NULL,
	"alt_text" text,
	"context" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "knowledge_asset_links" ADD CONSTRAINT "knowledge_asset_links_asset_id_knowledge_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."knowledge_assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "knowledge_asset_links" ADD CONSTRAINT "knowledge_asset_links_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "knowledge_asset_links" ADD CONSTRAINT "knowledge_asset_links_chunk_id_knowledge_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."knowledge_chunks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_assets_content_hash_unique_idx" ON "knowledge_assets" ("content_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_assets_object_key_idx" ON "knowledge_assets" ("storage_provider", "storage_bucket", "object_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_assets_status_visibility_idx" ON "knowledge_assets" ("status", "visibility");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_asset_links_occurrence_unique_idx" ON "knowledge_asset_links" ("document_id", "source_ref", "occurrence_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_asset_links_chunk_id_idx" ON "knowledge_asset_links" ("chunk_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_asset_links_document_role_idx" ON "knowledge_asset_links" ("document_id", "role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_asset_links_asset_id_idx" ON "knowledge_asset_links" ("asset_id");
