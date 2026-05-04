import type { users } from "../../db/schema";

export type McpUser = typeof users.$inferSelect;

export interface McpContext {
  user: McpUser;
  role: string;
}

// Extend Hono's context variable map so c.get("mcpUser") / c.set("mcpUser") are typed.
declare module "hono" {
  interface ContextVariableMap {
    mcpUser: McpUser;
    mcpRole: string;
  }
}
