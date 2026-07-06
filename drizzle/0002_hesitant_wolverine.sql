ALTER TABLE "interviews" ADD COLUMN "transcript" text;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "debrief_questions" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "debrief_answers" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "debrief_summary" text;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "debrief_action_items" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "debrief_sentiment" text;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "debrief_at" timestamp with time zone;