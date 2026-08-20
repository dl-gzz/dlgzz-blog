-- one-worker-os OAuth 单活会话。
--
-- 同一用户在同一 MCP resource 上只保留一个当前令牌族；
-- 会话替换不撤销用户的会员权益或 OAuth consent。

CREATE TABLE IF NOT EXISTS "onework_oauth_active_session" (
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"resource" text NOT NULL,
	"client_id" text NOT NULL REFERENCES "public"."onework_oauth_client"("client_id") ON DELETE cascade,
	"family_id" text NOT NULL,
	"activated_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onework_oauth_active_session_user_resource_unique_idx"
	ON "onework_oauth_active_session" ("user_id", "resource");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onework_oauth_active_session_family_unique_idx"
	ON "onework_oauth_active_session" ("family_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_oauth_active_session_client_idx"
	ON "onework_oauth_active_session" ("client_id");
--> statement-breakpoint

-- 回填时以“最近发行了仍可使用 token 的令牌族”为准。
-- refresh token 必须未消费、未撤销且未过期；access token
-- 必须未撤销且未过期。排序附带稳定 tie-breaker，保证重放确定。
WITH "eligible_token_event" AS (
	SELECT
		"user_id",
		"resource",
		"client_id",
		"family_id",
		"created_at" AS "issued_at"
	FROM "onework_oauth_refresh_token"
	WHERE "revoked_at" IS NULL
		AND "consumed_at" IS NULL
		AND "expires_at" > now()
	UNION ALL
	SELECT
		"user_id",
		"resource",
		"client_id",
		"family_id",
		"created_at" AS "issued_at"
	FROM "onework_oauth_access_token"
	WHERE "family_id" IS NOT NULL
		AND "revoked_at" IS NULL
		AND "expires_at" > now()
),
"latest_family_event" AS (
	SELECT DISTINCT ON ("user_id", "resource", "family_id")
		"user_id",
		"resource",
		"client_id",
		"family_id",
		"issued_at"
	FROM "eligible_token_event"
	ORDER BY
		"user_id",
		"resource",
		"family_id",
		"issued_at" DESC,
		"client_id" DESC
),
"latest_session" AS (
	SELECT DISTINCT ON ("user_id", "resource")
		"user_id",
		"resource",
		"client_id",
		"family_id",
		"issued_at"
	FROM "latest_family_event"
	ORDER BY
		"user_id",
		"resource",
		"issued_at" DESC,
		"family_id" DESC,
		"client_id" DESC
)
INSERT INTO "onework_oauth_active_session" (
	"user_id",
	"resource",
	"client_id",
	"family_id",
	"activated_at",
	"last_seen_at",
	"created_at",
	"updated_at"
)
SELECT
	"user_id",
	"resource",
	"client_id",
	"family_id",
	"issued_at",
	"issued_at",
	now(),
	now()
FROM "latest_session"
ORDER BY "user_id", "resource", "family_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 只撤销已有当前会话的同用户/资源下的其他 token。
-- IS DISTINCT FROM 会同时处理旧的 NULL family access token。
WITH "migration_clock" AS (SELECT now() AS "at")
UPDATE "onework_oauth_access_token" AS "token"
SET "revoked_at" = "migration_clock"."at"
FROM "onework_oauth_active_session" AS "active", "migration_clock"
WHERE "token"."user_id" = "active"."user_id"
	AND "token"."resource" = "active"."resource"
	AND "token"."family_id" IS DISTINCT FROM "active"."family_id"
	AND "token"."revoked_at" IS NULL;
--> statement-breakpoint
WITH "migration_clock" AS (SELECT now() AS "at")
UPDATE "onework_oauth_refresh_token" AS "token"
SET "revoked_at" = "migration_clock"."at"
FROM "onework_oauth_active_session" AS "active", "migration_clock"
WHERE "token"."user_id" = "active"."user_id"
	AND "token"."resource" = "active"."resource"
	AND "token"."family_id" <> "active"."family_id"
	AND "token"."revoked_at" IS NULL;
--> statement-breakpoint

-- 该表只由应用服务端管理，不通过 Supabase Data API 对外暴露。
ALTER TABLE "onework_oauth_active_session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "onework_oauth_active_session" FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE "onework_oauth_active_session" FROM anon;
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE "onework_oauth_active_session" FROM authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;
