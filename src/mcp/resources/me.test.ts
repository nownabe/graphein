import { describe, test, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMeResource } from "./me";
import type { McpContext } from "../types";
import type { McpUser } from "../types";

const mockUser: McpUser = {
  id: "user-uuid-123",
  displayName: "Alice",
  email: "alice@example.com",
  role: "admin",
  locale: "en",
  slackUserId: "U12345",
  avatarUrl: "https://example.com/avatar.png",
  theme: "dark",
  deactivatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockContext(): McpContext {
  return { user: mockUser, role: "admin" };
}

describe("registerMeResource", () => {
  test("registers the graphein://me resource", () => {
    const server = new McpServer(
      { name: "test", version: "0.1.0" },
      { capabilities: { resources: {} } },
    );

    registerMeResource(server, createMockContext);

    const registeredResources = (
      server as unknown as { _registeredResources: Record<string, unknown> }
    )._registeredResources;
    expect(registeredResources["graphein://me"]).toBeDefined();
  });

  test("resource handler returns user profile JSON", async () => {
    const server = new McpServer(
      { name: "test", version: "0.1.0" },
      { capabilities: { resources: {} } },
    );

    registerMeResource(server, createMockContext);

    const registeredResources = (
      server as unknown as {
        _registeredResources: Record<
          string,
          {
            readCallback: (
              uri: URL,
            ) => Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }>;
          }
        >;
      }
    )._registeredResources;

    const result = await registeredResources["graphein://me"].readCallback(
      new URL("graphein://me"),
    );
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe("graphein://me");
    expect(result.contents[0].mimeType).toBe("application/json");

    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed).toEqual({
      id: "user-uuid-123",
      displayName: "Alice",
      email: "alice@example.com",
      role: "admin",
      locale: "en",
    });
  });
});
