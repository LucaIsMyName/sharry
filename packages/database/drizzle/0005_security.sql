ALTER TABLE "redirect_domains" ADD COLUMN "txt_mismatch_streak" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE "link_password_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "link_id" uuid NOT NULL REFERENCES "links"("id") ON DELETE CASCADE,
  "visitor_id" text NOT NULL,
  "attempted_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "link_password_attempts_lookup_idx" ON "link_password_attempts" ("link_id", "visitor_id", "attempted_at");
--> statement-breakpoint
CREATE INDEX "link_password_attempts_attempted_at_idx" ON "link_password_attempts" ("attempted_at");
