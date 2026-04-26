import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(databaseUrl: string, options?: { max?: number }): Database {
  const queryClient = postgres(databaseUrl, { max: options?.max });
  return drizzle(queryClient, { schema });
}
