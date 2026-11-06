-- Widen only the page-count validation; no existing row/file is rewritten.
ALTER TABLE "presentation_jobs" DROP CONSTRAINT "presentation_page_count_check";
--> statement-breakpoint
ALTER TABLE "presentation_jobs" ADD CONSTRAINT "presentation_page_count_check" CHECK ("page_count" between 3 and 30);
