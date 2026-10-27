ALTER TABLE "tags" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "color" text;--> statement-breakpoint
UPDATE "tags" SET "kind" = 'link'
WHERE "id" IN (SELECT "tag_id" FROM "link_tags")
  AND "id" NOT IN (SELECT "tag_id" FROM "campaign_tags");--> statement-breakpoint
UPDATE "tags" SET "kind" = 'campaign'
WHERE "id" IN (SELECT "tag_id" FROM "campaign_tags")
  AND "id" NOT IN (SELECT "tag_id" FROM "link_tags");--> statement-breakpoint
INSERT INTO "tags" ("id", "name", "kind", "color")
SELECT gen_random_uuid(), "name", 'campaign', '#7c6af7'
FROM "tags" AS original
WHERE EXISTS (SELECT 1 FROM "link_tags" WHERE "link_tags"."tag_id" = original."id")
  AND EXISTS (SELECT 1 FROM "campaign_tags" WHERE "campaign_tags"."tag_id" = original."id");--> statement-breakpoint
UPDATE "campaign_tags"
SET "tag_id" = copy."id"
FROM "tags" AS original
JOIN "tags" AS copy ON lower(copy."name") = lower(original."name") AND copy."kind" = 'campaign'
WHERE "campaign_tags"."tag_id" = original."id"
  AND original."kind" IS NULL;--> statement-breakpoint
UPDATE "tags" SET "kind" = 'link' WHERE "kind" IS NULL;--> statement-breakpoint
UPDATE "tags" SET "color" = CASE abs(hashtext(lower("name"))) % 8
  WHEN 0 THEN '#7c6af7'
  WHEN 1 THEN '#e85d4c'
  WHEN 2 THEN '#2a9d8f'
  WHEN 3 THEN '#e9a825'
  WHEN 4 THEN '#3b82c4'
  WHEN 5 THEN '#c45c9a'
  WHEN 6 THEN '#6b8f3a'
  ELSE '#e07a3d'
END
WHERE "color" IS NULL;--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "color" SET NOT NULL;--> statement-breakpoint
DROP INDEX "tags_name_lower_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "tags_kind_name_lower_idx" ON "tags" USING btree ("kind", lower("name"));
