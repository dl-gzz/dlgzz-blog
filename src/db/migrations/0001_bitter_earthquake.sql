CREATE TABLE "custom_model" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"height" text NOT NULL,
	"weight" text NOT NULL,
	"body_type" text NOT NULL,
	"style" text NOT NULL,
	"image_url" text NOT NULL,
	"oss_key" text NOT NULL,
	"user_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_model" ADD CONSTRAINT "custom_model_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;