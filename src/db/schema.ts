import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  primaryKey,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  slackUserId: text("slack_user_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("user"),
  locale: text("locale").notNull().default("en"),
  theme: text("theme").notNull().default("dark"),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  archived: boolean("archived").notNull().default(false),
  deadline: timestamp("deadline", { withTimezone: true }),
  slackMessageTs: text("slack_message_ts"),
  slackChannelId: text("slack_channel_id"),
  slackPermalink: text("slack_permalink"),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    done: boolean("done").notNull().default(false),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

export const taskOwners = pgTable(
  "task_owners",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

// Usergroups — Slack usergroups as first-class entities
export const usergroups = pgTable("usergroups", {
  id: uuid("id").defaultRandom().primaryKey(),
  slackUsergroupId: text("slack_usergroup_id").notNull().unique(),
  name: text("name").notNull(),
  handle: text("handle"),
  membersSyncedAt: timestamp("members_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Usergroup members — cached Slack usergroup membership
export const usergroupMembers = pgTable(
  "usergroup_members",
  {
    usergroupId: uuid("usergroup_id")
      .notNull()
      .references(() => usergroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.usergroupId, t.userId] })],
);

// Snippet channels — admin-configured channels to monitor
export const snippetChannels = pgTable("snippet_channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  slackChannelId: text("slack_channel_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Snippets — daily report records
export const snippets = pgTable(
  "snippets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    content: text("content").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    slackMessageTs: text("slack_message_ts"),
    slackChannelId: text("slack_channel_id"),
    slackPermalink: text("slack_permalink"),
    postedById: uuid("posted_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("snippets_posted_at_idx").on(t.postedAt),
    unique("snippets_slack_message_unique").on(t.slackChannelId, t.slackMessageTs),
  ],
);

// Snippet mentioned users — junction for user mention filtering
export const snippetMentionedUsers = pgTable(
  "snippet_mentioned_users",
  {
    snippetId: uuid("snippet_id")
      .notNull()
      .references(() => snippets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.snippetId, t.userId] })],
);

// Snippet mentioned usergroups — junction for usergroup mention filtering
export const snippetMentionedUsergroups = pgTable(
  "snippet_mentioned_usergroups",
  {
    snippetId: uuid("snippet_id")
      .notNull()
      .references(() => snippets.id, { onDelete: "cascade" }),
    usergroupId: uuid("usergroup_id")
      .notNull()
      .references(() => usergroups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.snippetId, t.usergroupId] })],
);

// App settings — key-value store for application configuration
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Kudos channels — admin-configured channels to monitor for kudos
export const kudosChannels = pgTable("kudos_channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  slackChannelId: text("slack_channel_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Kudos — a Slack message containing one or more kudos entries
export const kudos = pgTable(
  "kudos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slackMessageTs: text("slack_message_ts"),
    slackChannelId: text("slack_channel_id"),
    slackPermalink: text("slack_permalink"),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    postedById: uuid("posted_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("kudos_posted_at_idx").on(t.postedAt),
    unique("kudos_slack_message_unique").on(t.slackChannelId, t.slackMessageTs),
  ],
);

// Kudos entries — individual kudos within a message
export const kudosEntries = pgTable("kudos_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  kudosId: uuid("kudos_id")
    .notNull()
    .references(() => kudos.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Kudos entry mentioned users — targets per entry
export const kudosEntryMentionedUsers = pgTable(
  "kudos_entry_mentioned_users",
  {
    kudosEntryId: uuid("kudos_entry_id")
      .notNull()
      .references(() => kudosEntries.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.kudosEntryId, t.userId] })],
);

// Kudos entry mentioned usergroups — group targets per entry
export const kudosEntryMentionedUsergroups = pgTable(
  "kudos_entry_mentioned_usergroups",
  {
    kudosEntryId: uuid("kudos_entry_id")
      .notNull()
      .references(() => kudosEntries.id, { onDelete: "cascade" }),
    usergroupId: uuid("usergroup_id")
      .notNull()
      .references(() => usergroups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.kudosEntryId, t.usergroupId] })],
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  createdTasks: many(tasks),
  assignments: many(taskAssignees),
  ownedTasks: many(taskOwners),
  snippets: many(snippets),
  snippetMentions: many(snippetMentionedUsers),
  usergroupMemberships: many(usergroupMembers),
  kudos: many(kudos),
  kudosEntryMentions: many(kudosEntryMentionedUsers),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [tasks.createdById],
    references: [users.id],
  }),
  assignees: many(taskAssignees),
  owners: many(taskOwners),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAssignees.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskAssignees.userId],
    references: [users.id],
  }),
}));

export const taskOwnersRelations = relations(taskOwners, ({ one }) => ({
  task: one(tasks, {
    fields: [taskOwners.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskOwners.userId],
    references: [users.id],
  }),
}));

export const usergroupsRelations = relations(usergroups, ({ many }) => ({
  members: many(usergroupMembers),
  snippetMentions: many(snippetMentionedUsergroups),
  kudosEntryMentions: many(kudosEntryMentionedUsergroups),
}));

export const usergroupMembersRelations = relations(usergroupMembers, ({ one }) => ({
  usergroup: one(usergroups, {
    fields: [usergroupMembers.usergroupId],
    references: [usergroups.id],
  }),
  user: one(users, {
    fields: [usergroupMembers.userId],
    references: [users.id],
  }),
}));

export const snippetsRelations = relations(snippets, ({ one, many }) => ({
  postedBy: one(users, {
    fields: [snippets.postedById],
    references: [users.id],
  }),
  mentionedUsers: many(snippetMentionedUsers),
  mentionedUsergroups: many(snippetMentionedUsergroups),
}));

export const snippetMentionedUsersRelations = relations(snippetMentionedUsers, ({ one }) => ({
  snippet: one(snippets, {
    fields: [snippetMentionedUsers.snippetId],
    references: [snippets.id],
  }),
  user: one(users, {
    fields: [snippetMentionedUsers.userId],
    references: [users.id],
  }),
}));

export const snippetMentionedUsergroupsRelations = relations(
  snippetMentionedUsergroups,
  ({ one }) => ({
    snippet: one(snippets, {
      fields: [snippetMentionedUsergroups.snippetId],
      references: [snippets.id],
    }),
    usergroup: one(usergroups, {
      fields: [snippetMentionedUsergroups.usergroupId],
      references: [usergroups.id],
    }),
  }),
);

export const kudosRelations = relations(kudos, ({ one, many }) => ({
  postedBy: one(users, {
    fields: [kudos.postedById],
    references: [users.id],
  }),
  entries: many(kudosEntries),
}));

export const kudosEntriesRelations = relations(kudosEntries, ({ one, many }) => ({
  kudos: one(kudos, {
    fields: [kudosEntries.kudosId],
    references: [kudos.id],
  }),
  mentionedUsers: many(kudosEntryMentionedUsers),
  mentionedUsergroups: many(kudosEntryMentionedUsergroups),
}));

export const kudosEntryMentionedUsersRelations = relations(kudosEntryMentionedUsers, ({ one }) => ({
  entry: one(kudosEntries, {
    fields: [kudosEntryMentionedUsers.kudosEntryId],
    references: [kudosEntries.id],
  }),
  user: one(users, {
    fields: [kudosEntryMentionedUsers.userId],
    references: [users.id],
  }),
}));

export const kudosEntryMentionedUsergroupsRelations = relations(
  kudosEntryMentionedUsergroups,
  ({ one }) => ({
    entry: one(kudosEntries, {
      fields: [kudosEntryMentionedUsergroups.kudosEntryId],
      references: [kudosEntries.id],
    }),
    usergroup: one(usergroups, {
      fields: [kudosEntryMentionedUsergroups.usergroupId],
      references: [usergroups.id],
    }),
  }),
);
