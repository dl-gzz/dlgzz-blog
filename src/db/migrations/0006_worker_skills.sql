CREATE TABLE "worker_skill" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"summary" text NOT NULL,
	"category" text DEFAULT 'professional' NOT NULL,
	"skill_type" text DEFAULT 'config' NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"default_enabled" boolean DEFAULT false NOT NULL,
	"requires_user_config" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_employee_skill" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"status" text DEFAULT 'allowed' NOT NULL,
	"default_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_instance_skill" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_tool_run" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"skill_id" text,
	"status" text NOT NULL,
	"input_summary" text,
	"output_summary" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "worker_employee_skill" ADD CONSTRAINT "worker_employee_skill_employee_id_worker_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."worker_employee"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_employee_skill" ADD CONSTRAINT "worker_employee_skill_skill_id_worker_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."worker_skill"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_instance_skill" ADD CONSTRAINT "worker_instance_skill_instance_id_worker_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."worker_instance"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_instance_skill" ADD CONSTRAINT "worker_instance_skill_skill_id_worker_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."worker_skill"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_tool_run" ADD CONSTRAINT "worker_tool_run_instance_id_worker_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."worker_instance"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_tool_run" ADD CONSTRAINT "worker_tool_run_skill_id_worker_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."worker_skill"("id") ON DELETE set null ON UPDATE no action;
