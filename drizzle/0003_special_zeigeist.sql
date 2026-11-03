CREATE TABLE "email_draft_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_draft_confirmations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"analysis_id" uuid NOT NULL,
	"risk_ids" jsonb NOT NULL,
	"todo_ids" jsonb NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"delivery_state" text DEFAULT 'not_sent' NOT NULL,
	"user_edited" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_drafts_meeting_id_unique" UNIQUE("meeting_id"),
	CONSTRAINT "draft_state_check" CHECK ("email_drafts"."state" in ('draft','confirmed') and "email_drafts"."delivery_state" = 'not_sent')
);
--> statement-breakpoint
ALTER TABLE "email_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meeting_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"result" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_analyses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meeting_risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"analysis_id" uuid NOT NULL,
	"type" text NOT NULL,
	"level" text NOT NULL,
	"description" text NOT NULL,
	"impact" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_risks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meeting_todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"analysis_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"task" text NOT NULL,
	"owner" text,
	"due_date" text,
	"status" text DEFAULT 'open' NOT NULL,
	"evidence" jsonb NOT NULL,
	"risk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"user_edited" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_todo_status_check" CHECK ("meeting_todos"."status" in ('open','in_progress','done'))
);
--> statement-breakpoint
ALTER TABLE "meeting_todos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"object_key" text NOT NULL,
	"storage_origin" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"transcript" text NOT NULL,
	"line_count" integer NOT NULL,
	"storage_ready" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"requested_version" integer DEFAULT 1 NOT NULL,
	"current_analysis_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_sha256_unique" UNIQUE("sha256"),
	CONSTRAINT "meetings_status_check" CHECK ("meetings"."status" in ('uploaded','processing','ready','failed')),
	CONSTRAINT "meetings_size_check" CHECK ("meetings"."size" > 0 and "meetings"."size" <= 1048576)
);
--> statement-breakpoint
ALTER TABLE "meetings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "risk_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"risk_id" uuid NOT NULL,
	"start_line" integer NOT NULL,
	"end_line" integer NOT NULL,
	"quote" text NOT NULL,
	CONSTRAINT "risk_evidence_lines_check" CHECK ("risk_evidence"."start_line" >= 1 and "risk_evidence"."end_line" >= "risk_evidence"."start_line")
);
--> statement-breakpoint
ALTER TABLE "risk_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_draft_confirmations" ADD CONSTRAINT "email_draft_confirmations_draft_id_email_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."email_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_analysis_id_meeting_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."meeting_analyses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_analyses" ADD CONSTRAINT "meeting_analyses_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_risks" ADD CONSTRAINT "meeting_risks_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_risks" ADD CONSTRAINT "meeting_risks_analysis_id_meeting_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."meeting_analyses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_todos" ADD CONSTRAINT "meeting_todos_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_todos" ADD CONSTRAINT "meeting_todos_analysis_id_meeting_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."meeting_analyses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_evidence" ADD CONSTRAINT "risk_evidence_risk_id_meeting_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."meeting_risks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "draft_confirmation_version_idx" ON "email_draft_confirmations" USING btree ("draft_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_analysis_version_idx" ON "meeting_analyses" USING btree ("meeting_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_todos_source_idx" ON "meeting_todos" USING btree ("meeting_id","source_key");--> statement-breakpoint
CREATE INDEX "meetings_queue_idx" ON "meetings" USING btree ("status","lease_until");