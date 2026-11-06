-- Nullable, no data rewrite, no object/vector deletion; old SELECT projections remain valid.
ALTER TABLE "conversations" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "removed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "meeting_todos" ADD COLUMN "dismissed_at" timestamp with time zone;
