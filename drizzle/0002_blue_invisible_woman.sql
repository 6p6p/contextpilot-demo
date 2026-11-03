CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"page" integer NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector NOT NULL,
	"dimensions" integer NOT NULL,
	"embedding_space" text NOT NULL,
	CONSTRAINT "document_chunks_dimensions_check" CHECK (vector_dims("document_chunks"."embedding") = "document_chunks"."dimensions" and "document_chunks"."dimensions" between 1 and 4096),
	CONSTRAINT "document_chunks_page_check" CHECK ("document_chunks"."page" >= 1 and "document_chunks"."start_offset" >= 0 and "document_chunks"."end_offset" > "document_chunks"."start_offset")
);
--> statement-breakpoint
ALTER TABLE "document_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"object_key" text NOT NULL,
	"storage_origin" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" text NOT NULL,
	"storage_ready" boolean DEFAULT false NOT NULL,
	"page_count" integer,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"embedding_space" text NOT NULL,
	"dimensions" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_status_check" CHECK ("documents"."status" in ('uploaded','processing','ready','failed')),
	CONSTRAINT "documents_size_check" CHECK ("documents"."size" > 0 and "documents"."size" <= 6291456),
	CONSTRAINT "documents_dimensions_check" CHECK ("documents"."dimensions" between 1 and 4096)
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "knowledge_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_chunks_ordinal_idx" ON "document_chunks" USING btree ("document_id","ordinal");--> statement-breakpoint
CREATE INDEX "documents_queue_idx" ON "documents" USING btree ("status","lease_until");