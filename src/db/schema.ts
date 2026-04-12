import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const members = pgTable("members", {
  id: uuid("id").defaultRandom().primaryKey(),
  slackUserId: text("slack_user_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("user"),
  locale: text("locale").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    done: boolean("done").notNull().default(false),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.memberId] })],
);

export const taskOwners = pgTable(
  "task_owners",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.memberId] })],
);

// Relations
export const membersRelations = relations(members, ({ many }) => ({
  createdTasks: many(tasks),
  assignments: many(taskAssignees),
  ownedTasks: many(taskOwners),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  createdBy: one(members, {
    fields: [tasks.createdById],
    references: [members.id],
  }),
  assignees: many(taskAssignees),
  owners: many(taskOwners),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAssignees.taskId],
    references: [tasks.id],
  }),
  member: one(members, {
    fields: [taskAssignees.memberId],
    references: [members.id],
  }),
}));

export const taskOwnersRelations = relations(taskOwners, ({ one }) => ({
  task: one(tasks, {
    fields: [taskOwners.taskId],
    references: [tasks.id],
  }),
  member: one(members, {
    fields: [taskOwners.memberId],
    references: [members.id],
  }),
}));
