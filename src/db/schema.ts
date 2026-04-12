import { pgTable, text, timestamp, uuid, boolean, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  slackUserId: text("slack_user_id").notNull().unique(),
  slackTeamId: text("slack_team_id"),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("user"),
  locale: text("locale").notNull().default("en"),
  theme: text("theme").notNull().default("dark"),
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

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  createdTasks: many(tasks),
  assignments: many(taskAssignees),
  ownedTasks: many(taskOwners),
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
