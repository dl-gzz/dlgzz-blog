ALTER TABLE "worker_instance" ADD COLUMN IF NOT EXISTS "access_source" text DEFAULT 'direct_purchase' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_instance" ADD COLUMN IF NOT EXISTS "membership_price_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_skill_knowledge_pack" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_id" text NOT NULL REFERENCES "public"."worker_skill"("id") ON DELETE cascade ON UPDATE no action,
	"knowledge_pack_id" text NOT NULL REFERENCES "public"."knowledge_packs"("id") ON DELETE cascade ON UPDATE no action,
	"status" text DEFAULT 'enabled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_skill_knowledge_pack_unique_idx" ON "worker_skill_knowledge_pack" ("skill_id", "knowledge_pack_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_skill_knowledge_pack_skill_id_idx" ON "worker_skill_knowledge_pack" ("skill_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_skill_knowledge_pack_pack_id_idx" ON "worker_skill_knowledge_pack" ("knowledge_pack_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_user_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	"scope" text DEFAULT 'global' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"facts" jsonb NOT NULL,
	"source" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_user_profile_user_scope_unique_idx" ON "worker_user_profile" ("user_id", "scope");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_user_profile_user_id_idx" ON "worker_user_profile" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	"instance_id" text REFERENCES "public"."worker_instance"("id") ON DELETE cascade ON UPDATE no action,
	"skill_id" text REFERENCES "public"."worker_skill"("id") ON DELETE set null ON UPDATE no action,
	"visibility" text DEFAULT 'instance' NOT NULL,
	"memory_type" text DEFAULT 'fact' NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_memory_user_visibility_idx" ON "worker_memory" ("user_id", "visibility");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_memory_instance_id_idx" ON "worker_memory" ("instance_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_memory_skill_id_idx" ON "worker_memory" ("skill_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	"skill_id" text REFERENCES "public"."worker_skill"("id") ON DELETE set null ON UPDATE no action,
	"knowledge_pack_id" text REFERENCES "public"."knowledge_packs"("id") ON DELETE set null ON UPDATE no action,
	"topic" text NOT NULL,
	"channel" text DEFAULT 'weixin' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"frequency" text DEFAULT 'normal' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_push_subscription_user_topic_channel_unique_idx" ON "worker_push_subscription" ("user_id", "topic", "channel");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_push_subscription_user_id_idx" ON "worker_push_subscription" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_push_subscription_skill_id_idx" ON "worker_push_subscription" ("skill_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_content_item" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"url" text NOT NULL,
	"content_type" text DEFAULT 'article' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"tags" jsonb NOT NULL,
	"created_by" text REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_content_item_status_idx" ON "worker_content_item" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_content_item_content_type_idx" ON "worker_content_item" ("content_type");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_push_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"content_id" text NOT NULL REFERENCES "public"."worker_content_item"("id") ON DELETE cascade ON UPDATE no action,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	"instance_id" text REFERENCES "public"."worker_instance"("id") ON DELETE set null ON UPDATE no action,
	"channel" text DEFAULT 'weixin' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"error" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_push_delivery_content_id_idx" ON "worker_push_delivery" ("content_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_push_delivery_user_id_idx" ON "worker_push_delivery" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_push_delivery_status_idx" ON "worker_push_delivery" ("status");
