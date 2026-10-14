CREATE TABLE "inventions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"invention_date" text,
	"identifier" text,
	"kind" text DEFAULT 'software' NOT NULL,
	"technologies" text DEFAULT '[]' NOT NULL,
	"include_in_resume" boolean DEFAULT false NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventions" ADD CONSTRAINT "inventions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventions_user_sort_idx" ON "inventions" USING btree ("user_id","sort_order");