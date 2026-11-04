CREATE TABLE "presentation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"assistant_message_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"request" text NOT NULL,
	"request_hash" text NOT NULL,
	"context" jsonb NOT NULL,
	"topic" text NOT NULL,
	"page_count" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"sources" jsonb,
	"plan" jsonb,
	"object_key" text NOT NULL,
	"storage_origin" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"filename" text NOT NULL,
	"size" integer,
	"sha256" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"retries" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presentation_page_count_check" CHECK ("presentation_jobs"."page_count" between 5 and 10),
	CONSTRAINT "presentation_attempts_check" CHECK ("presentation_jobs"."attempts" between 0 and 2 and "presentation_jobs"."retries" between 0 and 1),
	CONSTRAINT "presentation_status_check" CHECK ("presentation_jobs"."status" in ('queued','planning','rendering','ready','failed'))
);
--> statement-breakpoint
ALTER TABLE "presentation_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "presentation_jobs" ADD CONSTRAINT "presentation_jobs_assistant_message_id_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_jobs" ADD CONSTRAINT "presentation_jobs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_message_idx" ON "presentation_jobs" USING btree ("assistant_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_object_idx" ON "presentation_jobs" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "presentation_queue_idx" ON "presentation_jobs" USING btree ("scope","status","lease_until");