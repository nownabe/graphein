import { createApp } from "./app";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const port = Number(process.env.PORT ?? "3000");
const slackSocketMode = process.env.SLACK_SOCKET_MODE === "true";

const { app, boltApp } = createApp({
  devMode: process.env.NODE_ENV !== "production",
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret: requireEnv("JWT_SECRET"),
  baseUrl: requireEnv("BASE_URL"),
  slackClientId: requireEnv("SLACK_CLIENT_ID"),
  slackClientSecret: requireEnv("SLACK_CLIENT_SECRET"),
  slackTeamId: requireEnv("SLACK_TEAM_ID"),
  slackSigningSecret: requireEnv("SLACK_SIGNING_SECRET"),
  slackBotToken: requireEnv("SLACK_BOT_TOKEN"),
  slackAppToken: process.env.SLACK_APP_TOKEN ?? "",
  slackSocketMode,
  geminiApiKey: requireEnv("GEMINI_API_KEY"),
});

// Start Bolt (Socket Mode connects via WebSocket, HTTP mode is no-op)
await boltApp.start();
console.log(`Bolt app started (${slackSocketMode ? "Socket Mode" : "HTTP Mode"})`);

console.log(`Starting Graphein on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
