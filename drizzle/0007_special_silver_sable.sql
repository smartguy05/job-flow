CREATE TABLE "ingested_emails" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ingested_emails_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"application_id" integer,
	"kind" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"from_address" text,
	"subject" text,
	"received_at" timestamp with time zone,
	"actions" text,
	"applied_at" timestamp with time zone,
	"processed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingested_emails" ADD CONSTRAINT "ingested_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingested_emails" ADD CONSTRAINT "ingested_emails_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingested_emails_user_message_uq" ON "ingested_emails" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "ingested_emails_user_processed_idx" ON "ingested_emails" USING btree ("user_id","processed_at");