CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" text NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text DEFAULT 'user' NOT NULL,
  "email_verified_at" timestamptz,
  "totp_secret_encrypted" text,
  "totp_enabled" boolean DEFAULT false NOT NULL,
  "must_change_password" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "users_role_check" CHECK ("role" IN ('admin', 'user'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" (lower("username"));
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" (lower("email"));
--> statement-breakpoint
CREATE TABLE "links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "slug" text NOT NULL,
  "destination_url" text NOT NULL,
  "title" text,
  "description" text,
  "redirect_type" text DEFAULT '302' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "expires_at" timestamptz,
  "password_hash" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "links_redirect_type_check" CHECK ("redirect_type" IN ('301', '302', '307', '308')),
  CONSTRAINT "links_status_check" CHECK ("status" IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "links_slug_lower_idx" ON "links" (lower("slug"));
--> statement-breakpoint
CREATE INDEX "links_user_id_idx" ON "links" ("user_id");
--> statement-breakpoint
CREATE TABLE "app_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tracking_campaigns_user_id_idx" ON "tracking_campaigns" ("user_id");
--> statement-breakpoint
CREATE TABLE "tracking_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "link_id" uuid NOT NULL UNIQUE REFERENCES "links"("id") ON DELETE CASCADE,
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "utm_id" text,
  "utm_term" text,
  "utm_content" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_variants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "tracking_campaigns"("id") ON DELETE CASCADE,
  "link_id" uuid NOT NULL REFERENCES "links"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "utm_id" text,
  "utm_term" text,
  "utm_content" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tracking_variants_campaign_id_idx" ON "tracking_variants" ("campaign_id");
--> statement-breakpoint
CREATE INDEX "tracking_variants_link_id_idx" ON "tracking_variants" ("link_id");
--> statement-breakpoint
CREATE TABLE "qr_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "link_id" uuid NOT NULL REFERENCES "links"("id") ON DELETE CASCADE,
  "tracking_variant_id" uuid REFERENCES "tracking_variants"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "style_config" jsonb NOT NULL,
  "logo_path" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "qr_codes_link_id_idx" ON "qr_codes" ("link_id");
--> statement-breakpoint
CREATE TABLE "click_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "link_id" uuid NOT NULL REFERENCES "links"("id") ON DELETE CASCADE,
  "tracking_variant_id" uuid REFERENCES "tracking_variants"("id") ON DELETE SET NULL,
  "qr_code_id" uuid REFERENCES "qr_codes"("id") ON DELETE SET NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL,
  "referrer" text,
  "country_code" text,
  "region" text,
  "browser" text,
  "operating_system" text,
  "device_type" text,
  "is_bot" boolean DEFAULT false NOT NULL,
  "anonymous_visitor_id" text,
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "utm_id" text,
  "utm_term" text,
  "utm_content" text
);
--> statement-breakpoint
CREATE INDEX "click_events_link_id_occurred_at_idx" ON "click_events" ("link_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX "click_events_occurred_at_idx" ON "click_events" ("occurred_at");
--> statement-breakpoint
CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" ("created_at");
--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" ("entity_type", "entity_id");
--> statement-breakpoint
CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "scope" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "sessions_scope_check" CHECK ("scope" IN ('full', 'password_change', 'mfa_enroll', 'mfa_challenge'))
);
--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" ("expires_at");
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL UNIQUE,
  "used_at" timestamptz
);
--> statement-breakpoint
CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes" ("user_id");
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
