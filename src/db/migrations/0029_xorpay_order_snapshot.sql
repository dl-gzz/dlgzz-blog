-- No legacy amounts/order IDs are inferred from callback payloads or new prices.
-- Apply before the hardened payment provider is deployed.
CREATE TABLE IF NOT EXISTS "xorpay_order_snapshot" (
  "payment_id" text PRIMARY KEY NOT NULL REFERENCES "public"."payment"("id") ON DELETE cascade,
  "provider_order_id" text NOT NULL UNIQUE,
  "amount_minor" integer NOT NULL CONSTRAINT "xorpay_order_snapshot_positive_amount" CHECK ("amount_minor" > 0),
  "currency" text NOT NULL CONSTRAINT "xorpay_order_snapshot_cny" CHECK ("currency" = 'CNY'),
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "xorpay_order_snapshot" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "xorpay_order_snapshot" FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
  REVOKE ALL ON TABLE "xorpay_order_snapshot" FROM anon;
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  REVOKE ALL ON TABLE "xorpay_order_snapshot" FROM authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;
