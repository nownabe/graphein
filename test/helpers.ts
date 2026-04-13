import type { Hono } from "hono";
import { createHonoApp } from "../src/app";
import { createDb } from "../src/db/client";
import type { Database } from "../src/db/client";
import { createUserService } from "../src/users/service";
import { createTaskService } from "../src/tasks/service";
import { createSnippetService } from "../src/snippets/service";
import { createSessionHelpers } from "../src/auth/session";
import {
  users,
  tasks,
  taskAssignees,
  taskOwners,
  snippetMentionedUsers,
  snippetMentionedUsergroups,
  snippets,
  snippetChannels,
  usergroups,
} from "../src/db/schema";
import { TEST_DATABASE_URL } from "./setup";

const JWT_SECRET = "test-secret";
const BASE_URL = "http://localhost:3000";

const session = createSessionHelpers(JWT_SECRET);

export function createTestApp() {
  const db = createDb(TEST_DATABASE_URL);
  const userService = createUserService(db);
  const taskService = createTaskService(db);
  const snippetService = createSnippetService(db);

  const app = createHonoApp({
    devMode: false,
    baseUrl: BASE_URL,
    slackClientId: "",
    slackClientSecret: "",
    slackTeamId: "",
    session,
    userService,
    taskService,
    snippetService,
    buildMrkdwnLabels: async () => ({ users: {}, channels: {}, usergroups: {} }),
    snippetTimezone: "Asia/Tokyo",
  });

  return { app, db, userService, taskService, snippetService };
}

export async function createTestUser(
  db: Database,
  overrides?: Partial<{
    slackUserId: string;
    email: string;
    displayName: string;
    role: string;
    locale: string;
  }>,
) {
  const [user] = await db
    .insert(users)
    .values({
      slackUserId: `U${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      email: "test@example.com",
      displayName: "Test User",
      ...overrides,
    })
    .returning();
  return user;
}

export async function authRequest(app: Hono, userId: string, path: string, init?: RequestInit) {
  const token = await session.createToken(userId, "Test User");
  return app.request(path, {
    ...init,
    headers: {
      ...init?.headers,
      Cookie: `token=${token}`,
      Origin: BASE_URL,
    },
  });
}

export async function cleanupDb(db: Database) {
  await db.delete(snippetMentionedUsers);
  await db.delete(snippetMentionedUsergroups);
  await db.delete(snippets);
  await db.delete(snippetChannels);
  await db.delete(usergroups);
  await db.delete(taskAssignees);
  await db.delete(taskOwners);
  await db.delete(tasks);
  await db.delete(users);
}
