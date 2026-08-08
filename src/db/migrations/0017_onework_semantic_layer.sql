-- OneWorkOS V1 数据底座。
--
-- 能力注册表负责描述可调度能力，Skill 映射限定可用范围；
-- 语义模型只接受结构化 definition，由运行时编译为参数化查询。

CREATE TABLE IF NOT EXISTS "onework_capability" (
	"id" text PRIMARY KEY NOT NULL,
	"capability_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"owner_user_id" text,
	"scope" text DEFAULT 'global' NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"intents" jsonb NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"runtime" jsonb NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"requires_confirmation" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_skill_capability" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_id" text NOT NULL,
	"capability_id" text NOT NULL,
	"status" text DEFAULT 'enabled' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"configuration" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "semantic_model" (
	"id" text PRIMARY KEY NOT NULL,
	"model_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"owner_user_id" text,
	"scope" text DEFAULT 'private' NOT NULL,
	"provider" text DEFAULT 'postgres' NOT NULL,
	"definition" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "semantic_query_run" (
	"id" text PRIMARY KEY NOT NULL,
	"semantic_model_id" text,
	"capability_id" text,
	"skill_id" text,
	"instance_id" text,
	"user_id" text,
	"request" jsonb NOT NULL,
	"compiled_query" jsonb,
	"query_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error" text,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "onework_capability" ADD CONSTRAINT "onework_capability_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "worker_skill_capability" ADD CONSTRAINT "worker_skill_capability_skill_id_worker_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."worker_skill"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "worker_skill_capability" ADD CONSTRAINT "worker_skill_capability_capability_id_onework_capability_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."onework_capability"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "semantic_model" ADD CONSTRAINT "semantic_model_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "semantic_query_run" ADD CONSTRAINT "semantic_query_run_semantic_model_id_semantic_model_id_fk" FOREIGN KEY ("semantic_model_id") REFERENCES "public"."semantic_model"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "semantic_query_run" ADD CONSTRAINT "semantic_query_run_capability_id_onework_capability_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."onework_capability"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "semantic_query_run" ADD CONSTRAINT "semantic_query_run_skill_id_worker_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."worker_skill"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "semantic_query_run" ADD CONSTRAINT "semantic_query_run_instance_id_worker_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."worker_instance"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "semantic_query_run" ADD CONSTRAINT "semantic_query_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onework_capability_key_version_unique_idx" ON "onework_capability" ("capability_key", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_capability_kind_status_idx" ON "onework_capability" ("kind", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_capability_provider_status_idx" ON "onework_capability" ("provider", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_capability_owner_scope_idx" ON "onework_capability" ("owner_user_id", "scope");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_skill_capability_unique_idx" ON "worker_skill_capability" ("skill_id", "capability_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_skill_capability_skill_status_idx" ON "worker_skill_capability" ("skill_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_skill_capability_capability_status_idx" ON "worker_skill_capability" ("capability_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "semantic_model_key_version_unique_idx" ON "semantic_model" ("model_key", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "semantic_model_owner_scope_status_idx" ON "semantic_model" ("owner_user_id", "scope", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "semantic_model_provider_status_idx" ON "semantic_model" ("provider", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "semantic_query_run_model_created_idx" ON "semantic_query_run" ("semantic_model_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "semantic_query_run_user_created_idx" ON "semantic_query_run" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "semantic_query_run_status_created_idx" ON "semantic_query_run" ("status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "semantic_query_run_query_hash_idx" ON "semantic_query_run" ("query_hash");
