import { createHonoApp } from "./app";
import { createDb } from "./db/client";
import { createUserService } from "./users/service";
import { createTaskService } from "./tasks/service";
import { createSnippetService } from "./snippets/service";
import { createKudosService } from "./kudos/service";
import { createUsergroupService } from "./usergroups/service";
import { createSettingsService } from "./settings/service";
import { createApiKeyService } from "./api-keys/service";
import { createSessionHelpers } from "./auth/session";
import { createGeminiClient } from "./llm/gemini";
import { createBolt } from "./slack/bolt";
import { createLabelBuilder } from "./slack/labels";
import { createSlackLabelResolver } from "./slack/helpers";

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

// Create core services
const db = createDb(requireEnv("DATABASE_URL"));
const userService = createUserService(db);
const taskService = createTaskService(db);
const usergroupService = createUsergroupService(db);
const snippetService = createSnippetService(db);
const kudosService = createKudosService(db);
const settingsService = createSettingsService(db);
const apiKeyService = createApiKeyService(db);
const session = createSessionHelpers(requireEnv("JWT_SECRET"));

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
const buildMrkdwnLabels = createLabelBuilder(boltApp, userService);
const slackLabelResolver = createSlackLabelResolver(boltApp.client);

// Create Hono app
const app = createHonoApp({
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
