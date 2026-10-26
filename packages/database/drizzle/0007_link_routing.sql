ALTER TABLE "links" ADD COLUMN "routing_rules" jsonb DEFAULT '[]'::jsonb NOT NULL;
