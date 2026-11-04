ALTER TABLE "messages" ADD COLUMN "search_mode" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "web_sources" jsonb DEFAULT '[]'::jsonb NOT NULL;