DROP INDEX "snippets_slack_message_unique";--> statement-breakpoint
ALTER TABLE "snippets" ADD CONSTRAINT "snippets_slack_message_unique" UNIQUE("slack_channel_id","slack_message_ts");