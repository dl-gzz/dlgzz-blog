CREATE TABLE IF NOT EXISTS "edu_workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "edu_courseware" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by" text,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"locale" text DEFAULT 'zh' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source_slug" text,
	"whiteboard_prompt" text DEFAULT '' NOT NULL,
	"html_content" text NOT NULL,
	"mdx_source" text NOT NULL,
	"provider" text,
	"model" text,
	"status" text DEFAULT 'published' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "edu_blog_post" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"courseware_id" text,
	"created_by" text,
	"post_type" text DEFAULT 'courseware' NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"locale" text DEFAULT 'zh' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image" text DEFAULT '/images/blog/interactive-math-game.png' NOT NULL,
	"mdx_source" text NOT NULL,
	"whiteboard_category" text DEFAULT 'education' NOT NULL,
	"whiteboard_prompt" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"published_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "edu_board" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by" text,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"student_id" text,
	"lesson_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "edu_board_shape" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"shape_type" text NOT NULL,
	"shape_data" jsonb NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "edu_workspace"
		ADD CONSTRAINT "edu_workspace_owner_user_id_user_id_fk"
		FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	ALTER TABLE "edu_courseware"
		ADD CONSTRAINT "edu_courseware_workspace_id_edu_workspace_id_fk"
		FOREIGN KEY ("workspace_id") REFERENCES "public"."edu_workspace"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	ALTER TABLE "edu_courseware"
		ADD CONSTRAINT "edu_courseware_created_by_user_id_fk"
		FOREIGN KEY ("created_by") REFERENCES "public"."user"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	ALTER TABLE "edu_blog_post"
		ADD CONSTRAINT "edu_blog_post_workspace_id_edu_workspace_id_fk"
		FOREIGN KEY ("workspace_id") REFERENCES "public"."edu_workspace"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	ALTER TABLE "edu_blog_post"
		ADD CONSTRAINT "edu_blog_post_courseware_id_edu_courseware_id_fk"
		FOREIGN KEY ("courseware_id") REFERENCES "public"."edu_courseware"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	ALTER TABLE "edu_blog_post"
		ADD CONSTRAINT "edu_blog_post_created_by_user_id_fk"
		FOREIGN KEY ("created_by") REFERENCES "public"."user"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	ALTER TABLE "edu_board"
		ADD CONSTRAINT "edu_board_workspace_id_edu_workspace_id_fk"
		FOREIGN KEY ("workspace_id") REFERENCES "public"."edu_workspace"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	ALTER TABLE "edu_board"
		ADD CONSTRAINT "edu_board_created_by_user_id_fk"
		FOREIGN KEY ("created_by") REFERENCES "public"."user"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	ALTER TABLE "edu_board_shape"
		ADD CONSTRAINT "edu_board_shape_board_id_edu_board_id_fk"
		FOREIGN KEY ("board_id") REFERENCES "public"."edu_board"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "edu_workspace_slug_unique_idx" ON "edu_workspace" ("slug");
CREATE INDEX IF NOT EXISTS "edu_workspace_owner_user_id_idx" ON "edu_workspace" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "edu_workspace_status_idx" ON "edu_workspace" ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "edu_courseware_workspace_slug_locale_unique_idx" ON "edu_courseware" ("workspace_id", "slug", "locale");
CREATE INDEX IF NOT EXISTS "edu_courseware_workspace_id_idx" ON "edu_courseware" ("workspace_id");
CREATE INDEX IF NOT EXISTS "edu_courseware_created_by_idx" ON "edu_courseware" ("created_by");
CREATE INDEX IF NOT EXISTS "edu_courseware_status_idx" ON "edu_courseware" ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "edu_blog_post_workspace_slug_locale_unique_idx" ON "edu_blog_post" ("workspace_id", "slug", "locale");
CREATE INDEX IF NOT EXISTS "edu_blog_post_workspace_id_idx" ON "edu_blog_post" ("workspace_id");
CREATE INDEX IF NOT EXISTS "edu_blog_post_courseware_id_idx" ON "edu_blog_post" ("courseware_id");
CREATE INDEX IF NOT EXISTS "edu_blog_post_created_by_idx" ON "edu_blog_post" ("created_by");
CREATE INDEX IF NOT EXISTS "edu_blog_post_status_idx" ON "edu_blog_post" ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "edu_board_workspace_slug_unique_idx" ON "edu_board" ("workspace_id", "slug");
CREATE INDEX IF NOT EXISTS "edu_board_workspace_id_idx" ON "edu_board" ("workspace_id");
CREATE INDEX IF NOT EXISTS "edu_board_created_by_idx" ON "edu_board" ("created_by");
CREATE INDEX IF NOT EXISTS "edu_board_student_id_idx" ON "edu_board" ("student_id");

CREATE INDEX IF NOT EXISTS "edu_board_shape_board_id_idx" ON "edu_board_shape" ("board_id");
CREATE INDEX IF NOT EXISTS "edu_board_shape_shape_type_idx" ON "edu_board_shape" ("shape_type");
