CREATE TABLE IF NOT EXISTS "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	"name" text DEFAULT '' NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"monthly_quota" integer DEFAULT 1000 NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_key_key_hash_unique_idx" ON "api_key" ("key_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_user_id_idx" ON "api_key" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_key_pack_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"api_key_id" text NOT NULL REFERENCES "public"."api_key"("id") ON DELETE cascade ON UPDATE no action,
	"knowledge_pack_id" text NOT NULL,
	"source" text DEFAULT 'purchase' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_key_pack_grant_unique_idx" ON "api_key_pack_grant" ("api_key_id", "knowledge_pack_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_pack_grant_pack_idx" ON "api_key_pack_grant" ("knowledge_pack_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_usage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"api_key_id" text REFERENCES "public"."api_key"("id") ON DELETE set null ON UPDATE no action,
	"user_id" text REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action,
	"kind" text NOT NULL,
	"knowledge_pack_id" text,
	"service_id" text,
	"query" text DEFAULT '' NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"embedding_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_usage_event_key_created_idx" ON "api_usage_event" ("api_key_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_usage_event_user_created_idx" ON "api_usage_event" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_usage_event_pack_idx" ON "api_usage_event" ("knowledge_pack_id");
