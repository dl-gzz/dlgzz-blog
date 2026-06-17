CREATE TABLE "miniapp_account" (
	"id" text PRIMARY KEY NOT NULL,
	"openid" text NOT NULL,
	"unionid" text,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "miniapp_account_openid_unique" UNIQUE("openid")
);
--> statement-breakpoint
ALTER TABLE "miniapp_account" ADD CONSTRAINT "miniapp_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
