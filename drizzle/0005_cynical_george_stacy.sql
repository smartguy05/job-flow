CREATE TABLE "job_benefits" (
	"job_id" integer PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"health" text,
	"retirement" text,
	"pto_days" integer,
	"parental_leave" text,
	"remote_policy" text,
	"other" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_compensation" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_compensation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"job_id" integer NOT NULL,
	"effective_date" date,
	"kind" text DEFAULT 'start' NOT NULL,
	"title" text,
	"base_amount" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"period" text DEFAULT 'year' NOT NULL,
	"bonus" text,
	"equity" text,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"application_id" integer,
	"company" text NOT NULL,
	"company_normalized" text NOT NULL,
	"title" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"employment_type" text,
	"location_mode" text,
	"location" text,
	"manager" text,
	"team" text,
	"technologies" text DEFAULT '[]' NOT NULL,
	"reason_for_leaving" text,
	"notes" text,
	"profile_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "journal_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"job_id" integer NOT NULL,
	"entry_date" date,
	"kind" text DEFAULT 'achievement' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"impact" text,
	"technologies" text DEFAULT '[]' NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_benefits" ADD CONSTRAINT "job_benefits_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_benefits" ADD CONSTRAINT "job_benefits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_compensation" ADD CONSTRAINT "job_compensation_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_compensation" ADD CONSTRAINT "job_compensation_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_compensation_user_job_idx" ON "job_compensation" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE INDEX "jobs_user_idx" ON "jobs" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_user_application_uq" ON "jobs" USING btree ("user_id","application_id");--> statement-breakpoint
CREATE INDEX "journal_entries_user_job_idx" ON "journal_entries" USING btree ("user_id","job_id");