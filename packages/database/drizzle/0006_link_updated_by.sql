ALTER TABLE "links" ADD COLUMN "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
UPDATE "links" SET "updated_by" = "user_id" WHERE "updated_at" = "created_at";
