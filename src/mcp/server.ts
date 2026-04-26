import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getContext } from "hono/context-storage";
import type { McpContext } from "./types";

export interface McpServerConfig {
  name: string;
  version: string;
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

  // --- Resources ---
  registerMeResource(server);

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

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

function registerMeResource(server: McpServer): void {
  server.registerResource(
    "me",
    "graphein://me",
    { description: "Authenticated user profile" },
    () => {
      const { user } = getMcpContext();
      return {
        contents: [
          {
            uri: "graphein://me",
            mimeType: "application/json",
            text: JSON.stringify({
              id: user.id,
              displayName: user.displayName,
              email: user.email,
              role: user.role,
              locale: user.locale,
            }),
          },
        ],
      };
    },
  );
}
