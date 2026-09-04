-- 统一会员体系：星球成交通过一次性兑换码发放权益，
-- 网站和微信小程序都读取 membership_entitlement。

CREATE TABLE IF NOT EXISTS "membership_entitlement" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"product_id" text DEFAULT 'club' NOT NULL,
	"level" text DEFAULT 'member' NOT NULL,
	"source" text DEFAULT 'activation' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "membership_entitlement_user_product_unique_idx"
	ON "membership_entitlement" ("user_id", "product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membership_entitlement_user_status_idx"
	ON "membership_entitlement" ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membership_entitlement_external_id_idx"
	ON "membership_entitlement" ("external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membership_entitlement_expires_idx"
	ON "membership_entitlement" ("expires_at");
--> statement-breakpoint

-- 把已有的有效网站订阅迁入统一权益表；已有主动兑换的会员权益优先保留。
INSERT INTO "membership_entitlement" (
	"id",
	"user_id",
	"product_id",
	"level",
	"source",
	"status",
	"starts_at",
	"expires_at",
	"external_id",
	"created_at",
	"updated_at"
)
SELECT
	'membership_payment_' || "payment"."id",
	"payment"."user_id",
	'club',
	'member',
	'website',
	'active',
	COALESCE("payment"."period_start", "payment"."created_at"),
	"payment"."period_end",
	'payment:' || "payment"."id",
	now(),
	now()
FROM "payment"
WHERE "payment"."type" = 'subscription'
	AND "payment"."status" IN ('active', 'completed')
	AND "payment"."period_end" > now()
ON CONFLICT ("user_id", "product_id") DO UPDATE SET
	"status" = EXCLUDED."status",
	"starts_at" = EXCLUDED."starts_at",
	"expires_at" = EXCLUDED."expires_at",
	"source" = EXCLUDED."source",
	"external_id" = EXCLUDED."external_id",
	"updated_at" = now()
WHERE "membership_entitlement"."status" <> 'active'
	OR "membership_entitlement"."expires_at" <= now();
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "membership_activation_code" (
	"id" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"code_prefix" text NOT NULL,
	"product_id" text DEFAULT 'club' NOT NULL,
	"membership_level" text DEFAULT 'member' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'planet' NOT NULL,
	"duration_days" integer,
	"max_redemptions" integer DEFAULT 1 NOT NULL,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"redeemed_by_user_id" text REFERENCES "public"."user"("id") ON DELETE set null,
	"redeemed_at" timestamp,
	"code_expires_at" timestamp,
	"created_by_user_id" text REFERENCES "public"."user"("id") ON DELETE set null,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "membership_activation_code_hash_unique_idx"
	ON "membership_activation_code" ("code_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membership_activation_code_status_idx"
	ON "membership_activation_code" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membership_activation_code_external_source_idx"
	ON "membership_activation_code" ("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membership_activation_code_redeemed_user_idx"
	ON "membership_activation_code" ("redeemed_by_user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "miniapp_session" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"openid" text NOT NULL,
	"unionid" text,
	"user_id" text REFERENCES "public"."user"("id") ON DELETE cascade,
	"expires_at" timestamp NOT NULL,
	"last_seen_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "miniapp_session_token_hash_unique_idx"
	ON "miniapp_session" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "miniapp_session_openid_idx"
	ON "miniapp_session" ("openid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "miniapp_session_user_idx"
	ON "miniapp_session" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "miniapp_session_expires_idx"
	ON "miniapp_session" ("expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "miniapp_bind_code" (
	"id" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "miniapp_bind_code_hash_unique_idx"
	ON "miniapp_bind_code" ("code_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "miniapp_bind_code_user_idx"
	ON "miniapp_bind_code" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "miniapp_bind_code_expires_idx"
	ON "miniapp_bind_code" ("expires_at");
--> statement-breakpoint

-- These tables are managed by the trusted Next.js server and are not exposed
-- through the Supabase Data API. RLS remains enabled as defense in depth.
ALTER TABLE "membership_entitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership_activation_code" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "miniapp_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "miniapp_bind_code" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE
	"membership_entitlement",
	"membership_activation_code",
	"miniapp_session",
	"miniapp_bind_code"
FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE
		"membership_entitlement",
		"membership_activation_code",
		"miniapp_session",
		"miniapp_bind_code"
	FROM anon;
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE
		"membership_entitlement",
		"membership_activation_code",
		"miniapp_session",
		"miniapp_bind_code"
	FROM authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;
