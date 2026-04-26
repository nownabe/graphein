import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(databaseUrl: string, options?: postgres.Options<{}>): Database {
  const queryClient = postgres(databaseUrl, options);
  return drizzle(queryClient, { schema });
}
