import type { Hono } from "hono";
import { createHonoApp } from "../../../src/app";
import { createDb } from "../../../src/infrastructure/db/client";
import { createUserService } from "../../../src/application/users/service";
import { createTaskService } from "../../../src/application/tasks/service";
import { createSnippetService } from "../../../src/application/snippets/service";
import { createUsergroupService } from "../../../src/application/usergroups/service";
import { createSettingsService } from "../../../src/application/settings/service";
import { createApiKeyService } from "../../../src/application/api-keys/service";
import { createKudosService } from "../../../src/application/kudos/service";
import { createOAuthService } from "../../../src/application/oauth/service";
import { createSessionHelpers } from "../../../src/application/auth/session";
import { createMemoryCacheStore } from "../../../src/infrastructure/cache/memory";
import { TEST_DATABASE_URL } from "./setup";

const JWT_SECRET = "test-secret";
const BASE_URL = "http://localhost:3000";

const session = createSessionHelpers(JWT_SECRET);

export function createTestApp() {
  const db = createDb(TEST_DATABASE_URL, { max: 1 });
  const userService = createUserService(db);
  const taskService = createTaskService(db);
  const usergroupService = createUsergroupService(db);
  const snippetService = createSnippetService(db);
  const settingsService = createSettingsService(db);
  const apiKeyService = createApiKeyService(db);
  const kudosService = createKudosService(db);
  const oauthService = createOAuthService(db);

  const app = createHonoApp({
    db,
    cache: createMemoryCacheStore(),
    devMode: false,
    baseUrl: BASE_URL,
    slackClientId: "",
    slackClientSecret: "",
    slackTeamId: "",
    session,
    userService,
    taskService,
    snippetService,
    usergroupService,
    kudosService,
    settingsService,
    apiKeyService,
    oauthService,
    jwtSecret: JWT_SECRET,
    buildMrkdwnLabels: async () => ({ users: {}, channels: {}, usergroups: {}, emoji: {} }),
    resolveChannelName: async () => undefined,
    timezone: "Asia/Tokyo",
  });

  return { app, db, userService, taskService, snippetService, settingsService, apiKeyService };
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
