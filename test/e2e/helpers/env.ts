/**
 * E2E test environment variables.
 *
 * Required variables (set in .env or shell):
 *   E2E_GRAPHEIN_URL        — Graphein app URL (default: http://localhost:3000)
 *   E2E_SLACK_BOT_TOKEN     — Slack bot token for posting messages
 *   E2E_SLACK_CHANNEL_ID    — General test channel ID
 *   E2E_SLACK_USER_ID       — Slack user ID for the test user
 *   E2E_SNIPPET_CHANNEL_ID  — Snippet-monitored channel ID
 *   E2E_KUDOS_CHANNEL_ID    — Kudos-monitored channel ID
 *   DATABASE_URL             — Database connection string (uses dev DB)
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required E2E environment variable: ${name}. ` +
        "See test/e2e/helpers/env.ts for the full list.",
    );
  }
  return value;
}

export const env = {
  get grapheinUrl() {
    return process.env.E2E_GRAPHEIN_URL ?? "http://localhost:3000";
  },
  get slackBotToken() {
    return requireEnv("E2E_SLACK_BOT_TOKEN");
  },
  get slackChannelId() {
    return requireEnv("E2E_SLACK_CHANNEL_ID");
  },
  get slackUserId() {
    return requireEnv("E2E_SLACK_USER_ID");
  },
  get snippetChannelId() {
    return requireEnv("E2E_SNIPPET_CHANNEL_ID");
  },
  get kudosChannelId() {
    return requireEnv("E2E_KUDOS_CHANNEL_ID");
  },
  get databaseUrl() {
    return requireEnv("DATABASE_URL");
  },
  get jwtSecret() {
    return requireEnv("JWT_SECRET");
  },
};
