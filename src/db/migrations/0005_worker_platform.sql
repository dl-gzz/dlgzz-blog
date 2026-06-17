CREATE TABLE "worker_employee" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"responsibility" text NOT NULL,
	"suitable_tasks" text NOT NULL,
	"solves_problem" text NOT NULL,
	"employee_dir" text NOT NULL,
	"readme_path" text NOT NULL,
	"soul_path" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"monthly_price_id" text NOT NULL,
	"monthly_amount" integer NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"source_hash" text NOT NULL,
	"latest_version_id" text,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_employee_version" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"soul_path" text NOT NULL,
	"soul_hash" text NOT NULL,
	"readme_hash" text NOT NULL,
	"skills_hash" text NOT NULL,
	"soul_snapshot" text NOT NULL,
	"readme_snapshot" text NOT NULL,
	"skills_summary" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_instance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"employee_version_id" text NOT NULL,
	"persona_id" text,
	"persona_prompt" text,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"price_id" text NOT NULL,
	"subscription_id" text,
	"checkout_session_id" text,
	"profile_name" text,
	"activation_id" text,
	"qr_payload" text,
	"qr_image_url" text,
	"activation_expires_at" timestamp,
	"weixin_account_id" text,
	"weixin_user_id" text,
	"gateway_status" text,
	"error" text,
	"activated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_sync_run" (
	"id" text PRIMARY KEY NOT NULL,
	"source_root" text NOT NULL,
	"status" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"synced" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"errors" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "worker_employee_version" ADD CONSTRAINT "worker_employee_version_employee_id_worker_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."worker_employee"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_instance" ADD CONSTRAINT "worker_instance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_instance" ADD CONSTRAINT "worker_instance_employee_id_worker_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."worker_employee"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_instance" ADD CONSTRAINT "worker_instance_employee_version_id_worker_employee_version_id_fk" FOREIGN KEY ("employee_version_id") REFERENCES "public"."worker_employee_version"("id") ON DELETE restrict ON UPDATE no action;
