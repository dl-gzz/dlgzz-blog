CREATE TABLE IF NOT EXISTS "health_user_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	"display_name" text DEFAULT '' NOT NULL,
	"sex" text DEFAULT 'unknown' NOT NULL,
	"birth_year" integer,
	"height_cm" integer,
	"targets" jsonb NOT NULL,
	"medication_notes" text DEFAULT '' NOT NULL,
	"risk_notes" text DEFAULT '' NOT NULL,
	"hermes_assistant_id" text,
	"hermes_activation_id" text,
	"hermes_profile_name" text,
	"hermes_connection_mode" text,
	"hermes_status" text DEFAULT 'not_connected' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_measurement" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	"profile_id" text NOT NULL REFERENCES "public"."health_user_profile"("id") ON DELETE cascade ON UPDATE no action,
	"measured_at" timestamp NOT NULL,
	"entry_type" text DEFAULT 'daily' NOT NULL,
	"systolic" integer,
	"diastolic" integer,
	"heart_rate" integer,
	"fasting_glucose_mmol" numeric(5, 2),
	"postprandial_glucose_mmol" numeric(5, 2),
	"total_cholesterol_mmol" numeric(5, 2),
	"triglycerides_mmol" numeric(5, 2),
	"hdl_mmol" numeric(5, 2),
	"ldl_mmol" numeric(5, 2),
	"weight_kg" numeric(5, 2),
	"waist_cm" numeric(5, 2),
	"notes" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "health_user_profile_user_id_unique_idx" ON "health_user_profile" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "health_user_profile_hermes_assistant_id_idx" ON "health_user_profile" USING btree ("hermes_assistant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "health_measurement_user_measured_at_idx" ON "health_measurement" USING btree ("user_id", "measured_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "health_measurement_profile_measured_at_idx" ON "health_measurement" USING btree ("profile_id", "measured_at");
