CREATE TABLE "try_on_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"model_name" text NOT NULL,
	"model_image_url" text NOT NULL,
	"clothing_type" text NOT NULL,
	"top_garment_url" text,
	"bottom_garment_url" text,
	"result_image_url" text NOT NULL,
	"result_oss_key" text NOT NULL,
	"original_result_url" text,
	"task_id" text,
	"outfit_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "try_on_history" ADD CONSTRAINT "try_on_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;