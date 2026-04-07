ALTER TABLE "tasks" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "tasks" SET "archived" = true WHERE "status" = 'archived';--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "task_assignees" ADD COLUMN "done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DROP TYPE "public"."task_status";
