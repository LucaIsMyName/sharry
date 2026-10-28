CREATE TABLE "landing_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"folder_id" uuid,
	"redirect_domain_id" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"settings" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"published_title" text,
	"published_settings" jsonb,
	"published_content" jsonb,
	"published_at" timestamp with time zone,
	"hidden" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_redirect_domain_id_redirect_domains_id_fk" FOREIGN KEY ("redirect_domain_id") REFERENCES "public"."redirect_domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "landing_pages_slug_lower_idx" ON "landing_pages" USING btree (lower("slug"));--> statement-breakpoint
CREATE INDEX "landing_pages_user_id_idx" ON "landing_pages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "landing_pages_folder_id_idx" ON "landing_pages" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "landing_pages_redirect_domain_id_idx" ON "landing_pages" USING btree ("redirect_domain_id");
