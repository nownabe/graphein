-- Rename members table to users
ALTER TABLE "members" RENAME TO "users";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "members_pkey" TO "users_pkey";--> statement-breakpoint

-- Rename member_id columns to user_id
ALTER TABLE "task_assignees" RENAME COLUMN "member_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "task_owners" RENAME COLUMN "member_id" TO "user_id";--> statement-breakpoint

-- Rename unique constraint
ALTER TABLE "users" RENAME CONSTRAINT "members_slack_user_id_unique" TO "users_slack_user_id_unique";--> statement-breakpoint

-- Rename foreign key constraints
ALTER TABLE "tasks" RENAME CONSTRAINT "tasks_created_by_id_members_id_fk" TO "tasks_created_by_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_assignees" RENAME CONSTRAINT "task_assignees_member_id_members_id_fk" TO "task_assignees_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_owners" RENAME CONSTRAINT "task_owners_member_id_fkey" TO "task_owners_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_owners" RENAME CONSTRAINT "task_owners_task_id_fkey" TO "task_owners_task_id_tasks_id_fk";--> statement-breakpoint

-- Rename composite primary keys
ALTER TABLE "task_assignees" RENAME CONSTRAINT "task_assignees_task_id_member_id_pk" TO "task_assignees_task_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "task_owners" RENAME CONSTRAINT "task_owners_task_id_member_id_pk" TO "task_owners_task_id_user_id_pk";
