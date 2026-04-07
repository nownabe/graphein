CREATE TABLE "task_owners" (
	"task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE cascade,
	"member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE cascade,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_owners_task_id_member_id_pk" PRIMARY KEY("task_id","member_id")
);--> statement-breakpoint
INSERT INTO "task_owners" ("task_id", "member_id")
SELECT "id", "created_by_id" FROM "tasks";
