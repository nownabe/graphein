CREATE TABLE "snippet_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slack_channel_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snippet_channels_slack_channel_id_unique" UNIQUE("slack_channel_id")
);
--> statement-breakpoint
CREATE TABLE "snippet_mentioned_usergroups" (
	"snippet_id" uuid NOT NULL,
	"usergroup_id" uuid NOT NULL,
	CONSTRAINT "snippet_mentioned_usergroups_snippet_id_usergroup_id_pk" PRIMARY KEY("snippet_id","usergroup_id")
);
--> statement-breakpoint
CREATE TABLE "snippet_mentioned_users" (
	"snippet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "snippet_mentioned_users_snippet_id_user_id_pk" PRIMARY KEY("snippet_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "snippets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"slack_message_ts" text,
	"slack_channel_id" text,
	"slack_permalink" text,
	"posted_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usergroups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slack_usergroup_id" text NOT NULL,
	"name" text NOT NULL,
	"handle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usergroups_slack_usergroup_id_unique" UNIQUE("slack_usergroup_id")
);
--> statement-breakpoint
ALTER TABLE "snippet_mentioned_usergroups" ADD CONSTRAINT "snippet_mentioned_usergroups_snippet_id_snippets_id_fk" FOREIGN KEY ("snippet_id") REFERENCES "public"."snippets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snippet_mentioned_usergroups" ADD CONSTRAINT "snippet_mentioned_usergroups_usergroup_id_usergroups_id_fk" FOREIGN KEY ("usergroup_id") REFERENCES "public"."usergroups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snippet_mentioned_users" ADD CONSTRAINT "snippet_mentioned_users_snippet_id_snippets_id_fk" FOREIGN KEY ("snippet_id") REFERENCES "public"."snippets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snippet_mentioned_users" ADD CONSTRAINT "snippet_mentioned_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snippets" ADD CONSTRAINT "snippets_posted_by_id_users_id_fk" FOREIGN KEY ("posted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "snippets_posted_at_idx" ON "snippets" USING btree ("posted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "snippets_slack_message_unique" ON "snippets" USING btree ("slack_channel_id","slack_message_ts");