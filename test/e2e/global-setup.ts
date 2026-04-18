import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "../../src/db/client";
import { env } from "./helpers/env";

/**
 * Playwright global setup: run database migrations on the E2E database
 * before any tests execute.
 */
async function globalSetup() {
  const db = createDb(env.databaseUrl);
  await migrate(db, { migrationsFolder: "./drizzle" });
}

export default globalSetup;
