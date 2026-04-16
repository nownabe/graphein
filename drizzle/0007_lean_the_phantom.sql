CREATE TABLE "kudos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slack_message_ts" text,
	"slack_channel_id" text,
	"slack_permalink" text,
	"posted_at" timestamp with time zone NOT NULL,
	"posted_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kudos_slack_message_unique" UNIQUE("slack_channel_id","slack_message_ts")
);
--> statement-breakpoint
CREATE TABLE "kudos_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slack_channel_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kudos_channels_slack_channel_id_unique" UNIQUE("slack_channel_id")
);
--> statement-breakpoint
CREATE TABLE "kudos_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kudos_id" uuid NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kudos_entry_mentioned_usergroups" (
	"kudos_entry_id" uuid NOT NULL,
	"usergroup_id" uuid NOT NULL,
	CONSTRAINT "kudos_entry_mentioned_usergroups_kudos_entry_id_usergroup_id_pk" PRIMARY KEY("kudos_entry_id","usergroup_id")
);
--> statement-breakpoint
CREATE TABLE "kudos_entry_mentioned_users" (
	"kudos_entry_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "kudos_entry_mentioned_users_kudos_entry_id_user_id_pk" PRIMARY KEY("kudos_entry_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_posted_by_id_users_id_fk" FOREIGN KEY ("posted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos_entries" ADD CONSTRAINT "kudos_entries_kudos_id_kudos_id_fk" FOREIGN KEY ("kudos_id") REFERENCES "public"."kudos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos_entry_mentioned_usergroups" ADD CONSTRAINT "kudos_entry_mentioned_usergroups_kudos_entry_id_kudos_entries_id_fk" FOREIGN KEY ("kudos_entry_id") REFERENCES "public"."kudos_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos_entry_mentioned_usergroups" ADD CONSTRAINT "kudos_entry_mentioned_usergroups_usergroup_id_usergroups_id_fk" FOREIGN KEY ("usergroup_id") REFERENCES "public"."usergroups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos_entry_mentioned_users" ADD CONSTRAINT "kudos_entry_mentioned_users_kudos_entry_id_kudos_entries_id_fk" FOREIGN KEY ("kudos_entry_id") REFERENCES "public"."kudos_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos_entry_mentioned_users" ADD CONSTRAINT "kudos_entry_mentioned_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kudos_posted_at_idx" ON "kudos" USING btree ("posted_at");