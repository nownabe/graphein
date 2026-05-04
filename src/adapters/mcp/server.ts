import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getContext } from "hono/context-storage";
import type { Database } from "../../db/client";
import type { KudosService } from "../../kudos/service";
import type { SnippetService } from "../../snippets/service";
import type { TaskService } from "../../tasks/service";
import type { UserService } from "../../users/service";
import { registerMeResource } from "./resources/me";
import { registerAdminTools } from "./tools/admin";
import { registerKudosTools } from "./tools/kudos";
import { registerSnippetTools } from "./tools/snippets";
import { registerTaskTools } from "./tools/tasks";
import type { McpContext } from "./types";

export interface McpServerConfig {
  name: string;
  version: string;
  db: Database;
  taskService: TaskService;
  userService: UserService;
  snippetService: SnippetService;
  kudosService: KudosService;
}

/**
 * Creates a new McpServer instance with all tools and resources registered.
 *
 * Called per-request in stateless mode because the MCP SDK ties a single
 * McpServer instance to one transport at a time — sharing across concurrent
 * requests is unsafe. The factory is lightweight: it only registers
 * tool/resource definitions without performing any I/O.
 */
export function createMcpServer(config: McpServerConfig): McpServer {
  const server = new McpServer(
    { name: config.name, version: config.version },
    { capabilities: { tools: {}, resources: {} } },
  );

  // --- Tools ---
  registerTaskTools(server, {
    db: config.db,
    taskService: config.taskService,
    getMcpContext,
  });
  registerSnippetTools(server, {
    snippetService: config.snippetService,
    getMcpContext,
  });
  registerKudosTools(server, {
    kudosService: config.kudosService,
    getMcpContext,
  });
  registerAdminTools(server, {
    db: config.db,
    userService: config.userService,
    snippetService: config.snippetService,
    kudosService: config.kudosService,
    getMcpContext,
  });

  // --- Resources ---
  registerMeResource(server, getMcpContext);

  return server;
}

/**
 * Returns the authenticated user context from the Hono request context.
 * Tool and resource handlers call this to access the current user.
 */
function getMcpContext(): McpContext {
  const c = getContext();
  return {
    user: c.get("mcpUser"),
    role: c.get("mcpRole"),
  };
}
