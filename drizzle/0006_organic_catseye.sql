CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"config_identity" text NOT NULL,
	"draft_id" uuid NOT NULL,
	"confirmation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"analysis_id" uuid NOT NULL,
	"sender" text NOT NULL,
	"recipients" jsonb NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"payload_hash" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"provider_message_id" text,
	"provider_request_id" text,
	"provider_event" text,
	"error_code" text,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempted_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	CONSTRAINT "email_deliveries_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "email_delivery_status_check" CHECK ("email_deliveries"."status" in ('queued','processing','accepted','delivered','failed','unknown')),
	CONSTRAINT "email_delivery_version_check" CHECK ("email_deliveries"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "email_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_draft_id_email_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."email_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_confirmation_id_email_draft_confirmations_id_fk" FOREIGN KEY ("confirmation_id") REFERENCES "public"."email_draft_confirmations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_analysis_id_meeting_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."meeting_analyses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_delivery_draft_version_idx" ON "email_deliveries" USING btree ("draft_id","version");--> statement-breakpoint
CREATE INDEX "email_delivery_queue_idx" ON "email_deliveries" USING btree ("scope","config_identity","status","lease_until");