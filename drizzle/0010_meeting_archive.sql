-- Nullable state only: retain transcript, analyses, todos, drafts and private files.
ALTER TABLE "meetings" ADD COLUMN "archived_at" timestamp with time zone;
