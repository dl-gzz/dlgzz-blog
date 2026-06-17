CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"file_path" text NOT NULL,
	"content_hash" text NOT NULL,
	"raw_content" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"heading" text,
	"content" text NOT NULL,
	"token_count" integer,
	"embedding" vector(2048),
	"embedding_model" text DEFAULT 'embedding-3' NOT NULL,
	"embedding_dimensions" integer DEFAULT 2048 NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_units" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text,
	"chunk_id" text,
	"unit_type" text NOT NULL,
	"intent" text NOT NULL,
	"title" text NOT NULL,
	"answer" text NOT NULL,
	"source_quote" text,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"scope" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_pack_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_pack_id" text NOT NULL,
	"document_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_employee_knowledge_pack" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"knowledge_pack_id" text NOT NULL,
	"status" text DEFAULT 'enabled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_ingest_run" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_pack_id" text,
	"source_root" text NOT NULL,
	"status" text NOT NULL,
	"total_documents" integer DEFAULT 0 NOT NULL,
	"imported_documents" integer DEFAULT 0 NOT NULL,
	"skipped_documents" integer DEFAULT 0 NOT NULL,
	"total_chunks" integer DEFAULT 0 NOT NULL,
	"embedded_chunks" integer DEFAULT 0 NOT NULL,
	"total_units" integer DEFAULT 0 NOT NULL,
	"errors" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "knowledge_units" ADD CONSTRAINT "knowledge_units_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "knowledge_units" ADD CONSTRAINT "knowledge_units_chunk_id_knowledge_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."knowledge_chunks"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "knowledge_pack_documents" ADD CONSTRAINT "knowledge_pack_documents_knowledge_pack_id_knowledge_packs_id_fk" FOREIGN KEY ("knowledge_pack_id") REFERENCES "public"."knowledge_packs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "knowledge_pack_documents" ADD CONSTRAINT "knowledge_pack_documents_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_employee_knowledge_pack" ADD CONSTRAINT "worker_employee_knowledge_pack_employee_id_worker_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."worker_employee"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_employee_knowledge_pack" ADD CONSTRAINT "worker_employee_knowledge_pack_knowledge_pack_id_knowledge_packs_id_fk" FOREIGN KEY ("knowledge_pack_id") REFERENCES "public"."knowledge_packs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "knowledge_ingest_run" ADD CONSTRAINT "knowledge_ingest_run_knowledge_pack_id_knowledge_packs_id_fk" FOREIGN KEY ("knowledge_pack_id") REFERENCES "public"."knowledge_packs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_file_path_unique_idx" ON "knowledge_documents" ("file_path");
--> statement-breakpoint
CREATE INDEX "knowledge_documents_source_category_idx" ON "knowledge_documents" ("source", "category");
--> statement-breakpoint
CREATE INDEX "knowledge_chunks_document_id_idx" ON "knowledge_chunks" ("document_id");
--> statement-breakpoint
CREATE INDEX "knowledge_chunks_metadata_gin_idx" ON "knowledge_chunks" USING gin ("metadata");
--> statement-breakpoint
CREATE INDEX "knowledge_chunks_embedding_model_idx" ON "knowledge_chunks" ("embedding_model");
--> statement-breakpoint
CREATE INDEX "knowledge_units_intent_idx" ON "knowledge_units" ("intent");
--> statement-breakpoint
CREATE INDEX "knowledge_units_metadata_gin_idx" ON "knowledge_units" USING gin ("metadata");
--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_pack_documents_unique_idx" ON "knowledge_pack_documents" ("knowledge_pack_id", "document_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_employee_knowledge_pack_unique_idx" ON "worker_employee_knowledge_pack" ("employee_id", "knowledge_pack_id");
