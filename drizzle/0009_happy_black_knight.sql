CREATE TABLE "goals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "goals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"job_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"period" text,
	"status" text DEFAULT 'active' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"key_results" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_people" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_people_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"job_id" integer NOT NULL,
	"name" text NOT NULL,
	"relationship" text DEFAULT 'peer' NOT NULL,
	"title" text,
	"email" text,
	"start_date" date,
	"end_date" date,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_on_ones" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "one_on_ones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"job_id" integer NOT NULL,
	"person_id" integer,
	"date" date,
	"notes" text DEFAULT '' NOT NULL,
	"action_items" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_reviews" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "performance_reviews_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"job_id" integer NOT NULL,
	"cycle" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"rating" text,
	"reviewer" text,
	"summary" text,
	"strengths" text,
	"growth_areas" text,
	"outcome" text,
	"compensation_id" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "next_review_date" date;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "review_reminded_for" date;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_people" ADD CONSTRAINT "job_people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_people" ADD CONSTRAINT "job_people_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_on_ones" ADD CONSTRAINT "one_on_ones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_on_ones" ADD CONSTRAINT "one_on_ones_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_on_ones" ADD CONSTRAINT "one_on_ones_person_id_job_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."job_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_compensation_id_job_compensation_id_fk" FOREIGN KEY ("compensation_id") REFERENCES "public"."job_compensation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_user_job_idx" ON "goals" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE INDEX "job_people_user_job_idx" ON "job_people" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE INDEX "one_on_ones_user_job_idx" ON "one_on_ones" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE INDEX "performance_reviews_user_job_idx" ON "performance_reviews" USING btree ("user_id","job_id");