-- OneWorkOS OAuth 2.1 / MCP 授权存储。
--
-- 所有 code/token 只保存 SHA-256；客户端是 public client，
-- 只允许 Authorization Code + PKCE S256 与 Device Authorization Grant。

CREATE TABLE "onework_oauth_client" (
	"client_id" text PRIMARY KEY NOT NULL,
	"client_name" text DEFAULT '' NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"grant_types" jsonb NOT NULL,
	"response_types" jsonb NOT NULL,
	"scopes" jsonb NOT NULL,
	"token_endpoint_auth_method" text DEFAULT 'none' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"dynamically_registered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "onework_oauth_client_redirect_uris_array_check" CHECK (jsonb_typeof("redirect_uris") = 'array'),
	CONSTRAINT "onework_oauth_client_grant_types_array_check" CHECK (jsonb_typeof("grant_types") = 'array'),
	CONSTRAINT "onework_oauth_client_response_types_array_check" CHECK (jsonb_typeof("response_types") = 'array'),
	CONSTRAINT "onework_oauth_client_scopes_array_check" CHECK (jsonb_typeof("scopes") = 'array'),
	CONSTRAINT "onework_oauth_client_auth_method_check" CHECK ("token_endpoint_auth_method" = 'none'),
	CONSTRAINT "onework_oauth_client_status_check" CHECK ("status" IN ('active', 'revoked'))
);
--> statement-breakpoint
CREATE INDEX "onework_oauth_client_status_idx" ON "onework_oauth_client" ("status");
--> statement-breakpoint
CREATE INDEX "onework_oauth_client_created_idx" ON "onework_oauth_client" ("created_at");
--> statement-breakpoint

-- Device Authorization Grant 不对动态注册客户端开放。只预置这个官方公共客户端。
INSERT INTO "onework_oauth_client" (
	"client_id", "client_name", "redirect_uris", "grant_types",
	"response_types", "scopes", "token_endpoint_auth_method", "status",
	"dynamically_registered"
) VALUES (
	'onework-official-device-client-v1',
	'OneWorkOS 官方设备客户端',
	'[]'::jsonb,
	'["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"]'::jsonb,
	'[]'::jsonb,
	'["onework:resolve", "onework:knowledge", "onework:analytics", "onework:account"]'::jsonb,
	'none',
	'active',
	false
) ON CONFLICT ("client_id") DO NOTHING;
--> statement-breakpoint

CREATE TABLE "onework_oauth_authorization_code" (
	"id" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"client_id" text NOT NULL REFERENCES "public"."onework_oauth_client"("client_id") ON DELETE cascade,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"redirect_uri" text NOT NULL,
	"scope" text NOT NULL,
	"resource" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text DEFAULT 'S256' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "onework_oauth_authorization_code_method_check" CHECK ("code_challenge_method" = 'S256')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onework_oauth_authorization_code_hash_unique_idx" ON "onework_oauth_authorization_code" ("code_hash");
--> statement-breakpoint
CREATE INDEX "onework_oauth_authorization_code_client_idx" ON "onework_oauth_authorization_code" ("client_id");
--> statement-breakpoint
CREATE INDEX "onework_oauth_authorization_code_user_idx" ON "onework_oauth_authorization_code" ("user_id");
--> statement-breakpoint
CREATE INDEX "onework_oauth_authorization_code_expires_idx" ON "onework_oauth_authorization_code" ("expires_at");
--> statement-breakpoint

CREATE TABLE "onework_oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"client_id" text NOT NULL REFERENCES "public"."onework_oauth_client"("client_id") ON DELETE cascade,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"scope" text NOT NULL,
	"resource" text NOT NULL,
	"family_id" text,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onework_oauth_access_token_hash_unique_idx" ON "onework_oauth_access_token" ("token_hash");
--> statement-breakpoint
CREATE INDEX "onework_oauth_access_token_user_idx" ON "onework_oauth_access_token" ("user_id");
--> statement-breakpoint
CREATE INDEX "onework_oauth_access_token_client_idx" ON "onework_oauth_access_token" ("client_id");
--> statement-breakpoint
CREATE INDEX "onework_oauth_access_token_family_idx" ON "onework_oauth_access_token" ("family_id");
--> statement-breakpoint
CREATE INDEX "onework_oauth_access_token_expires_idx" ON "onework_oauth_access_token" ("expires_at");
--> statement-breakpoint

CREATE TABLE "onework_oauth_refresh_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"client_id" text NOT NULL REFERENCES "public"."onework_oauth_client"("client_id") ON DELETE cascade,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"scope" text NOT NULL,
	"resource" text NOT NULL,
	"family_id" text NOT NULL,
	"parent_token_id" text,
	"replaced_by_token_id" text,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onework_oauth_refresh_token_hash_unique_idx" ON "onework_oauth_refresh_token" ("token_hash");
--> statement-breakpoint
CREATE INDEX "onework_oauth_refresh_token_user_idx" ON "onework_oauth_refresh_token" ("user_id");
--> statement-breakpoint
CREATE INDEX "onework_oauth_refresh_token_client_idx" ON "onework_oauth_refresh_token" ("client_id");
--> statement-breakpoint
CREATE INDEX "onework_oauth_refresh_token_family_idx" ON "onework_oauth_refresh_token" ("family_id");
--> statement-breakpoint
CREATE INDEX "onework_oauth_refresh_token_expires_idx" ON "onework_oauth_refresh_token" ("expires_at");
--> statement-breakpoint

CREATE TABLE "onework_oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"client_id" text NOT NULL REFERENCES "public"."onework_oauth_client"("client_id") ON DELETE cascade,
	"scope" text NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onework_oauth_consent_user_client_scope_unique_idx" ON "onework_oauth_consent" ("user_id", "client_id", "scope");
--> statement-breakpoint
CREATE INDEX "onework_oauth_consent_client_idx" ON "onework_oauth_consent" ("client_id");
--> statement-breakpoint

CREATE TABLE "onework_oauth_device_code" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code_hash" text NOT NULL,
	"client_id" text NOT NULL REFERENCES "public"."onework_oauth_client"("client_id") ON DELETE cascade,
	"user_id" text REFERENCES "public"."user"("id") ON DELETE cascade,
	"scope" text NOT NULL,
	"resource" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"poll_interval_seconds" integer DEFAULT 5 NOT NULL,
	"last_polled_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"approved_at" timestamp,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "onework_oauth_device_status_check" CHECK ("status" IN ('pending', 'approved', 'denied', 'consumed')),
	CONSTRAINT "onework_oauth_device_poll_interval_check" CHECK ("poll_interval_seconds" BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onework_oauth_device_code_hash_unique_idx" ON "onework_oauth_device_code" ("device_code_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "onework_oauth_device_user_code_hash_unique_idx" ON "onework_oauth_device_code" ("user_code_hash");
--> statement-breakpoint
CREATE INDEX "onework_oauth_device_client_idx" ON "onework_oauth_device_code" ("client_id");
--> statement-breakpoint
CREATE INDEX "onework_oauth_device_user_idx" ON "onework_oauth_device_code" ("user_id");
--> statement-breakpoint
CREATE INDEX "onework_oauth_device_status_expires_idx" ON "onework_oauth_device_code" ("status", "expires_at");
--> statement-breakpoint

CREATE TABLE "onework_oauth_rate_limit_bucket" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_hash" text NOT NULL,
	"kind" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "onework_oauth_rate_limit_count_check" CHECK ("request_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onework_oauth_rate_limit_subject_kind_unique_idx" ON "onework_oauth_rate_limit_bucket" ("subject_hash", "kind");
--> statement-breakpoint
CREATE INDEX "onework_oauth_rate_limit_updated_idx" ON "onework_oauth_rate_limit_bucket" ("updated_at");
--> statement-breakpoint

-- 本项目的浏览器和 MCP 客户端只能经由应用 API 访问授权数据。
ALTER TABLE "onework_oauth_client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onework_oauth_authorization_code" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onework_oauth_access_token" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onework_oauth_refresh_token" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onework_oauth_consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onework_oauth_device_code" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onework_oauth_rate_limit_bucket" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE
	"onework_oauth_client", "onework_oauth_authorization_code",
	"onework_oauth_access_token", "onework_oauth_refresh_token",
	"onework_oauth_consent", "onework_oauth_device_code",
	"onework_oauth_rate_limit_bucket"
FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE
		"onework_oauth_client", "onework_oauth_authorization_code",
		"onework_oauth_access_token", "onework_oauth_refresh_token",
		"onework_oauth_consent", "onework_oauth_device_code",
		"onework_oauth_rate_limit_bucket"
	FROM anon;
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE
		"onework_oauth_client", "onework_oauth_authorization_code",
		"onework_oauth_access_token", "onework_oauth_refresh_token",
		"onework_oauth_consent", "onework_oauth_device_code",
		"onework_oauth_rate_limit_bucket"
	FROM authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;
