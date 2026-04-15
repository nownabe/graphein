CREATE TABLE "usergroup_members" (
	"usergroup_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "usergroup_members_usergroup_id_user_id_pk" PRIMARY KEY("usergroup_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "usergroup_members" ADD CONSTRAINT "usergroup_members_usergroup_id_usergroups_id_fk" FOREIGN KEY ("usergroup_id") REFERENCES "public"."usergroups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usergroup_members" ADD CONSTRAINT "usergroup_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;