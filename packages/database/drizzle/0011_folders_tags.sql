CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"icon" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folders_kind_parent_idx" ON "folders" USING btree ("kind","parent_id");--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "links_folder_id_idx" ON "links" USING btree ("folder_id");--> statement-breakpoint
ALTER TABLE "tracking_campaigns" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "tracking_campaigns" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "tracking_campaigns" ADD CONSTRAINT "tracking_campaigns_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracking_campaigns_folder_id_idx" ON "tracking_campaigns" USING btree ("folder_id");--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_lower_idx" ON "tags" USING btree (lower("name"));--> statement-breakpoint
CREATE TABLE "link_tags" (
	"link_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "link_tags_link_id_tag_id_pk" PRIMARY KEY("link_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "link_tags" ADD CONSTRAINT "link_tags_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_tags" ADD CONSTRAINT "link_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "link_tags_tag_id_idx" ON "link_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE TABLE "campaign_tags" (
	"campaign_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "campaign_tags_campaign_id_tag_id_pk" PRIMARY KEY("campaign_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "campaign_tags" ADD CONSTRAINT "campaign_tags_campaign_id_tracking_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."tracking_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_tags" ADD CONSTRAINT "campaign_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_tags_tag_id_idx" ON "campaign_tags" USING btree ("tag_id");
