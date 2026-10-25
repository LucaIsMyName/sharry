CREATE TABLE "redirect_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hostname" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "txt_token" text NOT NULL,
  "verified_at" timestamptz,
  "last_checked_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "redirect_domains_status_check" CHECK ("status" IN ('pending', 'verified'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "redirect_domains_hostname_lower_idx" ON "redirect_domains" (lower("hostname"));
--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "redirect_domain_id" uuid REFERENCES "redirect_domains"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "links_redirect_domain_id_idx" ON "links" ("redirect_domain_id");
