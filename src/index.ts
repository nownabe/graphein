import { createHonoApp } from "./app";
import { createDb } from "./infrastructure/db/client";
import { cacheConfigFromEnv, createCacheStore } from "./infrastructure/cache/factory";
import { createUserService } from "./application/users/service";
import { createTaskService } from "./application/tasks/service";
import { createSnippetService } from "./application/snippets/service";
import { createKudosService } from "./application/kudos/service";
import { createUsergroupService } from "./application/usergroups/service";
import { createSettingsService } from "./application/settings/service";
import { createApiKeyService } from "./application/api-keys/service";
import { createOAuthService } from "./application/oauth/service";
import { createSessionHelpers } from "./application/auth/session";
import { createGeminiClient } from "./infrastructure/llm/gemini";
import { createBolt } from "./adapters/slack/bolt";
import { createLabelBuilder } from "./adapters/slack/labels";
import { createSlackLabelResolver } from "./adapters/slack/helpers";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const port = Number(process.env.PORT ?? "3000");
const devMode = process.env.NODE_ENV !== "production";
const slackSocketMode = process.env.SLACK_SOCKET_MODE === "true";
const baseUrl = requireEnv("BASE_URL");
const timezone = process.env.APP_TIMEZONE ?? "UTC";

// Create cache store (in-memory by default, Redis when CACHE_BACKEND=redis)
const cacheConfig = cacheConfigFromEnv();
const cache = await createCacheStore(cacheConfig);

// Create core services
const db = createDb(requireEnv("DATABASE_URL"));
const userService = createUserService(db);
const taskService = createTaskService(db);
const usergroupService = createUsergroupService(db);
const snippetService = createSnippetService(db);
const kudosService = createKudosService(db);
const settingsService = createSettingsService(db);
const apiKeyService = createApiKeyService(db);
const oauthService = createOAuthService(db);
const jwtSecret = requireEnv("JWT_SECRET");
const session = createSessionHelpers(jwtSecret);

// Create Bolt app and Slack label builder
const geminiClient = createGeminiClient(requireEnv("GEMINI_API_KEY"));
const { boltApp, receiver } = createBolt(
  {
    slackBotToken: requireEnv("SLACK_BOT_TOKEN"),
    slackSigningSecret: requireEnv("SLACK_SIGNING_SECRET"),
    slackSocketMode,
    slackAppToken: process.env.SLACK_APP_TOKEN ?? "",
    baseUrl,
  },
  { userService, taskService, snippetService, kudosService, usergroupService, geminiClient },
);
const buildMrkdwnLabels = createLabelBuilder(boltApp, userService, cache);
const slackLabelResolver = createSlackLabelResolver(boltApp.client, cache);

// Create Hono app
const app = createHonoApp({
  db,
  cache,
  devMode,
  baseUrl,
  slackClientId: requireEnv("SLACK_CLIENT_ID"),
  slackClientSecret: requireEnv("SLACK_CLIENT_SECRET"),
  slackTeamId: requireEnv("SLACK_TEAM_ID"),
  session,
  userService,
  taskService,
  snippetService,
  usergroupService,
  kudosService,
  settingsService,
  apiKeyService,
  oauthService,
  jwtSecret,
  buildMrkdwnLabels,
  resolveChannelName: slackLabelResolver.channel.bind(slackLabelResolver),
  slackReceiver: receiver ?? undefined,
  timezone,
});

// Start Bolt (Socket Mode connects via WebSocket, HTTP mode is no-op)
await boltApp.start();
console.log(`Bolt app started (${slackSocketMode ? "Socket Mode" : "HTTP Mode"})`);

console.log(`Starting Graphein on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
