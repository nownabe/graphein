import type { Hono } from "hono";
import { createHonoApp } from "../../../src/app";
import { createDb } from "../../../src/db/client";
import { createUserService } from "../../../src/users/service";
import { createTaskService } from "../../../src/tasks/service";
import { createSnippetService } from "../../../src/snippets/service";
import { createUsergroupService } from "../../../src/usergroups/service";
import { createSettingsService } from "../../../src/settings/service";
import { createApiKeyService } from "../../../src/api-keys/service";
import { createKudosService } from "../../../src/kudos/service";
import { createOAuthService } from "../../../src/oauth/service";
import { createSessionHelpers } from "../../../src/auth/session";
import { TEST_DATABASE_URL } from "./setup";

const JWT_SECRET = "test-secret";
const MCP_JWT_SECRET = "test-mcp-secret";
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
    mcpJwtSecret: MCP_JWT_SECRET,
    buildMrkdwnLabels: async () => ({ users: {}, channels: {}, usergroups: {} }),
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
