import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";

export function registerMeResource(server: McpServer, getMcpContext: () => McpContext): void {
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
