CREATE TABLE "file_download" (
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
ALTER TABLE "file_download" ADD CONSTRAINT "file_download_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;