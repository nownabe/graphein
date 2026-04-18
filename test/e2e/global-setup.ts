import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "../../src/db/client";
import { env } from "./helpers/env";
import { ensureUser, closeDb } from "./helpers/db";
import { getSlackClient } from "./helpers/slack";

/**
 * Playwright global setup:
 * 1. Run database migrations on the E2E database.
 * 2. Ensure the E2E test user exists in the database (fetches profile from Slack API).
 */
async function globalSetup() {
  // Run migrations
  const db = createDb(env.databaseUrl);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.$client.end();

  // Ensure the test user exists in the E2E database
  const slack = getSlackClient();
  const result = await slack.users.info({ user: env.slackUserId });
  const profile = result.user?.profile;
  await ensureUser(env.slackUserId, {
    email: profile?.email ?? `e2e-${env.slackUserId}@example.com`,
    displayName: profile?.display_name || profile?.real_name || env.slackUserId,
  });
  await closeDb();
}

export default globalSetup;
