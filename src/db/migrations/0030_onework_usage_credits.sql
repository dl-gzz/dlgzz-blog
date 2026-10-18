CREATE TABLE IF NOT EXISTS "onework_usage_credit_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE CASCADE,
	"source" text DEFAULT 'payment' NOT NULL,
	"external_order_id" text,
	"credits_granted" integer NOT NULL,
	"credits_remaining" integer NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "onework_usage_credit_grant_positive" CHECK ("credits_granted" > 0),
	CONSTRAINT "onework_usage_credit_remaining_range" CHECK (
		"credits_remaining" >= 0 AND "credits_remaining" <= "credits_granted"
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onework_usage_credit_order_unique_idx"
	ON "onework_usage_credit_grant" ("user_id", "external_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onework_usage_credit_user_expiry_idx"
	ON "onework_usage_credit_grant" ("user_id", "expires_at");
--> statement-breakpoint
-- Credits are server-owned money-like balances. Supabase default grants must
-- not let browser database roles read or change them directly.
ALTER TABLE "onework_usage_credit_grant" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "onework_usage_credit_grant" FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
  REVOKE ALL ON TABLE "onework_usage_credit_grant" FROM anon;
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  REVOKE ALL ON TABLE "onework_usage_credit_grant" FROM authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "api_usage_event"
	ADD COLUMN IF NOT EXISTS "billing_source" text DEFAULT 'subscription' NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_usage_event"
	ADD COLUMN IF NOT EXISTS "credit_grant_id" text REFERENCES "onework_usage_credit_grant"("id") ON DELETE SET NULL;
