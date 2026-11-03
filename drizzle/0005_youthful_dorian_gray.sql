CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"source_group" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"quote" text NOT NULL,
	"sources" jsonb NOT NULL,
	"embedding" vector,
	"dimensions" integer,
	"embedding_space" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_kind_check" CHECK ("memories"."kind" in ('person','time','place','topic','event','decision')),
	CONSTRAINT "memory_vector_check" CHECK (("memories"."embedding" is null and "memories"."dimensions" is null and "memories"."embedding_space" is null) or ("memories"."embedding" is not null and "memories"."dimensions" is not null and "memories"."embedding_space" is not null and vector_dims("memories"."embedding") = "memories"."dimensions" and "memories"."dimensions" between 1 and 4096))
);
--> statement-breakpoint
ALTER TABLE "memories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"message_id" uuid,
	"analysis_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_job_source_check" CHECK (("memory_jobs"."message_id" is null) <> ("memory_jobs"."analysis_id" is null)),
	CONSTRAINT "memory_job_status_check" CHECK ("memory_jobs"."status" in ('queued','processing','ready','failed'))
);
--> statement-breakpoint
ALTER TABLE "memory_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "memory_sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD CONSTRAINT "memory_jobs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD CONSTRAINT "memory_jobs_analysis_id_meeting_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."meeting_analyses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memory_fact_identity_idx" ON "memories" USING btree ("scope","source_group","fingerprint");--> statement-breakpoint
CREATE INDEX "memories_scope_idx" ON "memories" USING btree ("scope");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_job_message_idx" ON "memory_jobs" USING btree ("scope","message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_job_analysis_idx" ON "memory_jobs" USING btree ("scope","analysis_id");--> statement-breakpoint
CREATE INDEX "memory_job_queue_idx" ON "memory_jobs" USING btree ("scope","status","lease_until");