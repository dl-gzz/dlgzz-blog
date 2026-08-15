-- OneWorkOS 会员交付层：兑换码 -> 账号权益 -> 设备 Key -> 一次性安装会话。
-- 全部对象均幂等创建，可在已手工建表的环境中安全补记迁移。

CREATE TABLE IF NOT EXISTS "onework_activation_code" (
	"id" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"code_prefix" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"pack_ids" jsonb NOT NULL,
	"trial_days" integer DEFAULT 30 NOT NULL,
	"monthly_quota" integer DEFAULT 1000 NOT NULL,
	"max_redemptions" integer DEFAULT 1 NOT NULL,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"redeemed_by_user_id" text REFERENCES "public"."user"("id") ON DELETE set null,
	"redeemed_at" timestamp,
	"expires_at" timestamp,
	"created_by_user_id" text REFERENCES "public"."user"("id") ON DELETE set null,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onework_activation_code_hash_unique_idx" ON "onework_activation_code" ("code_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_activation_code_status_idx" ON "onework_activation_code" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_activation_code_redeemed_user_idx" ON "onework_activation_code" ("redeemed_by_user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "onework_entitlement" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"knowledge_pack_id" text NOT NULL,
	"source" text DEFAULT 'activation' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"monthly_quota" integer DEFAULT 1000 NOT NULL,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"external_order_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onework_entitlement" ADD COLUMN IF NOT EXISTS "monthly_quota" integer DEFAULT 1000 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onework_entitlement_user_pack_unique_idx" ON "onework_entitlement" ("user_id", "knowledge_pack_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_entitlement_user_status_idx" ON "onework_entitlement" ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_entitlement_expires_idx" ON "onework_entitlement" ("expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "onework_device" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"api_key_id" text NOT NULL REFERENCES "public"."api_key"("id") ON DELETE cascade,
	"device_hash" text NOT NULL,
	"device_name" text DEFAULT '' NOT NULL,
	"platform" text DEFAULT 'unknown' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "onework_device_hash_unique_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_device_hash_idx" ON "onework_device" ("device_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_device_user_status_idx" ON "onework_device" ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_device_api_key_idx" ON "onework_device" ("api_key_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "onework_install_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"platform" text DEFAULT 'unknown' NOT NULL,
	"device_name" text DEFAULT '' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onework_install_token_hash_unique_idx" ON "onework_install_token" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_install_token_user_idx" ON "onework_install_token" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_install_token_expires_idx" ON "onework_install_token" ("expires_at");
--> statement-breakpoint

ALTER TABLE "api_usage_event" ADD COLUMN IF NOT EXISTS "visitor_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_usage_event_visitor_created_idx" ON "api_usage_event" ("visitor_id", "created_at");
--> statement-breakpoint

-- 历史环境可能存在 0 额度记录；统一恢复为标准额度后再加约束。
UPDATE "api_key" SET "monthly_quota" = 1000 WHERE "monthly_quota" < 1;
--> statement-breakpoint
UPDATE "onework_entitlement" SET "monthly_quota" = 1000 WHERE "monthly_quota" < 1;
--> statement-breakpoint
UPDATE "onework_activation_code"
SET
	"trial_days" = greatest("trial_days", 1),
	"monthly_quota" = greatest("monthly_quota", 1),
	"max_redemptions" = greatest("max_redemptions", "redeemed_count", 1),
	"redeemed_count" = greatest("redeemed_count", 0);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "api_key" ADD CONSTRAINT "api_key_monthly_quota_positive" CHECK ("monthly_quota" > 0);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "onework_entitlement" ADD CONSTRAINT "onework_entitlement_monthly_quota_positive" CHECK ("monthly_quota" > 0);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "onework_activation_code" ADD CONSTRAINT "onework_activation_code_limits_valid" CHECK (
		"trial_days" > 0 AND "monthly_quota" > 0 AND "max_redemptions" > 0
		AND "redeemed_count" >= 0 AND "redeemed_count" <= "max_redemptions"
	);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- 这些表仅允许服务端连接访问。即使数据库以 Supabase public schema 暴露，
-- anon/authenticated 角色也无法绕过 OneWorkOS API 直读 Key 哈希或权益。
ALTER TABLE "api_key" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_key_pack_grant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_usage_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onework_activation_code" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onework_entitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onework_device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onework_install_token" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE
		"api_key", "api_key_pack_grant", "api_usage_event",
		"onework_activation_code", "onework_entitlement", "onework_device", "onework_install_token"
	FROM anon;
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE
		"api_key", "api_key_pack_grant", "api_usage_event",
		"onework_activation_code", "onework_entitlement", "onework_device", "onework_install_token"
	FROM authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;
