-- OneWorkOS 支付权益发放账本。
--
-- onework_entitlement 是每个账号/知识包的聚合状态，external_order_id
-- 会被新续费更新，无法长期承担回调幂等。独立账本保证每个订单
-- 对每个知识包只发放一次。

-- 恢复旧环境通过 db:push 时可能漏建的小程序账号映射表。
CREATE TABLE IF NOT EXISTS "miniapp_account" (
	"id" text PRIMARY KEY NOT NULL,
	"openid" text NOT NULL,
	"unionid" text,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "miniapp_account_openid_unique"
	ON "miniapp_account" ("openid");
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "miniapp_account" ADD CONSTRAINT "miniapp_account_user_id_user_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- 恢复仍在运行时使用、但旧环境中可能未建立的下载统计表。
CREATE TABLE IF NOT EXISTS "file_download" (
	"id" text PRIMARY KEY NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer,
	"user_id" text,
	"user_email" text,
	"ip_address" text,
	"user_agent" text,
	"referer" text,
	"require_auth" boolean DEFAULT false NOT NULL,
	"require_premium" boolean DEFAULT false NOT NULL,
	"downloaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "file_download" ADD CONSTRAINT "file_download_user_id_user_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- 产品使用一客一码。历史未使用的共享码收紧为一次；
-- 已有兑换记录的码立即结束，避免同一账号重复续期。
UPDATE "onework_activation_code"
SET
	"max_redemptions" = CASE WHEN "redeemed_count" = 0 THEN 1 ELSE greatest("max_redemptions", "redeemed_count") END,
	"status" = CASE WHEN "redeemed_count" > 0 AND "status" = 'active' THEN 'redeemed' ELSE "status" END,
	"updated_at" = now()
WHERE "max_redemptions" <> 1
	OR ("redeemed_count" > 0 AND "status" = 'active');
--> statement-breakpoint

-- 能力路由不重复扣减用户的月度知识检索额度，但仍需要服务端限流。
-- 每个账号/能力只保留一个固定窗口计数器，不会按请求无限增长。
CREATE TABLE IF NOT EXISTS "api_rate_limit_bucket" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"kind" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_rate_limit_bucket_user_kind_unique_idx"
	ON "api_rate_limit_bucket" ("user_id", "kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_rate_limit_bucket_updated_idx"
	ON "api_rate_limit_bucket" ("updated_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "onework_entitlement_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"knowledge_pack_id" text NOT NULL,
	"external_order_id" text NOT NULL,
	"source" text DEFAULT 'payment' NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onework_entitlement_grant_order_pack_unique_idx"
	ON "onework_entitlement_grant" ("user_id", "external_order_id", "knowledge_pack_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_entitlement_grant_user_created_idx"
	ON "onework_entitlement_grant" ("user_id", "granted_at");
--> statement-breakpoint

-- 把旧聚合行中仍可见的订单先写入账本，防止部署后的回调重试
-- 把已经发放的旧订单再续一期。
INSERT INTO "onework_entitlement_grant" (
	"id", "user_id", "knowledge_pack_id", "external_order_id", "source", "granted_at"
)
SELECT
	'legacy_grant_' || md5("user_id" || ':' || "knowledge_pack_id" || ':' || "external_order_id"),
	"user_id",
	"knowledge_pack_id",
	"external_order_id",
	"source",
	"updated_at"
FROM "onework_entitlement"
WHERE "external_order_id" IS NOT NULL
	AND length(trim("external_order_id")) > 0
ON CONFLICT ("user_id", "external_order_id", "knowledge_pack_id") DO NOTHING;
--> statement-breakpoint

ALTER TABLE "onework_entitlement_grant" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE "onework_entitlement_grant" FROM anon;
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE "onework_entitlement_grant" FROM authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint

-- 能力 runtime、语义模型数据源和查询审计只允许 OneWorkOS 服务端访问。
-- Supabase 的 anon/authenticated 默认表权限不能绕过 API 鉴权。
ALTER TABLE "onework_capability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "worker_skill_capability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "semantic_model" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "semantic_query_run" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE
		"onework_capability", "worker_skill_capability", "semantic_model", "semantic_query_run"
	FROM anon;
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE
		"onework_capability", "worker_skill_capability", "semantic_model", "semantic_query_run"
	FROM authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint

-- 付费知识原文、向量、媒体索引和知识包映射同样只能经受治理 API 访问。
ALTER TABLE "knowledge_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_chunks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_packs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_pack_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "worker_employee_knowledge_pack" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "worker_skill_knowledge_pack" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_asset_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_ingest_run" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE
		"knowledge_documents", "knowledge_chunks", "knowledge_units", "knowledge_packs",
		"knowledge_pack_documents", "worker_employee_knowledge_pack", "worker_skill_knowledge_pack",
		"knowledge_assets", "knowledge_asset_links", "knowledge_ingest_run"
	FROM anon;
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint

-- 本项目没有浏览器直连 Supabase 的数据通路；认证、支付、业务和知识库
-- 都经过服务端 API。因此对 public schema 实施统一 deny-by-default，
-- 防止 anon/authenticated 使用公开项目 Key 绕过鉴权、权益和配额。
DO $$
DECLARE
	table_row record;
	sequence_row record;
	function_row record;
	role_name text;
BEGIN
	-- PUBLIC 是 PostgreSQL 的隐式角色；只撤销 anon/authenticated 不能
	-- 覆盖函数默认授予 PUBLIC 的 EXECUTE。
	REVOKE ALL ON SCHEMA public FROM PUBLIC;
	ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
	ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
	ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;

	FOR table_row IN
		SELECT schemaname, tablename
		FROM pg_catalog.pg_tables
		WHERE schemaname = 'public'
	LOOP
		EXECUTE format(
			'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
			table_row.schemaname,
			table_row.tablename
		);
		EXECUTE format(
			'REVOKE ALL ON TABLE %I.%I FROM PUBLIC',
			table_row.schemaname,
			table_row.tablename
		);
	END LOOP;

	FOR sequence_row IN
		SELECT schemaname, sequencename
		FROM pg_catalog.pg_sequences
		WHERE schemaname = 'public'
	LOOP
		EXECUTE format(
			'REVOKE ALL ON SEQUENCE %I.%I FROM PUBLIC',
			sequence_row.schemaname,
			sequence_row.sequencename
		);
	END LOOP;

	FOR function_row IN
		SELECT
			n.nspname AS schema_name,
			p.proname AS function_name,
			pg_get_function_identity_arguments(p.oid) AS identity_arguments
		FROM pg_catalog.pg_proc AS p
		JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
		WHERE n.nspname = 'public'
			AND p.proowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
	LOOP
		EXECUTE format(
			'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC',
			function_row.schema_name,
			function_row.function_name,
			function_row.identity_arguments
		);
	END LOOP;

	FOR role_name IN
		SELECT rolname FROM pg_catalog.pg_roles
		WHERE rolname IN ('anon', 'authenticated')
	LOOP
		EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', role_name);
		EXECUTE format(
			'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
			role_name
		);
		EXECUTE format(
			'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
			role_name
		);
		EXECUTE format(
			'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I',
			role_name
		);

		FOR table_row IN
			SELECT schemaname, tablename
			FROM pg_catalog.pg_tables
			WHERE schemaname = 'public'
		LOOP
			EXECUTE format(
				'REVOKE ALL ON TABLE %I.%I FROM %I',
				table_row.schemaname,
				table_row.tablename,
				role_name
			);
		END LOOP;

		FOR sequence_row IN
			SELECT schemaname, sequencename
			FROM pg_catalog.pg_sequences
			WHERE schemaname = 'public'
		LOOP
			EXECUTE format(
				'REVOKE ALL ON SEQUENCE %I.%I FROM %I',
				sequence_row.schemaname,
				sequence_row.sequencename,
				role_name
			);
		END LOOP;

		FOR function_row IN
			SELECT
				n.nspname AS schema_name,
				p.proname AS function_name,
				pg_get_function_identity_arguments(p.oid) AS identity_arguments
			FROM pg_catalog.pg_proc AS p
			JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
			WHERE n.nspname = 'public'
				AND p.proowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
		LOOP
			EXECUTE format(
				'REVOKE ALL ON FUNCTION %I.%I(%s) FROM %I',
				function_row.schema_name,
				function_row.function_name,
				function_row.identity_arguments,
				role_name
			);
		END LOOP;
	END LOOP;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE
		"knowledge_documents", "knowledge_chunks", "knowledge_units", "knowledge_packs",
		"knowledge_pack_documents", "worker_employee_knowledge_pack", "worker_skill_knowledge_pack",
		"knowledge_assets", "knowledge_asset_links", "knowledge_ingest_run"
	FROM authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;
