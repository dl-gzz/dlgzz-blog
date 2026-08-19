-- Group independently versioned knowledge packs into discoverable collections.
--
-- Collections are catalog/navigation metadata only. Access remains governed by
-- the existing per-pack entitlements, so a collection can never broaden a
-- user's licensed pack set.

CREATE TABLE IF NOT EXISTS "knowledge_collections" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_collection_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"knowledge_pack_id" text NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "knowledge_collection_packs" ADD CONSTRAINT "knowledge_collection_packs_collection_id_knowledge_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."knowledge_collections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "knowledge_collection_packs" ADD CONSTRAINT "knowledge_collection_packs_knowledge_pack_id_knowledge_packs_id_fk" FOREIGN KEY ("knowledge_pack_id") REFERENCES "public"."knowledge_packs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_collections_status_idx" ON "knowledge_collections" ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_collection_packs_unique_idx" ON "knowledge_collection_packs" ("collection_id", "knowledge_pack_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_collection_packs_collection_sort_idx" ON "knowledge_collection_packs" ("collection_id", "status", "sort_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_collection_packs_pack_idx" ON "knowledge_collection_packs" ("knowledge_pack_id", "status");
--> statement-breakpoint
INSERT INTO "knowledge_collections" (
	"id", "name", "description", "status", "metadata", "updated_at"
)
VALUES (
	'independent-worker',
	'独立工作者',
	'one-worker-os 面向独立工作者的第一方方法、案例和 AI 可读资料合集。',
	'active',
	'{"authority":"first_party_collection","contentKinds":["methodology","article","code"]}'::jsonb,
	now()
)
ON CONFLICT ("id") DO UPDATE SET
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description",
	"status" = EXCLUDED."status",
	"metadata" = EXCLUDED."metadata",
	"updated_at" = now();
--> statement-breakpoint

-- Catalog rows describe paid knowledge structure and remain server-only, just
-- like knowledge_packs and knowledge_pack_documents.
ALTER TABLE "knowledge_collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_collection_packs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "knowledge_collections", "knowledge_collection_packs" FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE "knowledge_collections", "knowledge_collection_packs" FROM anon;
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	REVOKE ALL ON TABLE "knowledge_collections", "knowledge_collection_packs" FROM authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;
