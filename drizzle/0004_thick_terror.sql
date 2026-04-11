ALTER TABLE "members" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
UPDATE "members" SET "role" = 'admin' WHERE "id" = (
  SELECT "id" FROM "members" ORDER BY "created_at" ASC LIMIT 1
);