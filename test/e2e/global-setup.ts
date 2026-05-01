import { spawn, type ChildProcess } from "node:child_process";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "../../src/db/client";
import { env } from "./helpers/env";
import { ensureUser, closeDb } from "./helpers/db";
import { getSlackClient } from "./helpers/slack";

const E2E_SERVER_PORT = 3001;

/**
 * Playwright global setup:
 * 1. Run database migrations on the E2E database.
 * 2. Ensure the E2E test user exists in the database.
 * 3. Start the Graphein server in HTTP mode (Socket Mode off) for E2E tests.
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

  // Start the E2E server with HTTP mode (Socket Mode off)
  const serverProcess: ChildProcess = spawn("bun", ["run", "src/index.ts"], {
    env: {
      ...process.env,
      PORT: String(E2E_SERVER_PORT),
      DATABASE_URL: env.databaseUrl,
      JWT_SECRET: env.jwtSecret,
      MCP_JWT_SECRET: env.mcpJwtSecret,
      SLACK_SOCKET_MODE: "false",
      BASE_URL: `http://localhost:${E2E_SERVER_PORT}`,
    },
    stdio: "inherit",
  });

  // Wait for the server to be ready
  const serverUrl = `http://localhost:${E2E_SERVER_PORT}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${serverUrl}/healthz`);
      if (res.ok) break;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (Date.now() >= deadline) {
    serverProcess.kill();
    throw new Error("E2E server failed to start within 30 seconds");
  }

  // Set the Graphein URL for tests to use (overrides any existing E2E_GRAPHEIN_URL)
  process.env.E2E_GRAPHEIN_URL = serverUrl;

  // Store the server process PID for teardown
  (globalThis as Record<string, unknown>).__e2eServerPid = serverProcess.pid;
}

export default globalSetup;
