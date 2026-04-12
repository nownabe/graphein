import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(databaseUrl: string): Database {
  const queryClient = postgres(databaseUrl);
  return drizzle(queryClient, { schema });
}
