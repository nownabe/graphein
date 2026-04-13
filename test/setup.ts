import { beforeAll } from "bun:test";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "../src/db/client";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://graphein_test:graphein_test@localhost:15433/graphein_test";

beforeAll(async () => {
  const db = createDb(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: "./drizzle" });
});
